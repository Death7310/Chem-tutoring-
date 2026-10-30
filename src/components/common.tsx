import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { db, locatorLabel, type BookLink, type Locator } from "../lib/db";
import { renderMarkdown } from "../lib/text/markdown";

export function Markdown({ text }: { text: string }) {
  return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />;
}

/** Shows a stored image (photo or drawing) by id. */
export function StoredImage({ id, className, alt = "" }: { id: string; className?: string; alt?: string }) {
  const file = useLiveQuery(() => db.files.get(id), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} className={className} alt={alt} /> : null;
}

/** Thumbnails of local images with remove buttons. */
export function BlobThumbs({ blobs, onRemove }: { blobs: Blob[]; onRemove: (index: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = blobs.map((b) => URL.createObjectURL(b));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [blobs]);
  if (!blobs.length) return null;
  return (
    <div className="thumbs">
      {urls.map((url, i) => (
        <div className="thumb" key={url}>
          <img src={url} alt={`Attachment ${i + 1}`} />
          <button onClick={() => onRemove(i)} aria-label="Remove">✕</button>
        </div>
      ))}
    </div>
  );
}

/** A button that opens the camera (on phones and tablets) or the photo library. */
export function PhotoButton({ onPhotos, camera, children, className }: {
  onPhotos: (files: File[]) => void;
  camera?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={!camera}
        capture={camera ? "environment" : undefined}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onPhotos(files);
        }}
      />
    </>
  );
}

export function readerPath(bookId: string, locator?: Locator): string {
  const at = locator?.pageIndex ?? locator?.chapterIndex;
  return `/library/${bookId}${at !== undefined ? `?at=${at}` : ""}`;
}

/** "Read in your book" links for a problem. */
export function BookLinks({ links }: { links: BookLink[] }) {
  const books = useLiveQuery(() => db.books.toArray(), [], []);
  if (!links.length) return <p className="muted small">No matching pages found in your books yet.</p>;
  return (
    <div className="list">
      {links.map((link, i) => {
        const book = books.find((b) => b.id === link.bookId);
        return book ? (
          <Link key={i} className="card" to={readerPath(link.bookId, link.locator)}>
            <strong>📖 {book.title} · {locatorLabel(link.locator)}</strong>
            <div className="muted small">{link.reason}</div>
          </Link>
        ) : (
          <div key={i} className="card muted small">
            {locatorLabel(link.locator)}: {link.reason} (the book isn't on this device; import it to open the page)
          </div>
        );
      })}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
