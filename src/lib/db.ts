import Dexie, { type EntityTable } from "dexie";

export type BookFormat = "pdf" | "epub" | "text";

/** Where a passage or problem lives in a book. */
export interface Locator {
  /** 0-based PDF page index. */
  pageIndex?: number;
  /** Printed page number, when the PDF provides one. */
  pageLabel?: string;
  /** 0-based chapter index for EPUB and text books. */
  chapterIndex?: number;
  chapterTitle?: string;
}

export interface Book {
  id: string;
  title: string;
  format: BookFormat;
  fileName: string;
  importedAt: number;
  /** Pages for PDFs, chapters/sections otherwise. */
  sectionCount: number;
  chunkCount: number;
}

/** A searchable slice of a book. */
export interface Chunk {
  id?: number;
  bookId: string;
  locator: Locator;
  text: string;
}

/** Full text of one PDF page or one EPUB/text chapter. */
export interface Section {
  id?: number;
  bookId: string;
  index: number;
  title: string;
  text: string;
}

/** Binary data: original book files and images. */
export interface StoredFile {
  id: string;
  blob: Blob;
}

export type TutorMode = "coach" | "explain" | "quiz";

/** Content blocks as sent to the API, with images replaced by references to stored files. */
export type StoredBlock = Record<string, unknown>;

export interface SourceRef {
  bookId: string;
  bookTitle: string;
  locator: Locator;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  createdAt: number;
  text: string;
  imageIds: string[];
  sources: SourceRef[];
  content: StoredBlock[];
  /** Errors and failed requests are shown but never sent back to the API. */
  excluded?: boolean;
}

export interface StudySession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: TutorMode;
  /** Books the tutor searches. Empty means all books. */
  focusBookIds: string[];
  /** Set when the session was started from a problem. */
  problemId?: string;
  messages: ChatMessage[];
}

export type ProblemSetKind = "test" | "book";

export interface ProblemSet {
  id: string;
  kind: ProblemSetKind;
  title: string;
  createdAt: number;
  /** For book exercise sets: which book and where the exercises are. */
  bookId?: string;
  range?: { start: number; end: number };
  /** For photographed tests: the page photos, in order. */
  imageIds: string[];
  status: "extracting" | "linking" | "ready" | "failed";
  error?: string;
}

export interface BookLink {
  bookId: string;
  locator: Locator;
  reason: string;
}

export type AttemptResult = "correct" | "partial" | "missed";

export interface Problem {
  id: string;
  setId: string;
  kind: ProblemSetKind;
  order: number;
  number: string;
  text: string;
  concepts: string[];
  hasFigure: boolean;
  /** Photographed test: which page photo (index into the set's imageIds). */
  imageIndex?: number;
  /** Book exercise: where it appears in the book. */
  bookId?: string;
  locator?: Locator;
  /** Pages in the book that teach what this problem needs. */
  bookLinks: BookLink[];
  /** End-of-chapter exercises that practice the same skill. */
  relatedIds: string[];
  linked: boolean;
  // Spaced review (Leitner boxes)
  box: number;
  nextDue?: number;
  lastResult?: AttemptResult;
  attempts: number;
}

class ChemTutorDB extends Dexie {
  books!: EntityTable<Book, "id">;
  chunks!: EntityTable<Chunk, "id">;
  sections!: EntityTable<Section, "id">;
  files!: EntityTable<StoredFile, "id">;
  sessions!: EntityTable<StudySession, "id">;
  problemSets!: EntityTable<ProblemSet, "id">;
  problems!: EntityTable<Problem, "id">;

  constructor() {
    super("chem-tutor");
    this.version(1).stores({
      books: "id, importedAt",
      chunks: "++id, bookId",
      sections: "++id, bookId, [bookId+index]",
      files: "id",
      sessions: "id, updatedAt",
      problemSets: "id, createdAt, bookId, kind",
      problems: "id, setId, kind, nextDue",
    });
  }
}

export const db = new ChemTutorDB();

export const newId = (): string => crypto.randomUUID();

export function locatorLabel(locator: Locator | undefined): string {
  if (!locator) return "";
  if (locator.pageLabel) return `p. ${locator.pageLabel}`;
  if (locator.pageIndex !== undefined) return `p. ${locator.pageIndex + 1}`;
  if (locator.chapterTitle) return locator.chapterTitle;
  if (locator.chapterIndex !== undefined) return `Section ${locator.chapterIndex + 1}`;
  return "";
}

/** Asks the browser not to evict the library when storage runs low. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported; data is still stored, just evictable.
  }
}
