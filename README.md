# Chem Tutor

A chemistry study app for **iPad (with Apple Pencil) and Android phones**. It's a web app you
install from the browser, so the same app runs on both devices with no App Store, no Mac and
no Xcode.

- **Library:** import your textbook as a PDF or EPUB (or notes as TXT/Markdown) and read it in
  the app. Scanned PDFs are read with on-device OCR.
- **Tutor:** an AI tutor (Claude) that answers from *your* book and cites the pages.
  - **Coach mode** gives hints before answers.
  - When you get something right, it checks your understanding from a different angle: the
    particle level, the lab level, the math, a reversed problem, or a planted mistake.
  - It asks clarifying questions when your question is unclear or it suspects a misconception.
  - **Explain** and **Quiz me** modes are also available.
- **Practice tests:** photograph a test or worksheet. Each question is transcribed, tagged with
  concepts, and linked to:
  - the **book pages that teach it**
  - the **most similar end-of-chapter problems** in your book
- **Book exercises:** add a chapter's end-of-chapter problems (the app suggests where they
  are). They become practice problems linked to the sections that teach them.
- **Handwriting:** work problems with the Apple Pencil (or an Android stylus, or a finger) and
  send your work to the tutor to check, step by step. Once a stylus is detected, palm touches
  are ignored.
- **Review:** mark each problem ✅ / 🟡 / ❌. Missed problems come back sooner and correct ones
  later (spaced repetition), mixed across topics. A "concepts to work on" list shows your
  weak spots.

## Getting it running

### 1. Turn on the website (one time, about 2 minutes)

The app is hosted free on GitHub Pages from this repository.

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab, then **Test and deploy** → **Run workflow** (on `main`).
   It also runs automatically every time `main` changes.
4. When it finishes, the app is at **https://death7310.github.io/Chem-tutoring-/**

### 2. Install it on each device

- **Android (Chrome):** open the link → menu ⋮ → **Install app** (or *Add to Home screen*).
- **iPad (Safari):** open the link → Share → **Add to Home Screen**. Always open it from the
  home-screen icon. That keeps your data safe from Safari's automatic storage cleanup.

### 3. Add your Claude API key

1. Create a key at <https://console.anthropic.com>. **Set a monthly spend limit there.** API
   usage is billed separately from a Claude.ai subscription.
2. In the app: **Settings** → paste the key → Save. It's stored only on that device and sent
   only to Anthropic.

## How the linking works

```
Book import ─ PDF/EPUB text (OCR for scans) → passages → on-device search index

Test photo ─→ Claude transcribes each problem + tags concepts
            ─→ for each problem: search finds candidate teaching pages (skipping exercise pages)
                                  and candidate end-of-chapter problems
            ─→ Claude picks the ones that actually match, with a reason
            ─→ saved as links you can tap: "📖 p. 214 – defines molarity", "Problem 4.37"
```

Claude only chooses from pages the search actually found, so it can't invent page numbers.
Add a chapter's **book exercises before** (or after, then press **Re-link to book**) a practice
test, so the test has exercises to match against.

## Using two devices

Each device keeps its own data. To photograph a test on your phone and study it on your iPad:

1. Phone: **Settings → Back up study data**. Save the file to Google Drive, or email it to
   yourself.
2. iPad: **Settings → Restore from backup** and pick that file.

Import the **same book file** on both devices. Books are identified by their content, so the
page links match. Automatic sync is a possible future step. It needs an online account and
server, so it's left out for now on purpose.

## Costs

Each tutor reply sends the conversation plus about 6 book passages. A practice test costs one
request per 4 photo pages to transcribe, plus one per 6 problems to link. Expect a few cents
per reply or per test page. Settings → Thinking effort trades cost for care, and Medium is the
default. Starting a new session when you change topics keeps replies cheaper.

## Limits

- Copy-protected textbooks (Kindle, VitalSource, most publisher platforms) can't be imported.
  DRM-free PDFs and EPUBs work, for example OpenStax *Chemistry 2e* (free at openstax.org).
- OCR of scanned pages and photos downloads a ~10 MB engine the first time it's needed.
- Concept tags and page links come from an AI and are usually right, but check them. Each
  link opens the actual page.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit + pipeline tests (Claude mocked)
npm run build      # typecheck + production build
```

Code layout:

- `src/lib/importers/`: PDF (pdf.js), EPUB, text, OCR, exercise-section detection
- `src/lib/search/bm25.ts`: passage search
- `src/lib/claude/prompts.ts`: the tutor's teaching rules and the extraction/linking
  instructions (edit these to change how it teaches)
- `src/lib/problems.ts`: test/exercise extraction and linking pipeline
- `src/lib/tutor.ts`: tutor conversations
- `src/lib/review.ts`: spaced review scheduling
- `src/pages/`, `src/components/`: screens and the handwriting canvas

## Why it teaches this way

- Practice testing and spaced practice are the two techniques rated "high utility" in
  Dunlosky et al. (2013), *Psychological Science in the Public Interest*, 14(1).
- Retrieval beats re-reading for retention: Roediger & Karpicke (2006), *Psychological
  Science*, 17(3).
- Mixing problem types improves picking the right method: Rohrer & Taylor (2007),
  *Instructional Science*, 35(6).
- Explaining in your own words improves understanding: Chi et al. (1994), *Cognitive
  Science*, 18(3).
- Moving between particle, lab and symbolic views is where chemistry gets hard: Johnstone
  (1991), *Journal of Computer Assisted Learning*, 7(2).
