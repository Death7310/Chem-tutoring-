import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Claude is mocked: these tests check what the app sends and how it stores the answers.
const structured = vi.fn();
vi.mock("../src/lib/claude/client", () => ({
  structured: (...args: unknown[]) => structured(...args),
  friendlyError: (e: unknown) => String(e),
  chat: vi.fn(),
}));

// The PDF engine needs a real browser; these tests don't import PDFs.
vi.mock("../src/lib/importers/pdf", () => ({ extractPdf: vi.fn(), openPdf: vi.fn() }));

const { db } = await import("../src/lib/db");
const { invalidateIndex } = await import("../src/lib/library");
const { createBookSet, processSet } = await import("../src/lib/problems");
const { buildTurnText } = await import("../src/lib/tutor");

const BOOK = "book-1";

async function seedBook() {
  await db.books.put({ id: BOOK, title: "Chem 2e", format: "pdf", fileName: "c.pdf", importedAt: 0, sectionCount: 4, chunkCount: 3 });
  await db.sections.bulkAdd([
    { bookId: BOOK, index: 0, title: "180", text: "Molarity is moles of solute per liter of solution." },
    { bookId: BOOK, index: 1, title: "181", text: "Dilution: M1V1 = M2V2 relates concentrations before and after adding solvent." },
    { bookId: BOOK, index: 2, title: "182", text: "Exercises\n1. What is the molarity of 2 mol NaCl in 4 L?\n2. Dilute 1 L of 2 M HCl to 4 L." },
  ]);
  await db.chunks.bulkAdd([
    { bookId: BOOK, locator: { pageIndex: 0, pageLabel: "180" }, text: "Molarity is moles of solute per liter of solution." },
    { bookId: BOOK, locator: { pageIndex: 1, pageLabel: "181" }, text: "Dilution: M1V1 = M2V2 relates concentrations before and after adding solvent." },
    { bookId: BOOK, locator: { pageIndex: 2, pageLabel: "182" }, text: "Exercises 1. What is the molarity of 2 mol NaCl in 4 L? 2. Dilute 1 L of 2 M HCl" },
  ]);
  invalidateIndex();
}

/** createBookSet starts processing in the background; wait for it to settle. */
async function settled(setId: string) {
  for (let i = 0; i < 200; i++) {
    const status = (await db.problemSets.get(setId))?.status;
    if (status === "ready" || status === "failed") return status;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}

beforeEach(async () => {
  structured.mockReset();
  await db.delete();
  await db.open();
  await seedBook();
});

describe("book exercise pipeline", () => {
  it("extracts exercises from the chosen pages, then links them to teaching pages (not exercise pages)", async () => {
    structured
      .mockResolvedValueOnce({
        problems: [
          { number: "1", text: "What is the molarity of 2 mol NaCl in 4 L?", concepts: ["Molarity"], has_figure: false, page: 2 },
          { number: "2", text: "Dilute 1 L of 2 M HCl to 4 L. What is the new concentration?", concepts: ["dilution"], has_figure: false, page: 2 },
        ],
      })
      .mockImplementationOnce(async (_schema: unknown, _system: string, content: Array<{ text: string }>) => {
        const prompt = content[0].text;
        // Exercise pages are excluded from teaching candidates.
        expect(prompt).not.toContain('location="p. 182"');
        expect(prompt).toContain('location="p. 180"');
        return {
          links: [
            { problem_id: "Q1", concepts: ["molarity"], passages: [{ passage_id: "P1", reason: "Defines molarity" }], similar_exercise_ids: [] },
            { problem_id: "Q2", concepts: ["dilution"], passages: [{ passage_id: "P99", reason: "bogus id" }], similar_exercise_ids: [] },
          ],
        };
      });

    const setId = await createBookSet(BOOK, 2, 2, "Ch 3 exercises");
    await settled(setId);

    const set = await db.problemSets.get(setId);
    expect(set?.status).toBe("ready");
    const problems = await db.problems.where("setId").equals(setId).sortBy("order");
    expect(problems).toHaveLength(2);
    expect(problems[0].locator).toEqual({ pageIndex: 2, pageLabel: "182" });
    expect(problems[0].concepts).toEqual(["molarity"]);

    // The extraction request carried the page text with its page marker.
    expect(structured.mock.calls[0][2][0].text).toContain("[[PAGE 2]]");

    const p1Passage = problems[0].bookLinks[0];
    expect(p1Passage.reason).toBe("Defines molarity");
    expect(p1Passage.locator.pageIndex).toBeLessThan(2);
    // Ids the model made up are ignored.
    expect(problems[1].bookLinks).toEqual([]);
  });

  it("marks the set failed with the error, and retry skips re-extraction", async () => {
    structured.mockResolvedValueOnce({
      problems: [{ number: "1", text: "Molarity of 2 mol in 4 L?", concepts: ["molarity"], has_figure: false, page: 2 }],
    });
    structured.mockRejectedValueOnce(new Error("network down"));
    const setId = await createBookSet(BOOK, 2, 2, "Ch 3");
    expect(await settled(setId)).toBe("failed");
    expect((await db.problemSets.get(setId))?.status).toBe("failed");

    structured.mockResolvedValueOnce({ links: [] });
    await processSet(setId);
    expect((await db.problemSets.get(setId))?.status).toBe("ready");
    expect(structured).toHaveBeenCalledTimes(3); // extract once, link twice
  });
});

describe("buildTurnText", () => {
  it("includes passages, the current problem with its linked pages, the mode and the message", () => {
    const text = buildTurnText({
      text: "I'm stuck",
      hasImages: false,
      mode: "coach",
      passages: [{ bookId: BOOK, locator: { pageIndex: 0, pageLabel: "180" }, text: "Molarity is…" }],
      sources: [{ bookId: BOOK, bookTitle: "Chem 2e", locator: { pageIndex: 0, pageLabel: "180" } }],
      hasBooks: true,
      problem: {
        id: "p", setId: "s", kind: "test", order: 0, number: "4", text: "Find the molarity.", concepts: ["molarity"],
        hasFigure: false, bookLinks: [{ bookId: BOOK, locator: { pageIndex: 0, pageLabel: "180" }, reason: "Defines molarity" }],
        relatedIds: [], linked: true, box: 0, attempts: 0,
      },
      bookTitle: () => "Chem 2e",
    });
    expect(text).toContain('<passage id="1" source="Chem 2e" location="p. 180">');
    expect(text).toContain('<current_problem number="4">');
    expect(text).toContain("- Chem 2e, p. 180: Defines molarity");
    expect(text).toContain("<tutor_mode>coach</tutor_mode>");
    expect(text).toContain("I'm stuck");
  });
});
