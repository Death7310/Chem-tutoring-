import Foundation
import ZIPFoundation

/// Reads an EPUB (a zip of XHTML files) in reading order: container.xml → OPF package → spine.
enum EPUBImporter {
    struct Output {
        let title: String?
        let chapters: [Chapter]
    }

    static func importEPUB(at url: URL) throws -> Output {
        let archive: Archive
        do {
            archive = try Archive(url: url, accessMode: .read)
        } catch {
            throw ImportError.unreadable("This EPUB could not be opened (\(error.localizedDescription)).")
        }

        func read(_ path: String) throws -> Data {
            guard let entry = archive[path] else {
                throw ImportError.unreadable("The EPUB is missing \(path).")
            }
            var data = Data()
            _ = try archive.extract(entry) { data.append($0) }
            return data
        }

        let container = XMLCollector.parse(try read("META-INF/container.xml"))
        guard let opfPath = container.elements.first(where: { $0.name == "rootfile" })?.attributes["full-path"] else {
            throw ImportError.unreadable("The EPUB has no package file.")
        }

        let package = XMLCollector.parse(try read(opfPath))
        let opfDirectory = (opfPath as NSString).deletingLastPathComponent

        var manifest: [String: (href: String, mediaType: String)] = [:]
        for item in package.elements where item.name == "item" {
            if let id = item.attributes["id"], let href = item.attributes["href"] {
                manifest[id] = (href, item.attributes["media-type"] ?? "")
            }
        }
        let spine = package.elements
            .filter { $0.name == "itemref" && $0.attributes["linear"] != "no" }
            .compactMap { $0.attributes["idref"] }

        var chapters: [Chapter] = []
        for idref in spine {
            guard let item = manifest[idref],
                  item.mediaType.contains("html") || item.href.hasSuffix("html") || item.href.hasSuffix("htm")
            else { continue }

            let path = resolve(href: item.href, relativeTo: opfDirectory)
            guard let data = try? read(path) else { continue }
            let html = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) ?? ""
            let result = HTMLText.plainText(fromHTML: html)
            // Skip covers, blank pages and other near-empty sections.
            guard result.text.count >= 40 else { continue }
            chapters.append(Chapter(title: result.heading ?? "Section \(chapters.count + 1)", text: result.text))
        }

        guard !chapters.isEmpty else {
            throw ImportError.noText("No readable text was found in this EPUB. It may be DRM-protected.")
        }
        return Output(title: package.firstText(named: "title"), chapters: chapters)
    }

    /// Resolves a manifest href (which may be percent-encoded or use "../") to an archive path.
    static func resolve(href: String, relativeTo directory: String) -> String {
        let withoutFragment = href.components(separatedBy: "#").first ?? href
        let decoded = withoutFragment.removingPercentEncoding ?? withoutFragment
        let base = URL(fileURLWithPath: "/" + directory, isDirectory: true)
        let path = base.appendingPathComponent(decoded).standardizedFileURL.path
        return String(path.drop(while: { $0 == "/" }))
    }
}

/// Minimal XML reader that records every element's local name and attributes.
final class XMLCollector: NSObject, XMLParserDelegate {
    struct Element {
        let name: String
        let attributes: [String: String]
        var text = ""
    }

    private(set) var elements: [Element] = []
    private var openIndices: [Int] = []

    static func parse(_ data: Data) -> XMLCollector {
        let collector = XMLCollector()
        let parser = XMLParser(data: data)
        parser.delegate = collector
        parser.parse()
        return collector
    }

    func firstText(named name: String) -> String? {
        elements.first { $0.name == name && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }?
            .text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func localName(_ qualified: String) -> String {
        qualified.components(separatedBy: ":").last ?? qualified
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        var attributes: [String: String] = [:]
        for (key, value) in attributeDict { attributes[XMLCollector.localName(key)] = value }
        elements.append(Element(name: XMLCollector.localName(elementName), attributes: attributes))
        openIndices.append(elements.count - 1)
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard let index = openIndices.last else { return }
        elements[index].text += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        _ = openIndices.popLast()
    }
}
