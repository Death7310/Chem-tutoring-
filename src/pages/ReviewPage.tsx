import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../lib/db";
import { reviewQueue } from "../lib/review";
import { ProblemView } from "./ProblemPage";

/** One due problem at a time, mixed across concepts. Problems enter review once you mark an attempt. */
export default function ReviewPage() {
  const problems = useLiveQuery(() => db.problems.toArray(), [], []);
  // Freeze the queue order for this visit so recording a result doesn't reshuffle it.
  const [queueIds, setQueueIds] = useState<string[] | null>(null);
  const live = reviewQueue(problems);
  const ids = queueIds ?? live.map((p) => p.id);
  const remaining = ids.filter((id) => live.some((p) => p.id === id));
  const current = problems.find((p) => p.id === remaining[0]);

  if (!problems.some((p) => p.attempts > 0)) {
    return (
      <div className="page empty">
        <h2>Nothing to review yet</h2>
        <p>Open a problem and mark how it went (✅ 🟡 ❌). It comes back here on a spaced schedule: soon if you missed it, later each time you get it right.</p>
        <Link className="button primary" to="/problems">Go to problems</Link>
      </div>
    );
  }

  if (!current) {
    const next = problems.filter((p) => p.nextDue).sort((a, b) => a.nextDue! - b.nextDue!)[0];
    return (
      <div className="page empty">
        <h2>All caught up 🎉</h2>
        {next?.nextDue && <p>Next review: {new Date(next.nextDue).toLocaleDateString()}.</p>}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row muted small">
        <span className="spacer">Review · {remaining.length} left</span>
      </div>
      <ProblemView key={current.id} problem={current} onRecorded={() => setQueueIds(remaining.slice(1))} />
    </div>
  );
}
