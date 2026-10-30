/** Splits text into overlapping, paragraph-aligned chunks small enough to retrieve precisely. */
export function chunkText(text: string, targetLength = 1200, overlap = 200): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .flatMap((p) => splitLong(p, targetLength));

  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
    } else if (current.length + 1 + paragraph.length <= targetLength) {
      current += "\n" + paragraph;
    } else {
      chunks.push(current);
      const tail = overlapTail(current, overlap);
      current = tail ? tail + "\n" + paragraph : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Breaks a paragraph longer than the target into word-aligned pieces. */
function splitLong(paragraph: string, targetLength: number): string[] {
  if (paragraph.length <= targetLength) return [paragraph];
  const pieces: string[] = [];
  let current = "";
  for (const word of paragraph.split(" ")) {
    if (current && current.length + 1 + word.length > targetLength) {
      pieces.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** The last `length` characters of a chunk, starting at a word boundary. */
function overlapTail(text: string, length: number): string {
  if (length <= 0 || text.length <= length) return "";
  const tail = text.slice(-length);
  const space = tail.search(/[ \n]/);
  return space < 0 ? "" : tail.slice(space).trim();
}
