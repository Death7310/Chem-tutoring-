# Chem Tutor

An iPad study app for chemistry. You import your textbooks, photograph or scan practice
problems, work them out with an Apple Pencil, and get help from an AI tutor (Claude) that
reads your actual book and cites the pages it uses.

The tutor is designed to make sure you understand the material, not just get the answer:

- **Coach mode (default):** you get hints before answers, escalating gradually. A full
  solution comes only after you've made a real attempt.
- **Understanding checks:** when you get something right, the tutor asks about the same idea
  from a different angle. That might be the particle level (what the molecules are doing), the
  lab level (what you would observe), or the math. It might also reverse the problem, ask you
  to predict what changes, or show a worked example with a planted mistake for you to find.
- **Clarifying questions:** the tutor asks before explaining when your question is ambiguous
  or it suspects a misconception.
- **Explain** and **Quiz me** modes, for direct explanations or for being tested.

## What works in this first version

| Feature | Status |
|---|---|
| Import books: PDF, EPUB, TXT, Markdown (as many as you want) | ✅ |
| Scanned PDFs (no text layer) are read with on-device OCR | ✅ |
| Read books in the app (PDF viewer, EPUB/text chapter reader) | ✅ |
| Tutor finds relevant passages and cites them; tap a citation to open that page | ✅ |
| Limit a session to certain books | ✅ |
| Attach photos, scan documents with the camera, or draw with Apple Pencil | ✅ |
| The tutor reads handwriting and checks work step by step | ✅ |
| Study sessions saved on the iPad | ✅ |
| Practice-test library linked to book concepts, weak-spot review queue | Planned (phase 3) |
| Writing on PDF pages, highlights feeding into notes | Planned (phase 4) |

**DRM:** books bought through Kindle, VitalSource, Pearson, McGraw Hill Connect and similar
platforms are usually DRM-locked and can't be imported. A DRM-free PDF or EPUB works, for
example the free OpenStax *Chemistry 2e* (openstax.org).

## Setup on your Mac (about 20 minutes, one time)

You need a Mac with **Xcode 16 or later** (free from the Mac App Store) and an iPad on
**iPadOS 17 or later**.

1. **Install XcodeGen**, which builds the Xcode project from `project.yml`:
   ```sh
   # Install Homebrew first if you don't have it: https://brew.sh
   brew install xcodegen
   ```
2. **Get the code and generate the project:**
   ```sh
   git clone https://github.com/Death7310/Chem-tutoring-.git
   cd Chem-tutoring-
   xcodegen generate
   open ChemTutor.xcodeproj
   ```
3. **Set up signing:** in Xcode, click the **ChemTutor** project, then the **ChemTutor** target,
   then **Signing & Capabilities**:
   - Team: choose your Apple ID (add it under Xcode → Settings → Accounts if needed).
   - Bundle Identifier: change `com.yourname.chemtutor` to something unique, such as
     `com.<yourname>.chemtutor`.
4. **Prepare the iPad:** connect it with a USB-C cable and tap **Trust**. Then go to
   Settings → Privacy & Security → **Developer Mode**, turn it on, and restart the iPad.
5. **Run:** pick your iPad as the run destination at the top of Xcode and press ▶ (⌘R).
   The first time, the iPad asks you to trust the developer under Settings → General →
   VPN & Device Management.
6. **Run the tests (optional):** ⌘U.

With a free Apple ID the app stops opening after **7 days**. Reconnect the iPad and press ▶
again to renew it (your books and sessions are kept). A paid Apple Developer account
($99/year) extends this to a year.

## Claude API key

1. Create an account and a key at <https://console.anthropic.com>.
2. **Set a monthly spend limit** in the Console. API usage is billed separately from a
   Claude.ai subscription.
3. In the app: Settings → paste the key → Save. It's stored in the iPad's Keychain.

**Cost:** each reply resends the conversation plus about 6 book passages. A typical tutoring
reply should cost a few cents, and more when there are several images or the session is long.
Start a new session when you change topics. That keeps replies cheaper and the tutor focused.
The "Thinking effort" setting trades cost for care. Medium is a good default.

## How it works

```
Import (PDF/EPUB/TXT) → extract text (OCR for scans) → split into ~1,200-character passages
                       → on-device keyword index (BM25)

Your message + photos → OCR the photos → search the index → top passages
                      → Claude (tutor instructions + passages + your images + conversation)
                      → reply with page citations
```

- Everything except the Claude call runs on the iPad. Books never leave the device. Only
  the matched passages are sent with each question.
- Code layout:
  - `ChemTutor/Services/Importers/`: PDF, EPUB and text import, chunking, OCR
  - `ChemTutor/Services/Search/BM25Index.swift`: passage search
  - `ChemTutor/Services/Claude/TutorPrompt.swift`: the tutor's teaching rules (edit this to
    change how it teaches)
  - `ChemTutor/Services/TutorService.swift`: assembles each request
  - `ChemTutor/Views/`: SwiftUI screens

## Roadmap

1. **Phase 1 (this version):** library, reader, grounded Q&A, photo/scan/Pencil input,
   coaching tutor.
2. **Phase 2:** save each Pencil page with its problem, and attach handwriting directly over
   a PDF page.
3. **Phase 3:** a practice-test library. Each problem is tagged with concepts and linked to
   book sections, and missed concepts come back in spaced, mixed review sets.
4. **Phase 4:** highlights and notes in the reader, plus a "ask about this page" button.

## Why the tutor behaves this way

- Practice testing and spaced practice are the two study techniques rated "high utility" in
  Dunlosky et al. (2013), *Psychological Science in the Public Interest*, 14(1).
- Retrieval beats re-reading for long-term retention: Roediger & Karpicke (2006),
  *Psychological Science*, 17(3).
- Explaining in your own words improves understanding: Chi et al. (1994), *Cognitive
  Science*, 18(3).
- Moving between the particle, lab and symbolic views of chemistry is where many students get
  stuck: Johnstone (1991), *Journal of Computer Assisted Learning*, 7(2).
