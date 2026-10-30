import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../lib/db";
import { detectExerciseRanges, type ExerciseRange } from "../lib/importers/exercises";
import { bookSections } from "../lib/library";
import { createBookSet } from "../lib/problems";
import { useSettings } from "../lib/settings";

/** Large ranges cost more and take longer; nudge toward one chapter at a time. */
const MAX_SECTIONS = 40;

export default function NewBookSetPage() {
  const navigate = useNavigate();
  const { apiKey } = useSettings();
  const books = useLiveQuery(() => db.books.orderBy("importedAt").reverse().toArray(), [], []);
  const [bookId, setBookId] = useState("");
  const book = books.find((b) => b.id === bookId) ?? books[0];
  const sections = useLiveQuery(async () => (book ? bookSections(book.id) : []), [book?.id], []);
  const existing = useLiveQuery(() => db.problemSets.where("kind").equals("book").toArray(), [], []);
  const suggestions = useMemo(() => detectExerciseRanges(sections), [sections]);
  const isPdf = book?.format === "pdf";

  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStart(0);
    setEnd(0);
    setTitle("");
  }, [book?.id]);

  const label = (index: number) => {
    const s = sections[index];
    if (!s) return String(index + 1);
    return isPdf ? `p. ${s.title}` : s.title;
  };

  const pick = (range: ExerciseRange) => {
    setStart(range.start);
    setEnd(range.end);
    setTitle(isPdf ? `Exercises, ${label(range.start)}–${sections[range.end]?.title ?? ""}` : `Exercises: ${range.label}`);
  };

  const alreadyAdded = (r: ExerciseRange) =>
    existing.some((s) => s.bookId === book?.id && s.range && s.range.start <= r.end && s.range.end >= r.start);

  if (!books.length) {
    return (
      <div className="page empty">
        <h2>Import a book first</h2>
        <Link className="button primary" to="/library">Go to Library</Link>
      </div>
    );
  }

  const count = end - start + 1;
  const save = async () => {
    if (!book) return;
    setSaving(true);
    const id = await createBookSet(book.id, start, end, title.trim() || `Exercises, ${label(start)}`);
    navigate(`/problems/set/${id}`, { replace: true });
  };

  return (
    <div className="page">
      <h1>Add book exercises</h1>
      <p className="muted">
        Choose where a chapter's practice problems are. They're transcribed and linked to the sections that teach them.
        Practice tests are then matched to the most similar exercises.
      </p>

      <label className="field">
        <span>Book</span>
        <select value={book?.id} onChange={(e) => setBookId(e.target.value)}>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
      </label>

      {suggestions.length > 0 && (
        <>
          <h2>Exercise sections found</h2>
          <div className="chips">
            {suggestions.map((r) => (
              <button key={`${r.start}-${r.end}`} className="chip" onClick={() => pick(r)}>
                {isPdf ? `${label(r.start)}–${sections[r.end]?.title}` : r.label}
                {alreadyAdded(r) ? " ✓" : ""}
              </button>
            ))}
          </div>
          <p className="muted small">✓ = already added. Tap one to fill in the range below, then adjust if needed.</p>
        </>
      )}

      <h2>Range</h2>
      <div className="row">
        <label className="field spacer">
          <span>From</span>
          <select value={start} onChange={(e) => { const v = Number(e.target.value); setStart(v); if (end < v) setEnd(v); }}>
            {sections.map((s) => <option key={s.index} value={s.index}>{label(s.index)}</option>)}
          </select>
        </label>
        <label className="field spacer">
          <span>To</span>
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {sections.filter((s) => s.index >= start).map((s) => <option key={s.index} value={s.index}>{label(s.index)}</option>)}
          </select>
        </label>
      </div>
      {count > MAX_SECTIONS && (
        <p className="error small">That's {count} {isPdf ? "pages" : "sections"}. Add one chapter's exercises at a time (up to {MAX_SECTIONS}).</p>
      )}

      <label className="field">
        <span>Name</span>
        <input type="text" value={title} placeholder="e.g. Chapter 4 exercises" onChange={(e) => setTitle(e.target.value)} />
      </label>

      {!apiKey && <p className="error">Add your Claude API key in Settings first.</p>}
      <div className="row">
        <button onClick={() => navigate(-1)}>Cancel</button>
        <button className="primary" disabled={saving || !apiKey || count > MAX_SECTIONS} onClick={save}>
          {saving ? "Saving…" : `Read ${count} ${isPdf ? "page" : "section"}${count === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
