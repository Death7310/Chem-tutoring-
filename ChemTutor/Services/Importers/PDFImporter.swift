import PDFKit
import UIKit

enum PDFImporter {
    struct Output {
        let title: String?
        let pageCount: Int
        let chunks: [(Locator, String)]
    }

    /// Extracts text page by page. Pages with no text layer (scans) fall back to OCR.
    static func importPDF(at url: URL, progress: (Double) -> Void) throws -> Output {
        guard let document = PDFDocument(url: url) else {
            throw ImportError.unreadable("This PDF could not be opened.")
        }
        if document.isLocked {
            throw ImportError.unreadable("This PDF is password-protected. Unlock it first, then import it again.")
        }

        let title = document.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String
        var chunks: [(Locator, String)] = []
        let pageCount = document.pageCount

        for index in 0..<pageCount {
            autoreleasepool {
                guard let page = document.page(at: index) else { return }
                var text = page.string ?? ""
                if text.trimmingCharacters(in: .whitespacesAndNewlines).count < 30 {
                    text = ocr(page)
                }
                let locator = Locator(pageIndex: index, pageLabel: page.label)
                for piece in TextChunker.chunk(text) {
                    chunks.append((locator, piece))
                }
            }
            progress(Double(index + 1) / Double(max(pageCount, 1)))
        }

        guard !chunks.isEmpty else {
            throw ImportError.noText("No text could be read from this PDF.")
        }
        return Output(title: title, pageCount: pageCount, chunks: chunks)
    }

    private static func ocr(_ page: PDFPage) -> String {
        let bounds = page.bounds(for: .mediaBox)
        let size = CGSize(width: bounds.width * 2, height: bounds.height * 2)
        guard let image = page.thumbnail(of: size, for: .mediaBox).cgImage else { return "" }
        return TextRecognizer.recognizeText(in: image)
    }
}
