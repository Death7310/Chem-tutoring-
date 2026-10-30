import type { Worker } from "tesseract.js";

/** On-device OCR (Tesseract). Loaded only when needed: the engine downloads ~10 MB the first time. */
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("eng"));
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

export async function recognizeText(image: Blob | HTMLCanvasElement): Promise<string> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return data.text ?? "";
  } catch {
    return "";
  }
}
