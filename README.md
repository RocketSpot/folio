# Folio

A personal reading room that runs entirely in the browser. Import almost any book file (PDF, EPUB, Kindle, Word, FictionBook, RTF, OpenDocument, PalmDoc, comics, Markdown, LaTeX, subtitles, HTML, text, or a zip of them; scanned pages are recognised on-device), listen with word-by-word highlighting, keep one bookmark across a paper copy and the screen, and see plain facts about how you read.

**Live site:** https://rocketspot.github.io/folio/

Everything is one HTML file plus a manifest and a service worker. There is no account, no server of its own, and nothing you import leaves the device. The only network calls are to the public catalogs you search (Open Library, Internet Archive, Gutendex, Google Books), to the fonts and code libraries the page loads (pdf.js, JSZip, Tesseract.js), and to a speech provider if you add your own key.

## What it does

- **Import** almost anything a book comes as, all parsed in the browser: PDF (text layer, or automatic OCR for image-only pages); EPUB; Kindle **MOBI, PRC, AZW and AZW3/KF8** (DRM-free, through [foliate-js](https://github.com/johnfactotum/foliate-js)'s parser); **FictionBook FB2** (and `.fb2.zip`); **Word DOCX**; **OpenDocument ODT/FODT** (and OpenOffice SXW); **RTF**; **PalmDoc and zTXT PDB**; **comic archives CBZ** (pages are recognised with OCR); **Markdown** (with front matter); **LaTeX**; **subtitles SRT/VTT/SBV**; HTML; DocBook/TEI and other XML; plain text in any encoding; **zip bundles** holding any of these (several books in one zip import as several books). Files are identified by extension and by their first bytes, so a mislabelled file still opens. Formats no browser can read (Kindle KFX and other DRM files, legacy `.doc`, CHM, LIT, CBR/RAR, DjVu, Pages, audiobooks) are recognised and explained instead of failing silently. Photographed pages and pasted text also work, and files can be dropped anywhere on the library page. Metadata is enriched with covers and subjects from Open Library.
- **Discover** public-domain books across Open Library, the Internet Archive, Project Gutenberg (through the Archive's mirror) and Google Books, with one-tap import where a full text is available.
- **Listen** six ways: the device's own browser voices; two **on-device open-source engines** that run inside the browser in a Web Worker, free and offline after a one-time download: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0, via [kokoro-js](https://www.npmjs.com/package/kokoro-js); 28 English voices, ~92 MB) and [Piper](https://github.com/rhasspy/piper) (MIT, via a patched [piper-tts-web](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web); 124 voice models in 38 languages, several multi-speaker, 20–130 MB each, chosen automatically from the book's language); or your own ElevenLabs (exact word timestamps), OpenAI or Google Cloud Text-to-Speech key. Twelve personas in two groups, *Narrators* and *Readers* (a slow philosophical baritone, a lecture-hall voice, a fireside storyteller, an essayist, a broadcast register, a close-mic bedtime voice), each mapped to a fitting voice on every provider. Speed control, sentence skipping, a sleep timer and lock-screen controls. All voices are original synthetic characters; nothing imitates a real person.
- **Follow along**: the current word and sentence are highlighted, tapping a word seeks the narration, and pages turn as the voice reaches them.
- **Read** in a full-screen reader with a two-page spread on wide screens, a 3D page turn you can drag, paged or scrolling layout, four themes and four typefaces.
- **Paper sync**: photograph a page of your printed copy; Folio matches it against the text, reads the printed page number off the photo, and keeps the paper and digital bookmarks in step. **Paper mode** times sessions with your physical book and takes page check-ins.
- **Insights**: automatic reading sessions (idle time excluded), streaks, a 30-day chart, pace, a nutrition-label style *Reading Label* per book, a taste profile and recommendations with plain reasons.

## Install on a phone or tablet

- **iPhone / iPad**: open the live site in Safari, tap **Share**, then **Add to Home Screen**. It launches full-screen and keeps its own library.
- **Android**: open the site in Chrome and choose **Install app** from the menu (or accept the install prompt).
- **Desktop Chrome / Edge**: use the install icon in the address bar.

The service worker caches the app and the libraries it has already loaded, so opening books you have imported works offline. Catalog search and cloud voices need a connection.

## Offline

Books, progress, calibration and settings live in IndexedDB on the device, so they are always available offline. The service worker caches the app shell at install and the PDF/EPUB engines shortly after, and it keeps anything else you have already used (text recognition data, the on-device voice model and any voice you have played, fonts). To make *everything* available before you lose the connection, use **Settings → Offline → Download everything for offline**: it fetches the import engines (PDF, EPUB, Kindle), the text-recognition engine with English data, the on-device voice model, all thirteen gallery voices and the fonts in one go, and shows what is cached. Catalog search and the cloud voices (ElevenLabs, OpenAI, Google) need a connection; the app says so instead of failing silently. On iPhone and iPad, install Folio to the Home Screen so its storage is kept.

The on-device voice runs in a Web Worker so the reader stays responsive while speech is generated. Speed depends on the hardware: browsers with WebGPU (recent iPads and phones, desktop Chrome and Edge) generate several times faster than real time; the WebAssembly fallback can be slower than real time on older devices, in which case Folio shows "Generating the next passage" between passages while it catches up.

## Optional keys

Settings → Voices accepts an ElevenLabs, OpenAI or Google Cloud Text-to-Speech API key; Settings → Catalog accepts a Google Books key. Keys are stored only in the browser (IndexedDB) and are sent only to the provider you chose when you press play. They are never written to this repository by the app. The on-device voices need no key at all: the models are fetched from Hugging Face once and cached by the browser.

The site owner can ship a **shared default key** for a provider by placing it in `secrets/<provider>.key` before running `build.py`; it is encoded into the build (so automated secret scanners do not match it) and used by every visitor who has not entered a key of their own. Anyone can decode it, so only share keys you are comfortable sharing. Settings shows the shared allowance used this month, and when a shared ElevenLabs allowance runs out the app switches to an on-device voice and says so. The `secrets/` folder is never committed.

## Project layout

```
docs/                     the deployed site (GitHub Pages serves this folder)
  index.html              the whole app, built from src/
  manifest.webmanifest    web app manifest (start_url and scope are ./ for subpath hosting)
  sw.js                   service worker: shell precache, runtime cache for CDN libraries and fonts
  icons/                  icon.svg (plus generated PNGs when built locally or by the workflow)
src/
  00_head.html            document head, styles, static skeleton
  01_util.js              constants (personas, fonts, themes), helpers, event bus
  01b_sample.js           bundled public-domain sample text (generated by tools/make_assets.py)
  02_store.js             IndexedDB layer with in-memory fallback, settings, backup export/import
  03_text.js              tokenizer, canonical locators, normalisation, readability, plain-text parser
  04_ingest.js            PDF / EPUB / TXT / HTML / photo ingestion and OCR
  04b_formats.js          every other format: Kindle (via foliate-js), FB2, DOCX, ODT, RTF, PDB, CBZ, zip bundles,
                          LaTeX, Markdown, subtitles, generic XML; detection by extension and magic bytes
  05_catalog.js           catalog search, full-text import, enrichment, recommendations
  06_tts.js               speech providers, playback controller, word sync
  07_reader.js            reader: pagination, page turns, gestures, highlighting, paper mode
  08_calibration.js       photo-to-edition matching and page mapping
  09_analytics.js         sessions, streaks, Reading Label, taste profile
  10_ui.js                views, modals, import and calibration flows, settings
  11_app.js               boot sequence
  99_tail.html            closing tags; the site build injects service-worker registration here
  sw.template.js          service worker source (build stamps the version)
tools/
  make_assets.py          generates the sample text module and test assets from test-assets/pg11.txt
  test_text.js            Node smoke tests for the text engine
test-assets/              pg11.txt (Alice, from Project Gutenberg) and photo-ground-truth.json;
                          run tools/make_assets.py to regenerate the EPUB, PDFs and page photos
  formats/                the same chapter as DOCX, ODT, RTF, FB2, PDB, Markdown, LaTeX, SRT/VTT, CBZ and zip
                          bundles (generated by tools/make_format_assets.py), plus Gutenberg's MOBI and AZW3 of Alice
build.py                  concatenates src/ into reader.html and/or docs/
```

## Build and deploy

```
python3 tools/make_assets.py   # optional: regenerate sample module and test assets (needs Pillow)
python3 build.py --all         # reader.html (single file) and docs/ (site)
node tools/test_text.js        # text engine smoke tests
```

Pushing to `main` updates the site: GitHub Pages is configured to serve the `docs/` folder of `main` (Settings → Pages → Deploy from a branch → `main` / `docs`). A build stamp is shown under Settings → About; when a new version is deployed, open copies show a "new version ready" toast.

`reader.html` is the same app as a single self-contained file. It runs from any static host or from a local file; hosts that serve pages inside a security sandbox (opaque origin) block browser storage, and the app says so on its library screen.

## Design notes

- Positions are anchored to a canonical locator (chapter, paragraph, sentence, word), so progress, highlights, paper calibration and statistics share one coordinate system regardless of edition or screen size.
- Calibration indexes the book into four-word phrases; a photographed page is matched by phrase votes with a consistency check, which tolerates OCR noise.
- Browser voices are spoken sentence by sentence; word boundaries come from the speech engine where it reports them and from a learned characters-per-second estimate where it does not.
- Recommendations are content-based only: overlap with the subjects and authors you spend time with, availability of a free copy, and length fit.

## Third-party code and data

- [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0), [JSZip](https://stuk.github.io/jszip/) (MIT or GPLv3), [Tesseract.js](https://tesseract.projectnaptha.com/) (Apache-2.0), and the MOBI/KF8 parser from [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT, pinned to a commit), loaded from CDNs at runtime. The other formats are parsed by Folio's own code.
- Fonts: Literata, Newsreader, Inter, Atkinson Hyperlegible (SIL Open Font License) via Google Fonts.
- Catalog data: [Open Library](https://openlibrary.org/developers/api), [Internet Archive](https://archive.org/developers/), [Gutendex](https://gutendex.com/), [Google Books API](https://developers.google.com/books).
- Sample text: *Alice's Adventures in Wonderland* by Lewis Carroll, public domain.

No license has been chosen for this repository's own code yet.
