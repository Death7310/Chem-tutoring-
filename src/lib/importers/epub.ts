import JSZip from "jszip";
import { htmlToText } from "../text/htmlText";

export interface Chapter {
  title: string;
  text: string;
}

/** Resolves a manifest href (which may be percent-encoded or use "../") to a path in the zip. */
export function resolvePath(href: string, directory: string): string {
  const withoutFragment = href.split("#")[0];
  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // Keep the raw href.
  }
  const parts = [...(directory ? directory.split("/") : []), ...decoded.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

/** Reads an EPUB in reading order: container.xml → OPF package → spine. */
export async function extractEpub(data: ArrayBuffer): Promise<{ title?: string; chapters: Chapter[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This EPUB could not be opened.");
  }
  const readText = async (path: string) => {
    const file = zip.file(path);
    if (!file) throw new Error(`The EPUB is missing ${path}.`);
    return file.async("string");
  };

  if (zip.file("META-INF/encryption.xml")) {
    const enc = await readText("META-INF/encryption.xml");
    if (/EncryptedData/i.test(enc) && !/font/i.test(enc)) {
      throw new Error("This EPUB is DRM-protected, so its text can't be read.");
    }
  }

  const parser = new DOMParser();
  const container = parser.parseFromString(await readText("META-INF/container.xml"), "application/xml");
  const opfPath = container.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw new Error("The EPUB has no package file.");

  const opf = parser.parseFromString(await readText(opfPath), "application/xml");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const title = opf.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim() || undefined;

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of Array.from(opf.getElementsByTagNameNS("*", "item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, { href, type: item.getAttribute("media-type") ?? "" });
  }

  const chapters: Chapter[] = [];
  for (const ref of Array.from(opf.getElementsByTagNameNS("*", "itemref"))) {
    if (ref.getAttribute("linear") === "no") continue;
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (!item || !(item.type.includes("html") || /\.x?html?$/i.test(item.href))) continue;
    const path = resolvePath(item.href, opfDir);
    const html = await readText(path).catch(() => null);
    if (!html) continue;
    const { heading, text } = htmlToText(html);
    // Skip covers, blank pages and other near-empty sections.
    if (text.length < 40) continue;
    chapters.push({ title: heading ?? `Section ${chapters.length + 1}`, text });
  }

  if (!chapters.length) throw new Error("No readable text was found in this EPUB.");
  return { title, chapters };
}
