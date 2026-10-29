import CoreGraphics
import Vision

/// On-device OCR with Apple's Vision framework. Used for scanned PDF pages and for
/// reading attached photos so the right book passages can be found.
enum TextRecognizer {
    static func recognizeText(in image: CGImage) -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return ""
        }

        let observations = request.results ?? []
        // Vision's origin is bottom-left, so higher minY means higher on the page.
        return observations
            .sorted { $0.boundingBox.minY > $1.boundingBox.minY }
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
    }
}
