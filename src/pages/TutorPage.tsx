import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BlobThumbs, Markdown, PhotoButton, readerPath, StoredImage } from "../components/common";
import PencilCanvas from "../components/PencilCanvas";
import { db, locatorLabel, type ChatMessage, type SourceRef, type TutorMode } from "../lib/db";
import { sendMessage, useSendingSessions } from "../lib/tutor";

const MODES: Array<{ id: TutorMode; label: string }> = [
  { id: "coach", label: "Coach" },
  { id: "explain", label: "Explain" },
  { id: "quiz", label: "Quiz me" },
];

const QUICK_PROMPTS = ["Give me a hint", "Check my work", "Explain it another way", "Why does that work?", "Quiz me on this"];

export default function TutorPage() {
  const { id = "" } = useParams();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const books = useLiveQuery(() => db.books.toArray(), [], []);
  const problem = useLiveQuery(async () => (session?.problemId ? db.problems.get(session.problemId) : undefined), [session?.problemId]);
  const sending = useSendingSessions().has(id);
  const [text, setText] = useState("");
  const [images, setImages] = useState<Blob[]>([]);
  const [drawing, setDrawing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const messageCount = session?.messages.length ?? 0;
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which an effect must not return.
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, sending]);

  if (session === undefined) return null;
  if (!session) return <div className="page empty"><h2>Session not found</h2><Link to="/tutor">Back to sessions</Link></div>;

  const send = (message: string) => {
    if (sending) return;
    void sendMessage(id, message, images);
    if (message === text) setText("");
    setImages([]);
  };

  const setMode = (mode: TutorMode) => db.sessions.update(id, { mode });
  const toggleBook = (bookId: string) =>
    db.sessions.update(id, {
      focusBookIds: session.focusBookIds.includes(bookId)
        ? session.focusBookIds.filter((b) => b !== bookId)
        : [...session.focusBookIds, bookId],
    });

  return (
    <div className="chat">
      <div className="chat-header">
        <Link to="/tutor" className="button small ghost" aria-label="Back">‹</Link>
        <h1>{session.title}</h1>
        <div className="segmented" role="group" aria-label="Tutor mode">
          {MODES.map((m) => (
            <button key={m.id} className={session.mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        {books.length > 1 && (
          <details>
            <summary className="button small">📚 {session.focusBookIds.length ? `${session.focusBookIds.length} book(s)` : "All books"}</summary>
            <div className="card" style={{ position: "absolute", right: 16, zIndex: 5 }}>
              {books.map((b) => (
                <label key={b.id} className="row small">
                  <input type="checkbox" checked={session.focusBookIds.includes(b.id)} onChange={() => toggleBook(b.id)} /> {b.title}
                </label>
              ))}
              <p className="muted small">None checked = search all books.</p>
            </div>
          </details>
        )}
      </div>

      <div className="messages">
        {problem && (
          <div className="card small">
            <strong>Working on problem {problem.number}</strong>{" "}
            <Link to={`/problems/p/${problem.id}`}>View problem</Link>
            <div className="problem-text">{problem.text}</div>
          </div>
        )}
        {session.messages.length === 0 && !problem && <EmptyHint mode={session.mode} />}
        {session.messages.map((m) => <Message key={m.id} message={m} />)}
        {sending && <div className="muted">Thinking…</div>}
        <div ref={bottom} />
      </div>

      <div className="composer">
        <div className="inner">
          <div className="quick">
            {QUICK_PROMPTS.map((q) => (
              <button key={q} className="small" disabled={sending} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
          <BlobThumbs blobs={images} onRemove={(i) => setImages(images.filter((_, j) => j !== i))} />
          <div className="inputs">
            <PhotoButton className="icon-button" camera onPhotos={(f) => setImages([...images, ...f])}>📷</PhotoButton>
            <PhotoButton className="icon-button" onPhotos={(f) => setImages([...images, ...f])}>🖼</PhotoButton>
            <button className="icon-button" onClick={() => setDrawing(true)} aria-label="Write by hand">✍️</button>
            <textarea
              rows={1}
              value={text}
              placeholder="Ask a question or describe what you tried…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(text);
              }}
            />
            <button
              className="primary icon-button"
              aria-label="Send"
              disabled={sending || (!text.trim() && !images.length)}
              onClick={() => send(text)}
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      {drawing && <PencilCanvas onAttach={(blob) => setImages((prev) => [...prev, blob])} onClose={() => setDrawing(false)} />}
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const unique = message.sources.filter(
    (s, i, all) => all.findIndex((o) => o.bookId === s.bookId && locatorLabel(o.locator) === locatorLabel(s.locator)) === i,
  );
  return (
    <div className={`msg ${isUser ? "user" : ""} ${message.excluded && !isUser ? "error" : ""}`}>
      {message.imageIds.length > 0 && (
        <div className="thumbs">{message.imageIds.map((imageId) => <StoredImage key={imageId} id={imageId} />)}</div>
      )}
      {message.text && (
        <div className="bubble">
          {isUser ? <div style={{ whiteSpace: "pre-wrap" }}>{message.text}</div> : <Markdown text={message.text} />}
        </div>
      )}
      {unique.length > 0 && <Sources sources={unique} />}
    </div>
  );
}

function Sources({ sources }: { sources: SourceRef[] }) {
  return (
    <div className="chips" aria-label="Passages from your books">
      {sources.map((s, i) => (
        <Link key={i} className="chip" to={readerPath(s.bookId, s.locator)}>📖 {s.bookTitle} · {locatorLabel(s.locator)}</Link>
      ))}
    </div>
  );
}

function EmptyHint({ mode }: { mode: TutorMode }) {
  const text = {
    coach: ["Bring a problem you're stuck on.", "You'll get hints before answers. Once you get it, the tutor asks about the same idea from a different angle to make sure it sticks."],
    explain: ["Ask about any concept.", "You'll get a direct explanation grounded in your book, then a quick question to check it landed."],
    quiz: ["Name a topic to be quizzed on.", "For example “stoichiometry, chapter 4” or “gas laws”. Questions get harder as you go."],
  }[mode];
  return (
    <div className="empty">
      <h2>{text[0]}</h2>
      <p>{text[1]}</p>
      <p>Snap a photo of a problem 📷, or work it out by hand ✍️ and attach it.</p>
    </div>
  );
}
