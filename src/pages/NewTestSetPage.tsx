import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BlobThumbs, PhotoButton } from "../components/common";
import { createTestSet } from "../lib/problems";
import { useSettings } from "../lib/settings";

export default function NewTestSetPage() {
  const navigate = useNavigate();
  const { apiKey } = useSettings();
  const [title, setTitle] = useState(`Practice test – ${new Date().toLocaleDateString()}`);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const id = await createTestSet(title.trim() || "Practice test", photos);
    navigate(`/problems/set/${id}`, { replace: true });
  };

  return (
    <div className="page">
      <h1>Add a practice test</h1>
      <p className="muted">
        Take one photo per page, in order, flat and well lit. Problems are transcribed and tagged with concepts,
        then linked to the pages in your book that teach them.
      </p>
      <label className="field">
        <span>Name</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="row">
        <PhotoButton camera className="primary" onPhotos={(f) => setPhotos([...photos, ...f])}>📷 Take photo</PhotoButton>
        <PhotoButton onPhotos={(f) => setPhotos([...photos, ...f])}>🖼 Choose photos</PhotoButton>
      </div>
      <BlobThumbs blobs={photos} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} />
      {photos.length > 0 && <p className="muted small">{photos.length} page{photos.length === 1 ? "" : "s"}</p>}
      {!apiKey && <p className="error">Add your Claude API key in Settings first.</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate(-1)}>Cancel</button>
        <button className="primary" disabled={!photos.length || saving || !apiKey} onClick={save}>
          {saving ? "Saving…" : "Read the problems"}
        </button>
      </div>
    </div>
  );
}
