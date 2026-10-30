import type { AttemptResult, Problem } from "./db";

/** Leitner-style spacing: each correct answer pushes the next review further out.
 *  Spaced, mixed practice is among the best-supported study methods (Dunlosky et al., 2013). */
export const INTERVAL_DAYS = [1, 2, 4, 8, 16, 32];
const DAY = 24 * 60 * 60 * 1000;

export function recordAttempt(problem: Problem, result: AttemptResult, now = Date.now()): Partial<Problem> {
  let box = problem.box;
  if (result === "correct") box = Math.min(box + 1, INTERVAL_DAYS.length - 1);
  else if (result === "missed") box = 0;
  // "partial" keeps the same box, but it comes back sooner than a correct answer would.
  const days = result === "partial" ? Math.max(1, Math.floor(INTERVAL_DAYS[box] / 2)) : INTERVAL_DAYS[box];
  return { box, lastResult: result, attempts: problem.attempts + 1, nextDue: now + days * DAY };
}

export function isDue(problem: Problem, now = Date.now()): boolean {
  return problem.nextDue !== undefined && problem.nextDue <= now;
}

/** Due problems, interleaved so consecutive problems come from different concepts where possible. */
export function reviewQueue(problems: Problem[], now = Date.now()): Problem[] {
  const due = problems.filter((p) => isDue(p, now)).sort((a, b) => (a.nextDue ?? 0) - (b.nextDue ?? 0));
  const groups = new Map<string, Problem[]>();
  for (const p of due) {
    const key = p.concepts[0] ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const queue: Problem[] = [];
  const lists = [...groups.values()];
  while (lists.some((l) => l.length)) {
    for (const list of lists) {
      const next = list.shift();
      if (next) queue.push(next);
    }
  }
  return queue;
}

/** Concepts ranked by how often their problems were missed or partly right. */
export function weakConcepts(problems: Problem[]): Array<{ concept: string; missed: number; total: number }> {
  const stats = new Map<string, { missed: number; total: number }>();
  for (const p of problems) {
    if (!p.lastResult) continue;
    for (const concept of p.concepts) {
      const s = stats.get(concept) ?? { missed: 0, total: 0 };
      s.total += 1;
      if (p.lastResult !== "correct") s.missed += 1;
      stats.set(concept, s);
    }
  }
  return [...stats]
    .map(([concept, s]) => ({ concept, ...s }))
    .filter((s) => s.missed > 0)
    .sort((a, b) => b.missed - a.missed || b.total - a.total);
}
