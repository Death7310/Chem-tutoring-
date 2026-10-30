import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractEpub, resolvePath } from "../src/lib/importers/epub";

describe("resolvePath", () => {
  it("decodes, drops fragments and resolves ..", () => {
    expect(resolvePath("Text/ch%201.xhtml#sec", "OEBPS")).toBe("OEBPS/Text/ch 1.xhtml");
    expect(resolvePath("../ch2.xhtml", "OEBPS/Text")).toBe("OEBPS/ch2.xhtml");
    expect(resolvePath("ch3.xhtml", "")).toBe("ch3.xhtml");
  });
});

async function makeEpub(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Chemistry</dc:title></metadata>
      <manifest>
        <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
        <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
        <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
  );
  zip.file("OEBPS/cover.xhtml", "<html><body><img src='c.jpg'/></body></html>");
  zip.file(
    "OEBPS/text/ch1.xhtml",
    "<html><body><h1>Atoms</h1><p>Water is H<sub>2</sub>O. Atoms combine in whole-number ratios to form compounds.</p></body></html>",
  );
  zip.file(
    "OEBPS/text/ch2.xhtml",
    "<html><body><h2>Exercises</h2><ol><li>How many moles are in 18 g of water?</li><li>Balance the combustion of methane.</li></ol></body></html>",
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("extractEpub", () => {
  it("reads chapters in spine order and skips near-empty pages", async () => {
    const { title, chapters } = await extractEpub(await makeEpub());
    expect(title).toBe("Test Chemistry");
    expect(chapters.map((c) => c.title)).toEqual(["Atoms", "Exercises"]);
    expect(chapters[0].text).toContain("H₂O");
    expect(chapters[1].text).toContain("• How many moles");
  });
});
