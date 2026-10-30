import { describe, expect, it } from "vitest";
import { detectExerciseRanges } from "../src/lib/importers/exercises";
import { splitIntoChapters } from "../src/lib/importers/text";
import { BM25Index, tokenize } from "../src/lib/search/bm25";
import { chunkText } from "../src/lib/text/chunker";
import { htmlToText } from "../src/lib/text/htmlText";
import { renderMarkdown } from "../src/lib/text/markdown";

describe("chunkText", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkText("Moles measure amount of substance.")).toEqual(["Moles measure amount of substance."]);
  });

  it("splits long text near the target with overlap", () => {
    const paragraph = "Avogadro's number relates particles to moles. ".repeat(20);
    const chunks = chunkText(Array(6).fill(paragraph).join("\n"), 1200, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1500)).toBe(true);
    // The start of each later chunk repeats the end of the previous one.
    expect(chunks[0].endsWith(chunks[1].split("\n")[0])).toBe(true);
  });

  it("returns nothing for blank text", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("turns sub/superscripts into Unicode", () => {
    expect(htmlToText("<p>H<sub>2</sub>O and SO<sub>4</sub><sup>2-</sup></p>").text).toBe("H₂O and SO₄²⁻");
  });

  it("finds the heading, drops head and scripts, and keeps paragraphs", () => {
    const result = htmlToText(
      "<html><head><title>x</title><style>p{}</style></head><body><h1>Gas Laws</h1><p>P &amp; V &lt; T</p><script>1</script><p>Second</p></body></html>",
    );
    expect(result.heading).toBe("Gas Laws");
    expect(result.text).toBe("Gas Laws\n\nP & V < T\n\nSecond");
  });

  it("keeps figure alt text", () => {
    expect(htmlToText('<p>See <img alt="titration curve"> below</p>').text).toContain("[Figure: titration curve]");
  });
});

describe("BM25", () => {
  const index = new BM25Index([
    "The ideal gas law relates pressure, volume and temperature: PV = nRT.",
    "Stoichiometry uses mole ratios from a balanced equation.",
    "Electron configurations fill orbitals in order of increasing energy.",
    "Water, H₂O, is a polar molecule.",
  ]);

  it("ranks the relevant document first", () => {
    expect(index.search("How do I use mole ratios?", 3)[0].index).toBe(1);
  });

  it("matches subscript formulas against plain digits", () => {
    expect(index.search("why is h2o polar", 1)[0].index).toBe(3);
  });

  it("respects the filter", () => {
    expect(index.search("gas mole water", 5, (i) => i === 2)).toEqual([]);
  });

  it("drops stopwords and light plurals", () => {
    expect(tokenize("What are the reactions of acids?")).toEqual(["reaction", "acid"]);
  });
});

describe("splitIntoChapters", () => {
  it("splits Markdown at headings", () => {
    const chapters = splitIntoChapters("# Atoms\nProtons.\n## Bonds\nCovalent.", "Notes");
    expect(chapters.map((c) => c.title)).toEqual(["Atoms", "Bonds"]);
  });

  it("uses the file name when there are no headings", () => {
    expect(splitIntoChapters("Just notes", "Notes")).toEqual([{ title: "Notes", text: "Just notes" }]);
  });
});

describe("detectExerciseRanges", () => {
  const items = (from: number) => Array.from({ length: 6 }, (_, i) => `${from + i}. Calculate the molarity of solution ${i}.`).join("\n");
  const sections = [
    { index: 10, title: "190", text: "4.3 Reaction Stoichiometry\nThe mole ratio…" },
    { index: 11, title: "191", text: "Key Equations\n…\nChemistry End of Chapter Exercises\n" + items(1) },
    { index: 12, title: "192", text: items(7) },
    { index: 13, title: "193", text: items(13) },
    { index: 14, title: "194", text: "CHAPTER 5\nThermochemistry\nEnergy is the capacity…" },
  ];

  it("finds the exercise pages as one range", () => {
    expect(detectExerciseRanges(sections)).toEqual([{ start: 11, end: 13, label: "191" }]);
  });

  it("detects EPUB chapters titled as exercises", () => {
    expect(detectExerciseRanges([{ index: 3, title: "Exercises", text: "1. Define a mole." }])).toEqual([
      { start: 3, end: 3, label: "Exercises" },
    ]);
  });
});

describe("renderMarkdown", () => {
  it("escapes HTML before formatting", () => {
    expect(renderMarkdown("<script>x</script> **bold**")).toBe("<p>&lt;script&gt;x&lt;/script&gt; <strong>bold</strong></p>");
  });

  it("renders lists", () => {
    expect(renderMarkdown("Steps:\n1. Balance\n2. Convert")).toBe("<p>Steps:</p><ol><li>Balance</li><li>Convert</li></ol>");
  });
});
