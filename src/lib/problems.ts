import type Anthropic from "@anthropic-ai/sdk";
import { useSyncExternalStore } from "react";
import { friendlyError, structured } from "./claude/client";
import { EXTRACT_SYSTEM, LINK_SYSTEM } from "./claude/prompts";
import { ExtractedProblems, ProblemLinks } from "./claude/schemas";
import { db, locatorLabel, newId, type Locator, type Problem, type ProblemSet } from "./db";
import { imageBlock, prepareImage, saveImage, storedImageBase64 } from "./images";
import { bookSections, inRanges, searchBooks } from "./library";
import { BM25Index } from "./search/bm25";

// MARK: - Running jobs (so the UI can tell "working" from "interrupted")

const running = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = new Set<string>();
function setRunning(id: string, on: boolean) {
  if (on) running.add(id);
  else running.delete(id);
  snapshot = new Set(running);
  listeners.forEach((l) => l());
}
export function useRunningJobs(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

// MARK: - Creating sets

export async function createTestSet(title: string, photos: Blob[]): Promise<string> {
  const imageIds: string[] = [];
  for (const photo of photos) imageIds.push(await saveImage(await prepareImage(photo)));
  const set: ProblemSet = { id: newId(), kind: "test", title, createdAt: Date.now(), imageIds, status: "extracting" };
  await db.problemSets.put(set);
  void processSet(set.id);
  return set.id;
}

export async function createBookSet(bookId: string, start: number, end: number, title: string): Promise<string> {
  const set: ProblemSet = {
    id: newId(), kind: "book", title, createdAt: Date.now(), bookId, range: { start, end }, imageIds: [], status: "extracting",
  };
  await db.problemSets.put(set);
  void processSet(set.id);
  return set.id;
}

export async function deleteSet(setId: string): Promise<void> {
  const set = await db.problemSets.get(setId);
  await db.transaction("rw", [db.problemSets, db.problems, db.files], async () => {
    await db.problems.where("setId").equals(setId).delete();
    if (set) await db.files.bulkDelete(set.imageIds);
    await db.problemSets.delete(setId);
  });
}

/** Extracts problems (if not done yet) and links them to the book. Safe to call again to retry. */
export async function processSet(setId: string): Promise<void> {
  if (running.has(setId)) return;
  setRunning(setId, true);
  try {
    const set = await db.problemSets.get(setId);
    if (!set) return;
    const existing = await db.problems.where("setId").equals(setId).count();
    if (!existing) {
      await db.problemSets.update(setId, { status: "extracting", error: undefined });
      const problems = set.kind === "test" ? await extractFromPhotos(set) : await extractFromBook(set);
      if (!problems.length) throw new Error("No problems were found.");
      await db.problems.bulkPut(problems);
    }
    await db.problemSets.update(setId, { status: "linking", error: undefined });
    await linkProblems(await db.problems.where("setId").equals(setId).sortBy("order"));
    await db.problemSets.update(setId, { status: "ready" });
  } catch (error) {
    await db.problemSets.update(setId, { status: "failed", error: friendlyError(error) });
  } finally {
    setRunning(setId, false);
  }
}

function newProblem(set: ProblemSet, order: number, fields: Partial<Problem>): Problem {
  return {
    id: newId(), setId: set.id, kind: set.kind, order, number: String(order + 1), text: "", concepts: [],
    hasFigure: false, bookLinks: [], relatedIds: [], linked: false, box: 0, attempts: 0, ...fields,
  };
}

// MARK: - Extraction

const PHOTOS_PER_CALL = 4;
const CHARS_PER_CALL = 14000;

async function extractFromPhotos(set: ProblemSet): Promise<Problem[]> {
  const problems: Problem[] = [];
  for (let start = 0; start < set.imageIds.length; start += PHOTOS_PER_CALL) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    const batch = set.imageIds.slice(start, start + PHOTOS_PER_CALL);
    for (const [offset, imageId] of batch.entries()) {
      const data = await storedImageBase64(imageId);
      if (!data) continue;
      content.push({ type: "text", text: `Page ${start + offset + 1}:` }, imageBlock(data));
    }
    content.push({ type: "text", text: "Transcribe the practice problems on these pages." });
    const result = await structured(ExtractedProblems, EXTRACT_SYSTEM, content);
    for (const p of result.problems) {
      const page = Math.min(Math.max(p.page - 1, start), start + batch.length - 1);
      problems.push(
        newProblem(set, problems.length, {
          number: p.number, text: p.text, concepts: normalizeConcepts(p.concepts), hasFigure: p.has_figure, imageIndex: page,
        }),
      );
    }
  }
  return problems;
}

async function extractFromBook(set: ProblemSet): Promise<Problem[]> {
  if (!set.bookId || !set.range) return [];
  const book = await db.books.get(set.bookId);
  if (!book) throw new Error("The book for this set was removed.");
  const sections = (await bookSections(set.bookId)).filter((s) => s.index >= set.range!.start && s.index <= set.range!.end);
  const isPdf = book.format === "pdf";

  // Group consecutive pages into requests of a manageable size.
  const batches: (typeof sections)[] = [];
  let current: typeof sections = [];
  let size = 0;
  for (const s of sections) {
    if (current.length && size + s.text.length > CHARS_PER_CALL) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += s.text.length;
  }
  if (current.length) batches.push(current);

  const problems: Problem[] = [];
  for (const batch of batches) {
    const text = batch.map((s) => `[[PAGE ${s.index}]]\n${s.text}`).join("\n\n");
    const result = await structured(ExtractedProblems, EXTRACT_SYSTEM, [
      {
        type: "text",
        text:
          `These are end-of-chapter exercises from the textbook “${book.title}”. Each [[PAGE n]] marker starts a page; ` +
          `use n as the page value.\n\n${text}`,
      },
    ]);
    for (const p of result.problems) {
      const section = batch.find((s) => s.index === p.page) ?? batch[0];
      const locator = isPdf
        ? { pageIndex: section.index, pageLabel: section.title !== String(section.index + 1) ? section.title : undefined }
        : { chapterIndex: section.index, chapterTitle: section.title };
      problems.push(
        newProblem(set, problems.length, {
          number: p.number, text: p.text, concepts: normalizeConcepts(p.concepts), hasFigure: p.has_figure,
          bookId: set.bookId, locator,
        }),
      );
    }
  }
  return problems;
}

function normalizeConcepts(concepts: string[]): string[] {
  return [...new Set(concepts.map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(0, 4);
}

// MARK: - Linking

const PROBLEMS_PER_LINK_CALL = 6;

/** Links problems to the book pages that teach them and to similar end-of-chapter exercises. */
export async function linkProblems(problems: Problem[]): Promise<void> {
  if (!problems.length) return;
  const books = new Map((await db.books.toArray()).map((b) => [b.id, b]));
  const bookSets = (await db.problemSets.where("kind").equals("book").toArray()).filter((s) => s.bookId && s.range);
  const exerciseRanges = bookSets.map((s) => ({ bookId: s.bookId!, start: s.range!.start, end: s.range!.end }));
  const setIds = new Set(problems.map((p) => p.setId));
  const exercises = (await db.problems.where("kind").equals("book").toArray()).filter((p) => !setIds.has(p.setId));
  const exerciseIndex = exercises.length ? new BM25Index(exercises.map((e) => `${e.concepts.join(" ")} ${e.text}`)) : null;

  for (let start = 0; start < problems.length; start += PROBLEMS_PER_LINK_CALL) {
    const batch = problems.slice(start, start + PROBLEMS_PER_LINK_CALL);
    // Short ids (P1, E1, Q1) keep the prompt compact; these maps translate them back.
    const passages = new Map<string, { bookId: string; locator: Locator; text: string }>();
    const passageKeys = new Map<number, string>();
    const exerciseIds = new Map<string, Problem>();
    const exerciseKeys = new Map<string, string>();
    const problemLines: string[] = [];

    for (const [i, problem] of batch.entries()) {
      const query = `${problem.concepts.join(" ")} ${problem.text}`;
      const chunks = await searchBooks(query, {
        limit: 8,
        bookIds: problem.bookId ? [problem.bookId] : undefined,
        include: (chunk) => !inRanges(chunk.bookId, chunk.locator, exerciseRanges),
      });
      const passageIds = chunks.map((chunk) => {
        let id = passageKeys.get(chunk.id!);
        if (!id) {
          id = `P${passages.size + 1}`;
          passageKeys.set(chunk.id!, id);
          passages.set(id, { bookId: chunk.bookId, locator: chunk.locator, text: chunk.text });
        }
        return id;
      });
      const similar = exerciseIndex ? exerciseIndex.search(query, 5).map((h) => exercises[h.index]) : [];
      const similarIds = similar.map((e) => {
        let id = exerciseKeys.get(e.id);
        if (!id) {
          id = `E${exerciseIds.size + 1}`;
          exerciseKeys.set(e.id, id);
          exerciseIds.set(id, e);
        }
        return id;
      });
      problemLines.push(
        `<problem id="Q${i + 1}" candidate_passages="${passageIds.join(",")}" candidate_exercises="${similarIds.join(",")}">\n` +
          `Number: ${problem.number}\nConcepts: ${problem.concepts.join(", ")}\n${problem.text}\n</problem>`,
      );
    }

    if (!passages.size && !exerciseIds.size) {
      await db.problems.bulkUpdate(batch.map((p) => ({ key: p.id, changes: { linked: true } })));
      continue;
    }

    const passageText = [...passages]
      .map(([id, p]) => `<passage id="${id}" source="${books.get(p.bookId)?.title ?? "Book"}" location="${locatorLabel(p.locator)}">\n${p.text}\n</passage>`)
      .join("\n");
    const exerciseText = [...exerciseIds]
      .map(([id, e]) => `<exercise id="${id}" source="${books.get(e.bookId ?? "")?.title ?? "Book"}" location="${locatorLabel(e.locator)}">\nNumber: ${e.number}\n${e.text}\n</exercise>`)
      .join("\n");

    const result = await structured(ProblemLinks, LINK_SYSTEM, [
      {
        type: "text",
        text: `<passages>\n${passageText}\n</passages>\n\n<exercises>\n${exerciseText}\n</exercises>\n\n<problems>\n${problemLines.join("\n")}\n</problems>`,
      },
    ]);

    const updates = batch.map((problem, i) => {
      const link = result.links.find((l) => l.problem_id === `Q${i + 1}`);
      const bookLinks = (link?.passages ?? [])
        .map((p) => ({ passage: passages.get(p.passage_id), reason: p.reason }))
        .filter((p) => p.passage)
        .slice(0, 3)
        .map((p) => ({ bookId: p.passage!.bookId, locator: p.passage!.locator, reason: p.reason }));
      const relatedIds = (link?.similar_exercise_ids ?? [])
        .map((id) => exerciseIds.get(id)?.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 3);
      const concepts = link?.concepts.length ? normalizeConcepts(link.concepts) : problem.concepts;
      return { key: problem.id, changes: { bookLinks, relatedIds, concepts, linked: true } };
    });
    await db.problems.bulkUpdate(updates);
  }
}

/** Re-links a set, for example after adding a book's end-of-chapter exercises. */
export async function relinkSet(setId: string): Promise<void> {
  await db.problems.where("setId").equals(setId).modify({ linked: false });
  await processSet(setId);
}
