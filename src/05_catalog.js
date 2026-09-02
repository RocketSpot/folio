/* 05_catalog.js — public-domain catalog search (Open Library, Internet Archive, Google Books, Gutendex), full-text import, enrichment, recommendations */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store;
const CAT = F.catalog = {};

const OL_FIELDS = 'key,title,author_name,first_publish_year,subject,cover_i,ia,ebook_access,number_of_pages_median,ratings_average,language,edition_count,public_scan_b';
const SUBJECT_STOP = /accessible book|protected daisy|in library|large type|staff picks|overdrive|wishlist|readalong|open_syllabus|nyt:|bestseller|lending library|specimens|translations into|fiction, general|^fiction$|^general$|juvenile literature|literature$|^english|history and criticism|textbooks|study guides|^reading level|^ficci|^romans?$|comic books|^classic literature$/i;

function strOrFirst(v){ return Array.isArray(v) ? (v[0] || '') : (v || ''); }
function stripTags(s){ return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function titleCase(s){ return s.replace(/\w\S*/g, w => w.length > 3 || /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w); }
/** "Austen, Jane, 1775-1817" -> "Jane Austen"; leaves plain names alone. */
CAT.cleanAuthor = function(a){
  return [].concat(a || []).map(s => {
    s = String(s).replace(/,\s*(ed|editor|ill|illustrator|tr|translator|comp|compiler)\.?$/i, '').replace(/,?\s*\(?\b\d{3,4}-(\d{3,4})?\)?\.?$/, '').trim();
    const m = s.match(/^([^,]+),\s*([^,]+)$/);
    return m ? `${m[2].trim()} ${m[1].trim()}` : s;
  }).filter(Boolean).join(', ');
};
CAT.cleanSubjects = function(list){
  const out = [];
  for (let s of [].concat(list || []).flatMap(x => String(x).split(/;|,(?![^()]*\))/))) {
    s = String(s).split(/\s*--\s*/)[0].replace(/\s+/g, ' ').trim();
    if (!s || s.length > 40 || SUBJECT_STOP.test(s) || /\d{4}/.test(s)) continue;
    s = titleCase(s.toLowerCase());
    if (!out.some(x => T.normalize(x) === T.normalize(s))) out.push(s);
    if (out.length >= 12) break;
  }
  return out;
};
CAT.cleanSubjects.one = s => CAT.cleanSubjects([s])[0] || null;

function mapOL(doc){
  return {
    id: 'ol:' + doc.key, source: 'openlibrary', key: doc.key, title: doc.title || 'Untitled', author: (doc.author_name || []).join(', '),
    year: doc.first_publish_year || null, subjects: CAT.cleanSubjects(doc.subject), rawSubjects: doc.subject || [],
    cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null, coverLarge: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    ia: doc.ia || [], ebookAccess: doc.ebook_access || 'no_ebook', pages: doc.number_of_pages_median || null, rating: doc.ratings_average || null,
    languages: doc.language || [], editions: doc.edition_count || 0, publicScan: !!doc.public_scan_b, url: 'https://openlibrary.org' + doc.key,
    fullText: (doc.ebook_access === 'public' && doc.ia && doc.ia.length) ? 'archive' : null,
  };
}

CAT.searchOpenLibrary = async (q, { limit = 20 } = {}) => {
  const d = await U.fetchJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=${OL_FIELDS}`, {}, 25000);
  return (d.docs || []).map(mapOL);
};

CAT.searchArchive = async (q, { limit = 20 } = {}) => {
  const query = `(${q}) AND mediatype:texts AND (format:EPUB OR format:DjVuTXT OR format:Text)`;
  const params = new URLSearchParams();
  params.set('q', query); params.set('rows', String(limit)); params.set('output', 'json'); params.append('sort[]', 'downloads desc');
  ['identifier', 'title', 'creator', 'year', 'downloads', 'subject', 'language', 'collection', 'description'].forEach(f => params.append('fl[]', f));
  const d = await U.fetchJSON(`https://archive.org/advancedsearch.php?${params.toString()}`, {}, 25000);
  return ((d.response && d.response.docs) || []).map(doc => {
    const coll = [].concat(doc.collection || []);
    return {
      id: 'ia:' + doc.identifier, source: 'archive', identifier: doc.identifier, title: strOrFirst(doc.title) || doc.identifier, author: CAT.cleanAuthor([].concat(doc.creator || []).slice(0, 2)),
      year: doc.year ? +String(doc.year).slice(0, 4) : null, downloads: doc.downloads || 0, subjects: CAT.cleanSubjects([].concat(doc.subject || []).flatMap(s => String(s).split(';'))),
      cover: `https://archive.org/services/img/${doc.identifier}`, gutenberg: coll.includes('gutenberg'), languages: [].concat(doc.language || []),
      description: (d => (d.length >= 24 && /[a-z]{3}/i.test(d)) ? d : '')(stripTags(strOrFirst(doc.description)).slice(0, 300)), url: `https://archive.org/details/${doc.identifier}`, fullText: 'archive',
    };
  });
};

CAT.searchGutendex = async (q, { limit = 20 } = {}) => {
  const d = await U.fetchJSON(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`, {}, 12000);
  return (d.results || []).slice(0, limit).map(b => ({
    id: 'pg:' + b.id, source: 'gutenberg', gutenbergId: b.id, title: b.title, author: (b.authors || []).map(a => a.name).join(', '),
    subjects: CAT.cleanSubjects((b.subjects || []).concat(b.bookshelves || [])), cover: (b.formats && b.formats['image/jpeg']) || null,
    languages: b.languages || [], downloads: b.download_count || 0, url: `https://www.gutenberg.org/ebooks/${b.id}`, fullText: 'gutenberg',
    year: b.authors && b.authors[0] && b.authors[0].birth_year ? null : null,
  }));
};

CAT.searchGoogleBooks = async (q, { limit = 20 } = {}) => {
  const key = S.settings.get('googleBooksKey');
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${Math.min(40, limit)}&printType=books${key ? '&key=' + encodeURIComponent(key) : ''}`;
  const d = await U.fetchJSON(url, {}, 15000);
  return (d.items || []).map(it => {
    const v = it.volumeInfo || {}, a = it.accessInfo || {};
    return {
      id: 'gb:' + it.id, source: 'google', title: (v.title || 'Untitled') + (v.subtitle ? ': ' + v.subtitle : ''), author: (v.authors || []).join(', '),
      year: v.publishedDate ? +String(v.publishedDate).slice(0, 4) : null, subjects: CAT.cleanSubjects(v.categories || []),
      cover: v.imageLinks ? String(v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || '').replace(/^http:/, 'https:') : null,
      description: stripTags(v.description || '').slice(0, 300), pages: v.pageCount || null, rating: v.averageRating || null,
      publicDomain: !!a.publicDomain, epubLink: (a.epub && a.epub.downloadLink) || null, pdfLink: (a.pdf && a.pdf.downloadLink) || null,
      url: v.infoLink || v.canonicalVolumeLink || null, previewLink: v.previewLink || null, viewability: a.viewability || null,
      fullText: a.publicDomain && (a.epub && a.epub.downloadLink) ? 'google-download' : null,
    };
  });
};

/** Search several sources in parallel. Returns { results, errors, timing }. onPartial(sourceId, results) is called as each finishes. */
CAT.search = async (q, sources, onPartial) => {
  const fns = { openlibrary: CAT.searchOpenLibrary, archive: CAT.searchArchive, gutenberg: CAT.searchGutendex, google: CAT.searchGoogleBooks };
  const errors = {};
  const results = [];
  await Promise.all((sources || Object.keys(fns)).filter(s => fns[s]).map(async s => {
    try { const r = await fns[s](q, { limit: 20 }); results.push(...r); onPartial && onPartial(s, r); }
    catch (e) { errors[s] = (e && e.message) || String(e); onPartial && onPartial(s, null, errors[s]); }
  }));
  return { results, errors };
};

// ---------- import ----------
function fmtBytes(n){ n = +n || 0; if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB'; if (n > 1e3) return Math.round(n / 1e3) + ' KB'; return n + ' B'; }
async function responseText(r){
  const buf = await r.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { try { return new TextDecoder('windows-1252').decode(buf); } catch (e2) { return new TextDecoder().decode(buf); } }
}
function preClean(text){
  // very old Gutenberg files end the license block with *END*THE SMALL PRINT!
  const m = text.match(/\*END\*\s*THE SMALL PRINT[^\n]*\n/i);
  if (m && !/\*{3}\s*START OF/i.test(text)) return text.slice(m.index + m[0].length);
  return text;
}
async function imageToDataURL(url){
  const r = await U.fetchWithTimeout(url, {}, 15000);
  if (!r.ok) throw new Error('cover fetch failed');
  const blob = await r.blob();
  if (!blob.type.startsWith('image/') || blob.size < 500) throw new Error('not an image');
  return U.resizeToDataURL(blob, 640, 0.82);
}
CAT.coverToDataURL = async url => { try { return await imageToDataURL(url); } catch (e) { return null; } };

/** File list + metadata for an Archive item. The JSON metadata API echoes the caller's origin (which fails for
 *  sandboxed "null" origins), so fall back to the item's _files.xml / _meta.xml on the download host, which allows any origin. */
async function archiveFileList(identifier){
  try {
    const meta = await U.fetchJSON(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {}, 25000);
    if (meta && meta.files && meta.files.length) return { files: meta.files, md: meta.metadata || {} };
  } catch (e) { console.warn('[catalog] metadata API unavailable from this origin, using _files.xml', e && e.message); }
  const base = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(identifier)}`;
  const [filesXml, metaXml] = await Promise.all([
    U.fetchWithTimeout(base + '_files.xml', {}, 30000).then(r => r.ok ? r.text() : ''),
    U.fetchWithTimeout(base + '_meta.xml', {}, 30000).then(r => r.ok ? r.text() : '').catch(() => ''),
  ]);
  if (!filesXml) throw new Error('Could not read the file list for this Archive item.');
  const fdoc = new DOMParser().parseFromString(filesXml, 'application/xml');
  const files = Array.from(fdoc.getElementsByTagName('file')).map(f => ({
    name: f.getAttribute('name'), format: ((f.getElementsByTagName('format')[0] || {}).textContent) || '', size: ((f.getElementsByTagName('size')[0] || {}).textContent) || '0',
  })).filter(f => f.name);
  const md = {};
  if (metaXml) {
    const mdoc = new DOMParser().parseFromString(metaXml, 'application/xml');
    for (const el of Array.from((mdoc.documentElement && mdoc.documentElement.children) || [])) {
      const k = el.localName, v = (el.textContent || '').trim();
      if (!v) continue;
      md[k] = md[k] === undefined ? v : [].concat(md[k], v);
    }
  }
  return { files, md };
}

CAT.importArchiveItem = async (identifier, onProgress = () => {}, hints = {}) => {
  onProgress({ stage: 'loading', message: 'Fetching file list from the Internet Archive…', percent: 0.02 });
  const { files, md } = await archiveFileList(identifier);
  if (!files.length) throw new Error('This Archive item has no files.');
  const txts = files.filter(f => /\.txt$/i.test(f.name) && !/_djvu\.txt$/i.test(f.name) && !/_meta|_files|_reviews|readme/i.test(f.name) && +f.size > 2000);
  const epubs = files.filter(f => /\.epub$/i.test(f.name));
  const djvu = files.find(f => /_djvu\.txt$/i.test(f.name));
  let pick = null;
  if (txts.length) pick = txts.sort((a, b) => (+b.size || 0) - (+a.size || 0))[0];
  if (!pick && epubs.length) pick = epubs[0];
  if (!pick && djvu) pick = djvu;
  if (!pick) throw new Error('No text or EPUB file is available in this item.');
  onProgress({ stage: 'downloading', message: `Downloading ${pick.name} (${fmtBytes(pick.size)})…`, percent: 0.08 });
  const r = await U.fetchWithTimeout(`https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pick.name)}`, {}, 180000);
  if (!r.ok) throw new Error(`Download failed (HTTP ${r.status}).`);
  const subjects = CAT.cleanSubjects([].concat(md.subject || []).flatMap(s => String(s).split(';')));
  const base = {
    title: hints.title || strOrFirst(md.title), author: CAT.cleanAuthor(hints.author || [].concat(md.creator || []).slice(0, 2)), language: strOrFirst(md.language),
    subjects: hints.subjects && hints.subjects.length ? hints.subjects : subjects, description: stripTags(strOrFirst(md.description)).slice(0, 600),
    source: 'archive', sourceRef: `https://archive.org/details/${identifier}`, ids: { ia: identifier },
  };
  const coverUrl = hints.cover || `https://archive.org/services/img/${identifier}`;
  let res;
  if (/\.epub$/i.test(pick.name)) {
    const blob = await r.blob();
    const file = new File([blob], pick.name, { type: 'application/epub+zip' });
    res = await F.ingest.fromEPUB(file, { onProgress });
    Object.assign(res.book, { source: 'archive', sourceRef: base.sourceRef, ids: base.ids });
    if (!res.book.subjects.length) res.book.subjects = base.subjects;
    if (!res.book.description) res.book.description = base.description;
  } else {
    onProgress({ stage: 'parsing', message: 'Parsing text…', percent: 0.6 });
    const text = preClean(await responseText(r));
    const isDjvu = /_djvu\.txt$/i.test(pick.name);
    res = await F.ingest.fromText(text, Object.assign({}, base, { fileName: pick.name }), { onProgress });
    if (isDjvu) res.book.ocrUsed = true;
  }
  if (!res.book.cover) { const c = await CAT.coverToDataURL(coverUrl); if (c) res.book.cover = c; else res.book.coverUrl = coverUrl; }
  return res;
};

CAT.importGutenberg = async (gutenbergId, onProgress = () => {}, hints = {}) => {
  onProgress({ stage: 'loading', message: 'Looking up the Internet Archive mirror…', percent: 0.02 });
  const pad = String(gutenbergId).padStart(5, '0');
  try {
    const d = await U.fetchJSON(`https://archive.org/advancedsearch.php?q=${encodeURIComponent('identifier:*' + pad + 'gut')}&fl[]=identifier&rows=5&output=json`, {}, 25000);
    const docs = (d.response && d.response.docs) || [];
    const exact = docs.find(x => x.identifier.endsWith(pad + 'gut'));
    if (exact) return CAT.importArchiveItem(exact.identifier, onProgress, Object.assign({}, hints, { ids: { gutenberg: gutenbergId } }));
  } catch (e) { console.warn('mirror lookup failed', e); }
  // direct attempt (gutenberg.org does not send CORS headers; this usually fails in browsers)
  try {
    const r = await U.fetchWithTimeout(`https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`, {}, 30000);
    if (r.ok) return F.ingest.fromText(await responseText(r), Object.assign({ source: 'gutenberg', sourceRef: `https://www.gutenberg.org/ebooks/${gutenbergId}`, ids: { gutenberg: gutenbergId } }, hints), { onProgress });
  } catch (e) {}
  const err = new Error('This title is not mirrored for direct import. Download the EPUB or TXT from Project Gutenberg, then upload it here.');
  err.link = `https://www.gutenberg.org/ebooks/${gutenbergId}`;
  throw err;
};

CAT.importResult = async (result, onProgress = () => {}) => {
  const hints = { title: result.title, author: result.author, cover: result.coverLarge || result.cover, subjects: result.subjects };
  switch (result.source) {
    case 'archive': return CAT.importArchiveItem(result.identifier, onProgress, hints);
    case 'gutenberg': return CAT.importGutenberg(result.gutenbergId, onProgress, hints);
    case 'openlibrary': {
      if (result.ia && result.ia.length && result.ebookAccess === 'public') return CAT.importArchiveItem(result.ia[0], onProgress, hints);
      const err = new Error(result.ebookAccess === 'borrowable' ? 'This edition can be borrowed on Open Library but not downloaded here. Check the Internet Archive tab for a public-domain copy.' : 'Open Library lists this title for lookup only; no full text is available for import.');
      err.link = result.url; throw err;
    }
    case 'google': {
      const err = new Error(result.fullText ? 'Google Books offers this as a download. Open the link, save the EPUB, then upload it here.' : 'Google Books provides metadata and preview only for this title.');
      err.link = result.epubLink || result.url; throw err;
    }
    default: throw new Error('Unknown source.');
  }
};

// ---------- enrichment ----------
CAT.enrichBook = async (bookId) => {
  const book = await S.get('books', bookId);
  if (!book || book.source === 'photo') return null;
  if ((book.cover || book.coverUrl) && book.subjects.length >= 3 && book.ids && book.ids.olid) return null;
  const params = new URLSearchParams();
  params.set('title', book.title.replace(/[:;(].*$/, '').trim());
  if (book.author) params.set('author', book.author.split(/,|&| and /)[0].trim());
  params.set('limit', '3'); params.set('fields', OL_FIELDS + ',first_sentence');
  let d;
  try { d = await U.fetchJSON(`https://openlibrary.org/search.json?${params.toString()}`, {}, 15000); } catch (e) { return null; }
  const doc = (d.docs || [])[0];
  if (!doc) return null;
  const patch = { ids: Object.assign({}, book.ids || {}, { olid: doc.key }) };
  if (!book.cover && !book.coverUrl && doc.cover_i) {
    const c = await CAT.coverToDataURL(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
    if (c) patch.cover = c; else patch.coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
  }
  const subj = CAT.cleanSubjects(doc.subject);
  if (book.subjects.length < 3 && subj.length) patch.subjects = U.uniq(book.subjects.concat(subj)).slice(0, 12);
  if (doc.first_publish_year && !book.year) patch.year = doc.first_publish_year;
  if (doc.number_of_pages_median) patch.physical = Object.assign({}, book.physical || {}, { pagesHint: doc.number_of_pages_median });
  await F.ingest.updateBook(bookId, patch);
  return patch;
};

// ---------- recommendations ----------
const LANG3 = { en: 'eng', fr: 'fre', de: 'ger', es: 'spa', it: 'ita', pt: 'por', nl: 'dut', ru: 'rus', sv: 'swe', la: 'lat' };
CAT.recommend = async (profile, libraryBooks, { limit = 12 } = {}) => {
  const seeds = (profile.topSubjects || []).slice(0, 4);
  const authors = (profile.topAuthors || []).slice(0, 2);
  if (!seeds.length && !authors.length) return { items: [], note: 'Read a little first. Recommendations build from the subjects and authors of books you actually spend time with.' };
  const owned = new Set(libraryBooks.map(b => T.normalize(b.title)));
  const ownedAuthors = new Set(libraryBooks.map(b => T.normalize(b.author)).filter(Boolean));
  const lang = LANG3[(profile.language || 'en').slice(0, 2)] || null;
  const candidates = new Map();
  const queries = seeds.map(s => ({ type: 'subject', term: s.name, weight: 0.6 + s.weight })).concat(authors.map(a => ({ type: 'author', term: a.name, weight: 1.1 })));
  await Promise.allSettled(queries.map(async q => {
    const params = new URLSearchParams();
    if (q.type === 'subject') { params.set('subject', q.term); params.set('sort', 'rating'); params.set('limit', '20'); }
    else { params.set('author', q.term); params.set('sort', 'rating'); params.set('limit', '15'); }
    if (lang) params.set('language', lang);
    params.set('fields', OL_FIELDS);
    const d = await U.fetchJSON(`https://openlibrary.org/search.json?${params.toString()}`, {}, 25000);
    for (const doc of d.docs || []) {
      const item = candidates.get(doc.key) || { doc, score: 0, reasons: [] };
      item.score += q.weight;
      item.reasons.push(q.type === 'subject' ? `shares “${q.term}” with books you read` : `by ${q.term}, whose work you already read`);
      candidates.set(doc.key, item);
    }
  }));
  const items = [];
  for (const it of candidates.values()) {
    const d = it.doc;
    if (!d.title || owned.has(T.normalize(d.title))) continue;
    const m = mapOL(d);
    const overlap = m.subjects.filter(s => profile.subjectSet && profile.subjectSet.has(T.normalize(s))).length;
    it.score += Math.min(4, overlap) * 0.3;
    if (m.fullText) { it.score += 0.7; it.reasons.push('free full text on the Internet Archive, one tap to import'); }
    if (m.rating) it.score += (m.rating - 3.6) * 0.5;
    if (profile.preferredPages && m.pages) { const ratio = m.pages / profile.preferredPages; if (ratio > 0.6 && ratio < 1.6) { it.score += 0.25; it.reasons.push('about the length you tend to finish'); } }
    if (m.author && ownedAuthors.has(T.normalize(m.author)) && !it.reasons.some(r => r.startsWith('by '))) it.score += 0.3;
    items.push(Object.assign(m, { score: Math.round(it.score * 100) / 100, reasons: U.uniq(it.reasons).slice(0, 3) }));
  }
  items.sort((a, b) => b.score - a.score);
  return { items: items.slice(0, limit) };
};
})();
