import { db, newId } from "./db";

/** Claude reads images best at up to ~1568 px on the long edge; larger only costs more. */
const MAX_DIMENSION = 1568;

/** Resizes a photo or drawing to a JPEG suitable for the API, on a white background. */
export async function prepareImage(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode image"))), "image/jpeg", 0.85),
  );
}

export async function saveImage(blob: Blob): Promise<string> {
  const id = newId();
  await db.files.put({ id, blob });
  return id;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < buffer.length; i += step) {
    binary += String.fromCharCode(...buffer.subarray(i, i + step));
  }
  return btoa(binary);
}

const base64Cache = new Map<string, string>();

/** Base64 for a stored image, cached so replayed history is byte-identical (and cache-friendly). */
export async function storedImageBase64(id: string): Promise<string | null> {
  const hit = base64Cache.get(id);
  if (hit) return hit;
  const file = await db.files.get(id);
  if (!file) return null;
  const data = await blobToBase64(file.blob);
  base64Cache.set(id, data);
  return data;
}

export function imageBlock(data: string) {
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } };
}
