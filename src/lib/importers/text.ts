import type { Chapter } from "./epub";

/** Splits .txt / Markdown into chapters at "# " and "## " headings. */
export function splitIntoChapters(text: string, fallbackTitle: string): Chapter[] {
  const chapters: Chapter[] = [];
  let title = fallbackTitle;
  let lines: string[] = [];

  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) chapters.push({ title, text: body });
    lines = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,2} /.test(line)) {
      flush();
      title = line.replace(/^#+/, "").trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return chapters;
}
