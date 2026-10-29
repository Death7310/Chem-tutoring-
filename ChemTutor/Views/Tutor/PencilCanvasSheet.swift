import PencilKit
import SwiftUI

/// A full-screen Apple Pencil workspace. "Attach" sends the drawn area to the tutor as an image.
struct PencilCanvasSheet: View {
    let onAttach: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var canvas = PKCanvasView()

    var body: some View {
        NavigationStack {
            PencilCanvas(canvas: canvas)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Work it out")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button("Clear", role: .destructive) { canvas.drawing = PKDrawing() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Attach") {
                            if let image = renderDrawing() { onAttach(image) }
                            dismiss()
                        }
                    }
                }
        }
    }

    /// Renders just the inked area, dark ink on white, regardless of the system appearance.
    private func renderDrawing() -> UIImage? {
        let drawing = canvas.drawing
        guard !drawing.strokes.isEmpty else { return nil }
        let rect = drawing.bounds.insetBy(dx: -24, dy: -24)

        var ink = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            ink = drawing.image(from: rect, scale: 2)
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = ink.scale
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: rect.size))
            ink.draw(in: CGRect(origin: .zero, size: rect.size))
        }
    }
}

private struct PencilCanvas: UIViewRepresentable {
    let canvas: PKCanvasView

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> PKCanvasView {
        canvas.drawingPolicy = .default
        canvas.backgroundColor = .white
        canvas.isOpaque = true
        // Keep ink colors stable (black stays black) so the attached image is readable.
        canvas.overrideUserInterfaceStyle = .light
        canvas.alwaysBounceVertical = true
        canvas.contentSize = CGSize(width: 2000, height: 4000)
        canvas.tool = PKInkingTool(.pen, color: .black, width: 3)

        let picker = context.coordinator.toolPicker
        picker.addObserver(canvas)
        picker.overrideUserInterfaceStyle = .light
        DispatchQueue.main.async {
            picker.setVisible(true, forFirstResponder: canvas)
            canvas.becomeFirstResponder()
        }
        return canvas
    }

    func updateUIView(_ view: PKCanvasView, context: Context) {}

    final class Coordinator {
        let toolPicker = PKToolPicker()
    }
}
