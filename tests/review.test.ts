import { describe, expect, it } from "vitest";
import type { Problem } from "../src/lib/db";
import { recordAttempt, reviewQueue, weakConcepts } from "../src/lib/review";

const DAY = 86_400_000;

function problem(id: string, fields: Partial<Problem> = {}): Problem {
  return {
    id, setId: "s", kind: "test", order: 0, number: id, text: "", concepts: ["gas laws"], hasFigure: false,
    bookLinks: [], relatedIds: [], linked: true, box: 0, attempts: 0, ...fields,
  };
}

describe("recordAttempt", () => {
  it("moves up a box when correct and resets when missed", () => {
    const now = 1_000_000;
    const right = recordAttempt(problem("a", { box: 1 }), "correct", now);
    expect(right.box).toBe(2);
    expect(right.nextDue).toBe(now + 4 * DAY);
    const wrong = recordAttempt(problem("a", { box: 3 }), "missed", now);
    expect(wrong.box).toBe(0);
    expect(wrong.nextDue).toBe(now + DAY);
  });

  it("brings partial answers back sooner without changing the box", () => {
    const partial = recordAttempt(problem("a", { box: 3 }), "partial", 0);
    expect(partial.box).toBe(3);
    expect(partial.nextDue).toBe(4 * DAY);
  });
});

describe("reviewQueue", () => {
  it("returns only due problems, alternating concepts", () => {
    const due = (id: string, concept: string, t: number) => problem(id, { concepts: [concept], nextDue: t, attempts: 1 });
    const queue = reviewQueue(
      [due("g1", "gas", 1), due("g2", "gas", 2), due("m1", "moles", 3), due("later", "moles", 99), problem("new")],
      10,
    );
    expect(queue.map((p) => p.id)).toEqual(["g1", "m1", "g2"]);
  });
});

describe("weakConcepts", () => {
  it("ranks concepts by misses", () => {
    const result = weakConcepts([
      problem("a", { concepts: ["molarity"], lastResult: "missed" }),
      problem("b", { concepts: ["molarity", "dilution"], lastResult: "partial" }),
      problem("c", { concepts: ["dilution"], lastResult: "correct" }),
    ]);
    expect(result).toEqual([
      { concept: "molarity", missed: 2, total: 2 },
      { concept: "dilution", missed: 1, total: 2 },
    ]);
  });
});
