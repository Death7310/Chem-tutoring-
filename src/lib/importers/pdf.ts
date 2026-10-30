import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { recognizeText } from "./ocr";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPage {
  index: number;
  label?: string;
  text: string;
}

export async function openPdf(data: ArrayBuffer) {
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

/** Extracts text page by page. Pages with no text layer (scans) fall back to OCR. */
export async function extractPdf(
  data: ArrayBuffer,
  onProgress: (fraction: number) => void,
): Promise<{ title?: string; pages: PdfPage[] }> {
  const doc = await openPdf(data);
  const labels = await doc.getPageLabels().catch(() => null);
  const meta = await doc.getMetadata().catch(() => null);
  const info = meta?.info as { Title?: string } | undefined;

  const pages: PdfPage[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if ("str" in item) text += item.str + (item.hasEOL ? "\n" : "");
    }
    if (text.trim().length < 30) {
      text = await ocrPage(page);
    }
    const label = labels?.[i];
    pages.push({ index: i, label: label && label !== String(i + 1) ? label : undefined, text });
    page.cleanup();
    onProgress((i + 1) / doc.numPages);
  }
  await doc.loadingTask.destroy();
  return { title: info?.Title, pages };
}

async function ocrPage(page: pdfjs.PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return recognizeText(canvas);
}
