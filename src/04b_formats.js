/* 04b_formats.js — every other book format.
   Kindle (MOBI / PRC / AZW / AZW3, via foliate-js), FictionBook (FB2), Word (DOCX), OpenDocument (ODT / FODT), RTF,
   PalmDoc and zTXT (PDB), comic archives (CBZ, via OCR), ZIP bundles, LaTeX, Markdown, subtitles (SRT / VTT / SBV),
   generic XML (DocBook, TEI). Detection by extension, MIME type and magic bytes; clear messages for formats no browser can open. */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C, I = F.ingest;

// ---------- registry ----------
I.FORMATS = [
  { id: 'pdf', label: 'PDF', ext: ['pdf'], mime: ['application/pdf'] },
  { id: 'epub', label: 'EPUB', ext: ['epub', 'kepub'], mime: ['application/epub+zip'] },
  { id: 'mobi', label: 'Kindle (MOBI, PRC, AZW, AZW3)', ext: ['mobi', 'prc', 'azw', 'azw3', 'azw4', 'kf8'], mime: ['application/x-mobipocket-ebook', 'application/vnd.amazon.ebook', 'application/vnd.amazon.mobi8-ebook'] },
  { id: 'fb2', label: 'FictionBook (FB2)', ext: ['fb2'], mime: ['application/x-fictionbook+xml'] },
  { id: 'docx', label: 'Word (DOCX)', ext: ['docx', 'docm', 'dotx', 'dotm'], mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { id: 'odt', label: 'OpenDocument (ODT)', ext: ['odt', 'ott', 'sxw', 'stw'], mime: ['application/vnd.oasis.opendocument.text', 'application/vnd.sun.xml.writer'] },
  { id: 'fodt', label: 'Flat OpenDocument (FODT)', ext: ['fodt'], mime: ['application/vnd.oasis.opendocument.text-flat-xml'] },
  { id: 'rtf', label: 'Rich Text (RTF)', ext: ['rtf'], mime: ['application/rtf', 'text/rtf'] },
  { id: 'pdb', label: 'PalmDoc / zTXT (PDB)', ext: ['pdb'], mime: ['application/vnd.palm', 'application/x-palm-database'] },
  { id: 'txt', label: 'Plain text', ext: ['txt', 'text', 'log', 'asc', 'nfo', 'utf8'], mime: ['text/plain'] },
  { id: 'md', label: 'Markdown', ext: ['md', 'markdown', 'mdown', 'mkd', 'mkdn'], mime: ['text/markdown', 'text/x-markdown'] },
  { id: 'html', label: 'HTML', ext: ['html', 'htm', 'xhtml', 'xht', 'shtml'], mime: ['text/html', 'application/xhtml+xml'] },
  { id: 'xml', label: 'XML (DocBook, TEI, FB2)', ext: ['xml', 'tei', 'dbk', 'docbook'], mime: ['text/xml', 'application/xml'] },
  { id: 'tex', label: 'LaTeX', ext: ['tex', 'latex', 'ltx'], mime: ['application/x-tex', 'text/x-tex', 'application/x-latex'] },
  { id: 'srt', label: 'Subtitles (SRT, VTT, SBV)', ext: ['srt', 'vtt', 'sbv'], mime: ['text/vtt', 'application/x-subrip'] },
  { id: 'cbz', label: 'Comics (CBZ)', ext: ['cbz'], mime: ['application/vnd.comicbook+zip', 'application/x-cbz'] },
  { id: 'zip', label: 'ZIP bundle', ext: ['zip'], mime: ['application/zip', 'application/x-zip-compressed'] },
  { id: 'image', label: 'Photos and scans', ext: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tif', 'tiff', 'avif'], mime: ['image/*'] },
];
const EXT = new Map();
for (const f of I.FORMATS) for (const e of f.ext) EXT.set(e, f.id);

// Formats that exist but cannot be opened by a browser (or by anyone but their vendor). The message says what to do instead.
const CALIBRE = 'Convert it to EPUB with the free Calibre app and import that.';
const BLOCKED = {
  cbr: 'CBR comics are RAR archives, which browsers cannot unpack. Re-save the comic as CBZ (a zip of the pages) and import that.',
  rar: 'RAR archives cannot be unpacked in a browser. Unpack it first and import the book file inside, or zip it instead.',
  '7z': '7z archives cannot be unpacked in a browser. Unpack it first and import the book file inside, or zip it instead.',
  cb7: '7z comic archives cannot be unpacked in a browser. Re-save the comic as CBZ (a zip of the pages) and import that.',
  cbt: 'TAR comic archives are not supported. Re-save the comic as CBZ (a zip of the pages) and import that.',
  chm: 'Windows Help (CHM) books use a compression browsers cannot read. ' + CALIBRE,
  lit: 'Microsoft Reader (LIT) is a retired, copy-protected format. ' + CALIBRE,
  kfx: 'Kindle KFX files are encrypted for Amazon\'s own apps and cannot be read by anything else. Amazon can supply the same purchase as AZW3 ("Download & transfer via USB"); Folio reads DRM-free MOBI and AZW3 files.',
  kfxzip: 'Kindle KFX files are encrypted for Amazon\'s own apps and cannot be read by anything else.',
  azw8: 'Kindle KFX files are encrypted for Amazon\'s own apps and cannot be read by anything else.',
  doc: 'Old binary Word files (.doc) cannot be parsed in a browser. Open it in Word, Pages or LibreOffice and save it as .docx.',
  dot: 'Old binary Word templates (.dot) cannot be parsed in a browser. Save the document as .docx first.',
  wps: 'Works / WPS Office files cannot be parsed in a browser. Save the document as .docx first.',
  wpd: 'WordPerfect files must be converted first: LibreOffice opens them and can save .docx.',
  pages: 'Apple Pages files must be exported first: File → Export To → EPUB (or Word).',
  djvu: 'DjVu is not supported yet. Convert it to PDF first (the Internet Archive offers a PDF of every DjVu scan it hosts).',
  djv: 'DjVu is not supported yet. Convert it to PDF first.',
  xps: 'XPS files must be converted to PDF first.',
  oxps: 'XPS files must be converted to PDF first.',
  lrf: 'Sony Reader LRF files must be converted first. ' + CALIBRE,
  lrx: 'Sony Reader LRX files are copy-protected and cannot be opened outside Sony\'s software.',
  acsm: 'An .acsm file is an Adobe download ticket, not a book. Open it in Adobe Digital Editions to fetch the EPUB or PDF; Folio can read copies without DRM.',
  snb: 'Shanda Bambook (SNB) files are not supported. ' + CALIBRE,
  tcr: 'Psion TCR files are not supported. ' + CALIBRE,
  pml: 'eReader PML sources are not supported. ' + CALIBRE,
  pmlz: 'eReader PML sources are not supported. ' + CALIBRE,
  rb: 'Rocket eBook files are not supported. ' + CALIBRE,
  imp: 'Softbook / IMP files are not supported. ' + CALIBRE,
  tpz: 'Kindle Topaz files are copy-protected and cannot be opened outside Amazon\'s apps.',
  azw1: 'Kindle Topaz files are copy-protected and cannot be opened outside Amazon\'s apps.',
  ibooks: 'Apple .ibooks files are locked to Apple Books. Import a plain EPUB of the same book.',
  opf: 'This is an EPUB package file, not the book itself. Import the .epub.',
  ncx: 'This is an EPUB navigation file, not the book itself. Import the .epub.',
  mp3: 'Audiobooks are not supported: Folio reads text and narrates it itself.',
  m4b: 'Audiobooks are not supported: Folio reads text and narrates it itself.',
  m4a: 'Audiobooks are not supported: Folio reads text and narrates it itself.',
  aax: 'Audible files are copy-protected audio; Folio reads text and narrates it itself.',
  aa: 'Audible files are copy-protected audio; Folio reads text and narrates it itself.',
  ogg: 'Audio files are not supported: Folio reads text and narrates it itself.',
  wav: 'Audio files are not supported: Folio reads text and narrates it itself.',
  exe: 'Executable files are not books.',
};
I.BLOCKED = BLOCKED;
I.supportedSummary = () => 'PDF, EPUB, Kindle (MOBI, AZW3), Word (DOCX), FictionBook (FB2), RTF, OpenDocument (ODT), PalmDoc (PDB), comics (CBZ), Markdown, HTML, LaTeX, subtitles, plain text, zips of any of these, and photos';
I.acceptString = () => {
  const parts = [];
  for (const f of I.FORMATS) { for (const e of f.ext) parts.push('.' + e); for (const m of f.mime) parts.push(m); }
  return parts.join(',');
};

// ---------- helpers ----------
const noop = () => {};
function fileExt(name){ const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,7})$/); return m ? m[1] : ''; }
function fileTitle(name){ return String(name || 'Untitled').replace(/\.(fb2|tar)\.(zip|gz)$/i, '').replace(/\.[a-z0-9]{1,7}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled'; }
function hintsOf(file, extra){ return Object.assign({ title: fileTitle(file.name), fileName: file.name, fileSize: file.size }, extra || {}); }
function clean(s){ return String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim(); }
function oneLine(s){ return String(s || '').replace(/\s+/g, ' ').trim(); }
function naturalSort(a, b){ return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }); }
function parseXML(str){
  const doc = new DOMParser().parseFromString(str, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return new DOMParser().parseFromString(str, 'text/html');
  return doc;
}
function byLocal(root, name){ return Array.from(root.getElementsByTagNameNS('*', name)); }
function firstLocal(root, name){ return root.getElementsByTagNameNS('*', name)[0] || null; }
function attr(el, ns, name){ if (!el) return null; return el.getAttributeNS(ns, name) || Array.from(el.attributes).map(a => a.localName === name ? a.value : null).find(v => v !== null && v !== undefined) || null; }
function ascii(u8, start, len){ let s = ''; for (let i = start; i < start + len && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
function concatBytes(parts){ const n = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function decodeBytes(bytes, label){
  if (label) { try { return new TextDecoder(label).decode(bytes); } catch (e) {} }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
}
// Read a text file honouring a BOM, an XML/HTML encoding declaration, and falling back from strict UTF-8 to Windows-1252.
async function readTextSmart(file){
  const buf = await U.readAsArrayBuffer(file);
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  const head = ascii(u8, 0, Math.min(u8.length, 1024));
  const m = head.match(/encoding\s*=\s*["']([\w-]+)["']/i) || head.match(/charset\s*=\s*["']?([\w-]+)/i);
  if (m && !/^utf-?8$/i.test(m[1])) { try { return new TextDecoder(m[1].toLowerCase()).decode(u8); } catch (e) {} }
  return decodeBytes(u8);
}
I.readTextSmart = readTextSmart;
async function zipOf(file){ await U.loadScript(C.CDN.JSZIP); return window.JSZip.loadAsync(await U.readAsArrayBuffer(file)); }
function zipEntries(zip){ return Object.keys(zip.files).filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|\.[^/]*|thumbs\.db|desktop\.ini)(\/|$)/i.test(n)); }
async function zipText(zip, path){
  let f = zip.file(path);
  if (!f) { const lower = path.toLowerCase(); const key = Object.keys(zip.files).find(k => k.toLowerCase() === lower); if (key) f = zip.file(key); }
  if (!f) return null;
  const bytes = await f.async('uint8array');
  return readTextSmart(new Blob([bytes]));
}
function mimeFor(name){ const e = fileExt(name); return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif' })[e] || ''; }
function makeFile(blob, name, type){ try { return new File([blob], name, { type: type || blob.type || '' }); } catch (e) { blob.name = name; return blob; } }
function b64ToBlob(b64, type){ const bin = atob(b64.replace(/\s+/g, '')); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new Blob([bytes], { type: type || 'image/jpeg' }); }
async function inflate(bytes, format){
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress zlib streams.');
  const ds = new DecompressionStream(format || 'deflate');
  const res = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await res.arrayBuffer());
}

// Chapters from heading-annotated blocks; falls back to the plain-text chapter heuristics ("CHAPTER I" lines and the like).
function chaptersFromBlocks(blocks, fallbackTitle, hints){
  blocks = blocks.filter(b => b && b.text && /[\p{L}\p{N}]/u.test(b.text));
  if (!blocks.length) return [];
  const tops = blocks.filter(b => b.heading && (b.level || 1) <= 2);
  let chapters;
  if (tops.length >= 1) chapters = T.chaptersFromBlocks(blocks.map(b => ({ text: b.text, heading: !!b.heading && (b.level || 1) <= 2 })), fallbackTitle);
  else chapters = T.parsePlainText(blocks.map(b => b.text).join('\n\n'), hints || {}).chapters;
  return refineChapters(chapters);
}
// Project Gutenberg editions carry a licence header and footer around the text; keep only what lies between the markers.
function stripGutenberg(chapters){
  const START = /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i, END = /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i;
  let seenStart = false, seenEnd = false;
  const flat = chapters.flatMap(c => c.paras);
  if (!flat.some(p => START.test(p)) && !flat.some(p => END.test(p))) return chapters;
  const out = [];
  for (const ch of chapters) {
    if (seenEnd) break;
    const paras = [];
    for (const p of ch.paras) {
      if (END.test(p)) { seenEnd = true; break; }
      if (START.test(p)) { seenStart = true; paras.length = 0; out.length = 0; continue; }
      paras.push(p);
    }
    if (paras.length) out.push(Object.assign({}, ch, { paras }));
  }
  return seenStart || seenEnd ? out.filter(c => c.paras.length) : chapters;
}
// A "Contents" section of a converted e-book is a list of links, not reading matter.
function isContentsSection(blocks, title){
  const words = blocks.reduce((a, b) => a + T.countWords(b.text), 0);
  if (words > 600) return false;
  const short = blocks.filter(b => T.countWords(b.text) <= 12).length;
  return /^(table of )?contents$/i.test(title || '') || (/contents/i.test(title || '') && short / Math.max(1, blocks.length) > 0.7) || (blocks.length >= 6 && short / blocks.length > 0.9 && /^(table of )?contents$/i.test((blocks[0] || {}).text || ''));
}
// One very long chapter usually means the headings were lost; try the plain-text chapter finder on it.
function refineChapters(chapters){
  chapters = stripGutenberg((chapters || []).filter(c => c && c.paras && c.paras.length));
  if (chapters.length !== 1) return chapters;
  const words = chapters[0].paras.reduce((a, p) => a + T.countWords(p), 0);
  if (words < 6000) return chapters;
  try {
    const parsed = T.parsePlainText(chapters[0].paras.join('\n\n'), { title: chapters[0].title });
    if (parsed.chapters.length >= 2) return parsed.chapters;
  } catch (e) {}
  return chapters;
}
// Mirror of the EPUB spine logic: one document section becomes one chapter, or several when it holds several top headings.
function pushSectionChapters(chapters, blocks, tocTitle){
  const words = blocks.reduce((a, b) => a + T.countWords(b.text), 0);
  if (words < 5) return;
  const tops = blocks.filter(b => b.heading && (b.level || 1) <= 2);
  let chs;
  if (tops.length >= 2 && words > 2500) chs = T.chaptersFromBlocks(blocks.map(b => ({ text: b.text, heading: !!b.heading && (b.level || 1) <= 2 })), tocTitle);
  else {
    const firstHead = blocks.slice(0, 2).find(b => b.heading);
    chs = [{ title: tocTitle || (firstHead ? firstHead.text : ''), paras: blocks.filter(b => b !== firstHead).map(b => b.text) }];
  }
  chs = chs.filter(c => c.paras.length);
  chs.forEach(c => { if (!c.title) c.title = tocTitle || `Section ${chapters.length + 1}`; });
  chapters.push(...chs);
}
I.chaptersFromBlocks = chaptersFromBlocks;

// ---------- detection ----------
I.detectType = file => {
  const name = (file.name || '').toLowerCase();
  const ext = fileExt(name);
  if (ext && BLOCKED[ext]) return 'blocked';
  if (/\.fb2\.zip$/.test(name)) return 'zip';
  if (EXT.has(ext)) return EXT.get(ext);
  const type = (file.type || '').toLowerCase().split(';')[0].trim();
  if (type) {
    for (const f of I.FORMATS) if (f.mime.some(m => m.endsWith('/*') ? type.startsWith(m.slice(0, -1)) : type === m)) return f.id;
    if (type.startsWith('text/')) return 'txt';
  }
  return null;
};
I.blockedReason = file => BLOCKED[fileExt(file.name)] || 'This kind of file cannot be read in a browser.';

// Look at the bytes when the name is missing, generic (.zip, .xml, .txt, .pdb) or lying.
I.sniff = async (file, guess) => {
  const headBuf = await file.slice(0, 4096).arrayBuffer();
  const u8 = new Uint8Array(headBuf);
  const head = ascii(u8, 0, Math.min(u8.length, 4096));
  const pdbType = u8.length > 68 ? head.slice(60, 68) : '';
  if (head.startsWith('%PDF')) return 'pdf';
  if (pdbType === 'BOOKMOBI') return 'mobi';
  if (pdbType === 'TEXtREAd' || pdbType === 'zTXTGPlm') return 'pdb';
  if (pdbType === 'PNRdPPrs') throw new Error('eReader (Palm) books are compressed or encrypted in a way browsers cannot read. ' + CALIBRE);
  if (pdbType === 'DataPlkr') throw new Error('Plucker documents are not supported. ' + CALIBRE);
  if (head.startsWith('{\\rtf')) return 'rtf';
  if (head.startsWith('Rar!')) throw new Error(BLOCKED.rar);
  if (head.startsWith('7z\u00bc\u00af\u0027\u001c')) throw new Error(BLOCKED['7z']);
  if (head.startsWith('ITSF')) throw new Error(BLOCKED.chm);
  if (head.startsWith('ITOLITLS')) throw new Error(BLOCKED.lit);
  if (head.startsWith('AT&TFORM')) throw new Error(BLOCKED.djvu);
  if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) throw new Error(BLOCKED.doc);
  if (head.startsWith('CONT') && /kfx|CONT\u0002/.test(head.slice(0, 64))) throw new Error(BLOCKED.kfx);
  if (head.startsWith('TPZ')) throw new Error(BLOCKED.tpz);
  if (u8[0] === 0x89 && head.slice(1, 4) === 'PNG') return 'image';
  if (u8[0] === 0xFF && u8[1] === 0xD8) return 'image';
  if (head.startsWith('GIF8') || head.startsWith('BM') || (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') || head.startsWith('II*\0') || head.startsWith('MM\0*')) return 'image';
  if (head.startsWith('PK\u0003\u0004') || head.startsWith('PK\u0005\u0006')) {
    if (guess === 'epub' || guess === 'docx' || guess === 'odt' || guess === 'cbz') return guess;
    const zip = await zipOf(file);
    const kind = zipKind(zip, zipEntries(zip));
    return kind;
  }
  const text = head.replace(/^\ufeff/, '').replace(/^\s+/, '');
  if (/^WEBVTT/.test(text)) return 'srt';
  if (/^\d+\s*\r?\n\s*\d\d:\d\d:\d\d[,.]\d{3}\s*-->/.test(text) || /^\d+:\d\d:\d\d\.\d{3},\d+:\d\d:\d\d\.\d{3}/.test(text)) return 'srt';
  if (/^<\?xml/i.test(text) || /^<[a-zA-Z!]/.test(text)) {
    if (/<FictionBook[\s>]/i.test(text)) return 'fb2';
    if (/<!DOCTYPE\s+html|<html[\s>]/i.test(text)) return 'html';
    if (/<office:document[\s>]/i.test(text)) return 'fodt';
    if (/<(TEI|book|article|chapter|set)[\s>]/.test(text)) return 'xml';
    if (/^<\?xml/i.test(text)) return 'xml';
    if (/<(p|div|body|h1|h2|section|article)[\s>]/i.test(text)) return 'html';
  }
  if (/\\documentclass|\\begin\{document\}|\\chapter\{|\\section\{/.test(text)) return 'tex';
  if (guess === 'md' || /^(---\n[\s\S]{0,400}\n---\n|#{1,6}\s+\S)/.test(text) || /\n#{1,3}\s+\S[^\n]*\n/.test(text)) return guess === 'txt' || guess === 'md' || !guess ? 'md' : guess;
  if (guess) return guess;
  let printable = 0, control = 0;
  for (let i = 0; i < u8.length; i++) { const b = u8[i]; if (b === 0) return null; if (b < 32 && b !== 9 && b !== 10 && b !== 13) control++; else printable++; }
  if (printable && control / Math.max(1, printable) < 0.02) return 'txt';
  return null;
};
function zipKind(zip, names){
  const lower = names.map(n => n.toLowerCase());
  if (lower.includes('meta-inf/container.xml') || lower.some(n => n.endsWith('.opf'))) return 'epub';
  if (lower.includes('word/document.xml')) return 'docx';
  if (lower.includes('content.xml') && (lower.includes('mimetype') || lower.includes('meta.xml') || lower.includes('styles.xml'))) return 'odt';
  const content = lower.filter(n => !/(^|\/)(comicinfo\.xml|.*\.(txt|nfo|xml|db|json|ini|sfv))$/.test(n));
  if (content.length && content.every(n => /\.(jpe?g|png|webp|gif|bmp|tiff?|avif)$/.test(n))) return 'cbz';
  return 'zip';
}

const NEEDS_SNIFF = new Set(['zip', 'xml', 'txt', 'pdb', null]);
I.fromFile = async (file, opts = {}) => {
  let type = I.detectType(file);
  if (type === 'blocked') throw new Error(I.blockedReason(file));
  if (NEEDS_SNIFF.has(type)) { try { type = await I.sniff(file, type); } catch (e) { if (e && e.message && /cannot|not supported|Convert|ticket/.test(e.message)) throw e; if (!type) throw e; } }
  if (!type) throw new Error(`Folio doesn't recognize “${file.name || 'this file'}”. It reads ${I.supportedSummary()}.`);
  switch (type) {
    case 'pdf': return I.fromPDF(file, opts);
    case 'epub': return I.fromEPUB(file, opts);
    case 'mobi': return I.fromMOBI(file, opts);
    case 'fb2': return I.fromFB2(await readTextSmart(file), hintsOf(file), opts);
    case 'docx': return I.fromDOCX(file, opts);
    case 'odt': return I.fromODT(file, opts);
    case 'fodt': return I.fromFODT(await readTextSmart(file), hintsOf(file), opts);
    case 'rtf': return I.fromRTF(file, opts);
    case 'pdb': return I.fromPDB(file, opts);
    case 'cbz': return I.fromCBZ(file, opts);
    case 'zip': return I.fromZip(file, opts);
    case 'tex': return I.fromLaTeX(await readTextSmart(file), hintsOf(file), opts);
    case 'md': return I.fromMarkdown(await readTextSmart(file), hintsOf(file), opts);
    case 'srt': return I.fromSubtitles(await readTextSmart(file), hintsOf(file), opts);
    case 'xml': return I.fromXML(await readTextSmart(file), hintsOf(file), opts);
    case 'html': return I.fromHTML(await readTextSmart(file), hintsOf(file), opts);
    case 'txt': return I.fromText(await readTextSmart(file), hintsOf(file), opts);
    case 'image': return I.fromImages([file], opts);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
};

// ---------- Kindle: MOBI / PRC / AZW / AZW3 (foliate-js) ----------
let mobiLib = null;
I.loadMobi = async () => {
  if (!mobiLib) mobiLib = import(C.CDN.MOBI).catch(e => { mobiLib = null; console.warn(e); throw new Error('The Kindle import engine could not be loaded' + (navigator.onLine === false ? ' while offline. Connect once, or use Settings → Offline → Download everything.' : '. Check the connection and try again.')); });
  return mobiLib;
};
I.fromMOBI = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening Kindle file…', percent: 0.02 });
  const lib = await I.loadMobi();
  const mobi = new lib.MOBI({ unzlib: async () => { throw new Error('fonts are not needed'); } });
  let book;
  try { book = await mobi.open(file); }
  catch (e) {
    console.warn(e);
    if (/Missing MOBI header|Unknown compression|Record index|out of bounds/i.test(e && e.message)) throw new Error(`“${file.name}” is not a readable Kindle file.`);
    throw e;
  }
  const hdr = mobi.headers && mobi.headers.mobi;
  if (hdr && hdr.encryption) {
    try { book.destroy && book.destroy(); } catch (e) {}
    throw new Error('This Kindle book is copy-protected (DRM): its text is encrypted for Amazon\'s apps and cannot be read anywhere else. Folio imports DRM-free MOBI and AZW3 files.');
  }
  const md = book.metadata || {};
  const meta = {
    title: oneLine(md.title) || fileTitle(file.name),
    author: Array.isArray(md.author) ? md.author.map(oneLine).filter(Boolean).join(', ') : oneLine(md.author),
    language: String(md.language || '').slice(0, 8), subjects: Array.isArray(md.subject) ? md.subject.map(oneLine).filter(Boolean) : [],
    description: oneLine(String(md.description || '').replace(/<[^>]+>/g, ' ')), cover: null,
  };
  try { const blob = await book.getCover(); if (blob && blob.size > 200) meta.cover = await U.resizeToDataURL(blob, 640, 0.82); } catch (e) { console.warn('cover failed', e); }

  // table of contents → section titles
  const secTitle = new Map();
  const walkToc = async (items, depth) => {
    for (const it of items || []) {
      if (it && it.href) { try { const r = await book.resolveHref(it.href); if (r && r.index >= 0 && !secTitle.has(r.index)) secTitle.set(r.index, oneLine(it.label)); } catch (e) {} }
      if (it && depth < 2) await walkToc(it.subitems, depth + 1);
    }
  };
  try { await walkToc(book.toc, 0); } catch (e) {}
  // the book's own table-of-contents page (from the guide/landmarks) is skipped
  const tocSections = new Set();
  try {
    for (const lm of book.landmarks || []) if (lm && lm.href && (lm.type || []).some(t => /toc/i.test(t))) { const r = await book.resolveHref(lm.href); if (r && r.index >= 0) tocSections.add(r.index); }
  } catch (e) {}

  const sections = book.sections || [];
  const chapters = [];
  const ser = new XMLSerializer();
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec || !sec.createDocument) continue;
    progress({ stage: 'parsing', message: `Reading section ${i + 1} of ${sections.length}`, percent: 0.05 + 0.88 * i / Math.max(1, sections.length) });
    let html = null;
    try {
      const doc = await sec.createDocument();
      if (doc && doc.documentElement && !doc.querySelector('parsererror')) html = ser.serializeToString(doc);
      else if (sec.load) { const url = await sec.load(); html = await (await fetch(url)).text(); }
    } catch (e) { console.warn('section failed', i, e); }
    if (!html) continue;
    const blocks = I.blocksFromHTML(html);
    const title = secTitle.get(i) || '';
    if (tocSections.has(i) && isContentsSection(blocks, title || (blocks[0] && blocks[0].text))) continue;
    if (isContentsSection(blocks, title)) continue;
    pushSectionChapters(chapters, blocks, title);
    if (i % 3 === 0) await U.sleep(0);
  }
  try { book.destroy && book.destroy(); } catch (e) {}
  const out = refineChapters(chapters);
  if (!out.length) throw new Error('No readable text found in this Kindle file.');
  progress({ stage: 'saving', message: 'Finishing…', percent: 0.96 });
  const fmt = fileExt(file.name) === 'azw3' || (mobi.headers && mobi.headers.mobi && mobi.headers.mobi.version >= 8) ? 'azw3' : 'mobi';
  return I.makeBook(meta, { chapters: out }, { source: 'upload', format: fmt, fileName: file.name, fileSize: file.size });
};

// ---------- FictionBook (FB2) ----------
I.fromFB2 = async (xml, hints = {}, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'parsing', message: 'Reading FictionBook…', percent: 0.2 });
  const doc = parseXML(xml);
  const XLINK = 'http://www.w3.org/1999/xlink';
  const txt = el => el ? oneLine(el.textContent) : '';
  const meta = { title: '', author: '', language: '', subjects: [], description: '', cover: null };
  const ti = firstLocal(doc, 'title-info');
  if (ti) {
    meta.title = txt(firstLocal(ti, 'book-title'));
    meta.author = byLocal(ti, 'author').map(a => ['first-name', 'middle-name', 'last-name'].map(n => txt(firstLocal(a, n))).filter(Boolean).join(' ') || txt(firstLocal(a, 'nickname'))).filter(Boolean).join(', ');
    meta.language = txt(firstLocal(ti, 'lang')).slice(0, 8);
    meta.subjects = byLocal(ti, 'genre').map(txt).filter(Boolean).map(g => g.replace(/_/g, ' '));
    meta.description = txt(firstLocal(ti, 'annotation'));
    const cp = firstLocal(ti, 'coverpage');
    const img = cp && firstLocal(cp, 'image');
    const href = img && (attr(img, XLINK, 'href') || '');
    if (href && href.startsWith('#')) {
      const bin = byLocal(doc, 'binary').find(b => b.getAttribute('id') === href.slice(1));
      if (bin) { try { meta.cover = await U.resizeToDataURL(b64ToBlob(bin.textContent, bin.getAttribute('content-type') || 'image/jpeg'), 640, 0.82); } catch (e) { console.warn('fb2 cover failed', e); } }
    }
  }
  const BLOCKS = new Set(['p', 'v', 'subtitle', 'text-author', 'td', 'th']);
  const collect = (el, out) => {
    for (const ch of Array.from(el.children)) {
      const ln = ch.localName;
      if (ln === 'section' || ln === 'title' || ln === 'image' || ln === 'binary') continue;
      if (BLOCKS.has(ln)) { const t = oneLine(ch.textContent); if (t) out.push(ln === 'subtitle' ? { text: t, heading: true, level: 3 } : { text: t }); }
      else collect(ch, out);
    }
  };
  const titleOf = el => { const t = Array.from(el.children).find(c => c.localName === 'title'); if (!t) return ''; const ps = byLocal(t, 'p').map(p => oneLine(p.textContent)).filter(Boolean); return ps.length ? ps.join(' · ') : oneLine(t.textContent); };
  const chapters = [];
  const walk = (sec, prefix, depth) => {
    const own = titleOf(sec);
    const full = [prefix, own].filter(Boolean).join(' · ');
    const paras = []; collect(sec, paras);
    if (paras.length) chapters.push({ title: full || `Section ${chapters.length + 1}`, paras: paras.map(p => p.text) });
    if (depth > 6) return;
    for (const s of Array.from(sec.children).filter(c => c.localName === 'section')) walk(s, paras.length ? '' : (own || prefix), depth + 1);
  };
  const root = doc.documentElement;
  const bodies = Array.from(root.children).filter(c => c.localName === 'body');
  for (const body of bodies) {
    const name = (body.getAttribute('name') || '').toLowerCase();
    if (/notes|comments|footnotes/.test(name)) continue;
    const bodyTitle = titleOf(body);
    const direct = []; collect(body, direct);
    if (direct.length) chapters.push({ title: bodyTitle || meta.title || 'Text', paras: direct.map(p => p.text) });
    for (const s of Array.from(body.children).filter(c => c.localName === 'section')) walk(s, bodies.length > 1 && !direct.length ? bodyTitle : '', 0);
  }
  const out = refineChapters(chapters);
  if (!out.length) throw new Error('No readable text found in this FictionBook file.');
  return I.makeBook(Object.assign(meta, { title: meta.title || hints.title }), { chapters: out }, { source: hints.source || 'upload', format: 'fb2', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- Word (DOCX) ----------
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
I.fromDOCX = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening Word document…', percent: 0.05 });
  const zip = await zipOf(file);
  const xml = await zipText(zip, 'word/document.xml');
  if (!xml) throw new Error('This file has no Word document inside (word/document.xml is missing).');
  const wattr = (el, name) => attr(el, W_NS, name);
  // style id → heading level
  const headingStyles = new Map();
  const stylesXml = await zipText(zip, 'word/styles.xml');
  if (stylesXml) {
    const sd = parseXML(stylesXml);
    for (const st of byLocal(sd, 'style')) {
      const id = wattr(st, 'styleId') || '';
      const nameEl = firstLocal(st, 'name');
      const name = ((nameEl && wattr(nameEl, 'val')) || id).toLowerCase();
      let lvl = null;
      const m = name.match(/^heading\s*(\d)$/) || id.toLowerCase().match(/^heading(\d)$/) || name.match(/^(?:überschrift|titre|título|titolo|заголовок|kop|rubrik|overskrift|nagłówek|nadpis)\s*(\d)$/);
      if (m) lvl = +m[1];
      else if (/^(title|titre|titel|título|titolo|название)$/.test(name)) lvl = 1;
      else if (/^(subtitle|sous-titre|untertitel|subtítulo)$/.test(name)) lvl = 2;
      else { const ol = firstLocal(st, 'outlineLvl'); if (ol) { const v = +wattr(ol, 'val'); if (v >= 0 && v <= 2) lvl = v + 1; } }
      if (lvl && id) headingStyles.set(id, lvl);
    }
  }
  const doc = parseXML(xml);
  for (const el of byLocal(doc, 'Fallback')) el.remove();           // mc:AlternateContent duplicates
  for (const el of byLocal(doc, 'del')) el.remove();                // tracked deletions
  for (const el of byLocal(doc, 'instrText')) el.remove();          // field codes
  for (const el of byLocal(doc, 'delText')) el.remove();
  const paraText = p => {
    let s = '';
    const walk = node => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType !== 1) continue;
        const ln = ch.localName;
        if (ln === 't') s += ch.textContent;
        else if (ln === 'tab') s += ' ';
        else if (ln === 'br' || ln === 'cr') { if ((wattr(ch, 'type') || '') !== 'page') s += '\n'; }
        else if (ln === 'noBreakHyphen') s += '-';
        else if (ln === 'sym') { const c = wattr(ch, 'char'); if (c && /^F0/i.test(c)) s += ''; }
        else if (ln === 'pPr' || ln === 'rPr' || ln === 'footnoteReference' || ln === 'endnoteReference' || ln === 'commentReference' || ln === 'commentRangeStart' || ln === 'commentRangeEnd' || ln === 'bookmarkStart' || ln === 'bookmarkEnd' || ln === 'proofErr' || ln === 'drawing' || ln === 'pict' || ln === 'object') continue;
        else walk(ch);
      }
    };
    walk(p);
    return clean(s);
  };
  const blocks = [];
  const paras = byLocal(doc, 'p').filter(p => p.namespaceURI === W_NS || !p.namespaceURI);
  let i = 0;
  for (const p of paras) {
    i++;
    if (i % 400 === 0) { progress({ stage: 'parsing', message: `Reading paragraph ${i} of ${paras.length}`, percent: 0.1 + 0.8 * i / paras.length }); await U.sleep(0); }
    const t = paraText(p);
    if (!t) continue;
    let level = 0;
    const pPr = Array.from(p.children).find(c => c.localName === 'pPr');
    if (pPr) {
      const ps = Array.from(pPr.children).find(c => c.localName === 'pStyle');
      const sid = ps && wattr(ps, 'val');
      if (sid && headingStyles.has(sid)) level = headingStyles.get(sid);
      const ol = Array.from(pPr.children).find(c => c.localName === 'outlineLvl');
      if (!level && ol) { const v = +wattr(ol, 'val'); if (v >= 0 && v <= 2) level = v + 1; }
    }
    if (level && T.countWords(t) <= 24) blocks.push({ text: t, heading: true, level }); else blocks.push({ text: t });
  }
  const meta = { title: '', author: '', language: '', subjects: [], description: '' };
  const core = await zipText(zip, 'docProps/core.xml');
  if (core) {
    const cd = parseXML(core);
    const g = n => { const el = firstLocal(cd, n); return el ? oneLine(el.textContent) : ''; };
    meta.title = g('title'); meta.author = g('creator'); meta.language = g('language').slice(0, 8); meta.description = g('description');
    meta.subjects = [g('subject'), ...g('keywords').split(/[,;]/)].map(s => s.trim()).filter(Boolean);
  }
  if (/^(untitled|microsoft word)/i.test(meta.title)) meta.title = '';
  const lang = doc.documentElement && firstLocal(doc, 'lang');
  if (!meta.language && lang) meta.language = (wattr(lang, 'val') || '').slice(0, 8);
  const title = meta.title || fileTitle(file.name);
  const chapters = chaptersFromBlocks(blocks, title, { title });
  if (!chapters.length) throw new Error('No readable text found in this Word document.');
  return I.makeBook(Object.assign(meta, { title }), { chapters }, { source: 'upload', format: 'docx', fileName: file.name, fileSize: file.size });
};

// ---------- OpenDocument (ODT / FODT / SXW) ----------
const TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
function odfBlocks(doc){
  const body = firstLocal(doc, 'text') && firstLocal(doc, 'text').namespaceURI && /office/.test(firstLocal(doc, 'text').namespaceURI) ? firstLocal(doc, 'text') : (firstLocal(doc, 'body') || doc.documentElement);
  const SKIP = new Set(['tracked-changes', 'sequence-decls', 'forms', 'variable-decls', 'user-field-decls', 'dde-connection-decls', 'alphabetical-index-auto-mark-file', 'table-of-content', 'illustration-index', 'table-index', 'object-index', 'user-index', 'alphabetical-index', 'bibliography', 'note', 'annotation', 'annotation-end', 'bookmark', 'bookmark-start', 'bookmark-end', 'reference-mark', 'reference-mark-start', 'reference-mark-end', 'soft-page-break', 'change', 'change-start', 'change-end', 'ruby-text', 'meta', 'settings', 'scripts', 'font-face-decls', 'styles', 'automatic-styles', 'master-styles']);
  const inline = el => {
    let s = '';
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        const ln = n.localName;
        if (ln === 's') s += ' '.repeat(Math.min(20, +(attr(n, TEXT_NS, 'c') || 1)));
        else if (ln === 'tab' || ln === 'tab-stop') s += ' ';
        else if (ln === 'line-break') s += '\n';
        else if (SKIP.has(ln)) continue;
        else s += inline(n);
      }
    }
    return s;
  };
  const blocks = [];
  const walk = el => {
    for (const ch of Array.from(el.children)) {
      const ln = ch.localName;
      if (SKIP.has(ln)) continue;
      if (ln === 'h') { const t = clean(inline(ch)); const lvl = +(attr(ch, TEXT_NS, 'outline-level') || attr(ch, TEXT_NS, 'level') || 1); if (t) blocks.push({ text: t, heading: true, level: lvl }); }
      else if (ln === 'p') { const t = clean(inline(ch)); if (t) blocks.push({ text: t }); }
      else walk(ch);
    }
  };
  walk(body);
  return blocks;
}
function odfMeta(doc){
  const meta = { title: '', author: '', language: '', subjects: [], description: '' };
  const om = firstLocal(doc, 'meta');
  if (!om) return meta;
  const g = n => { const el = firstLocal(om, n); return el ? oneLine(el.textContent) : ''; };
  meta.title = g('title'); meta.author = g('creator') || g('initial-creator'); meta.language = g('language').slice(0, 8); meta.description = g('description') || g('subject');
  meta.subjects = byLocal(om, 'keyword').map(k => oneLine(k.textContent)).filter(Boolean);
  return meta;
}
I.fromODT = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening document…', percent: 0.05 });
  const zip = await zipOf(file);
  const xml = await zipText(zip, 'content.xml');
  if (!xml) throw new Error('This file has no OpenDocument content inside (content.xml is missing).');
  progress({ stage: 'parsing', message: 'Reading document…', percent: 0.3 });
  const blocks = odfBlocks(parseXML(xml));
  const metaXml = await zipText(zip, 'meta.xml');
  const meta = metaXml ? odfMeta(parseXML(metaXml)) : { title: '', author: '', language: '', subjects: [] };
  const title = meta.title || fileTitle(file.name);
  const chapters = chaptersFromBlocks(blocks, title, { title });
  if (!chapters.length) throw new Error('No readable text found in this document.');
  return I.makeBook(Object.assign(meta, { title }), { chapters }, { source: 'upload', format: 'odt', fileName: file.name, fileSize: file.size });
};
I.fromFODT = async (xml, hints = {}, opts = {}) => {
  (opts.onProgress || noop)({ stage: 'parsing', message: 'Reading document…', percent: 0.3 });
  const doc = parseXML(xml);
  const blocks = odfBlocks(doc);
  const meta = odfMeta(doc);
  const title = meta.title || hints.title;
  const chapters = chaptersFromBlocks(blocks, title, { title });
  if (!chapters.length) throw new Error('No readable text found in this document.');
  return I.makeBook(Object.assign(meta, { title }), { chapters }, { source: 'upload', format: 'odt', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- Rich Text (RTF) ----------
const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'listtable', 'listoverridetable', 'pict', 'object', 'objdata', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote', 'annotation', 'atnid', 'atnauthor', 'atndate', 'xe', 'tc', 'txe', 'fldinst', 'datafield', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'rsidtbl', 'generator', 'pntext', 'pn', 'listtext', 'revtbl', 'xmlnstbl', 'mmathPr', 'background', 'shp', 'shpinst', 'shprslt', 'docvar', 'userprops', 'wgrffmtfilter', 'nesttableprops', 'protusertbl', 'factoidname', 'template', 'bkmkstart', 'bkmkend', 'ftnsep', 'ftnsepc', 'aftnsep', 'aftnsepc', 'aftncn', 'ftncn', 'fchars', 'lchars', 'nonshppict', 'blipuid', 'panose', 'falt', 'sp', 'sn', 'sv', 'field', 'category', 'company', 'manager', 'operator', 'comment', 'doccomm', 'hlinkbase', 'password', 'passwordhash', 'writereservhash', 'stylesheet_ignored']);
const RTF_CP = { 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258', 874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1361: 'euc-kr', 65001: 'utf-8', 10000: 'macintosh' };
function rtfToBlocks(src){
  const blocks = [];
  const styles = new Map();          // style index → heading level (0 = none)
  const info = { title: '', author: '' };
  let codepage = 'windows-1252', decoder = null;
  const dec = () => decoder || (decoder = (() => { try { return new TextDecoder(codepage); } catch (e) { return new TextDecoder('windows-1252'); } })());
  let para = '', pendingHex = [], skipChars = 0;
  const stack = [];
  let st = { mode: 'text', uc: 1, style: 0, outline: null, ignorable: false, textAcc: '', styleIdx: null, styleOutline: null, field: null };
  const flushHex = () => { if (pendingHex.length) { para += dec().decode(Uint8Array.from(pendingHex)); pendingHex = []; } };
  const endPara = () => {
    flushHex();
    const t = clean(para);
    para = '';
    if (!t) return;
    let lvl = st.outline != null ? st.outline + 1 : (styles.get(st.style) || 0);
    if (lvl && lvl <= 3 && T.countWords(t) <= 24) blocks.push({ text: t, heading: true, level: lvl }); else blocks.push({ text: t });
  };
  const emit = ch => { flushHex(); if (skipChars > 0) { skipChars--; return; } para += ch; };
  const SYM = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', enspace: ' ', emspace: ' ', qmspace: ' ', zwj: '', zwnj: '', ltrmark: '', rtlmark: '', zwbo: '', zwnbo: '' };
  const handleWord = (word, param) => {
    if (st.ignorable) { st.ignorable = false; st.mode = 'skip'; return; }
    if (st.mode === 'skip') return;
    if (RTF_SKIP.has(word)) { st.mode = 'skip'; return; }
    if (word === 'stylesheet') { st.mode = 'stylesheet'; return; }
    if (word === 'info') { st.mode = 'info'; return; }
    if (st.mode === 'info') { if (word === 'title' || word === 'author' || word === 'subject') { st.mode = 'infofield'; st.field = word; st.textAcc = ''; } return; }
    if (st.mode === 'infofield') { if (word === 'u' && param != null) st.textAcc += String.fromCharCode(param < 0 ? param + 65536 : param); return; }
    if (st.mode === 'style') { if (word === 's') st.styleIdx = param; else if (word === 'outlinelevel') st.styleOutline = param; return; }
    if (st.mode !== 'text') return;
    switch (word) {
      case 'par': case 'sect': case 'page': case 'row': case 'cell': case 'nestcell': case 'nestrow': endPara(); return;
      case 'line': case 'lbr': emit('\n'); return;
      case 'tab': emit(' '); return;
      case 'pard': st.style = 0; st.outline = null; return;
      case 's': st.style = param || 0; return;
      case 'outlinelevel': st.outline = param; return;
      case 'uc': st.uc = param == null ? 1 : param; return;
      case 'u': { if (param == null) return; flushHex(); para += String.fromCharCode(param < 0 ? param + 65536 : param); skipChars = st.uc; return; }
      case 'ansicpg': { codepage = RTF_CP[param] || codepage; decoder = null; return; }
      case 'mac': { codepage = 'macintosh'; decoder = null; return; }
      case 'pc': { codepage = 'cp437'; decoder = null; return; }
      case 'pca': { codepage = 'cp850'; decoder = null; return; }
      case 'chdate': case 'chtime': case 'chpgn': case 'sectnum': return;
    }
    if (SYM[word] !== undefined) emit(SYM[word]);
  };
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '{') {
      stack.push(st);
      st = Object.assign({}, st, { ignorable: false, textAcc: '', styleIdx: null, styleOutline: null });
      if (stack[stack.length - 1].mode === 'stylesheet') st.mode = 'style';
      i++; continue;
    }
    if (c === '}') {
      if (st.mode === 'style' && st.styleIdx != null) {
        const name = st.textAcc.replace(/;\s*$/, '').trim().toLowerCase();
        let lvl = 0;
        const m = name.match(/heading\s*(\d)/) || name.match(/(?:überschrift|titre|título|titolo|заголовок)\s*(\d)/);
        if (m) lvl = +m[1]; else if (/^title$/.test(name)) lvl = 1; else if (/^subtitle$/.test(name)) lvl = 2; else if (st.styleOutline != null && st.styleOutline <= 2) lvl = st.styleOutline + 1;
        if (lvl) styles.set(st.styleIdx, lvl);
      }
      if (st.mode === 'infofield' && st.field) info[st.field] = (info[st.field] || '') + st.textAcc;
      st = stack.pop() || st;
      i++; continue;
    }
    if (c === '\\') {
      const rest = src.substr(i, 40);
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rest);
      if (m) { i += m[0].length; handleWord(m[1], m[2] == null ? null : +m[2]); continue; }
      const sym = src[i + 1]; i += 2;
      if (sym === "'") {
        const b = parseInt(src.substr(i, 2), 16); i += 2;
        if (st.mode === 'text') { if (skipChars > 0) skipChars--; else if (!isNaN(b)) pendingHex.push(b); }
        else if (st.mode === 'style' || st.mode === 'infofield') { if (!isNaN(b)) st.textAcc += dec().decode(Uint8Array.from([b])); }
        continue;
      }
      if (sym === '*') { st.ignorable = true; continue; }
      if (st.mode === 'text') {
        if (sym === '\\' || sym === '{' || sym === '}') emit(sym);
        else if (sym === '~') emit('\u00a0');
        else if (sym === '_') emit('-');
        else if (sym === '\n' || sym === '\r') endPara();
      } else if ((st.mode === 'style' || st.mode === 'infofield') && (sym === '\\' || sym === '{' || sym === '}')) st.textAcc += sym;
      continue;
    }
    i++;
    if (c === '\r' || c === '\n') continue;
    if (st.mode === 'text') emit(c);
    else if (st.mode === 'style' || st.mode === 'infofield') st.textAcc += c;
  }
  endPara();
  return { blocks, info };
}
I.rtfToBlocks = rtfToBlocks;
I.fromRTF = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'parsing', message: 'Reading RTF…', percent: 0.2 });
  const src = new TextDecoder('windows-1252').decode(new Uint8Array(await U.readAsArrayBuffer(file)));
  if (!/^\s*\{\\rtf/.test(src)) throw new Error('This is not an RTF file.');
  const { blocks, info } = rtfToBlocks(src);
  const title = oneLine(info.title) || fileTitle(file.name);
  const chapters = chaptersFromBlocks(blocks, title, { title });
  if (!chapters.length) throw new Error('No readable text found in this RTF file.');
  return I.makeBook({ title, author: oneLine(info.author) }, { chapters }, { source: 'upload', format: 'rtf', fileName: file.name, fileSize: file.size });
};

// ---------- PalmDoc / zTXT (PDB) ----------
function palmdocDecompress(inp){
  const out = [];
  for (let i = 0; i < inp.length; i++) {
    const b = inp[i];
    if (b === 0) out.push(0);
    else if (b <= 8) { for (let j = 0; j < b && i + 1 + j < inp.length; j++) out.push(inp[i + 1 + j]); i += b; }
    else if (b <= 0x7f) out.push(b);
    else if (b <= 0xbf) { const v = (b << 8) | inp[++i]; const dist = (v & 0x3fff) >>> 3, len = (v & 7) + 3; for (let j = 0; j < len; j++) out.push(out[out.length - dist] || 32); }
    else { out.push(32, b ^ 0x80); }
  }
  return Uint8Array.from(out);
}
I.palmdocDecompress = palmdocDecompress;
I.fromPDB = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening Palm database…', percent: 0.05 });
  const buf = await U.readAsArrayBuffer(file);
  const u8 = new Uint8Array(buf);
  if (u8.length < 80) throw new Error('This Palm database is too small to hold a book.');
  const dv = new DataView(buf);
  const type = ascii(u8, 60, 8);
  if (type === 'BOOKMOBI') return I.fromMOBI(file, opts);
  if (type === 'PNRdPPrs') throw new Error('eReader (Palm) books are compressed or encrypted in a way browsers cannot read. ' + CALIBRE);
  if (type === 'DataPlkr') throw new Error('Plucker documents are not supported. ' + CALIBRE);
  if (type !== 'TEXtREAd' && type !== 'zTXTGPlm') throw new Error(`Unknown Palm database type “${type.replace(/[^\x20-\x7e]/g, '?')}”. Folio reads PalmDoc (TEXtREAd), zTXT and Mobipocket databases.`);
  const name = ascii(u8, 0, 32).replace(/\0[\s\S]*$/, '').trim();
  const numRecords = dv.getUint16(76);
  const offsets = [];
  for (let r = 0; r < numRecords; r++) offsets.push(dv.getUint32(78 + r * 8));
  const rec = r => u8.subarray(offsets[r], r + 1 < numRecords ? offsets[r + 1] : u8.length);
  let text = '';
  progress({ stage: 'parsing', message: 'Unpacking text…', percent: 0.3 });
  if (type === 'TEXtREAd') {
    const r0 = rec(0), d0 = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
    const compression = d0.getUint16(0), textLen = d0.getUint32(4), count = d0.getUint16(8);
    if (compression !== 1 && compression !== 2) throw new Error(compression === 17480 ? 'This PalmDoc uses Mobipocket Huffman compression; rename it .mobi to import it.' : `Unsupported PalmDoc compression (${compression}).`);
    const parts = [];
    for (let r = 1; r <= count && r < numRecords; r++) parts.push(compression === 2 ? palmdocDecompress(rec(r)) : rec(r));
    let bytes = concatBytes(parts);
    if (textLen && textLen < bytes.length) bytes = bytes.subarray(0, textLen);
    text = decodeBytes(bytes);
  } else {
    const r0 = rec(0), d0 = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
    const count = d0.getUint16(2), flags = r0.length > 16 ? r0[16] : 0;
    const parts = [];
    for (let r = 1; r <= count && r < numRecords; r++) parts.push(rec(r));
    try {
      if (flags & 1) { const outs = []; for (const p of parts) outs.push(await inflate(p, 'deflate')); text = decodeBytes(concatBytes(outs)); }
      else text = decodeBytes(await inflate(concatBytes(parts), 'deflate'));
    } catch (e) { console.warn(e); throw new Error('This zTXT file could not be decompressed in this browser.'); }
  }
  text = text.replace(/\0/g, '');
  if (!/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable text found in this Palm database.');
  return I.fromText(text, hintsOf(file, { title: name || fileTitle(file.name), format: 'pdb' }), opts);
};

// ---------- Comics (CBZ) ----------
I.fromCBZ = async (file, opts = {}, zipArg) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening comic archive…', percent: 0.02 });
  const zip = zipArg || await zipOf(file);
  const names = zipEntries(zip).filter(n => /\.(jpe?g|png|webp|gif|bmp|tiff?|avif)$/i.test(n)).sort(naturalSort);
  if (!names.length) throw new Error('No page images found in this comic archive.');
  const meta = { title: fileTitle(file.name), author: '', language: '', subjects: [], description: '' };
  const info = await zipText(zip, 'ComicInfo.xml');
  if (info) {
    const d = parseXML(info);
    const g = t => { const el = firstLocal(d, t); return el ? oneLine(el.textContent) : ''; };
    const series = g('Series'), num = g('Number'), title = g('Title');
    meta.title = [series, num ? '#' + num : '', title && title !== series ? (series ? '· ' : '') + title : ''].filter(Boolean).join(' ') || meta.title;
    meta.author = [g('Writer'), g('Penciller')].filter(Boolean).join(', ');
    meta.language = g('LanguageISO').slice(0, 8);
    meta.subjects = g('Genre').split(',').map(s => s.trim()).filter(Boolean);
    meta.description = g('Summary');
  }
  const files = [];
  for (const n of names) files.push(makeFile(await zip.file(n).async('blob'), n.split('/').pop(), mimeFor(n)));
  const res = await I.fromImages(files, Object.assign({}, opts, { title: meta.title, author: meta.author, onProgress: p => progress(Object.assign({}, p, { message: String(p.message || '').replace(/photo/g, 'page') })) }));
  const b = res.book;
  b.format = 'cbz'; b.source = 'upload'; b.fileName = file.name; b.fileSize = file.size; b.language = meta.language || b.language; b.subjects = meta.subjects; b.description = meta.description;
  b.physical = { totalPages: names.length };
  try { b.cover = await U.resizeToDataURL(files[0], 640, 0.82); } catch (e) {}
  res.content.chapters.forEach(c => { if (c.title === 'Scanned pages') c.title = 'Pages'; });
  return res;
};

// ---------- ZIP bundles ----------
const BOOK_IN_ZIP = /\.(epub|kepub|mobi|prc|azw3?|azw4|kf8|pdf|fb2|docx|docm|odt|sxw|fodt|rtf|pdb|cbz|tex|latex|srt|vtt|sbv)$/i;
const TEXT_IN_ZIP = /\.(x?html?|xht|txt|text|md|markdown|xml)$/i;
I.fromZip = async (file, opts = {}) => {
  const progress = opts.onProgress || noop;
  progress({ stage: 'loading', message: 'Opening archive…', percent: 0.02 });
  const zip = await zipOf(file);
  const names = zipEntries(zip);
  const kind = zipKind(zip, names);
  if (kind === 'epub') return I.fromEPUB(file, opts);
  if (kind === 'docx') return I.fromDOCX(file, opts);
  if (kind === 'odt') return I.fromODT(file, opts);
  if (kind === 'cbz') return I.fromCBZ(file, opts, zip);
  const inner = async n => makeFile(await zip.file(n).async('blob'), n.split('/').pop());
  const books = names.filter(n => BOOK_IN_ZIP.test(n)).sort(naturalSort);
  if (books.length) {
    const results = [];
    for (const n of books) {
      progress({ stage: 'loading', message: `Opening ${n.split('/').pop()}…`, percent: 0.05 });
      const r = await I.fromFile(await inner(n), opts);
      for (const one of (Array.isArray(r) ? r : [r])) { one.book.fileName = `${file.name} › ${n}`; results.push(one); }
    }
    return results.length === 1 ? results[0] : results;
  }
  const texts = names.filter(n => TEXT_IN_ZIP.test(n)).sort(naturalSort);
  if (!texts.length) throw new Error('This zip holds no book files. Folio looks inside archives for EPUB, Kindle, PDF, FB2, Word, ODT, RTF, PalmDoc, HTML, Markdown, text and page images.');
  if (texts.length === 1) { const r = await I.fromFile(await inner(texts[0]), opts); r.book.fileName = `${file.name} › ${texts[0]}`; return r; }
  // several text/HTML files: one book, one chapter (or more) per file, in natural order
  const chapters = [];
  let title = fileTitle(file.name), author = '', language = '';
  let i = 0;
  for (const n of texts) {
    i++;
    progress({ stage: 'parsing', message: `Reading ${n.split('/').pop()} (${i} of ${texts.length})`, percent: 0.05 + 0.9 * i / texts.length });
    const str = await zipText(zip, n);
    if (!str) continue;
    if (/\.(x?html?|xht|xml)$/i.test(n)) {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      const t = doc.querySelector('title');
      const blocks = I.blocksFromHTML(str);
      if (!language) language = (doc.documentElement.getAttribute('lang') || '').slice(0, 8);
      pushSectionChapters(chapters, blocks, t ? oneLine(t.textContent) : '');
    } else {
      const parsed = T.parsePlainText(str, { title: fileTitle(n) });
      if (!author && parsed.author) author = parsed.author;
      if (!language && parsed.language) language = parsed.language;
      parsed.chapters.forEach(c => { if (!c.title) c.title = fileTitle(n); });
      chapters.push(...parsed.chapters);
    }
    if (i % 4 === 0) await U.sleep(0);
  }
  const out = refineChapters(chapters);
  if (!out.length) throw new Error('No readable text found in this archive.');
  return I.makeBook({ title, author, language }, { chapters: out }, { source: 'upload', format: 'zip', fileName: file.name, fileSize: file.size });
};

// ---------- LaTeX ----------
function balancedArg(s, open){ // s[open] === '{' → returns [inner, endIndexExclusive]
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [s.slice(open + 1, i), i + 1]; }
  }
  return [s.slice(open + 1), s.length];
}
const TEX_DROP = ['label', 'ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'cite', 'citep', 'citet', 'citeauthor', 'citeyear', 'nocite', 'index', 'footnote', 'footnotetext', 'footnotemark', 'marginpar', 'vspace', 'hspace', 'includegraphics', 'input', 'include', 'bibliography', 'bibliographystyle', 'usepackage', 'documentclass', 'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'setlength', 'addtolength', 'pagestyle', 'thispagestyle', 'caption', 'todo', 'glossary', 'addcontentsline', 'setcounter', 'addtocounter', 'numberwithin', 'hyphenation', 'linespread', 'geometry', 'fancyhead', 'fancyfoot', 'rule', 'phantomsection', 'selectlanguage', 'date', 'author', 'title', 'thanks', 'affiliation', 'email', 'keywords', 'pacs', 'hypersetup', 'graphicspath', 'DeclareMathOperator', 'newtheorem', 'theoremstyle', 'setmainfont', 'setsansfont', 'setmonofont', 'definecolor', 'color', 'pagecolor', 'fontsize', 'raisebox', 'makebox', 'framebox', 'parbox', 'rotatebox', 'scalebox', 'resizebox', 'label', 'nocite', 'vfill', 'hfill'];
const TEX_ACCENTS = { "'": '\u0301', '`': '\u0300', '^': '\u0302', '"': '\u0308', '~': '\u0303', '=': '\u0304', '.': '\u0307', 'u': '\u0306', 'v': '\u030C', 'H': '\u030B', 'c': '\u0327', 'k': '\u0328', 'r': '\u030A', 'b': '\u0331', 'd': '\u0323' };
const TEX_LETTERS = { ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', dh: 'ð', DH: 'Ð', th: 'þ', TH: 'Þ', dag: '†', ddag: '‡', S: '§', P: '¶', pounds: '£', copyright: '©', textcopyright: '©', textregistered: '®', texttrademark: '™', textellipsis: '…', ldots: '…', dots: '…', cdots: '⋯', textbackslash: '\\', textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', textemdash: '—', textendash: '–', LaTeX: 'LaTeX', TeX: 'TeX', LaTeXe: 'LaTeX2e', textasciitilde: '~', textasciicircum: '^', textbullet: '•', textdegree: '°', textperiodcentered: '·', textbar: '|', textless: '<', textgreater: '>', textunderscore: '_', textbraceleft: '{', textbraceright: '}', slash: '/', quad: ' ', qquad: ' ', enspace: ' ', thinspace: ' ', negthinspace: '', space: ' ', newline: '\n', linebreak: '\n', par: '\n\n', item: '\n\n• ', and: ', ' };
function dropTexCommands(s, names){
  const re = new RegExp('\\\\(' + names.join('|') + ')\\*?\\s*((?:\\[[^\\]]*\\])*)\\s*(\\{)?', 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    out += s.slice(last, m.index);
    let end = m.index + m[0].length;
    if (m[3]) { const [, e] = balancedArg(s, end - 1); end = e; while (s[end] === '{') { const [, e2] = balancedArg(s, end); end = e2; } }
    last = end; re.lastIndex = end;
  }
  return out + s.slice(last);
}
function texInline(str){
  let t = String(str || '');
  t = dropTexCommands(t, TEX_DROP);
  // \href{url}{text} → text ; \url{x} → x
  for (let guard = 0; guard < 50; guard++) {
    const m = /\\href\s*\{/.exec(t); if (!m) break;
    const [, e1] = balancedArg(t, m.index + m[0].length - 1);
    if (t[e1] !== '{') { t = t.slice(0, m.index) + t.slice(e1); continue; }
    const [inner, e2] = balancedArg(t, e1);
    t = t.slice(0, m.index) + inner + t.slice(e2);
  }
  // accents: \'e \'{e} \c{c}
  t = t.replace(/\\([`'^"~=.uvHckrbd])\s*\{?\s*(\\?[a-zA-Z])\}?/g, (m, acc, ch) => { const base = ch.replace(/^\\/, ''); return TEX_ACCENTS[acc] ? (base + TEX_ACCENTS[acc]).normalize('NFC') : base; });
  // named letters and symbols: \ss \ae \ldots …
  t = t.replace(/\\([a-zA-Z]+)(\{\})?(?![a-zA-Z])/g, (m, name) => (Object.prototype.hasOwnProperty.call(TEX_LETTERS, name) ? TEX_LETTERS[name] : m));
  // wrapper commands: keep the argument text (\emph{x}, \textbf{x}, \section*{x} …) — repeat for nesting
  for (let guard = 0; guard < 40; guard++) {
    const m = /\\([a-zA-Z]+)\*?\s*(?:\[[^\]]*\])?\s*\{/.exec(t); if (!m) break;
    const [inner, end] = balancedArg(t, m.index + m[0].length - 1);
    t = t.slice(0, m.index) + ' ' + inner + ' ' + t.slice(end);
  }
  t = t.replace(/\\([&%$#_{}])/g, '$1').replace(/\\[,;:!]/g, ' ').replace(/\\ /g, ' ').replace(/\\@/g, '').replace(/\\-/g, '').replace(/\\\\(\[[^\]]*\])?/g, '\n');
  t = t.replace(/\\[a-zA-Z]+\*?/g, ' ');           // any remaining bare command
  t = t.replace(/(^|[^\\])~/g, '$1 ').replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/(^|\s)`/g, '$1‘').replace(/[{}]/g, '');
  return clean(t);
}
function removeTexEnv(s, env){
  const e = env.replace(/\*/g, '\\*');
  return s.replace(new RegExp('\\\\begin\\{' + e + '\\}[\\s\\S]*?\\\\end\\{' + e + '\\}', 'g'), '\n\n');
}
I.fromLaTeX = async (src, hints = {}, opts = {}) => {
  (opts.onProgress || noop)({ stage: 'parsing', message: 'Reading LaTeX…', percent: 0.2 });
  let s = String(src).replace(/\r\n?/g, '\n').replace(/\\begin\{comment\}[\s\S]*?\\end\{comment\}/g, '');
  s = s.replace(/(^|[^\\])%[^\n]*/g, '$1');
  const grab = cmd => { const m = new RegExp('\\\\' + cmd + '\\*?\\s*(?:\\[[^\\]]*\\])?\\s*\\{').exec(s); if (!m) return ''; return texInline(balancedArg(s, m.index + m[0].length - 1)[0]); };
  const title = grab('title'), author = grab('author').replace(/\s*,\s*,/g, ',');
  const langM = s.match(/\\usepackage\[([^\]]*)\]\{(?:babel|polyglossia)\}/) || s.match(/\\setmainlanguage\{(\w+)\}/) || s.match(/\\setdefaultlanguage\{(\w+)\}/);
  const LANGS = { english: 'en', british: 'en', american: 'en', french: 'fr', frenchb: 'fr', german: 'de', ngerman: 'de', spanish: 'es', italian: 'it', portuguese: 'pt', brazilian: 'pt', dutch: 'nl', russian: 'ru', polish: 'pl', swedish: 'sv', danish: 'da', norsk: 'no', finnish: 'fi', czech: 'cs', greek: 'el', turkish: 'tr', latin: 'la', hungarian: 'hu', romanian: 'ro' };
  const language = langM ? (LANGS[(langM[1].split(',').pop() || '').trim()] || '') : '';
  const bodyM = s.match(/\\begin\{document\}([\s\S]*?)(\\end\{document\}|$)/);
  let body = bodyM ? bodyM[1] : s;
  for (const env of ['figure', 'figure*', 'table', 'table*', 'tikzpicture', 'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'eqnarray', 'eqnarray*', 'displaymath', 'gather', 'gather*', 'multline', 'multline*', 'lstlisting', 'verbatim', 'minted', 'tabular', 'tabular*', 'tabularx', 'longtable', 'thebibliography', 'filecontents', 'filecontents*', 'wrapfigure', 'subfigure', 'algorithm', 'algorithmic', 'tcolorbox', 'titlepage', 'frame']) body = removeTexEnv(body, env);
  body = body.replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\\\[[\s\S]*?\\\]/g, ' ').replace(/\\\([\s\S]*?\\\)/g, ' ').replace(/(^|[^\\])\$[^$\n]*\$/g, '$1 ');
  body = body.replace(/\\(maketitle|tableofcontents|listoffigures|listoftables|newpage|clearpage|cleardoublepage|noindent|centering|raggedright|raggedleft|bigskip|medskip|smallskip|vfill|hfill|indent|frontmatter|mainmatter|backmatter|appendix|printbibliography|printindex|onecolumn|twocolumn|sloppy|fussy|nopagebreak|pagebreak|linebreak|samepage|flushbottom|raggedbottom|makeatletter|makeatother|normalsize|small|footnotesize|scriptsize|tiny|large|Large|LARGE|huge|Huge|em|bf|it|rm|sf|tt|sc|sl|bfseries|itshape|scshape|ttfamily|rmfamily|sffamily|mdseries|upshape|slshape)\b\*?/g, ' ');
  body = body.replace(/\\item\b\s*(\[[^\]]*\])?/g, '\n\n• ').replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?(\{[^}]*\})?/g, '\n\n');
  // sectioning → heading markers
  const LEVEL = { part: 1, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
  const hasChapters = /\\chapter\b/.test(body);
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;
  let out = '', last = 0, m;
  while ((m = re.exec(body))) {
    const [inner, end] = balancedArg(body, m.index + m[0].length - 1);
    let lvl = LEVEL[m[1]];
    if (!hasChapters && m[1] === 'section') lvl = 1; else if (!hasChapters && m[1] === 'subsection') lvl = 2;
    if (hasChapters && m[1] === 'section') lvl = 2;
    out += body.slice(last, m.index) + `\n\n\u0001H${lvl}\u0001${texInline(inner)}\n\n`;
    last = end; re.lastIndex = end;
  }
  body = out + body.slice(last);
  const blocks = [];
  for (const para of body.split(/\n\s*\n/)) {
    const hm = para.match(/^\s*\u0001H(\d)\u0001([\s\S]*)$/);
    if (hm) { const t = clean(hm[2]); if (t) blocks.push({ text: t, heading: true, level: +hm[1] }); continue; }
    const t = texInline(para);
    if (t && /[\p{L}\p{N}]/u.test(t)) blocks.push({ text: t.replace(/\n+/g, ' ') });
  }
  const bookTitle = title || hints.title;
  const chapters = chaptersFromBlocks(blocks, bookTitle, { title: bookTitle });
  if (!chapters.length) throw new Error('No readable text found in this LaTeX source.');
  return I.makeBook({ title: bookTitle, author, language }, { chapters }, { source: 'upload', format: 'tex', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- Markdown ----------
function mdInline(s){
  let t = String(s || '');
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1').replace(/<(https?:\/\/[^>]+)>/g, '$1');
  t = t.replace(/\[\^[^\]]+\]/g, '').replace(/<[^>\n]+>/g, '');
  t = t.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2').replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g, '$2').replace(/~~([^~]+)~~/g, '$1').replace(/`([^`]+)`/g, '$1');
  t = t.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
  t = t.replace(/ {2,}\n/g, '\n').replace(/([^\n])\n(?!\n)/g, '$1 ');
  return clean(t);
}
I.fromMarkdown = async (src, hints = {}, opts = {}) => {
  (opts.onProgress || noop)({ stage: 'parsing', message: 'Reading Markdown…', percent: 0.2 });
  let s = String(src).replace(/\r\n?/g, '\n').replace(/^\ufeff/, '');
  const meta = { title: '', author: '', language: '', subjects: [], description: '' };
  const fm = s.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\n/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(title|author|authors|lang|language|description|subjects|tags|keywords)\s*:\s*(.+)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase(), val = m[2].trim().replace(/^["'\[]|["'\]]$/g, '');
      if (key === 'title') meta.title = val; else if (key === 'author' || key === 'authors') meta.author = val; else if (key === 'lang' || key === 'language') meta.language = val.slice(0, 8); else if (key === 'description') meta.description = val; else meta.subjects = val.split(',').map(x => x.trim()).filter(Boolean);
    }
    s = s.slice(fm[0].length);
  }
  const blocks = [];
  const lines = s.split('\n');
  let para = [], inFence = false, fence = [];
  const flush = () => { if (para.length) { const t = mdInline(para.join('\n')); if (t) blocks.push({ text: t }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(ln)) { if (inFence) { const t = fence.join('\n').trim(); if (t) blocks.push({ text: t, pre: true }); fence = []; inFence = false; } else { flush(); inFence = true; } continue; }
    if (inFence) { fence.push(ln); continue; }
    const h = ln.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flush(); const t = mdInline(h[2]); if (t) blocks.push({ text: t, heading: true, level: h[1].length }); continue; }
    if (para.length === 1 && /^\s{0,3}(=+|-+)\s*$/.test(ln) && para[0].trim()) { const t = mdInline(para[0]); para = []; if (t) blocks.push({ text: t, heading: true, level: ln.trim()[0] === '=' ? 1 : 2 }); continue; }
    if (!ln.trim()) { flush(); continue; }
    if (/^\s{0,3}([-*_]\s*){3,}$/.test(ln)) { flush(); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) { flush(); continue; }
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(ln)) continue;
    const li = ln.match(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (li) { flush(); para.push('• ' + li[1]); flush(); continue; }
    para.push(ln.replace(/^\s{0,3}>\s?/, ''));
  }
  flush();
  if (inFence && fence.length) blocks.push({ text: fence.join('\n').trim(), pre: true });
  const title = meta.title || hints.title;
  const chapters = chaptersFromBlocks(blocks, title, { title });
  if (!chapters.length) throw new Error('No readable text found in this Markdown file.');
  return I.makeBook(Object.assign(meta, { title }), { chapters }, { source: hints.source || 'upload', format: 'md', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- Subtitles (SRT / VTT / SBV) ----------
I.fromSubtitles = async (src, hints = {}, opts = {}) => {
  (opts.onProgress || noop)({ stage: 'parsing', message: 'Reading subtitles…', percent: 0.2 });
  const s = String(src).replace(/\r\n?/g, '\n').replace(/^\ufeff/, '');
  const isVTT = /^WEBVTT/.test(s);
  const TIMING = /-->|^\d+:\d\d:\d\d[.,]\d{3},\d+:\d\d:\d\d[.,]\d{3}$/;
  const cues = [];
  for (const block of s.split(/\n{2,}/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (isVTT && /^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0])) continue;
    const ti = lines.findIndex(l => TIMING.test(l));
    if (ti < 0) continue;
    const text = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (text && text !== cues[cues.length - 1]) cues.push(text);
  }
  if (!cues.length) throw new Error('No subtitle text found in this file.');
  const paras = [];
  let cur = '';
  for (const c of cues) {
    cur = cur ? cur + ' ' + c : c;
    if (cur.length > 450 && /[.!?…"”]$/.test(cur)) { paras.push(cur); cur = ''; }
  }
  if (cur) paras.push(cur);
  const title = hints.title || 'Transcript';
  return I.makeBook({ title, language: hints.language }, { chapters: [{ title: 'Transcript', paras }] }, { source: 'upload', format: 'subtitles', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- generic XML (DocBook, TEI, and anything with paragraphs) ----------
I.fromXML = async (str, hints = {}, opts = {}) => {
  const doc = parseXML(str);
  const root = doc.documentElement;
  const rn = (root && root.localName || '').toLowerCase();
  if (rn === 'fictionbook') return I.fromFB2(str, hints, opts);
  if (rn === 'html') return I.fromHTML(str, hints, opts);
  if (rn === 'document' && /opendocument/.test(root.namespaceURI || '')) return I.fromFODT(str, hints, opts);
  if (rn === 'package') throw new Error(BLOCKED.opf);
  if (rn === 'ncx') throw new Error(BLOCKED.ncx);
  if (rn === 'rss' || rn === 'feed') {
    const items = byLocal(doc, 'item').concat(byLocal(doc, 'entry'));
    const chapters = [];
    for (const it of items) {
      const t = firstLocal(it, 'title'); const body = firstLocal(it, 'encoded') || firstLocal(it, 'content') || firstLocal(it, 'description') || firstLocal(it, 'summary');
      if (!body) continue;
      const blocks = I.blocksFromHTML(body.textContent);
      if (blocks.length) chapters.push({ title: t ? oneLine(t.textContent) : `Entry ${chapters.length + 1}`, paras: blocks.map(b => b.text) });
    }
    if (!chapters.length) throw new Error('No readable entries found in this feed.');
    const ft = firstLocal(doc, 'title');
    return I.makeBook({ title: ft ? oneLine(ft.textContent) : hints.title }, { chapters }, { source: 'upload', format: 'xml', fileName: hints.fileName, fileSize: hints.fileSize });
  }
  const HEAD = new Set(['title', 'head', 'h1', 'h2', 'h3', 'bridgehead', 'subtitle']);
  const PARA = new Set(['para', 'p', 'simpara', 'formalpara', 'l', 'lg', 'li', 'listitem', 'verse', 'quote', 'sp', 'stage', 'ab', 'blockquote', 'epigraph', 'attribution', 'literallayout', 'programlisting', 'screen', 'td', 'entry', 'dd', 'dt', 'term', 'note', 'remark', 'ref', 'item']);
  const CONTAINER = new Set(['book', 'article', 'part', 'chapter', 'section', 'sect1', 'sect2', 'sect3', 'sect4', 'sect5', 'preface', 'appendix', 'div', 'div0', 'div1', 'div2', 'div3', 'div4', 'body', 'text', 'front', 'back', 'group', 'act', 'scene', 'set', 'refentry', 'glossary', 'bibliography', 'index', 'colophon', 'dedication', 'toc', 'lot', 'partintro', 'simplesect', 'abstract', 'poem', 'stanza', 'castlist', 'epigraph']);
  const META = new Set(['teiheader', 'info', 'bookinfo', 'articleinfo', 'chapterinfo', 'sectioninfo', 'appendixinfo', 'prefaceinfo', 'partinfo']);
  const blocks = [];
  let metaTitle = '', metaAuthor = '', language = (root && (root.getAttribute('xml:lang') || root.getAttribute('lang')) || '').slice(0, 8);
  const walk = (el, inMeta) => {
    for (const ch of Array.from(el.children)) {
      const ln = ch.localName.toLowerCase();
      if (META.has(ln)) {
        const t = firstLocal(ch, 'title'); if (t && !metaTitle) metaTitle = oneLine(t.textContent);
        const a = firstLocal(ch, 'author'); if (a && !metaAuthor) metaAuthor = oneLine(a.textContent);
        const l = firstLocal(ch, 'language'); if (l && !language) language = (l.getAttribute('ident') || oneLine(l.textContent)).slice(0, 8);
        continue;
      }
      if (HEAD.has(ln) && (CONTAINER.has((ch.parentElement.localName || '').toLowerCase()) || ch.parentElement === root)) { const t = oneLine(ch.textContent); if (t) blocks.push({ text: t, heading: true, level: /^(h1|title|head)$/.test(ln) && /^(book|article|part|chapter|div|div0|div1|section|sect1|body|text|act|set)$/.test((ch.parentElement.localName || '').toLowerCase()) ? 1 : 2 }); continue; }
      if (PARA.has(ln)) {
        const nestedPara = Array.from(ch.children).some(c => PARA.has(c.localName.toLowerCase()) || CONTAINER.has(c.localName.toLowerCase()));
        if (nestedPara) { walk(ch, inMeta); continue; }
        const t = oneLine(ch.textContent); if (t) blocks.push({ text: t }); continue;
      }
      walk(ch, inMeta);
    }
  };
  walk(root, false);
  let chapters;
  if (blocks.filter(b => !b.heading).length >= 2) chapters = chaptersFromBlocks(blocks, metaTitle || hints.title, { title: metaTitle || hints.title });
  else {
    const text = clean((root.textContent || '').replace(/\n[ \t]+/g, '\n'));
    if (!/[\p{L}]{3,}/u.test(text)) throw new Error('No readable text found in this XML file.');
    chapters = T.parsePlainText(text, { title: hints.title }).chapters;
  }
  if (!chapters.length) throw new Error('No readable text found in this XML file.');
  return I.makeBook({ title: metaTitle || hints.title, author: metaAuthor, language }, { chapters }, { source: 'upload', format: 'xml', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- pretty names for the library ----------
I.formatLabel = fmt => ({ pdf: 'PDF', epub: 'EPUB', mobi: 'Kindle MOBI', azw3: 'Kindle AZW3', fb2: 'FictionBook', docx: 'Word', odt: 'OpenDocument', rtf: 'RTF', pdb: 'PalmDoc', cbz: 'Comic', zip: 'Zip bundle', tex: 'LaTeX', md: 'Markdown', subtitles: 'Subtitles', xml: 'XML', html: 'HTML', txt: 'Text', scan: 'Scanned pages', catalog: 'Catalog' })[fmt] || (fmt ? fmt.toUpperCase() : '');
})();
