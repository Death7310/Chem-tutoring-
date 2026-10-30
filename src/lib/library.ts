import { db, requestPersistentStorage, type Book, type BookFormat, type Chunk, type Locator, type Section } from "./db";
import { extractEpub, type Chapter } from "./importers/epub";
import { extractPdf } from "./importers/pdf";
import { splitIntoChapters } from "./importers/text";
import { BM25Index } from "./search/bm25";
import { chunkText } from "./text/chunker";

export function formatFor(fileName: string): BookFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "epub") return "epub";
  if (["txt", "md", "markdown"].includes(ext)) return "text";
  return null;
}

/** Imports a book file: stores the original, its full text per page/chapter, and searchable chunks. */
export async function importBook(file: File, onProgress: (fraction: number) => void): Promise<Book> {
  const format = formatFor(file.name);
  if (!format) throw new Error(`“${file.name}” isn't a supported format. Use PDF, EPUB, TXT or Markdown.`);
  await requestPersistentStorage();

  const data = await file.arrayBuffer();
  // Same file → same id on every device, so problem links survive a backup/restore between devices.
  const id = await contentId(data);
  if (await db.books.get(id)) throw new Error(`“${file.name}” is already in your library.`);
  const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
  let title: string | undefined;
  let sections: Section[];
  let chunks: Chunk[];

  if (format === "pdf") {
    const pdf = await extractPdf(data, onProgress);
    title = pdf.title;
    sections = pdf.pages.map((p) => ({ bookId: id, index: p.index, title: p.label ?? String(p.index + 1), text: p.text }));
    chunks = pdf.pages.flatMap((p) =>
      chunkText(p.text).map((text) => ({ bookId: id, locator: { pageIndex: p.index, pageLabel: p.label }, text })),
    );
  } else {
    let chapters: Chapter[];
    if (format === "epub") {
      const epub = await extractEpub(data);
      title = epub.title;
      chapters = epub.chapters;
    } else {
      chapters = splitIntoChapters(new TextDecoder().decode(data), fallbackTitle);
    }
    sections = chapters.map((c, index) => ({ bookId: id, index, title: c.title, text: c.text }));
    chunks = chapters.flatMap((c, index) =>
      chunkText(c.text).map((text) => ({ bookId: id, locator: { chapterIndex: index, chapterTitle: c.title }, text })),
    );
    onProgress(1);
  }

  if (!chunks.length) throw new Error("No text could be read from this file.");
  title = title?.trim();
  const book: Book = {
    id,
    title: title && title.toLowerCase() !== "untitled" ? title : fallbackTitle,
    format,
    fileName: file.name,
    importedAt: Date.now(),
    sectionCount: sections.length,
    chunkCount: chunks.length,
  };

  await db.transaction("rw", [db.books, db.files, db.sections, db.chunks], async () => {
    await db.files.put({ id: `file-${id}`, blob: new Blob([data], { type: file.type || "application/octet-stream" }) });
    await db.sections.bulkAdd(sections);
    await db.chunks.bulkAdd(chunks);
    await db.books.put(book);
  });
  invalidateIndex();
  return book;
}

async function contentId(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return "book-" + [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deleteBook(bookId: string): Promise<void> {
  const sets = await db.problemSets.where("bookId").equals(bookId).toArray();
  await db.transaction("rw", [db.books, db.files, db.sections, db.chunks, db.problemSets, db.problems], async () => {
    await db.chunks.where("bookId").equals(bookId).delete();
    await db.sections.where("bookId").equals(bookId).delete();
    await db.files.delete(`file-${bookId}`);
    for (const set of sets) {
      await db.problems.where("setId").equals(set.id).delete();
      await db.problemSets.delete(set.id);
    }
    await db.books.delete(bookId);
  });
  invalidateIndex();
}

export async function bookFile(bookId: string): Promise<Blob | undefined> {
  return (await db.files.get(`file-${bookId}`))?.blob;
}

export async function bookSections(bookId: string): Promise<Section[]> {
  return db.sections.where("bookId").equals(bookId).sortBy("index");
}

// MARK: - Search

interface IndexState {
  index: BM25Index;
  chunks: Chunk[];
}

let indexPromise: Promise<IndexState> | null = null;

export function invalidateIndex(): void {
  indexPromise = null;
}

async function getIndex(): Promise<IndexState> {
  if (!indexPromise) {
    indexPromise = db.chunks.toArray().then((chunks) => ({ chunks, index: new BM25Index(chunks.map((c) => c.text)) }));
  }
  return indexPromise;
}

export interface SearchOptions {
  bookIds?: string[];
  limit?: number;
  /** Return false to skip a chunk (for example, chunks inside exercise sections). */
  include?: (chunk: Chunk) => boolean;
}

export async function searchBooks(query: string, options: SearchOptions = {}): Promise<Chunk[]> {
  const { index, chunks } = await getIndex();
  const books = options.bookIds?.length ? new Set(options.bookIds) : null;
  const include = (i: number) => (!books || books.has(chunks[i].bookId)) && (!options.include || options.include(chunks[i]));
  return index.search(query, options.limit ?? 6, include).map((hit) => chunks[hit.index]);
}

/** True when the locator falls inside one of the given page/chapter ranges of the same book. */
export function inRanges(bookId: string, locator: Locator, ranges: Array<{ bookId: string; start: number; end: number }>): boolean {
  const position = locator.pageIndex ?? locator.chapterIndex;
  if (position === undefined) return false;
  return ranges.some((r) => r.bookId === bookId && position >= r.start && position <= r.end);
}
