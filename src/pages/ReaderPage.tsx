import { useLiveQuery } from "dexie-react-hooks";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { db, type Book, type Section } from "../lib/db";
import { openPdf } from "../lib/importers/pdf";
import { bookFile, bookSections } from "../lib/library";

export default function ReaderPage() {
  const { bookId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const book = useLiveQuery(() => db.books.get(bookId), [bookId]);
  const at = Number(params.get("at") ?? 0) || 0;
  const go = (index: number) => setParams({ at: String(index) }, { replace: true });

  if (book === undefined) return null;
  if (!book) return <div className="page empty"><h2>Book not found</h2><Link to="/library">Back to library</Link></div>;
  return book.format === "pdf" ? <PdfReader book={book} page={at} go={go} /> : <ChapterReader book={book} chapter={at} go={go} />;
}

function PdfReader({ book, page, go }: { book: Book; page: number; go: (i: number) => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sections = useLiveQuery(() => bookSections(book.id), [book.id], [] as Section[]);
  const [jump, setJump] = useState("");

  useEffect(() => {
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      const blob = await bookFile(book.id);
      if (!blob) return setError("The book file is missing.");
      loaded = await openPdf(await blob.arrayBuffer());
      setDoc(loaded);
    })().catch((e) => setError(String(e)));
    return () => void loaded?.loadingTask.destroy();
  }, [book.id]);

  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const p = await doc.getPage(Math.min(page, doc.numPages - 1) + 1);
      if (cancelled || !canvas.current) return;
      const width = Math.min(canvas.current.parentElement!.clientWidth - 16, 1000) * zoom;
      const base = p.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: (width / base.width) * dpr });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      canvas.current.style.width = `${viewport.width / dpr}px`;
      const render = p.render({ canvas: canvas.current, viewport });
      task = render;
      await render.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom]);

  const count = doc?.numPages ?? book.sectionCount;
  const label = sections[page]?.title ?? String(page + 1);

  const jumpTo = () => {
    const match = sections.find((s) => s.title === jump.trim());
    const index = match ? match.index : Number(jump) - 1;
    if (index >= 0 && index < count) go(index);
    setJump("");
  };

  return (
    <div>
      <div className="reader-bar">
        <Link to="/library" className="button small ghost">‹</Link>
        <strong className="spacer" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</strong>
        <button className="small" disabled={page <= 0} onClick={() => go(page - 1)}>‹ Prev</button>
        <span className="small">p. {label} ({page + 1}/{count})</span>
        <button className="small" disabled={page >= count - 1} onClick={() => go(page + 1)}>Next ›</button>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Go to"
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && jumpTo()}
        />
        <button className="small" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>−</button>
        <button className="small" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>＋</button>
      </div>
      {error && <p className="error page">{error}</p>}
      <div style={{ overflowX: "auto", padding: 8 }}>
        <canvas ref={canvas} className="pdf-page" />
      </div>
    </div>
  );
}

function ChapterReader({ book, chapter, go }: { book: Book; chapter: number; go: (i: number) => void }) {
  const sections = useLiveQuery(() => bookSections(book.id), [book.id], [] as Section[]);
  const current = sections[Math.min(chapter, Math.max(sections.length - 1, 0))];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [chapter]);

  return (
    <div>
      <div className="reader-bar">
        <Link to="/library" className="button small ghost">‹</Link>
        <select value={chapter} onChange={(e) => go(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }}>
          {sections.map((s) => <option key={s.index} value={s.index}>{s.title}</option>)}
        </select>
        <button className="small" disabled={chapter <= 0} onClick={() => go(chapter - 1)}>‹</button>
        <button className="small" disabled={chapter >= sections.length - 1} onClick={() => go(chapter + 1)}>›</button>
      </div>
      {current && (
        <article className="chapter">
          <h1 style={{ fontFamily: "inherit" }}>{current.title}</h1>
          {current.text}
        </article>
      )}
    </div>
  );
}
