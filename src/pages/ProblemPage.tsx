import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookLinks, readerPath, StoredImage } from "../components/common";
import { db, locatorLabel, type AttemptResult, type Problem } from "../lib/db";
import { recordAttempt } from "../lib/review";
import { createSession, sendMessage } from "../lib/tutor";

export default function ProblemPage() {
  const { id = "" } = useParams();
  const problem = useLiveQuery(() => db.problems.get(id), [id]);
  if (problem === undefined) return null;
  if (!problem) return <div className="page empty"><h2>Problem not found</h2><Link to="/problems">Back</Link></div>;
  return (
    <div className="page">
      <Link to={`/problems/set/${problem.setId}`} className="small">‹ Back to set</Link>
      <ProblemView problem={problem} />
    </div>
  );
}

/** A problem with its photo, concepts, linked book pages, similar exercises, and practice actions. */
export function ProblemView({ problem, onRecorded }: { problem: Problem; onRecorded?: () => void }) {
  const navigate = useNavigate();
  const set = useLiveQuery(() => db.problemSets.get(problem.setId), [problem.setId]);
  const related = useLiveQuery(() => db.problems.bulkGet(problem.relatedIds), [problem.relatedIds.join()], [] as (Problem | undefined)[]);
  const usedIn = useLiveQuery(
    () => db.problems.where("kind").equals("test").filter((p) => p.relatedIds.includes(problem.id)).toArray(),
    [problem.id],
    [],
  );
  const book = useLiveQuery(async () => (problem.bookId ? db.books.get(problem.bookId) : undefined), [problem.bookId]);
  const relatedProblems = related.filter((r): r is Problem => r !== undefined);
  const imageId = problem.imageIndex !== undefined ? set?.imageIds[problem.imageIndex] : undefined;

  const workOnIt = async () => {
    const sessionId = await createSession("coach", problem);
    navigate(`/tutor/${sessionId}`);
    void sendMessage(sessionId, "I want to work on this problem. Help me get started.", [], imageId ? [imageId] : []);
  };

  const record = async (result: AttemptResult) => {
    await db.problems.update(problem.id, recordAttempt(problem, result));
    onRecorded?.();
  };

  return (
    <>
      <h1>Problem {problem.number}</h1>
      <p className="muted small">
        {set?.title}
        {book && problem.locator && (
          <> · <Link to={readerPath(book.id, problem.locator)}>{book.title}, {locatorLabel(problem.locator)}</Link></>
        )}
      </p>
      <div className="card">
        <div className="problem-text">{problem.text}</div>
        {imageId && (
          <details style={{ marginTop: 8 }} open={problem.hasFigure}>
            <summary className="muted small">Original photo{problem.hasFigure ? " (has a figure)" : ""}</summary>
            <StoredImage id={imageId} className="photo" />
          </details>
        )}
      </div>
      <div className="chips">{problem.concepts.map((c) => <span key={c} className="chip">{c}</span>)}</div>

      <div className="row" style={{ margin: "12px 0" }}>
        <button className="primary" onClick={workOnIt}>💬 Work on it with the tutor</button>
      </div>

      <h2>How did it go?</h2>
      <div className="row">
        <button onClick={() => record("correct")}>✅ Got it</button>
        <button onClick={() => record("partial")}>🟡 Partly</button>
        <button onClick={() => record("missed")}>❌ Missed it</button>
      </div>
      {problem.attempts > 0 && problem.nextDue && (
        <p className="muted small">
          Tried {problem.attempts}×. Next review {new Date(problem.nextDue).toLocaleDateString()}.
        </p>
      )}

      <h2>Read in your book</h2>
      {problem.linked ? <BookLinks links={problem.bookLinks} /> : <p className="muted small">Linking in progress…</p>}

      {problem.kind === "test" && (
        <>
          <h2>Similar end-of-chapter problems</h2>
          {relatedProblems.length ? (
            <div className="list">
              {relatedProblems.map((r) => <RelatedCard key={r.id} problem={r} />)}
            </div>
          ) : (
            <p className="muted small">
              None yet. <Link to="/problems/new-book">Add your book's exercises</Link>, then use “Re-link to book” on this test.
            </p>
          )}
        </>
      )}

      {problem.kind === "book" && usedIn.length > 0 && (
        <>
          <h2>Matches these test questions</h2>
          <div className="list">{usedIn.map((r) => <RelatedCard key={r.id} problem={r} />)}</div>
        </>
      )}
    </>
  );
}

function RelatedCard({ problem }: { problem: Problem }) {
  return (
    <Link className="card" to={`/problems/p/${problem.id}`}>
      <strong>Problem {problem.number}{problem.locator ? ` · ${locatorLabel(problem.locator)}` : ""}</strong>
      <div className="small" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {problem.text}
      </div>
    </Link>
  );
}
