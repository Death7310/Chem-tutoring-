import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/db";
import { useSettings } from "../lib/settings";
import { createSession, deleteSession } from "../lib/tutor";

export default function TutorListPage() {
  const sessions = useLiveQuery(() => db.sessions.orderBy("updatedAt").reverse().toArray(), [], []);
  const settings = useSettings();
  const navigate = useNavigate();

  const start = async () => navigate(`/tutor/${await createSession(settings.defaultMode)}`);

  return (
    <div className="page">
      <div className="row">
        <h1 className="spacer">Tutor</h1>
        <button className="primary" onClick={start}>＋ New session</button>
      </div>
      {!settings.apiKey && (
        <div className="card">
          <strong>Add your Claude API key to start.</strong>{" "}
          <Link to="/settings">Go to Settings</Link>
        </div>
      )}
      {sessions.length === 0 ? (
        <div className="empty">
          <h2>Bring a problem you're stuck on</h2>
          <p>The tutor gives hints before answers, then checks that you really understand from a different angle.</p>
        </div>
      ) : (
        <div className="list">
          {sessions.map((s) => (
            <div key={s.id} className="card row">
              <Link to={`/tutor/${s.id}`} className="spacer" style={{ color: "inherit", textDecoration: "none" }}>
                <strong>{s.title}</strong>
                <div className="muted small">
                  {new Date(s.updatedAt).toLocaleString()} · {s.messages.filter((m) => m.role === "user").length} messages
                </div>
              </Link>
              <button
                className="small ghost danger"
                onClick={() => confirm("Delete this session?") && deleteSession(s.id)}
                aria-label="Delete session"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
