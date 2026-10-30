import type Anthropic from "@anthropic-ai/sdk";
import { useSyncExternalStore } from "react";
import { chat, friendlyError } from "./claude/client";
import { TUTOR_SYSTEM } from "./claude/prompts";
import {
  db, locatorLabel, newId, type ChatMessage, type Chunk, type Problem, type SourceRef, type StoredBlock, type StudySession, type TutorMode,
} from "./db";
import { imageBlock, prepareImage, saveImage, storedImageBase64 } from "./images";
import { recognizeText } from "./importers/ocr";
import { searchBooks } from "./library";

// MARK: - Sending state

const sending = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = new Set<string>();
function setSending(id: string, on: boolean) {
  if (on) sending.add(id);
  else sending.delete(id);
  snapshot = new Set(sending);
  listeners.forEach((l) => l());
}
export function useSendingSessions(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

// MARK: - Sessions

export async function createSession(mode: TutorMode, problem?: Problem): Promise<string> {
  const now = Date.now();
  const session: StudySession = {
    id: newId(),
    title: problem ? `Problem ${problem.number}` : "New session",
    createdAt: now,
    updatedAt: now,
    mode,
    focusBookIds: [],
    problemId: problem?.id,
    messages: [],
  };
  await db.sessions.put(session);
  return session.id;
}

export async function deleteSession(id: string): Promise<void> {
  const session = await db.sessions.get(id);
  if (session) await db.files.bulkDelete(session.messages.flatMap((m) => m.imageIds));
  await db.sessions.delete(id);
}

async function updateSession(id: string, change: (s: StudySession) => void): Promise<void> {
  await db.transaction("rw", db.sessions, async () => {
    const session = await db.sessions.get(id);
    if (!session) return;
    change(session);
    session.updatedAt = Date.now();
    await db.sessions.put(session);
  });
}

// MARK: - Sending a message

/** Sends a student message: reads attached images, finds book passages, calls Claude, saves both sides. */
export async function sendMessage(sessionId: string, text: string, images: Blob[], extraImageIds: string[] = []): Promise<void> {
  const session = await db.sessions.get(sessionId);
  const trimmed = text.trim();
  if (!session || sending.has(sessionId) || (!trimmed && !images.length && !extraImageIds.length)) return;
  setSending(sessionId, true);

  try {
    const imageIds = [...extraImageIds];
    for (const image of images) imageIds.push(await saveImage(await prepareImage(image)));

    const problem = session.problemId ? await db.problems.get(session.problemId) : undefined;
    const books = new Map((await db.books.toArray()).map((b) => [b.id, b]));

    // Find book passages. Short replies like "I don't get it" also use the tutor's last message.
    // Photos sent without much text are read on-device so their topic can be searched for.
    let query = trimmed;
    if (images.length && trimmed.length < 60 && !problem) {
      for (const image of images) query += "\n" + (await recognizeText(image));
    }
    const lastReply = [...session.messages].reverse().find((m) => m.role === "assistant" && !m.excluded);
    if (trimmed.length < 60 && lastReply) query += "\n" + lastReply.text;
    if (problem) query += `\n${problem.concepts.join(" ")} ${problem.text}`;
    const passages = await searchBooks(query, { bookIds: session.focusBookIds, limit: 6 });

    const sources: SourceRef[] = passages.map((c) => ({
      bookId: c.bookId, bookTitle: books.get(c.bookId)?.title ?? "Book", locator: c.locator,
    }));

    const isFirstTurn = !session.messages.some((m) => !m.excluded);
    const turnText = buildTurnText({
      text: trimmed,
      hasImages: imageIds.length > 0,
      mode: session.mode,
      passages,
      sources,
      hasBooks: books.size > 0,
      problem: isFirstTurn ? problem : undefined,
      bookTitle: (id) => books.get(id)?.title ?? "Book",
    });

    const content: StoredBlock[] = [
      ...imageIds.map((id) => ({ type: "image_ref", fileId: id })),
      { type: "text", text: turnText },
    ];
    const userMessage: ChatMessage = {
      id: newId(), role: "user", createdAt: Date.now(), text: trimmed, imageIds, sources: [], content,
    };
    await updateSession(sessionId, (s) => {
      s.messages.push(userMessage);
      if (s.title === "New session") s.title = (trimmed || "Image question").slice(0, 48);
    });

    const updated = (await db.sessions.get(sessionId))!;
    const history: Anthropic.Beta.BetaMessageParam[] = [];
    for (const message of updated.messages.filter((m) => !m.excluded)) {
      history.push({ role: message.role, content: await expandContent(message.content) });
    }

    try {
      const result = await chat(TUTOR_SYSTEM, history);
      if (result.stopReason === "refusal" || !result.content.length) {
        await fail(sessionId, userMessage.id, "The tutor couldn't answer that one. Try rephrasing the question.");
        return;
      }
      let reply = result.text;
      if (result.stopReason === "max_tokens") reply += "\n\n_(The reply was cut off. Ask the tutor to continue.)_";
      const assistant: ChatMessage = {
        id: newId(), role: "assistant", createdAt: Date.now(), text: reply, imageIds: [], sources,
        content: result.content as unknown as StoredBlock[],
      };
      await updateSession(sessionId, (s) => s.messages.push(assistant));
    } catch (error) {
      await fail(sessionId, userMessage.id, friendlyError(error));
    }
  } finally {
    setSending(sessionId, false);
  }
}

/** Keeps the failed message visible but out of the API history, so turns still alternate. */
async function fail(sessionId: string, userMessageId: string, reason: string) {
  await updateSession(sessionId, (s) => {
    const message = s.messages.find((m) => m.id === userMessageId);
    if (message) message.excluded = true;
    s.messages.push({
      id: newId(), role: "assistant", createdAt: Date.now(), text: reason, imageIds: [], sources: [], content: [], excluded: true,
    });
  });
}

/** Replaces stored image references with the image data, leaving everything else byte-for-byte. */
async function expandContent(content: StoredBlock[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const out: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const block of content) {
    if (block.type === "image_ref") {
      const data = await storedImageBase64(String(block.fileId));
      if (data) out.push(imageBlock(data));
    } else {
      out.push(block as unknown as Anthropic.Beta.BetaContentBlockParam);
    }
  }
  return out;
}

interface TurnInput {
  text: string;
  hasImages: boolean;
  mode: TutorMode;
  passages: Chunk[];
  sources: SourceRef[];
  hasBooks: boolean;
  problem?: Problem;
  bookTitle: (bookId: string) => string;
}

export function buildTurnText(input: TurnInput): string {
  let out = "<book_passages>\n";
  if (!input.hasBooks) out += "The student has not imported any books yet.\n";
  else if (!input.passages.length) out += "No passages in the student's books matched this message.\n";
  input.passages.forEach((chunk, i) => {
    const source = input.sources[i];
    out += `<passage id="${i + 1}" source="${source.bookTitle}" location="${locatorLabel(source.locator)}">\n${chunk.text}\n</passage>\n`;
  });
  out += "</book_passages>\n\n";

  if (input.problem) {
    const p = input.problem;
    out += `<current_problem number="${p.number}">\n${p.text}\nConcepts: ${p.concepts.join(", ")}\n`;
    if (p.bookLinks.length) {
      out += "Linked book pages:\n";
      for (const link of p.bookLinks) out += `- ${input.bookTitle(link.bookId)}, ${locatorLabel(link.locator)}: ${link.reason}\n`;
    }
    out += "</current_problem>\n\n";
  }

  out += `<tutor_mode>${input.mode}</tutor_mode>\n\n<student_message>\n`;
  out += input.text || (input.hasImages ? "(The student sent the attached image(s) without a message.)" : "");
  out += "\n</student_message>";
  return out;
}
