import PhotosUI
import SwiftUI
import VisionKit

struct ComposerView: View {
    let sessionID: UUID
    let isSending: Bool
    let onSend: (String, [UIImage]) -> Void

    @State private var text = ""
    @State private var images: [UIImage] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showingScanner = false
    @State private var showingCanvas = false
    @FocusState private var focused: Bool

    private let quickPrompts = [
        "Give me a hint",
        "Check my work",
        "Explain it another way",
        "Quiz me on this",
        "Why does that work?",
    ]

    var body: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(quickPrompts, id: \.self) { prompt in
                        Button(prompt) { send(prompt) }
                            .buttonStyle(.bordered)
                            .font(.callout)
                            .disabled(isSending)
                    }
                }
                .padding(.horizontal)
            }

            if !images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(images.indices, id: \.self) { i in
                            Image(uiImage: images[i])
                                .resizable()
                                .scaledToFill()
                                .frame(width: 80, height: 80)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(alignment: .topTrailing) {
                                    Button {
                                        images.remove(at: i)
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .symbolRenderingMode(.palette)
                                            .foregroundStyle(.white, .black.opacity(0.6))
                                    }
                                    .padding(4)
                                }
                        }
                    }
                    .padding(.horizontal)
                }
            }

            HStack(alignment: .bottom, spacing: 12) {
                PhotosPicker(selection: $photoItems, maxSelectionCount: 4, matching: .images) {
                    Image(systemName: "photo.on.rectangle")
                }
                .accessibilityLabel("Attach photos")

                if VNDocumentCameraViewController.isSupported {
                    Button { showingScanner = true } label: { Image(systemName: "doc.viewfinder") }
                        .accessibilityLabel("Scan a document")
                }

                Button { showingCanvas = true } label: { Image(systemName: "pencil.tip.crop.circle") }
                    .accessibilityLabel("Write with Apple Pencil")

                TextField("Ask a question or describe what you tried…", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .textFieldStyle(.roundedBorder)
                    .focused($focused)

                Button {
                    send(text)
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title)
                }
                .disabled(isSending || (text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && images.isEmpty))
                .keyboardShortcut(.return, modifiers: .command)
            }
            .font(.title2)
            .padding(.horizontal)
        }
        .padding(.vertical, 10)
        .background(.bar)
        .onChange(of: photoItems) {
            let items = photoItems
            photoItems = []
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        images.append(image)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showingScanner) {
            DocumentScannerView { scanned in images.append(contentsOf: scanned) }
                .ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showingCanvas) {
            PencilCanvasSheet { drawing in images.append(drawing) }
        }
    }

    private func send(_ message: String) {
        guard !isSending else { return }
        onSend(message, images)
        if message == text { text = "" }
        images = []
    }
}
