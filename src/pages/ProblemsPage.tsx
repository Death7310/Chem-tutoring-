import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { db, type ProblemSet } from "../lib/db";
import { useRunningJobs } from "../lib/problems";
import { reviewQueue, weakConcepts } from "../lib/review";

export function setStatusText(set: ProblemSet, running: boolean): string {
  if (set.status === "ready") return "";
  if (set.status === "failed") return `Failed: ${set.error ?? "unknown error"}`;
  if (!running) return "Interrupted. Open it to retry.";
  return set.status === "extracting" ? "Reading problems…" : "Linking to your book…";
}

export default function ProblemsPage() {
  const sets = useLiveQuery(() => db.problemSets.orderBy("createdAt").reverse().toArray(), [], []);
  const problems = useLiveQuery(() => db.problems.toArray(), [], []);
  const running = useRunningJobs();
  const due = reviewQueue(problems).length;
  const weak = weakConcepts(problems).slice(0, 6);

  const counts = new Map<string, number>();
  for (const p of problems) counts.set(p.setId, (counts.get(p.setId) ?? 0) + 1);

  const renderSet = (set: ProblemSet) => (
    <Link key={set.id} className="card" to={`/problems/set/${set.id}`}>
      <div className="row">
        <strong className="spacer">{set.kind === "test" ? "📝" : "📘"} {set.title}</strong>
        <span className="muted small">{counts.get(set.id) ?? 0} problems</span>
      </div>
      {set.status !== "ready" && (
        <div className={`small ${set.status === "failed" ? "error" : "muted"}`}>{setStatusText(set, running.has(set.id))}</div>
      )}
    </Link>
  );

  const tests = sets.filter((s) => s.kind === "test");
  const bookSets = sets.filter((s) => s.kind === "book");

  return (
    <div className="page">
      <h1>Problems</h1>
      <div className="row">
        <Link className="button primary" to="/problems/new-test">📷 Add a practice test</Link>
        <Link className="button" to="/problems/new-book">📘 Add book exercises</Link>
      </div>

      {(due > 0 || weak.length > 0) && (
        <div className="card">
          {due > 0 && (
            <div className="row">
              <strong className="spacer">🔁 {due} problem{due === 1 ? "" : "s"} due for review</strong>
              <Link className="button small primary" to="/review">Start review</Link>
            </div>
          )}
          {weak.length > 0 && (
            <>
              <div className="muted small" style={{ marginTop: 8 }}>Concepts to work on</div>
              <div className="chips">
                {weak.map((w) => <span key={w.concept} className="chip">{w.concept} · {w.missed}/{w.total} missed</span>)}
              </div>
            </>
          )}
        </div>
      )}

      <h2>Practice tests</h2>
      {tests.length ? tests.map(renderSet) : (
        <p className="muted">Photograph a practice test or worksheet. Each question gets transcribed, tagged with concepts, and linked to the pages in your book that teach it, plus similar end-of-chapter problems.</p>
      )}

      <h2>Book exercises</h2>
      {bookSets.length ? bookSets.map(renderSet) : (
        <p className="muted">Add the end-of-chapter problems from your textbook. They become practice problems, and your tests get linked to the most similar ones.</p>
      )}
    </div>
  );
}
