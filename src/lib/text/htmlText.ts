/** Converts (X)HTML into readable plain text, keeping chemical subscripts (H<sub>2</sub>O → H₂O). */

const SUBSCRIPTS: Record<string, string> = Object.fromEntries(
  [..."0123456789+-=()"].map((c, i) => [c, [..."₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎"][i]]),
);
const SUPERSCRIPTS: Record<string, string> = Object.fromEntries(
  [..."0123456789+-=()n"].map((c, i) => [c, [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ"][i]]),
);

const BLOCK_TAGS = new Set([
  "p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "tr", "table",
  "section", "article", "blockquote", "figure", "figcaption", "dt", "dd", "pre", "aside", "header", "footer",
]);
const SKIP_TAGS = new Set(["script", "style", "head", "noscript", "svg", "math"]);

/** Maps every character, or returns null if any character has no mapping. */
function mapChars(text: string, table: Record<string, string>): string | null {
  let out = "";
  for (const raw of text.trim()) {
    const ch = raw === "−" || raw === "–" ? "-" : raw;
    const mapped = table[ch];
    if (mapped === undefined) return null;
    out += mapped;
  }
  return out;
}

export interface HtmlTextResult {
  heading: string | null;
  text: string;
}

export function htmlToText(html: string): HtmlTextResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return elementToText(doc.body ?? doc.documentElement);
}

export function elementToText(root: Element): HtmlTextResult {
  const headingEl = root.querySelector("h1, h2, h3");
  const heading = headingEl?.textContent?.replace(/\s+/g, " ").trim() || null;

  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replace(/\s+/g, " ");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === "sub" || tag === "sup") {
      const inner = el.textContent ?? "";
      const mapped = mapChars(inner, tag === "sub" ? SUBSCRIPTS : SUPERSCRIPTS);
      out += mapped ?? (tag === "sub" ? "_" : "^") + inner.trim();
      return;
    }
    if (tag === "img") {
      const alt = el.getAttribute("alt")?.trim();
      if (alt) out += ` [Figure: ${alt}] `;
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) out += "\n";
    if (tag === "li") out += "• ";
    el.childNodes.forEach(walk);
    if (block) out += "\n";
  };
  root.childNodes.forEach(walk);

  const text = out
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { heading, text };
}
