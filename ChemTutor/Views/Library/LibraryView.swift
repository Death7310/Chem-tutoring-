import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @Environment(LibraryStore.self) private var library
    @State private var showingImporter = false
    @State private var renaming: Book?
    @State private var newTitle = ""

    private static let importTypes: [UTType] = [.pdf, .epub, .plainText]
        + [UTType("net.daringfireball.markdown")].compactMap { $0 }

    var body: some View {
        @Bindable var library = library

        Group {
            if library.books.isEmpty && library.importStatus == nil {
                ContentUnavailableView {
                    Label("No books yet", systemImage: "books.vertical")
                } description: {
                    Text("Import your textbook as a PDF or EPUB. The tutor searches it to answer questions and cites the pages it used.")
                } actions: {
                    Button("Import a book") { showingImporter = true }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                List {
                    if let status = library.importStatus {
                        Section("Importing") {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(status.fileName).lineLimit(1)
                                ProgressView(value: status.progress)
                                Text("Large or scanned books can take a few minutes.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section("Books") {
                        ForEach(library.books) { book in
                            NavigationLink {
                                BookReaderView(book: book)
                            } label: {
                                BookRow(book: book)
                            }
                            .contextMenu {
                                Button("Rename", systemImage: "pencil") {
                                    newTitle = book.title
                                    renaming = book
                                }
                                Button("Delete", systemImage: "trash", role: .destructive) {
                                    library.delete(book)
                                }
                            }
                        }
                        .onDelete { offsets in
                            offsets.map { library.books[$0] }.forEach(library.delete)
                        }
                    }
                }
            }
        }
        .navigationTitle("Library")
        .toolbar {
            Button {
                showingImporter = true
            } label: {
                Label("Import", systemImage: "plus")
            }
            .disabled(library.importStatus != nil)
        }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: Self.importTypes,
                      allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                Task { await library.importFiles(urls) }
            case .failure(let error):
                library.lastError = error.localizedDescription
            }
        }
        .alert("Import problem", isPresented: Binding(
            get: { library.lastError != nil },
            set: { if !$0 { library.lastError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(library.lastError ?? "")
        }
        .alert("Rename book", isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField("Title", text: $newTitle)
            Button("Save") {
                if let renaming, !newTitle.isEmpty { library.rename(renaming, to: newTitle) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

private struct BookRow: View {
    let book: Book

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: book.format == .pdf ? "doc.richtext" : "book")
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(book.title).font(.headline).lineLimit(2)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var detail: String {
        let unit = book.format == .pdf ? "pages" : "sections"
        return "\(book.format.rawValue.uppercased()) · \(book.sectionCount) \(unit) · \(book.chunkCount) passages indexed"
    }
}
