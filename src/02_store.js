/* 02_store.js — IndexedDB storage layer with in-memory fallback, settings cache, backup export/import */
(function(){
'use strict';
const F = window.F = window.F || {};
const S = F.store = {};

const DB_NAME = 'folio_reader';
const DB_VERSION = 1;
const STORES = {
  books:       { keyPath: 'id' },                                   // metadata shown on the shelf
  content:     { keyPath: 'bookId' },                               // { bookId, chapters:[{title, paras:[...], pwc:[...]}] }
  progress:    { keyPath: 'bookId' },                               // { bookId, loc, percent, physicalPage, updatedAt }
  sessions:    { keyPath: 'id', indexes: [['bookId','bookId'], ['day','day']] },
  calibration: { keyPath: 'bookId' },                               // { bookId, points:[{page, g, loc, confidence, at}], totalPages }
  audio:       { keyPath: 'key', indexes: [['bookId','bookId']] },  // cached TTS audio per paragraph
  settings:    { keyPath: 'key' },
  scans:       { keyPath: 'id', indexes: [['bookId','bookId']] },   // photographed page thumbnails (optional)
};

let dbPromise = null;
let memory = null;
S.available = true;
S.mode = 'indexeddb';

function memInit(){
  memory = {};
  for (const k of Object.keys(STORES)) memory[k] = new Map();
  S.available = false;
  S.mode = 'memory';
}

function openDB(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: def.keyPath });
          (def.indexes || []).forEach(([iname, kp]) => os.createIndex(iname, kp));
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (e) {} dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
    setTimeout(() => reject(new Error('IndexedDB open timed out')), 8000);
  }).catch(err => {
    console.warn('[store] falling back to memory store:', err && err.message);
    memInit();
    return null;
  });
  return dbPromise;
}

function reqp(r){
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function txDone(t){
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('transaction aborted')); });
}
function keyOf(store, val){ return val[STORES[store].keyPath]; }

S.ready = () => openDB().then(() => S.available);

S.get = async (store, key) => {
  const db = await openDB();
  if (!db) return memory[store].get(key);
  return reqp(db.transaction(store).objectStore(store).get(key));
};
S.put = async (store, val) => {
  const db = await openDB();
  if (!db) { memory[store].set(keyOf(store, val), val); return val; }
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).put(val);
  await txDone(t);
  return val;
};
S.putMany = async (store, vals) => {
  const db = await openDB();
  if (!db) { vals.forEach(v => memory[store].set(keyOf(store, v), v)); return vals.length; }
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  vals.forEach(v => os.put(v));
  await txDone(t);
  return vals.length;
};
S.del = async (store, key) => {
  const db = await openDB();
  if (!db) { memory[store].delete(key); return; }
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).delete(key);
  await txDone(t);
};
S.all = async (store) => {
  const db = await openDB();
  if (!db) return Array.from(memory[store].values());
  return reqp(db.transaction(store).objectStore(store).getAll());
};
S.keys = async (store) => {
  const db = await openDB();
  if (!db) return Array.from(memory[store].keys());
  return reqp(db.transaction(store).objectStore(store).getAllKeys());
};
S.where = async (store, index, value) => {
  const db = await openDB();
  if (!db) return Array.from(memory[store].values()).filter(v => v[index] === value);
  return reqp(db.transaction(store).objectStore(store).index(index).getAll(value));
};
S.delWhere = async (store, index, value) => {
  const rows = await S.where(store, index, value);
  const db = await openDB();
  if (!db) { rows.forEach(r => memory[store].delete(keyOf(store, r))); return rows.length; }
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  rows.forEach(r => os.delete(keyOf(store, r)));
  await txDone(t);
  return rows.length;
};
S.clear = async (store) => {
  const db = await openDB();
  if (!db) { memory[store].clear(); return; }
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).clear();
  await txDone(t);
};
S.count = async (store) => {
  const db = await openDB();
  if (!db) return memory[store].size;
  return reqp(db.transaction(store).objectStore(store).count());
};

// ---- settings (small key/value, cached in memory, mirrored to localStorage as a safety net) ----
const LS_KEY = 'folio_settings_mirror';
const settingsCache = {};
let settingsLoaded = false;
S.settings = {
  async load(){
    try {
      const rows = await S.all('settings');
      rows.forEach(r => { settingsCache[r.key] = r.value; });
    } catch (e) { console.warn('[settings] load failed', e); }
    if (!Object.keys(settingsCache).length) {
      try {
        const mirror = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        Object.assign(settingsCache, mirror);
      } catch (e) {}
    }
    settingsLoaded = true;
    return settingsCache;
  },
  get(key, dflt){
    return (key in settingsCache && settingsCache[key] !== undefined) ? settingsCache[key] : dflt;
  },
  async set(key, value){
    settingsCache[key] = value;
    mirror();
    try { await S.put('settings', { key, value }); } catch (e) { console.warn('[settings] persist failed', e); }
    return value;
  },
  async remove(key){
    delete settingsCache[key];
    mirror();
    try { await S.del('settings', key); } catch (e) {}
  },
  all(){ return Object.assign({}, settingsCache); },
  get loaded(){ return settingsLoaded; },
};
function mirror(){
  try {
    const small = {};
    for (const [k, v] of Object.entries(settingsCache)) {
      const s = JSON.stringify(v);
      if (s && s.length < 4000) small[k] = v;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(small));
  } catch (e) {}
}

// ---- storage estimate & persistence request ----
S.estimate = async () => {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    }
  } catch (e) {}
  return null;
};
S.requestPersist = async () => {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {}
  return false;
};

// ---- backup export / import (JSON; audio cache excluded; API keys optional) ----
const SECRET_KEYS = ['elevenlabsKey', 'openaiKey', 'googleBooksKey'];
S.exportAll = async ({ includeKeys = false } = {}) => {
  const [books, content, progress, sessions, calibration] = await Promise.all([
    S.all('books'), S.all('content'), S.all('progress'), S.all('sessions'), S.all('calibration'),
  ]);
  const settings = {};
  for (const [k, v] of Object.entries(settingsCache)) {
    if (!includeKeys && SECRET_KEYS.includes(k)) continue;
    settings[k] = v;
  }
  return { app: 'folio', version: 1, exportedAt: new Date().toISOString(), books, content, progress, sessions, calibration, settings };
};
S.importAll = async (data, { replace = false } = {}) => {
  if (!data || data.app !== 'folio') throw new Error('Not a Folio backup file');
  if (replace) {
    for (const s of ['books', 'content', 'progress', 'sessions', 'calibration']) await S.clear(s);
  }
  const counts = {};
  for (const s of ['books', 'content', 'progress', 'sessions', 'calibration']) {
    const rows = Array.isArray(data[s]) ? data[s] : [];
    if (rows.length) await S.putMany(s, rows);
    counts[s] = rows.length;
  }
  if (data.settings && typeof data.settings === 'object') {
    for (const [k, v] of Object.entries(data.settings)) await S.settings.set(k, v);
  }
  return counts;
};

// ---- wipe everything (settings included) ----
S.wipe = async () => {
  for (const s of Object.keys(STORES)) { try { await S.clear(s); } catch (e) {} }
  for (const k of Object.keys(settingsCache)) delete settingsCache[k];
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
};
})();
