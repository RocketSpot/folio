/* 09_analytics.js — reading sessions, streaks, daily stats, Reading Label, Taste Profile */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store;
const A = F.analytics = {};

const IDLE_MS = 2 * 60 * 1000;      // inactivity beyond this is not counted
const MIN_SESSION_MS = 20 * 1000;   // shorter sessions are discarded
let cur = null;                     // active session
let heartbeat = null;

function now(){ return Date.now(); }
function persist(open){
  if (!cur) return Promise.resolve();
  const rec = {
    id: cur.id, bookId: cur.bookId, mode: cur.mode, start: cur.start, end: now(), day: U.dayKey(new Date(cur.start)),
    ms: cur.ms, minutes: Math.round(cur.ms / 6000) / 10,
    gStart: cur.gStart, gEnd: cur.gEnd, words: Math.max(0, (cur.gEnd || 0) - (cur.gStart || 0)),
    pageStart: cur.pageStart, pageEnd: cur.pageEnd, pages: (cur.pageEnd != null && cur.pageStart != null) ? Math.max(0, cur.pageEnd - cur.pageStart) : 0,
    open: !!open,
  };
  return S.put('sessions', rec).catch(e => console.warn('session save failed', e));
}

/** Begin (or continue) a session. mode: read | listen | physical. pos: { g, page } */
A.begin = (bookId, mode, pos = {}) => {
  if (cur && cur.bookId === bookId && cur.mode === mode) { A.touch(); A.update(pos); return cur; }
  if (cur) A.end();
  cur = { id: U.uuid(), bookId, mode, start: now(), last: now(), ms: 0, gStart: pos.g ?? null, gEnd: pos.g ?? null, pageStart: pos.page ?? null, pageEnd: pos.page ?? null };
  if (!heartbeat) heartbeat = setInterval(() => { if (cur) persist(true); }, 30000);
  F.bus.emit('session', { type: 'begin', session: cur });
  return cur;
};
A.touch = () => {
  if (!cur) return;
  const t = now();
  cur.ms += Math.min(IDLE_MS, t - cur.last);
  cur.last = t;
};
A.update = (pos = {}) => {
  if (!cur) return;
  A.touch();
  if (pos.g != null) { if (cur.gStart == null) cur.gStart = pos.g; cur.gEnd = pos.g; }
  if (pos.page != null) { if (cur.pageStart == null) cur.pageStart = pos.page; cur.pageEnd = pos.page; }
};
A.end = async () => {
  if (!cur) return null;
  A.touch();
  const s = cur;
  cur = null;
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  if (s.ms < MIN_SESSION_MS && (s.gEnd || 0) - (s.gStart || 0) < 30) { try { await S.del('sessions', s.id); } catch (e) {} F.bus.emit('session', { type: 'discard' }); return null; }
  cur = s; await persist(false); cur = null;
  F.bus.emit('session', { type: 'end', session: s });
  return s;
};
A.current = () => cur;
A.isActive = () => !!cur && (now() - cur.last) < IDLE_MS;

/** Close any sessions left open by a crash / tab close. */
A.recover = async () => {
  const rows = await S.all('sessions');
  for (const r of rows) {
    if (r.open) { r.open = false; if (r.ms < MIN_SESSION_MS) await S.del('sessions', r.id); else await S.put('sessions', r); }
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden && cur) persist(true); });
window.addEventListener('pagehide', () => { if (cur) persist(true); });

// ---------- aggregate stats ----------
A.getSessions = async () => (await S.all('sessions')).filter(s => !s.open || (now() - s.end) < 90000).sort((a, b) => a.start - b.start);
A.daily = (sessions, days = 30) => {
  const out = [];
  const today = U.dayKey();
  let key = U.addDays(today, -(days - 1));
  const byDay = {};
  for (const s of sessions) { const d = byDay[s.day] || (byDay[s.day] = { minutes: 0, words: 0, sessions: 0, listen: 0 }); d.minutes += s.minutes || 0; d.words += s.words || 0; d.sessions++; if (s.mode === 'listen') d.listen += s.minutes || 0; }
  for (let i = 0; i < days; i++) { out.push(Object.assign({ day: key }, byDay[key] || { minutes: 0, words: 0, sessions: 0, listen: 0 })); key = U.addDays(key, 1); }
  return out;
};
A.streak = (sessions, minMinutes = 1) => {
  const days = new Set();
  const byDay = {};
  for (const s of sessions) byDay[s.day] = (byDay[s.day] || 0) + (s.minutes || 0);
  for (const [d, m] of Object.entries(byDay)) if (m >= minMinutes) days.add(d);
  const today = U.dayKey();
  let current = 0, cursor = days.has(today) ? today : U.addDays(today, -1);
  while (days.has(cursor)) { current++; cursor = U.addDays(cursor, -1); }
  let best = 0;
  const sorted = Array.from(days).sort();
  let run = 0, prev = null;
  for (const d of sorted) { run = (prev && U.addDays(prev, 1) === d) ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { current, best, activeDays: days.size, today: days.has(today) };
};
A.totals = (sessions, books) => {
  const minutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const words = sessions.reduce((a, s) => a + (s.words || 0), 0);
  const listen = sessions.filter(s => s.mode === 'listen').reduce((a, s) => a + (s.minutes || 0), 0);
  const physical = sessions.filter(s => s.mode === 'physical').reduce((a, s) => a + (s.minutes || 0), 0);
  return { minutes, words, sessions: sessions.length, listenMinutes: listen, physicalMinutes: physical, books: books.length, finished: books.filter(b => b.finishedAt).length };
};
A.bookStats = (sessions, bookId) => {
  const mine = sessions.filter(s => s.bookId === bookId);
  const read = mine.filter(s => s.mode === 'read' && s.words > 30 && s.minutes >= 0.5);
  const listen = mine.filter(s => s.mode === 'listen');
  const minutes = mine.reduce((a, s) => a + (s.minutes || 0), 0);
  const rWords = read.reduce((a, s) => a + s.words, 0), rMin = read.reduce((a, s) => a + s.minutes, 0);
  return {
    minutes, sessions: mine.length, words: mine.reduce((a, s) => a + (s.words || 0), 0),
    wpm: rMin >= 1 ? Math.round(rWords / rMin) : null,
    listenMinutes: listen.reduce((a, s) => a + (s.minutes || 0), 0),
    physicalMinutes: mine.filter(s => s.mode === 'physical').reduce((a, s) => a + (s.minutes || 0), 0),
    lastRead: mine.length ? Math.max(...mine.map(s => s.end)) : null,
    firstRead: mine.length ? Math.min(...mine.map(s => s.start)) : null,
  };
};
A.userWpm = sessions => {
  const read = sessions.filter(s => s.mode === 'read' && s.words > 30 && s.minutes >= 0.5);
  const w = read.reduce((a, s) => a + s.words, 0), m = read.reduce((a, s) => a + s.minutes, 0);
  return m >= 2 ? Math.round(w / m) : null;
};

// ---------- Reading Label (nutrition-label style facts about one book) ----------
A.label = (book, stats, progress, library) => {
  const words = book.words || 0;
  const wpm = stats.wpm || library.wpm || 230;
  const r = book.readability || {};
  const chapters = book.chapterCount || 1;
  const libWords = library.medianWords || 90000;
  const listenShare = stats.minutes ? stats.listenMinutes / stats.minutes : 0;
  const percent = progress ? progress.percent || 0 : 0;
  return {
    words, hours: words / wpm / 60, chapters, avgChapterWords: Math.round(words / chapters),
    lengthBand: words < 25000 ? 'Novella-length' : words < 60000 ? 'Short novel' : words < 110000 ? 'Full-length novel' : words < 200000 ? 'Long read' : 'Epic',
    lengthDV: libWords ? words / libWords : 1,
    pace: { yourWpm: stats.wpm, avgWpm: library.wpm, compare: stats.wpm && library.wpm ? (stats.wpm > library.wpm * 1.1 ? 'faster than your usual' : stats.wpm < library.wpm * 0.9 ? 'slower than your usual' : 'your usual pace') : null },
    complexity: { band: r.band || '–', flesch: r.flesch, grade: r.grade, wps: r.wordsPerSentence, spw: r.syllablesPerWord, longWords: r.longWordShare },
    dialogue: r.dialogueShare == null ? null : r.dialogueShare,
    genre: (book.subjects || []).slice(0, 6),
    completion: percent, minutes: stats.minutes, sessions: stats.sessions, listenShare,
    finished: !!book.finishedAt || percent >= 0.98,
  };
};

// ---------- Taste Profile ----------
A.profile = (books, sessions, progressMap) => {
  const subjectWeights = new Map();
  const authorWeights = new Map();
  const langCount = {};
  let weightedWpm = 0, wpmWeight = 0;
  const finishedWords = [];
  let started = 0, finished = 0, listenMin = 0, totalMin = 0;
  const hours = new Array(24).fill(0);
  const bookMinutes = {};
  for (const s of sessions) { bookMinutes[s.bookId] = (bookMinutes[s.bookId] || 0) + (s.minutes || 0); totalMin += s.minutes || 0; if (s.mode === 'listen') listenMin += s.minutes || 0; hours[new Date(s.start).getHours()] += s.minutes || 0; }
  for (const b of books) {
    const p = progressMap[b.id] || { percent: 0 };
    const min = bookMinutes[b.id] || 0;
    const done = !!b.finishedAt || p.percent >= 0.98;
    if (p.percent > 0.02 || min > 2) started++;
    if (done) { finished++; finishedWords.push(b.words || 0); }
    const w = 0.25 + 0.75 * (p.percent || 0) + (done ? 0.6 : 0) + Math.min(1, min / 120) * 0.6;
    for (const s of b.subjects || []) { const k = T.normalize(s); if (!k) continue; const e = subjectWeights.get(k) || { name: s, weight: 0, books: 0 }; e.weight += w; e.books++; subjectWeights.set(k, e); }
    if (b.author) { const k = T.normalize(b.author.split(/,|&| and /)[0]); if (k) { const e = authorWeights.get(k) || { name: b.author.split(/,|&| and /)[0].trim(), weight: 0, books: 0 }; e.weight += w; e.books++; authorWeights.set(k, e); } }
    if (b.language) { const l = b.language.slice(0, 2).toLowerCase(); langCount[l] = (langCount[l] || 0) + 1; }
    const st = A.bookStats(sessions, b.id);
    if (st.wpm) { weightedWpm += st.wpm * st.minutes; wpmWeight += st.minutes; }
  }
  const topSubjects = Array.from(subjectWeights.values()).sort((a, b) => b.weight - a.weight).slice(0, 8);
  const maxW = topSubjects.length ? topSubjects[0].weight : 1;
  topSubjects.forEach(s => { s.weight = Math.round(s.weight / maxW * 100) / 100; });
  const topAuthors = Array.from(authorWeights.values()).sort((a, b) => b.weight - a.weight).slice(0, 5);
  const medianWords = arr => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const prefWords = medianWords(finishedWords.length ? finishedWords : books.filter(b => (progressMap[b.id] || {}).percent > 0.3).map(b => b.words || 0));
  const slotNames = ['night owl', 'early riser', 'morning reader', 'afternoon reader', 'evening reader', 'bedtime reader'];
  const slots = [hours.slice(0, 5).reduce((a, b) => a + b, 0), hours.slice(5, 8).reduce((a, b) => a + b, 0), hours.slice(8, 12).reduce((a, b) => a + b, 0), hours.slice(12, 17).reduce((a, b) => a + b, 0), hours.slice(17, 21).reduce((a, b) => a + b, 0), hours.slice(21, 24).reduce((a, b) => a + b, 0)];
  const bestSlot = slots.indexOf(Math.max(...slots));
  const language = Object.entries(langCount).sort((a, b) => b[1] - a[1])[0];
  return {
    topSubjects, subjectSet: new Set(topSubjects.map(s => T.normalize(s.name))), topAuthors,
    avgWpm: wpmWeight ? Math.round(weightedWpm / wpmWeight) : A.userWpm(sessions),
    preferredWords: prefWords, preferredPages: prefWords ? Math.round(prefWords / 280) : null,
    completionRate: started ? finished / started : null, started, finished,
    listenShare: totalMin ? listenMin / totalMin : 0, totalMinutes: totalMin,
    timeOfDay: totalMin > 10 ? slotNames[bestSlot] : null, hours,
    language: language ? language[0] : 'en',
    medianWords: medianWords(books.map(b => b.words || 0)),
    label: totalMin < 5 ? 'Just getting started' : pickArchetype(topSubjects, listenMin / (totalMin || 1), finished, started),
  };
};
function pickArchetype(subjects, listenShare, finished, started){
  const s = subjects.map(x => T.normalize(x.name)).join(' ');
  let base = /fantasy|science fiction|adventure/.test(s) ? 'World-builder' : /mystery|detective|crime|thriller/.test(s) ? 'Puzzle-solver' : /history|biography|science|philosophy|essays|politics/.test(s) ? 'Deep-diver' : /romance|love|domestic/.test(s) ? 'Heart-first reader' : /poetry|drama|plays/.test(s) ? 'Language-lover' : /children|fairy|juvenile|nonsense/.test(s) ? 'Wonder-seeker' : 'Wide-ranging reader';
  if (listenShare > 0.6) base += ', mostly by ear';
  else if (finished >= 3 && started && finished / started > 0.7) base += ', a finisher';
  return base;
}
})();
