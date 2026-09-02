/* 04_ingest.js — PDF / EPUB / TXT / HTML / photo ingestion, OCR pipeline, metadata */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C;
const I = F.ingest = {};

// ---------- helpers ----------
function titleFromFilename(name){
  return String(name || 'Untitled').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}
function cleanMetaTitle(t){
  t = String(t || '').trim();
  if (!t || t.length < 2) return '';
  if (/^untitled|^microsoft word|\.(docx?|indd|qxd|pdf|tex|odt)$/i.test(t)) return '';
  return t.replace(/\s+/g, ' ');
}
function parseXML(str){
  const doc = new DOMParser().parseFromString(str, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return new DOMParser().parseFromString(str, 'text/html');
  return doc;
}
function stripTags(s){ return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function dirOf(p){ return p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''; }
function resolvePath(base, href){
  if (!href) return base;
  href = decodeURIComponent(href.split('#')[0].split('?')[0]);
  if (href.startsWith('/')) return href.slice(1);
  const parts = (base + href).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}
function normHref(p){ return p.replace(/^\/+/, '').toLowerCase(); }
async function readZipText(zip, path){
  let f = zip.file(path);
  if (!f) { const lower = path.toLowerCase(); const key = Object.keys(zip.files).find(k => k.toLowerCase() === lower); if (key) f = zip.file(key); }
  return f ? f.async('string') : null;
}

function makeBook(meta, content, extra = {}){
  content.chapters = content.chapters.filter(ch => ch && ch.paras && ch.paras.length);
  content.chapters.forEach(ch => { ch.pwc = ch.paras.map(T.countWords); });
  T.ensureCounts(content);
  const title = (meta.title || 'Untitled').replace(/\s+/g, ' ').trim();
  const book = {
    id: U.uuid(), title, author: (meta.author || '').replace(/\s+/g, ' ').trim(), language: (meta.language || '').trim(),
    subjects: U.uniq((meta.subjects || []).map(s => String(s).trim())).slice(0, 12), description: (meta.description || '').trim(),
    source: extra.source || 'upload', sourceRef: extra.sourceRef || null, format: extra.format || 'txt',
    cover: meta.cover || null, coverColor: U.hashColor(title),
    addedAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: null, finishedAt: null,
    words: content.totalWords, chapterCount: content.chapters.length, paragraphs: content.chapters.reduce((a, c) => a + c.paras.length, 0),
    readability: T.readability(content), ocrUsed: !!extra.ocrUsed, pdfPages: extra.pdfPages || null,
    physical: { totalPages: extra.totalPages || null }, fileName: extra.fileName || null, fileSize: extra.fileSize || null,
    ids: extra.ids || {},
  };
  return { book, content: { bookId: book.id, chapters: content.chapters } };
}
I.makeBook = makeBook;

I.save = async ({ book, content }) => {
  content.bookId = book.id;
  await S.put('content', content);
  await S.put('books', book);
  await S.put('progress', { bookId: book.id, loc: T.firstLoc(), percent: 0, updatedAt: Date.now(), physicalPage: null });
  F.bus.emit('books-changed', { bookId: book.id, action: 'added' });
  return book;
};

I.deleteBook = async (bookId) => {
  await S.del('books', bookId);
  await S.del('content', bookId);
  await S.del('progress', bookId);
  await S.del('calibration', bookId);
  try { await S.delWhere('audio', 'bookId', bookId); } catch (e) {}
  try { await S.delWhere('scans', 'bookId', bookId); } catch (e) {}
  // sessions are kept for history but marked orphaned
  F.bus.emit('books-changed', { bookId, action: 'deleted' });
};

I.detectType = file => {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (name.endsWith('.epub') || type === 'application/epub+zip') return 'epub';
  if (/\.(txt|text|md|markdown)$/.test(name) || type.startsWith('text/plain') || type === 'text/markdown') return 'txt';
  if (/\.(x?html?)$/.test(name) || type.includes('html')) return 'html';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/.test(name)) return 'image';
  return null;
};

I.fromFile = async (file, opts = {}) => {
  const type = I.detectType(file);
  if (!type) throw new Error(`Unsupported file type: ${file.name}. Use PDF, EPUB, TXT, HTML or images.`);
  if (type === 'pdf') return I.fromPDF(file, opts);
  if (type === 'epub') return I.fromEPUB(file, opts);
  if (type === 'txt') return I.fromText(await U.readAsText(file), { title: titleFromFilename(file.name), fileName: file.name, fileSize: file.size }, opts);
  if (type === 'html') return I.fromHTML(await U.readAsText(file), { title: titleFromFilename(file.name), fileName: file.name, fileSize: file.size }, opts);
  return I.fromImages([file], opts);
};

// ---------- plain text ----------
I.fromText = async (text, hints = {}, opts = {}) => {
  (opts.onProgress || (() => {}))({ stage: 'parsing', message: 'Parsing text…', percent: 0.3 });
  const parsed = T.parsePlainText(text, hints);
  if (!parsed.chapters.length) throw new Error('No readable text found.');
  return makeBook({
    title: parsed.title || hints.title, author: parsed.author || hints.author, language: parsed.language || hints.language,
    subjects: hints.subjects, description: hints.description, cover: hints.cover,
  }, { chapters: parsed.chapters }, { source: hints.source || 'upload', sourceRef: hints.sourceRef, format: 'txt', fileName: hints.fileName, fileSize: hints.fileSize, ids: hints.ids });
};

// ---------- HTML ----------
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'li', 'ul', 'ol', 'dl', 'dd', 'dt', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'figure', 'figcaption', 'header', 'footer', 'main', 'aside', 'hr', 'address', 'center', 'body', 'nav', 'details', 'summary']);
I.blocksFromHTML = function(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg,math,template,iframe,object').forEach(n => n.remove());
  const blocks = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/ {2,}/g, ' ').replace(/\n{2,}/g, '\n').trim();
    if (t) blocks.push({ text: t, heading: false });
    buf = '';
  };
  const walk = node => {
    if (node.nodeType === 3) { buf += node.nodeValue.replace(/\s+/g, ' '); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'br') { buf += '\n'; return; }
    if (tag === 'img' || tag === 'image' || tag === 'video' || tag === 'audio' || tag === 'canvas') return;
    if (/^h[1-6]$/.test(tag)) {
      flush();
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) blocks.push({ text: t, heading: true, level: +tag[1] });
      return;
    }
    if (tag === 'pre') {
      flush();
      const t = node.textContent.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (t) blocks.push({ text: t, heading: false, pre: true });
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) flush();
    for (const ch of Array.from(node.childNodes)) walk(ch);
    if (isBlock) flush();
  };
  walk(doc.body || doc.documentElement);
  flush();
  return blocks.filter(b => /[\p{L}\p{N}]/u.test(b.text));
};

I.fromHTML = async (html, hints = {}, opts = {}) => {
  const blocks = I.blocksFromHTML(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = (doc.querySelector('title') && doc.querySelector('title').textContent.trim()) || hints.title;
  const authorMeta = doc.querySelector('meta[name="author"]');
  const norm = blocks.map(b => ({ text: b.text, heading: !!b.heading && (b.level || 1) <= 2 }));
  const chapters = T.chaptersFromBlocks(norm, title);
  if (!chapters.length) throw new Error('No readable text found in this HTML file.');
  return makeBook({ title, author: hints.author || (authorMeta && authorMeta.content) || '', language: (doc.documentElement.getAttribute('lang') || '').slice(0, 5), subjects: hints.subjects }, { chapters }, { source: hints.source || 'upload', sourceRef: hints.sourceRef, format: 'html', fileName: hints.fileName, fileSize: hints.fileSize });
};

// ---------- EPUB ----------
I.fromEPUB = async (file, opts = {}) => {
  const onProgress = opts.onProgress || (() => {});
  onProgress({ stage: 'loading', message: 'Opening EPUB…', percent: 0.02 });
  await U.loadScript(C.CDN.JSZIP);
  const zip = await window.JSZip.loadAsync(await U.readAsArrayBuffer(file));
  let opfPath = null;
  const containerXml = await readZipText(zip, 'META-INF/container.xml');
  if (containerXml) {
    const cdoc = parseXML(containerXml);
    const rf = cdoc.getElementsByTagName('rootfile')[0];
    if (rf) opfPath = rf.getAttribute('full-path');
  }
  if (!opfPath) opfPath = Object.keys(zip.files).find(n => n.toLowerCase().endsWith('.opf'));
  if (!opfPath) throw new Error('This EPUB has no package file (content.opf).');
  const opfXml = await readZipText(zip, opfPath);
  const opf = parseXML(opfXml);
  const base = dirOf(opfPath);

  const meta = { title: '', author: '', language: '', subjects: [], description: '', cover: null };
  const metaEl = opf.getElementsByTagName('metadata')[0] || opf.documentElement;
  for (const el of Array.from(metaEl.children || [])) {
    const ln = el.localName; const txt = (el.textContent || '').trim();
    if (!txt) continue;
    if (ln === 'title' && !meta.title) meta.title = txt;
    else if (ln === 'creator') meta.author = meta.author ? `${meta.author}, ${txt}` : txt;
    else if (ln === 'language' && !meta.language) meta.language = txt;
    else if (ln === 'subject') meta.subjects.push(txt);
    else if (ln === 'description') meta.description = stripTags(txt);
  }
  const manifest = {};
  for (const it of Array.from(opf.getElementsByTagName('item'))) {
    manifest[it.getAttribute('id')] = { id: it.getAttribute('id'), href: it.getAttribute('href') || '', type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
  }
  const spineEl = opf.getElementsByTagName('spine')[0];
  const spine = spineEl ? Array.from(spineEl.getElementsByTagName('itemref')).map(r => r.getAttribute('idref')) : Object.keys(manifest);

  // cover
  let coverId = null;
  const coverMeta = Array.from(opf.getElementsByTagName('meta')).find(m => (m.getAttribute('name') || '') === 'cover');
  if (coverMeta) coverId = coverMeta.getAttribute('content');
  if (!coverId || !manifest[coverId]) coverId = Object.keys(manifest).find(id => manifest[id].props.split(/\s+/).includes('cover-image'));
  if (!coverId) coverId = Object.keys(manifest).find(id => manifest[id].type.startsWith('image/') && /cover/i.test(id + ' ' + manifest[id].href));
  if (coverId && manifest[coverId]) {
    try {
      const f = zip.file(resolvePath(base, manifest[coverId].href));
      if (f) meta.cover = await U.resizeToDataURL(await f.async('blob'), 640, 0.82);
    } catch (e) { console.warn('cover failed', e); }
  }

  // table of contents: href -> title
  const toc = {};
  const navId = Object.keys(manifest).find(id => manifest[id].props.split(/\s+/).includes('nav'));
  if (navId) {
    const navPath = resolvePath(base, manifest[navId].href);
    const html = await readZipText(zip, navPath);
    if (html) {
      const ndoc = new DOMParser().parseFromString(html, 'text/html');
      const navs = Array.from(ndoc.querySelectorAll('nav'));
      const nav = navs.find(n => ((n.getAttribute('epub:type') || n.getAttribute('type') || n.getAttribute('role') || '')).includes('toc')) || navs[0];
      if (nav) for (const a of Array.from(nav.querySelectorAll('a[href]'))) {
        const href = normHref(resolvePath(dirOf(navPath), a.getAttribute('href')));
        if (!toc[href]) toc[href] = a.textContent.replace(/\s+/g, ' ').trim();
      }
    }
  }
  if (!Object.keys(toc).length) {
    const ncxId = spineEl && spineEl.getAttribute('toc');
    const ncxItem = (ncxId && manifest[ncxId]) || Object.values(manifest).find(m => m.type.includes('dtbncx') || /\.ncx$/i.test(m.href));
    if (ncxItem) {
      const ncxPath = resolvePath(base, ncxItem.href);
      const xml = await readZipText(zip, ncxPath);
      if (xml) {
        const ndoc = parseXML(xml);
        for (const np of Array.from(ndoc.getElementsByTagName('navPoint'))) {
          const lbl = np.getElementsByTagName('text')[0], cont = np.getElementsByTagName('content')[0];
          if (lbl && cont) { const href = normHref(resolvePath(dirOf(ncxPath), cont.getAttribute('src'))); if (!toc[href]) toc[href] = lbl.textContent.replace(/\s+/g, ' ').trim(); }
        }
      }
    }
  }

  // spine documents
  const chapters = [];
  let idx = 0;
  for (const idref of spine) {
    idx++;
    const item = manifest[idref];
    if (!item) continue;
    if (item.props.split(/\s+/).includes('nav')) continue;
    if (!/xhtml|html|xml/i.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
    const path = resolvePath(base, item.href);
    const html = await readZipText(zip, path);
    if (!html) continue;
    onProgress({ stage: 'parsing', message: `Reading section ${idx} of ${spine.length}`, percent: 0.05 + 0.9 * idx / spine.length });
    const blocks = I.blocksFromHTML(html);
    const words = blocks.reduce((a, b) => a + T.countWords(b.text), 0);
    if (words < 5) continue;
    const tocTitle = toc[normHref(path)] || '';
    const topHeads = blocks.filter(b => b.heading && (b.level || 1) <= 2);
    let chs;
    if (topHeads.length >= 2 && words > 2500) {
      chs = T.chaptersFromBlocks(blocks.map(b => ({ text: b.text, heading: !!b.heading && (b.level || 1) <= 2 })), tocTitle);
    } else {
      const firstHead = blocks.find(b => b.heading);
      const paras = blocks.filter(b => b !== firstHead).map(b => b.text);
      let title = tocTitle || (firstHead ? firstHead.text : '');
      chs = [{ title, paras }];
    }
    chs = chs.filter(c => c.paras.length);
    chs.forEach(c => { if (!c.title) c.title = tocTitle || `Section ${chapters.length + 1}`; });
    chapters.push(...chs);
    if (idx % 4 === 0) await U.sleep(0);
  }
  if (!chapters.length) throw new Error('No readable text found in this EPUB.');
  const title = meta.title || titleFromFilename(file.name);
  return makeBook(Object.assign(meta, { title }), { chapters }, { source: 'upload', format: 'epub', fileName: file.name, fileSize: file.size });
};

// ---------- PDF ----------
I.pdfjs = async () => {
  await U.loadScript(C.CDN.PDFJS);
  const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
  if (!lib) throw new Error('PDF engine failed to load.');
  lib.GlobalWorkerOptions.workerSrc = C.CDN.PDFJS_WORKER;
  return lib;
};

function linesFromTextContent(tc){
  const items = (tc.items || []).filter(it => it.str && it.str.trim().length && it.transform);
  if (!items.length) return [];
  const its = items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height || 10, w: it.width || 0 }));
  its.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  for (const it of its) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < Math.max(2, Math.min(last.h, it.h) * 0.6)) {
      const gap = it.x - last.xEnd;
      const needSpace = gap > last.h * 0.12 && !last.text.endsWith(' ') && !it.str.startsWith(' ');
      last.text += (needSpace ? ' ' : '') + it.str;
      last.xEnd = Math.max(last.xEnd, it.x + it.w);
      last.h = Math.max(last.h, it.h);
    } else lines.push({ text: it.str, x: it.x, xEnd: it.x + it.w, y: it.y, h: it.h });
  }
  return lines.map(l => Object.assign(l, { text: l.text.replace(/\s+/g, ' ').trim() })).filter(l => l.text);
}
function median(arr){ if (!arr.length) return 0; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }
function normLineKey(t){ return t.toLowerCase().replace(/\d+/g, '#').replace(/[^a-z#]+/g, ''); }

function stripRepeatedLines(pages){
  const textPages = pages.filter(p => p.lines && p.lines.length);
  if (textPages.length < 3) return;
  const counts = new Map();
  for (const p of textPages) {
    const edge = [...p.lines.slice(0, 2), ...p.lines.slice(-2)];
    const seen = new Set();
    for (const l of edge) { const k = normLineKey(l.text); if (k.length < 2 || seen.has(k)) continue; seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); }
  }
  const threshold = Math.max(3, Math.ceil(textPages.length * 0.3));
  const repeated = new Set(Array.from(counts.entries()).filter(([, n]) => n >= threshold).map(([k]) => k));
  for (const p of textPages) {
    const n = p.lines.length;
    p.lines = p.lines.filter((l, i) => {
      const edge = i < 2 || i >= n - 2;
      if (!edge) return true;
      if (/^[\divxlc]{1,6}$/i.test(l.text.replace(/\s/g, ''))) return false; // bare page numbers
      return !repeated.has(normLineKey(l.text));
    });
  }
}

function paragraphsFromLines(lines, bodyH){
  if (!lines.length) return [];
  const out = [];
  let cur = null, prev = null;
  const leftX = Math.min(...lines.map(l => l.x));
  const maxW = Math.max(...lines.map(l => l.xEnd - l.x));
  for (const l of lines) {
    const words = T.countWords(l.text);
    const isHeading = bodyH && l.h > bodyH * 1.22 && words <= 14 && !/[,;:]$/.test(l.text) && !(/[a-z]\.$/.test(l.text) && words > 8);
    if (isHeading) { if (cur) { out.push(cur); cur = null; } out.push({ text: l.text, heading: true }); prev = l; continue; }
    let newPara = !cur;
    if (cur && prev) {
      const gap = prev.y - l.y;
      const indent = (l.x - leftX) > bodyH * 0.9 && (prev.x - leftX) < bodyH * 0.9;
      const prevShort = (prev.xEnd - prev.x) < maxW * 0.75 && /[.!?…"”’')\]]$/.test(prev.text);
      if (gap > bodyH * 1.7 || indent || prevShort) newPara = true;
    }
    if (newPara) { if (cur) out.push(cur); cur = { text: l.text, heading: false }; }
    else if (/[A-Za-z]-$/.test(cur.text) && /^[a-z]/.test(l.text)) cur.text = cur.text.slice(0, -1) + l.text;
    else cur.text += ' ' + l.text;
    prev = l;
  }
  if (cur) out.push(cur);
  return out;
}

async function renderPage(page, targetWidth){
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, targetWidth / vp1.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function resolveOutline(doc, items, depth = 0){
  const out = [];
  for (const it of items || []) {
    let pageIndex = null;
    try {
      let dest = it.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest.length) pageIndex = (typeof dest[0] === 'object' && dest[0] !== null) ? await doc.getPageIndex(dest[0]) : (typeof dest[0] === 'number' ? dest[0] : null);
    } catch (e) {}
    if (pageIndex !== null && pageIndex !== undefined) out.push({ title: (it.title || '').replace(/\s+/g, ' ').trim(), page: pageIndex + 1 });
    if (depth < 1 && it.items && it.items.length) out.push(...await resolveOutline(doc, it.items, depth + 1));
  }
  out.sort((a, b) => a.page - b.page);
  const seen = new Set();
  return out.filter(o => { if (!o.title || seen.has(o.page)) return false; seen.add(o.page); return true; });
}

function finishChapter(ch, out){ if (ch && ch.paras.length) out.push(ch); }
function newChapter(title){ return { title, paras: [], pg: [] }; }
function pushPara(ch, b){ ch.paras.push(b.text); ch.pg.push(b.page || null); }

function chaptersFromOutline(blocks, outline){
  const out = [];
  let k = 0;
  let cur = newChapter('Front matter');
  for (const b of blocks) {
    while (k < outline.length && b.page >= outline[k].page) {
      finishChapter(cur, out);
      cur = newChapter(outline[k].title);
      k++;
    }
    if (b.heading) { if (T.normalize(b.text) === T.normalize(cur.title) || (cur.paras.length === 0 && T.normalize(cur.title).includes(T.normalize(b.text)))) continue; }
    pushPara(cur, b);
  }
  finishChapter(cur, out);
  return out;
}
function chaptersFromHeadingBlocks(blocks, fallbackTitle){
  const out = [];
  let cur = newChapter(fallbackTitle || 'Front matter');
  for (const b of blocks) {
    if (b.heading) {
      if (cur.paras.length) { finishChapter(cur, out); cur = newChapter(b.text); }
      else cur.title = cur.paras.length === 0 && cur.title && cur.title !== fallbackTitle && cur.title !== 'Front matter' ? `${cur.title} · ${b.text}` : b.text;
      continue;
    }
    pushPara(cur, b);
  }
  finishChapter(cur, out);
  return out;
}
function chaptersByPages(blocks, numPages, title){
  if (numPages <= 40) { const ch = newChapter(title || 'Full text'); blocks.forEach(b => { if (!b.heading) pushPara(ch, b); else pushPara(ch, b); }); return [ch]; }
  const out = [];
  const span = 20;
  let cur = null;
  for (const b of blocks) {
    const bucket = Math.floor(((b.page || 1) - 1) / span);
    if (!cur || cur.bucket !== bucket) { finishChapter(cur, out); cur = newChapter(`Pages ${bucket * span + 1}–${Math.min(numPages, (bucket + 1) * span)}`); cur.bucket = bucket; }
    pushPara(cur, b);
  }
  finishChapter(cur, out);
  out.forEach(c => delete c.bucket);
  return out;
}
function mergeAcrossPages(blocks){
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b = blocks[i + 1];
    if (a.heading || b.heading) continue;
    if (a.page && b.page && b.page === a.page + 1 && !/[.!?…"”’')\]:]$/.test(a.text) && /^[a-z(“"‘']/.test(b.text)) {
      if (/[A-Za-z]-$/.test(a.text) && /^[a-z]/.test(b.text)) a.text = a.text.slice(0, -1) + b.text; else a.text += ' ' + b.text;
      blocks.splice(i + 1, 1); i--;
    }
  }
}

I.fromPDF = async (file, opts = {}) => {
  const onProgress = opts.onProgress || (() => {});
  onProgress({ stage: 'loading', message: 'Opening PDF…', percent: 0.01 });
  const pdfjs = await I.pdfjs();
  const data = new Uint8Array(await U.readAsArrayBuffer(file));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const numPages = doc.numPages;
  let info = {};
  try { info = (await doc.getMetadata()).info || {}; } catch (e) {}
  const meta = {
    title: cleanMetaTitle(info.Title) || titleFromFilename(file.name),
    author: cleanMetaTitle(info.Author) || '',
    subjects: info.Keywords ? String(info.Keywords).split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 8) : [],
  };
  let outline = [];
  try { const ol = await doc.getOutline(); if (ol && ol.length) outline = await resolveOutline(doc, ol); } catch (e) {}

  const ocrEnabled = opts.ocr !== false && S.settings.get('ocrAuto', true);
  const ocrLang = S.settings.get('ocrLang', 'eng');
  const pages = [];
  let ocrUsed = false, ocrFailures = 0;
  for (let i = 1; i <= numPages; i++) {
    if (opts.signal && opts.signal.aborted) throw new Error('Import cancelled.');
    onProgress({ stage: 'parsing', message: `Reading page ${i} of ${numPages}`, percent: 0.02 + 0.9 * (i - 1) / numPages, page: i, pages: numPages });
    const page = await doc.getPage(i);
    let lines = [], ocrBlocks = null;
    try { lines = linesFromTextContent(await page.getTextContent()); } catch (e) { console.warn('text layer failed p', i, e); }
    const chars = lines.reduce((a, l) => a + l.text.length, 0);
    if (chars < 40 && ocrEnabled && ocrFailures < 3) {
      onProgress({ stage: 'ocr', message: `Recognizing text on page ${i} of ${numPages}`, percent: 0.02 + 0.9 * (i - 1) / numPages, page: i, pages: numPages });
      try {
        const canvas = await renderPage(page, 1800);
        const text = await I.ocrCanvas(canvas, { lang: ocrLang, onProgress: p => onProgress({ stage: 'ocr', message: `Recognizing page ${i} of ${numPages} · ${Math.round(p * 100)}%`, percent: 0.02 + 0.9 * (i - 1 + p) / numPages, page: i, pages: numPages }) });
        ocrBlocks = I.ocrTextToParagraphs(text);
        if (ocrBlocks.length) ocrUsed = true;
      } catch (e) { ocrFailures++; console.warn('OCR failed on page', i, e); if (ocrFailures >= 3) onProgress({ stage: 'warn', message: 'OCR is not available; continuing with text layer only.' }); }
    }
    pages.push({ index: i, lines, ocrBlocks });
    try { page.cleanup(); } catch (e) {}
    if (i % 5 === 0) await U.sleep(0);
  }
  stripRepeatedLines(pages);
  const bodyH = median(pages.flatMap(p => (p.lines || []).map(l => l.h)));
  const blocks = [];
  for (const pg of pages) {
    if (pg.ocrBlocks) pg.ocrBlocks.forEach(t => blocks.push({ text: t, heading: false, page: pg.index }));
    else paragraphsFromLines(pg.lines, bodyH).forEach(b => blocks.push(Object.assign(b, { page: pg.index })));
  }
  mergeAcrossPages(blocks);
  let chapters;
  const headCount = blocks.filter(b => b.heading).length;
  if (outline.length >= 2) chapters = chaptersFromOutline(blocks, outline);
  else if (headCount >= 2 && headCount <= Math.max(6, numPages * 1.5)) chapters = chaptersFromHeadingBlocks(blocks, 'Front matter');
  else chapters = chaptersByPages(blocks, numPages, meta.title);
  chapters = chapters.filter(c => c.paras.length);
  if (!chapters.length) throw new Error(ocrEnabled ? 'No text could be extracted from this PDF.' : 'No text layer found. Turn on automatic OCR in Settings to read scanned PDFs.');
  onProgress({ stage: 'saving', message: 'Finishing…', percent: 0.97 });
  try { doc.destroy(); } catch (e) {}
  return makeBook(meta, { chapters }, { source: 'upload', format: 'pdf', fileName: file.name, fileSize: file.size, ocrUsed, pdfPages: numPages });
};

// ---------- OCR ----------
let tessWorker = null, tessLang = null, tessLoading = null, tessProgress = null;
I.getOCRWorker = async (lang = 'eng') => {
  if (tessWorker && tessLang === lang) return tessWorker;
  if (tessLoading) { await tessLoading; if (tessWorker && tessLang === lang) return tessWorker; }
  tessLoading = (async () => {
    await U.loadScript(C.CDN.TESSERACT);
    if (tessWorker) { try { await tessWorker.terminate(); } catch (e) {} tessWorker = null; }
    const w = await window.Tesseract.createWorker(lang, 1, {
      logger: m => { if (tessProgress && m && m.status === 'recognizing text' && typeof m.progress === 'number') tessProgress(m.progress); },
    });
    tessWorker = w; tessLang = lang;
    return w;
  })();
  try { return await tessLoading; } finally { tessLoading = null; }
};
I.releaseOCR = async () => { if (tessWorker) { try { await tessWorker.terminate(); } catch (e) {} tessWorker = null; tessLang = null; } };

function preprocessForOCR(canvas){
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  let img;
  try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return canvas; }
  const d = img.data;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; gray[j] = g; hist[g | 0]++; }
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = U.clamp(((gray[j] - lo) / range) * 255, 0, 255); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

I.ocrTextToParagraphs = function(text){
  const t = String(text || '').replace(/\r/g, '').replace(/-\n([a-z])/g, '$1').replace(/[ \t]+\n/g, '\n');
  const isCapsHeader = l => { const letters = l.replace(/[^A-Za-z]/g, ''); return letters.length >= 3 && letters === letters.toUpperCase() && T.countWords(l) <= 12; };
  const out = [];
  for (const block of t.split(/\n\s*\n/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => /[\p{L}\p{N}]{2,}/u.test(l) || l.length > 6);
    let body = [];
    for (const line of lines) {
      if (/^[\divxlc]{1,5}$/i.test(line)) continue;                       // bare page number
      if (isCapsHeader(line) && !body.length) { out.push(line.replace(/\s+\d{1,4}$/, '')); continue; } // running header / chapter line on its own
      body.push(line);
    }
    const para = body.join(' ').replace(/\s+/g, ' ').trim();
    if (para) out.push(para);
  }
  return out.filter(p => T.countWords(p) >= 2 || isCapsHeader(p));
};

I.ocrCanvas = async (canvas, { lang = 'eng', onProgress } = {}) => {
  const engine = S.settings.get('ocrEngine', 'tesseract');
  if (engine === 'openai' && S.settings.get('openaiKey')) return I.ocrWithOpenAI(canvas, onProgress);
  const worker = await I.getOCRWorker(lang);
  tessProgress = onProgress || null;
  try {
    const prepped = preprocessForOCR(canvas);
    const { data } = await worker.recognize(prepped);
    return data.text || '';
  } finally { tessProgress = null; }
};

I.ocrWithOpenAI = async (canvas, onProgress) => {
  const key = S.settings.get('openaiKey');
  if (!key) throw new Error('Add an OpenAI key in Settings to use vision OCR.');
  onProgress && onProgress(0.2);
  const dataURL = canvas.toDataURL('image/jpeg', 0.85);
  const model = S.settings.get('openaiVisionModel', 'gpt-4o-mini');
  const body = {
    model, max_tokens: 4000, temperature: 0,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Transcribe all the printed text in this image exactly as written, preserving paragraph breaks as blank lines. Ignore page headers, footers and page numbers. Output only the transcribed text.' },
      { type: 'image_url', image_url: { url: dataURL, detail: 'high' } },
    ] }],
  };
  const res = await U.fetchJSON('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, 90000);
  onProgress && onProgress(1);
  return (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
};

I.ocrImageFile = async (file, { onProgress } = {}) => {
  const canvas = await U.imageToCanvas(file, 2200);
  const text = await I.ocrCanvas(canvas, { lang: S.settings.get('ocrLang', 'eng'), onProgress });
  return { text, paragraphs: I.ocrTextToParagraphs(text), thumb: (await U.imageToCanvas(file, 320)).toDataURL('image/jpeg', 0.7) };
};

I.fromImages = async (files, opts = {}) => {
  const onProgress = opts.onProgress || (() => {});
  const paras = [];
  let i = 0;
  for (const f of files) {
    i++;
    onProgress({ stage: 'ocr', message: `Recognizing photo ${i} of ${files.length}`, percent: (i - 1) / files.length });
    const r = await I.ocrImageFile(f, { onProgress: p => onProgress({ stage: 'ocr', message: `Recognizing photo ${i} of ${files.length} · ${Math.round(p * 100)}%`, percent: (i - 1 + p) / files.length }) });
    paras.push(...r.paragraphs);
  }
  if (!paras.length) throw new Error('No text was recognized. Try more light, a flatter page, and fill the frame with the text.');
  const title = opts.title || `Scanned pages · ${new Date().toLocaleDateString()}`;
  return makeBook({ title, author: opts.author || '' }, { chapters: [{ title: 'Scanned pages', paras }] }, { source: 'photo', format: 'scan', ocrUsed: true });
};

I.appendImagesToBook = async (bookId, files, opts = {}) => {
  const onProgress = opts.onProgress || (() => {});
  const content = await S.get('content', bookId);
  const book = await S.get('books', bookId);
  if (!content || !book) throw new Error('Book not found.');
  const added = [];
  let i = 0;
  for (const f of files) {
    i++;
    onProgress({ stage: 'ocr', message: `Recognizing photo ${i} of ${files.length}`, percent: (i - 1) / files.length });
    const r = await I.ocrImageFile(f, { onProgress: p => onProgress({ stage: 'ocr', message: `Recognizing photo ${i} of ${files.length} · ${Math.round(p * 100)}%`, percent: (i - 1 + p) / files.length }) });
    added.push(...r.paragraphs);
  }
  if (!added.length) throw new Error('No text was recognized in the new photo(s).');
  const last = content.chapters[content.chapters.length - 1] || (content.chapters.push({ title: 'Scanned pages', paras: [] }), content.chapters[content.chapters.length - 1]);
  last.paras.push(...added);
  last.pwc = last.paras.map(T.countWords);
  delete content.chapterOffsets;
  T.ensureCounts(content);
  book.words = content.totalWords; book.paragraphs = content.chapters.reduce((a, c) => a + c.paras.length, 0); book.updatedAt = Date.now(); book.readability = T.readability(content);
  await S.put('content', content);
  await S.put('books', book);
  if (F.calib) F.calib.invalidate(bookId);
  F.bus.emit('books-changed', { bookId, action: 'updated' });
  return added.length;
};

// ---------- metadata edits ----------
I.updateBook = async (bookId, patch) => {
  const book = await S.get('books', bookId);
  if (!book) throw new Error('Book not found.');
  Object.assign(book, patch, { updatedAt: Date.now() });
  if (patch.title) book.coverColor = book.coverColor || U.hashColor(patch.title);
  await S.put('books', book);
  F.bus.emit('books-changed', { bookId, action: 'updated' });
  return book;
};
})();
