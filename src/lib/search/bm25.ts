/** Keyword search using Okapi BM25 (Robertson & Zaragoza, 2009). Runs entirely on the device. */

export interface Hit {
  index: number;
  score: number;
}

const K1 = 1.5;
const B = 0.75;

const STOPWORDS = new Set(
  ("a an and are as at be but by can do does for from had has have how i if in into is it its me my of " +
    "on or so that the their then there these this to was we what when where which who why will with would you your")
    .split(" "),
);

const DIGITS: Record<string, string> = Object.fromEntries(
  [..."₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹"].map((c, i) => [c, String(i % 10)]),
);

/** Very light plural stripping so "reactions" matches "reaction". */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[₀-₉⁰¹²³⁴-⁹]/g, (c) => DIGITS[c] ?? c);
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

export class BM25Index {
  private readonly lengths: number[] = [];
  private readonly postings = new Map<string, Array<[number, number]>>();
  private readonly averageLength: number;

  constructor(documents: string[]) {
    documents.forEach((doc, index) => {
      const tokens = tokenize(doc);
      this.lengths.push(tokens.length);
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [term, count] of counts) {
        let list = this.postings.get(term);
        if (!list) this.postings.set(term, (list = []));
        list.push([index, count]);
      }
    });
    const total = this.lengths.reduce((a, b) => a + b, 0);
    this.averageLength = this.lengths.length ? total / this.lengths.length : 0;
  }

  get size(): number {
    return this.lengths.length;
  }

  search(query: string, limit: number, include?: (index: number) => boolean): Hit[] {
    const terms = new Set(tokenize(query));
    if (!terms.size || !this.averageLength) return [];
    const n = this.lengths.length;
    const scores = new Map<number, number>();
    for (const term of terms) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
      for (const [doc, tf] of list) {
        if (include && !include(doc)) continue;
        const norm = 1 - B + (B * this.lengths[doc]) / this.averageLength;
        scores.set(doc, (scores.get(doc) ?? 0) + (idf * (tf * (K1 + 1))) / (tf + K1 * norm));
      }
    }
    return [...scores]
      .map(([index, score]) => ({ index, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
