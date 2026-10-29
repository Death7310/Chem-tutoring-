import XCTest
@testable import ChemTutor

final class TextChunkerTests: XCTestCase {
    func testShortTextIsOneChunk() {
        XCTAssertEqual(TextChunker.chunk("Moles measure amount of substance."), ["Moles measure amount of substance."])
    }

    func testLongTextSplitsNearTargetWithOverlap() {
        let paragraph = String(repeating: "Avogadro's number relates particles to moles. ", count: 20)
        let text = (0..<6).map { _ in paragraph }.joined(separator: "\n")
        let chunks = TextChunker.chunk(text, targetLength: 1200, overlap: 200)
        XCTAssertGreaterThan(chunks.count, 1)
        XCTAssertTrue(chunks.allSatisfy { $0.count <= 1500 })
    }

    func testEmptyTextHasNoChunks() {
        XCTAssertTrue(TextChunker.chunk("  \n\n ").isEmpty)
    }
}

final class HTMLTextTests: XCTestCase {
    func testSubscriptsAndSuperscriptsBecomeUnicode() {
        let result = HTMLText.plainText(fromHTML: "<p>H<sub>2</sub>O and SO<sub>4</sub><sup>2-</sup></p>")
        XCTAssertEqual(result.text, "H₂O and SO₄²⁻")
    }

    func testHeadingAndEntities() {
        let html = "<html><head><title>x</title></head><body><h1>Gas Laws</h1><p>P &amp; V &lt; T</p></body></html>"
        let result = HTMLText.plainText(fromHTML: html)
        XCTAssertEqual(result.heading, "Gas Laws")
        XCTAssertTrue(result.text.contains("P & V < T"))
        XCTAssertFalse(result.text.contains("<p") || result.text.contains("<h1"), "tags should be stripped")
        XCTAssertTrue(result.text.hasPrefix("Gas Laws"), "the <head> title should be removed")
    }

    func testScriptsAreRemoved() {
        let result = HTMLText.plainText(fromHTML: "<p>Keep</p><script>var x = 1;</script>")
        XCTAssertEqual(result.text, "Keep")
    }
}

final class BM25IndexTests: XCTestCase {
    func testFindsRelevantDocumentFirst() {
        let index = BM25Index(documents: [
            "The ideal gas law relates pressure, volume and temperature: PV = nRT.",
            "Stoichiometry uses mole ratios from a balanced equation.",
            "Electron configurations fill orbitals in order of increasing energy.",
        ])
        let hits = index.search("How do I use mole ratios?", limit: 3)
        XCTAssertEqual(hits.first?.documentIndex, 1)
    }

    func testSubscriptFormulaMatchesPlainDigits() {
        let index = BM25Index(documents: ["Water, H₂O, is a polar molecule.", "Sodium chloride is ionic."])
        XCTAssertEqual(index.search("why is h2o polar", limit: 1).first?.documentIndex, 0)
    }

    func testFilterExcludesDocuments() {
        let index = BM25Index(documents: ["acid base titration", "acid base buffer"])
        let hits = index.search("acid", limit: 5, where: { $0 == 1 })
        XCTAssertEqual(hits.map(\.documentIndex), [1])
    }
}

final class ImporterTests: XCTestCase {
    func testMarkdownSplitsAtHeadings() {
        let chapters = PlainTextImporter.splitIntoChapters("# Atoms\nProtons.\n## Bonds\nCovalent.", fallbackTitle: "Notes")
        XCTAssertEqual(chapters.map(\.title), ["Atoms", "Bonds"])
    }

    func testEPUBPathResolution() {
        XCTAssertEqual(EPUBImporter.resolve(href: "Text/ch%201.xhtml#sec", relativeTo: "OEBPS"), "OEBPS/Text/ch 1.xhtml")
        XCTAssertEqual(EPUBImporter.resolve(href: "../ch2.xhtml", relativeTo: "OEBPS/Text"), "OEBPS/ch2.xhtml")
        XCTAssertEqual(EPUBImporter.resolve(href: "ch3.xhtml", relativeTo: ""), "ch3.xhtml")
    }
}

final class JSONValueTests: XCTestCase {
    func testRoundTripKeepsThinkingBlocksIntact() throws {
        let json = #"[{"type":"thinking","thinking":"","signature":"abc"},{"type":"text","text":"Hi","n":3,"x":1.5,"ok":true,"z":null}]"#
        let decoded = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
        let reencoded = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(decoded))
        XCTAssertEqual(decoded, reencoded)
        XCTAssertEqual(decoded.arrayValue?[1]["n"], .int(3))
        XCTAssertEqual(decoded.arrayValue?[0]["signature"]?.stringValue, "abc")
    }
}
