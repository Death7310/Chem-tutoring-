import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StoredImage } from "../components/common";
import { db, locatorLabel } from "../lib/db";
import { deleteSet, processSet, relinkSet, useRunningJobs } from "../lib/problems";
import { setStatusText } from "./ProblemsPage";

const RESULT_ICON = { correct: "✅", partial: "🟡", missed: "❌" } as const;

export default function ProblemSetPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const set = useLiveQuery(() => db.problemSets.get(id), [id]);
  const problems = useLiveQuery(() => db.problems.where("setId").equals(id).sortBy("order"), [id], []);
  const book = useLiveQuery(async () => (set?.bookId ? db.books.get(set.bookId) : undefined), [set?.bookId]);
  const running = useRunningJobs().has(id);

  if (set === undefined) return null;
  if (!set) return <div className="page empty"><h2>Not found</h2><Link to="/problems">Back</Link></div>;

  const status = setStatusText(set, running);
  const busy = running && set.status !== "ready" && set.status !== "failed";

  return (
    <div className="page">
      <Link to="/problems" className="small">‹ Problems</Link>
      <h1>{set.title}</h1>
      {book && <p className="muted small">From {book.title}</p>}

      {status && (
        <div className="card">
          <div className={set.status === "failed" ? "error" : ""}>{status}</div>
          {busy && <p className="muted small">This takes about a minute per few pages. You can leave this screen.</p>}
          {!busy && <button className="primary small" onClick={() => processSet(id)}>Retry</button>}
        </div>
      )}

      {set.imageIds.length > 0 && (
        <details>
          <summary className="muted">Page photos ({set.imageIds.length})</summary>
          <div className="thumbs">{set.imageIds.map((img) => <StoredImage key={img} id={img} />)}</div>
        </details>
      )}

      <div className="list" style={{ marginTop: 12 }}>
        {problems.map((p) => (
          <Link key={p.id} className="card" to={`/problems/p/${p.id}`}>
            <div className="row">
              <strong className="spacer">Problem {p.number}{p.locator ? ` · ${locatorLabel(p.locator)}` : ""}</strong>
              {p.lastResult && <span aria-label={p.lastResult}>{RESULT_ICON[p.lastResult]}</span>}
            </div>
            <div className="small" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {p.text}
            </div>
            <div className="chips">
              {p.concepts.map((c) => <span key={c} className="chip">{c}</span>)}
            </div>
            {p.linked && (
              <div className="muted small">
                📖 {p.bookLinks.length} book page{p.bookLinks.length === 1 ? "" : "s"}
                {set.kind === "test" && ` · 🧪 ${p.relatedIds.length} similar exercise${p.relatedIds.length === 1 ? "" : "s"}`}
              </div>
            )}
          </Link>
        ))}
      </div>

      {set.status === "ready" && (
        <div className="row" style={{ marginTop: 16 }}>
          {set.kind === "test" && (
            <button onClick={() => relinkSet(id)} title="Use after adding more book exercises">🔗 Re-link to book</button>
          )}
          <span className="spacer" />
          <button
            className="danger"
            onClick={async () => {
              if (!confirm("Delete this set and its review progress?")) return;
              await deleteSet(id);
              navigate("/problems", { replace: true });
            }}
          >
            Delete set
          </button>
        </div>
      )}
    </div>
  );
}
