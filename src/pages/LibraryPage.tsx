import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Progress } from "../components/common";
import { db } from "../lib/db";
import { deleteBook, importBook } from "../lib/library";

export default function LibraryPage() {
  const books = useLiveQuery(() => db.books.orderBy("importedAt").reverse().toArray(), [], []);
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ name: string; progress: number } | null>(null);
  const [error, setError] = useState("");

  const importFiles = async (files: File[]) => {
    setError("");
    for (const file of files) {
      setStatus({ name: file.name, progress: 0 });
      try {
        await importBook(file, (progress) => setStatus({ name: file.name, progress }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setStatus(null);
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="spacer">Library</h1>
        <button className="primary" disabled={!!status} onClick={() => input.current?.click()}>＋ Import book</button>
        <input
          ref={input}
          type="file"
          accept=".pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain,text/markdown"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void importFiles(files);
          }}
        />
      </div>

      {status && (
        <div className="card">
          <div className="row small"><span className="spacer">Importing {status.name}</span>{Math.round(status.progress * 100)}%</div>
          <Progress value={status.progress} />
          <p className="muted small">Keep this screen open. Large or scanned books can take several minutes.</p>
        </div>
      )}
      {error && <div className="card error">{error}</div>}

      {books.length === 0 && !status ? (
        <div className="empty">
          <h2>No books yet</h2>
          <p>Import your textbook as a PDF or EPUB, or notes as a text or Markdown file. The tutor searches them and cites the pages it uses.</p>
          <p className="small">Books stay on this device. Textbooks bought through platforms like VitalSource or Kindle are usually copy-protected and can't be imported.</p>
        </div>
      ) : (
        <div className="list">
          {books.map((b) => (
            <div key={b.id} className="card row">
              <Link to={`/library/${b.id}`} className="spacer" style={{ color: "inherit", textDecoration: "none" }}>
                <strong>{b.format === "pdf" ? "📄" : "📘"} {b.title}</strong>
                <div className="muted small">
                  {b.format.toUpperCase()} · {b.sectionCount} {b.format === "pdf" ? "pages" : "sections"} · {b.chunkCount} passages indexed
                </div>
              </Link>
              <button
                className="small ghost danger"
                aria-label={`Delete ${b.title}`}
                onClick={() => confirm(`Delete “${b.title}” and its exercise sets?`) && deleteBook(b.id)}
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
