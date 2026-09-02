/* 06_tts.js — text-to-speech: browser voices (default), ElevenLabs (word timestamps), OpenAI TTS; playback controller with word sync */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C;
const X = F.tts = {};

const state = X.state = {
  status: 'idle',            // idle | loading | playing | paused
  provider: 'browser',       // browser | elevenlabs | openai
  personaId: 'calm-narrator',
  speed: 1,
  bookId: null,
  loc: null,                 // { c, p, s } current sentence
  word: -1,                  // current word index within the sentence
  sleepMode: 0,              // 0 off, -1 end of chapter, N minutes
  sleepAt: null,
  error: null,
  loadingMsg: '',
};
let book = null, content = null;
let session = 0;            // increments on every stop/seek; async callbacks check it
let currentUtterance = null; // keep a reference (Chrome GC bug)
const emit = () => F.bus.emit('tts', Object.assign({}, state));

X.init = () => {
  state.provider = S.settings.get('ttsProvider', 'browser');
  state.personaId = S.settings.get('ttsPersona', 'calm-narrator');
  state.speed = +S.settings.get('ttsSpeed', 1) || 1;
  if (!X.providerReady(state.provider)) state.provider = 'browser';
  if (browser.available()) browser.loadVoices().then(v => { browser.voices = v; F.bus.emit('tts-voices', v); });
  try { if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { browser.voices = speechSynthesis.getVoices(); F.bus.emit('tts-voices', browser.voices); }); } catch (e) {}
};
X.persona = () => C.PERSONAS.find(p => p.id === state.personaId) || C.PERSONAS[0];
X.load = (b, c) => {
  if (book && b && book.id !== b.id) X.stop();
  book = b; content = c;
  state.bookId = b ? b.id : null;
  if (!b) state.loc = null;
};
X.isPlaying = () => state.status === 'playing' || state.status === 'loading';
X.providerReady = id => id === 'browser' ? browser.available() : id === 'elevenlabs' ? !!S.settings.get('elevenlabsKey') : id === 'openai' ? !!S.settings.get('openaiKey') : false;
X.providerName = id => ({ browser: 'Browser voices', elevenlabs: 'ElevenLabs', openai: 'OpenAI' })[id] || id;

function fail(msg){
  state.status = 'idle'; state.error = msg; state.loadingMsg = '';
  emit();
  F.bus.emit('tts-error', { message: msg });
}
function setWord(w){
  if (w === state.word) return;
  state.word = w;
  if (state.loc) F.bus.emit('tts-word', { c: state.loc.c, p: state.loc.p, s: state.loc.s, w });
}
function setSentence(loc, w){
  state.loc = { c: loc.c, p: loc.p, s: loc.s };
  state.word = -1;
  F.bus.emit('tts-sentence', { c: loc.c, p: loc.p, s: loc.s, w: w || 0 });
  setWord(w || 0);
}
function wordAtChar(words, absChar){
  let lo = 0, hi = words.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].start <= absChar) lo = mid; else hi = mid - 1; }
  return lo;
}
function sleepShouldStop(nextLoc){
  if (state.sleepMode === -1 && state.loc && nextLoc && nextLoc.c !== state.loc.c) return true;
  if (state.sleepAt && Date.now() >= state.sleepAt) return true;
  return false;
}
function finished(){
  state.status = 'idle'; state.loadingMsg = '';
  emit();
  F.bus.emit('tts-ended', { bookId: state.bookId });
}
function sleepStop(){
  X.pause();
  state.sleepMode = 0; state.sleepAt = null;
  emit();
  F.bus.emit('tts-sleep', {});
}

// =====================================================================
// Browser speech synthesis
// =====================================================================
const browser = X.browser = {
  voices: [],
  available: () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  loadVoices(){
    return new Promise(res => {
      const v = speechSynthesis.getVoices();
      if (v && v.length) return res(v);
      let done = false;
      const h = () => { if (done) return; done = true; res(speechSynthesis.getVoices() || []); };
      try { speechSynthesis.addEventListener('voiceschanged', h, { once: true }); } catch (e) {}
      setTimeout(h, 1500);
    });
  },
  pickVoice(persona, lang){
    const voices = this.voices.length ? this.voices : (speechSynthesis.getVoices() || []);
    if (!voices.length) return null;
    const override = S.settings.get('browserVoice:' + persona.id);
    if (override) { const v = voices.find(v => v.voiceURI === override || v.name === override); if (v) return v; }
    const pref = (lang || (book && book.language) || navigator.language || 'en').slice(0, 2).toLowerCase();
    let pool = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(pref) && !this.blocked.has(v.voiceURI));
    if (!pool.length) pool = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en') && !this.blocked.has(v.voiceURI));
    if (!pool.length) pool = voices.filter(v => !this.blocked.has(v.voiceURI));
    if (!pool.length) { this.blocked.clear(); pool = voices.slice(); }
    for (const hint of persona.browserHints || []) {
      const v = pool.find(v => v.name.toLowerCase().includes(hint.toLowerCase()));
      if (v) return v;
    }
    // on-device voices start reliably; remote ones can hang when offline
    return pool.find(v => v.localService && /premium|enhanced|natural|neural/i.test(v.name)) || pool.find(v => v.localService && v.default) || pool.find(v => v.localService) || pool.find(v => /premium|enhanced|natural|neural/i.test(v.name)) || pool.find(v => v.default) || pool[0];
  },
  blocked: new Set(),   // voices that failed to start in this session
};
const est = { cps: +S.settings.get('ttsCps', 15.5) || 15.5 }; // characters per second at rate 1 (learned)

function chunkText(text, max){
  if (text.length <= max) return [{ text, offset: 0 }];
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + max);
    if (end < text.length) {
      const slice = text.slice(pos, end);
      let cut = Math.max(slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(': '), slice.lastIndexOf(' — '), slice.lastIndexOf('—'));
      if (cut < max * 0.4) cut = slice.lastIndexOf(' ');
      if (cut > 0) end = pos + cut + 1;
    }
    out.push({ text: text.slice(pos, end), offset: pos });
    pos = end;
  }
  return out.filter(c => c.text.trim().length);
}

function speakSentence(loc, startWord, mySession, delayMs){
  if (mySession !== session) return;
  const sent = T.sentenceAt(content, loc);
  if (!sent || !sent.words.length) return advanceSentence(mySession);
  startWord = U.clamp(startWord || 0, 0, sent.words.length - 1);
  const fromChar = sent.words[startWord].start;
  const text = sent.text.slice(fromChar);
  const chunks = chunkText(text, 190);
  const words = sent.words;
  setSentence(loc, startWord);
  const persona = X.persona();
  const voice = browser.pickVoice(persona, book && book.language);
  const go = () => speakChunk(0);
  if (delayMs) setTimeout(() => { if (mySession === session) go(); }, delayMs); else go();

  function speakChunk(ci){
    if (mySession !== session) return;
    if (ci >= chunks.length) return advanceSentence(mySession);
    const chunk = chunks[ci];
    const u = new SpeechSynthesisUtterance(chunk.text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = U.clamp(persona.rate * state.speed, 0.5, 3.5);
    u.pitch = U.clamp(persona.pitch, 0.5, 2);
    u.volume = 1;
    const chunkStartWord = wordAtChar(words, fromChar + chunk.offset);
    const chunkEndWord = wordAtChar(words, fromChar + chunk.offset + chunk.text.length - 1);
    let gotBoundary = false, startedAt = 0, ended = false, estTimer = null, estTick = null;
    const stopEstimate = () => { if (estTick) { clearTimeout(estTick); estTick = null; } if (estTimer) { clearTimeout(estTimer); estTimer = null; } if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
    // If the engine never reports a start, the voice is unusable here (typical for some remote voices offline): try another voice once, then give up clearly.
    let watchdog = setTimeout(() => {
      if (startedAt || ended || mySession !== session) return;
      ended = true; stopEstimate();
      try { speechSynthesis.cancel(); } catch (err) {}
      if (voice && !browser.blocked.has(voice.voiceURI) && browser.voices.length > 1 && !speakSentence.retried) {
        browser.blocked.add(voice.voiceURI);
        speakSentence.retried = true;
        setTimeout(() => { if (mySession === session) speakSentence(loc, startWord, mySession, 0); }, 120);
        return;
      }
      speakSentence.retried = false;
      fail('The speech voice did not start. Pick another voice under Settings → Voices, or check that the device is not muted.');
    }, 4500);
    const runEstimate = () => {
      const cps = est.cps * u.rate;
      const tick = () => {
        if (ended || mySession !== session) return;
        const chars = ((performance.now() - startedAt) / 1000) * cps;
        let acc = 0, idx = chunkStartWord;
        for (let i = chunkStartWord; i <= chunkEndWord; i++) {
          const w = words[i];
          acc += w.text.length + 1 + (/[,;:]$/.test(w.text) ? 2 : /[.!?…]["”’)]*$/.test(w.text) ? 4 : 0);
          idx = i;
          if (acc > chars) break;
        }
        setWord(idx);
        estTick = setTimeout(tick, 70);
      };
      tick();
    };
    u.onstart = () => {
      if (mySession !== session) return;
      startedAt = performance.now();
      if (state.status !== 'playing') { state.status = 'playing'; state.loadingMsg = ''; emit(); }
      setWord(chunkStartWord);
      estTimer = setTimeout(() => { if (!gotBoundary && !ended && mySession === session) runEstimate(); }, 550);
    };
    u.onboundary = e => {
      if (mySession !== session || ended) return;
      if (e.name && e.name !== 'word') return;
      gotBoundary = true;
      stopEstimate();
      setWord(wordAtChar(words, fromChar + chunk.offset + (e.charIndex || 0)));
    };
    u.onend = () => {
      if (ended) return;
      ended = true;
      stopEstimate();
      if (mySession !== session) return;
      if (startedAt && !gotBoundary) {
        const dur = (performance.now() - startedAt) / 1000;
        if (dur > 0.5 && chunk.text.length > 20) {
          const observed = chunk.text.length / dur / u.rate;
          if (observed > 5 && observed < 40) { est.cps = est.cps * 0.7 + observed * 0.3; S.settings.set('ttsCps', Math.round(est.cps * 10) / 10); }
        }
      }
      speakChunk(ci + 1);
    };
    u.onerror = e => {
      if (ended) return;
      ended = true;
      stopEstimate();
      if (mySession !== session) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (e.error === 'not-allowed') return fail('The browser blocked speech until you tap play again.');
      fail(`Speech failed (${e.error || 'unknown error'}). Try another voice in Settings.`);
    };
    currentUtterance = u;
    try { speechSynthesis.speak(u); } catch (err) { fail('Speech could not start: ' + err.message); }
  }
}

function advanceSentence(mySession){
  if (mySession !== session) return;
  const next = T.nextSentence(content, state.loc);
  if (!next) return finished();
  if (sleepShouldStop(next)) return sleepStop();
  const paragraphChanged = next.p !== state.loc.p || next.c !== state.loc.c;
  if (state.provider === 'browser') speakSentence(next, 0, mySession, paragraphChanged ? 350 : 0);
}

// =====================================================================
// Provider audio (ElevenLabs / OpenAI) — per paragraph units with word timing
// =====================================================================
let audioEl = null;
let unit = null;
const urlCache = new Map();
const MAX_UNIT_CHARS = 2400;

function unitsOfParagraph(c, p){
  const para = content.chapters[c].paras[p];
  const tok = T.tokenize(para);
  const units = [];
  let start = 0;
  while (start < tok.sentences.length) {
    let end = start, chars = 0;
    while (end < tok.sentences.length && (chars + tok.sentences[end].text.length <= MAX_UNIT_CHARS || end === start)) { chars += tok.sentences[end].text.length + 1; end++; }
    const first = tok.sentences[start], last = tok.sentences[end - 1];
    units.push({ c, p, sStart: start, sEnd: end, charBase: first.start, text: para.slice(first.start, last.start + last.text.length) });
    start = end;
  }
  if (!units.length) units.push({ c, p, sStart: 0, sEnd: 0, charBase: 0, text: '' });
  return units;
}
function unitWords(def){
  const tok = T.tokenize(content.chapters[def.c].paras[def.p]);
  const out = [];
  for (let s = def.sStart; s < def.sEnd; s++) {
    const sent = tok.sentences[s];
    sent.words.forEach((w, wi) => out.push({ s, w: wi, char: sent.start - def.charBase + w.start, len: w.text.length, text: w.text }));
  }
  return out;
}
function voiceKey(){
  const persona = X.persona();
  if (state.provider === 'elevenlabs') return `${resolveElevenVoice(persona)}|${S.settings.get('elevenModel', 'eleven_multilingual_v2')}`;
  return `${S.settings.get('openaiVoice:' + persona.id) || persona.openaiVoice}|${S.settings.get('openaiTtsModel', 'gpt-4o-mini-tts')}|${persona.id}`;
}
function estimateWordTimes(words, duration){
  const weights = words.map(w => w.len + 1 + (/[,;:]$/.test(w.text) ? 2.5 : /[.!?…]["”’)]*$/.test(w.text) ? 5 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((w, i) => { const start = acc / total * duration; acc += weights[i]; return { start, end: acc / total * duration }; });
}
function blobDuration(blob){
  return new Promise((res) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = d => { URL.revokeObjectURL(url); res(isFinite(d) && d > 0 ? d : null); };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(null);
    a.src = url;
    setTimeout(() => done(a.duration), 6000);
  });
}
async function synthesize(def){
  const persona = X.persona();
  if (state.provider === 'elevenlabs') return synthElevenLabs(def.text, persona);
  return synthOpenAI(def.text, persona);
}
function b64ToBlob(b64, type){
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
async function synthElevenLabs(text, persona){
  const key = S.settings.get('elevenlabsKey');
  if (!key) throw new Error('Add your ElevenLabs API key in Settings.');
  const voiceId = resolveElevenVoice(persona);
  if (!voiceId) throw new Error('No ElevenLabs voice is available. Open Settings → Voices to refresh the voice list.');
  const model = S.settings.get('elevenModel', 'eleven_multilingual_v2');
  const r = await U.fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  }, 120000);
  if (!r.ok) {
    let msg = `ElevenLabs error ${r.status}`;
    try { const j = await r.json(); msg += ': ' + ((j.detail && (j.detail.message || j.detail.status)) || JSON.stringify(j).slice(0, 160)); } catch (e) {}
    if (r.status === 401) msg = 'ElevenLabs rejected the API key (401). Check it in Settings.';
    throw new Error(msg);
  }
  const j = await r.json();
  const al = j.alignment || j.normalized_alignment;
  return { blob: b64ToBlob(j.audio_base64, 'audio/mpeg'), chars: al ? { starts: al.character_start_times_seconds, ends: al.character_end_times_seconds, n: (al.characters || []).length } : null };
}
async function synthOpenAI(text, persona){
  const key = S.settings.get('openaiKey');
  if (!key) throw new Error('Add your OpenAI API key in Settings.');
  const model = S.settings.get('openaiTtsModel', 'gpt-4o-mini-tts');
  const voice = S.settings.get('openaiVoice:' + persona.id) || persona.openaiVoice;
  const body = { model, voice, input: text, response_format: 'mp3' };
  if (/gpt-4o|gpt-4\.1|gpt-5/.test(model)) body.instructions = persona.instructions;
  const r = await U.fetchWithTimeout('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 120000);
  if (!r.ok) {
    let msg = `OpenAI error ${r.status}`;
    try { const j = await r.json(); msg += ': ' + ((j.error && j.error.message) || '').slice(0, 200); } catch (e) {}
    if (r.status === 401) msg = 'OpenAI rejected the API key (401). Check it in Settings.';
    throw new Error(msg);
  }
  return { blob: await r.blob(), chars: null };
}
async function ensureUnitAudio(def){
  const key = `${book.id}|${state.provider}|${voiceKey()}|${def.c}|${def.p}|${def.sStart}`;
  let rec = null;
  try { rec = await S.get('audio', key); } catch (e) {}
  const words = unitWords(def);
  if (!rec) {
    if (!def.text.trim()) throw new Error('Nothing to read here.');
    const { blob, chars } = await synthesize(def);
    let times = null, duration = null;
    if (chars && chars.starts && chars.starts.length) {
      const scale = chars.n && chars.n !== def.text.length ? chars.n / def.text.length : 1;
      const n = chars.starts.length;
      times = words.map(w => {
        const a = U.clamp(Math.round(w.char * scale), 0, n - 1);
        const b = U.clamp(Math.round((w.char + w.len - 1) * scale), 0, n - 1);
        return { start: chars.starts[a], end: (chars.ends && chars.ends[b]) || chars.starts[b] };
      });
      duration = (chars.ends && chars.ends[n - 1]) || chars.starts[n - 1];
    } else {
      duration = await blobDuration(blob);
      if (duration) times = estimateWordTimes(words, duration);
    }
    rec = { key, bookId: book.id, blob, times, duration, createdAt: Date.now(), chars: def.text.length };
    try { await S.put('audio', rec); } catch (e) { console.warn('audio cache write failed', e); }
  }
  let url = urlCache.get(key);
  if (!url) { url = URL.createObjectURL(rec.blob); urlCache.set(key, url); if (urlCache.size > 40) { const [k0, u0] = urlCache.entries().next().value; URL.revokeObjectURL(u0); urlCache.delete(k0); } }
  const times = rec.times || estimateWordTimes(words, rec.duration || Math.max(1, def.text.length / 15));
  return { url, duration: rec.duration, words: words.map((w, i) => Object.assign({}, w, times[i] || { start: 0, end: 0 })) };
}
function wordIndexAtTime(words, t){
  let lo = 0, hi = words.length - 1;
  if (!words.length) return -1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].start <= t + 0.02) lo = mid; else hi = mid - 1; }
  return lo;
}
function nextUnitStart(u){
  if (u.sEnd < T.tokenize(content.chapters[u.c].paras[u.p]).sentences.length) return { c: u.c, p: u.p, s: u.sEnd, w: 0 };
  return T.nextParagraph(content, { c: u.c, p: u.p });
}
function prefetch(loc){
  if (!loc) return;
  try {
    const defs = unitsOfParagraph(loc.c, loc.p);
    const def = defs.find(d => loc.s >= d.sStart && loc.s < d.sEnd) || defs[0];
    ensureUnitAudio(def).catch(() => {});
  } catch (e) {}
}
async function playUnitFrom(loc, mySession){
  state.status = 'loading'; state.loadingMsg = 'Generating audio…'; state.error = null;
  emit();
  const defs = unitsOfParagraph(loc.c, loc.p);
  const def = defs.find(d => loc.s >= d.sStart && loc.s < d.sEnd) || defs[0];
  let rec;
  try { rec = await ensureUnitAudio(def); } catch (e) { if (mySession === session) fail(e.message || String(e)); return; }
  if (mySession !== session) return;
  unit = Object.assign({}, def, rec);
  if (!audioEl) { audioEl = new Audio(); audioEl.preload = 'auto'; }
  audioEl.onended = null; audioEl.onerror = null; audioEl.onloadedmetadata = null;
  audioEl.src = rec.url;
  audioEl.playbackRate = state.speed;
  try { audioEl.preservesPitch = true; } catch (e) {}
  audioEl.onended = () => {
    if (mySession !== session) return;
    const next = nextUnitStart(unit);
    if (!next) return finished();
    if (sleepShouldStop(next)) return sleepStop();
    playUnitFrom(next, mySession);
  };
  audioEl.onerror = () => { if (mySession === session) fail('Audio playback failed.'); };
  const target = unit.words.find(x => x.s === loc.s && x.w === (loc.w || 0)) || unit.words.find(x => x.s === loc.s) || unit.words[0];
  const startAt = target ? target.start : 0;
  const startPlay = () => {
    if (mySession !== session) return;
    try { audioEl.currentTime = Math.max(0, startAt - 0.02); } catch (e) {}
    audioEl.play().then(() => {
      if (mySession !== session) return;
      state.status = 'playing'; state.loadingMsg = '';
      emit();
      setSentence({ c: def.c, p: def.p, s: target ? target.s : def.sStart }, target ? target.w : 0);
      loop(mySession);
      prefetch(nextUnitStart(unit));
      updateMediaSession();
    }).catch(e => fail('Playback was blocked: ' + (e.message || e)));
  };
  if (audioEl.readyState >= 1) startPlay(); else audioEl.onloadedmetadata = startPlay;
}
function loop(mySession){
  const step = () => {
    if (mySession !== session || !audioEl || audioEl.paused) return;
    const idx = wordIndexAtTime(unit.words, audioEl.currentTime);
    if (idx >= 0) {
      const w = unit.words[idx];
      if (!state.loc || w.s !== state.loc.s || w.w !== state.word) {
        if (!state.loc || w.s !== state.loc.s) setSentence({ c: unit.c, p: unit.p, s: w.s }, w.w); else setWord(w.w);
      }
    }
    if (state.sleepAt && Date.now() >= state.sleepAt) return sleepStop();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function updateMediaSession(){
  if (!('mediaSession' in navigator) || !book) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: book.author || 'Folio', album: 'Folio', artwork: book.cover ? [{ src: book.cover, sizes: '512x512', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.setActionHandler('play', () => X.resume());
    navigator.mediaSession.setActionHandler('pause', () => X.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => X.skip(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => X.skip(1));
    navigator.mediaSession.setActionHandler('seekbackward', () => X.skip(-1));
    navigator.mediaSession.setActionHandler('seekforward', () => X.skip(1));
  } catch (e) {}
}

// ---------- ElevenLabs voices ----------
X.fetchElevenVoices = async () => {
  const key = S.settings.get('elevenlabsKey');
  if (!key) throw new Error('Add your ElevenLabs API key first.');
  const j = await U.fetchJSON('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } }, 20000);
  const voices = (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, labels: Object.values(v.labels || {}).map(x => String(x).toLowerCase()), category: v.category }));
  await S.settings.set('elevenVoices', voices);
  return voices;
};
function resolveElevenVoice(persona){
  const override = S.settings.get('elevenVoice:' + persona.id);
  if (override) return override;
  const voices = S.settings.get('elevenVoices', []);
  if (!voices.length) return null;
  let best = null, bestScore = -1;
  for (const v of voices) {
    const text = (v.labels || []).join(' ') + ' ' + v.name.toLowerCase();
    let score = 0;
    for (const l of persona.labels) if (text.includes(l)) score += 1;
    if (v.category === 'premade') score += 0.2;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best ? best.id : voices[0].id;
}
X.resolveElevenVoice = resolveElevenVoice;

// =====================================================================
// Public controls
// =====================================================================
X.play = async (loc) => {
  if (!book || !content) return fail('Open a book first.');
  if (!X.providerReady(state.provider)) { state.provider = 'browser'; S.settings.set('ttsProvider', 'browser'); }
  if (!X.providerReady('browser') && state.provider === 'browser') return fail('This browser has no speech voices. Add an ElevenLabs or OpenAI key in Settings to listen.');
  session++;
  const mySession = session;
  stopEngines();
  loc = T.clampLoc(content, loc || Object.assign({ w: Math.max(0, state.word) }, state.loc || T.firstLoc()));
  state.error = null;
  state.loc = { c: loc.c, p: loc.p, s: loc.s }; state.word = loc.w || 0;
  if (state.sleepMode > 0 && !state.sleepAt) state.sleepAt = Date.now() + state.sleepMode * 60000;
  if (state.provider === 'browser') {
    state.status = 'loading'; state.loadingMsg = 'Starting…'; emit();
    if (!browser.voices.length) browser.voices = await browser.loadVoices();
    if (mySession !== session) return;
    // Chrome needs a beat after cancel() before speak()
    setTimeout(() => { if (mySession === session) speakSentence(loc, loc.w || 0, mySession, 0); }, 60);
  } else {
    playUnitFrom(loc, mySession);
  }
};
function stopEngines(){
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (audioEl) { try { audioEl.pause(); } catch (e) {} }
}
X.pause = () => {
  if (state.status === 'idle') return;
  session++;
  stopEngines();
  state.status = 'paused'; state.loadingMsg = '';
  emit();
};
X.resume = () => { if (state.status === 'paused' || state.status === 'idle') X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc || T.firstLoc())); };
X.toggle = () => { if (X.isPlaying()) X.pause(); else X.resume(); };
X.stop = () => {
  session++;
  stopEngines();
  state.status = 'idle'; state.loadingMsg = '';
  emit();
};
X.seek = (loc) => {
  if (!content) return;
  loc = T.clampLoc(content, loc);
  if (X.isPlaying()) X.play(loc);
  else { state.loc = { c: loc.c, p: loc.p, s: loc.s }; state.word = loc.w || 0; F.bus.emit('tts-sentence', Object.assign({}, loc)); F.bus.emit('tts-word', Object.assign({}, loc)); emit(); }
};
X.skip = (n) => {
  if (!content) return;
  let loc = state.loc ? Object.assign({ w: 0 }, state.loc) : T.firstLoc();
  const step = n > 0 ? T.nextSentence : T.prevSentence;
  for (let i = 0; i < Math.abs(n); i++) { const nx = step(content, loc); if (!nx) break; loc = nx; }
  X.seek(loc);
};
X.skipParagraph = (n) => {
  if (!content) return;
  const loc = state.loc ? Object.assign({ w: 0 }, state.loc) : T.firstLoc();
  const target = n > 0 ? T.nextParagraph(content, loc) : (state.loc && (state.loc.s > 0 || state.word > 3) ? T.paragraphStart(loc) : T.prevParagraph(content, loc));
  if (target) X.seek(target);
};
X.setSpeed = (x) => {
  state.speed = U.clamp(+x || 1, 0.5, 3);
  S.settings.set('ttsSpeed', state.speed);
  if (audioEl && state.provider !== 'browser') audioEl.playbackRate = state.speed;
  else if (state.provider === 'browser' && X.isPlaying()) X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc));
  emit();
};
X.setPersona = (id) => {
  if (!C.PERSONAS.find(p => p.id === id)) return;
  state.personaId = id;
  S.settings.set('ttsPersona', id);
  if (X.isPlaying()) X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc));
  emit();
};
X.setProvider = (id) => {
  const was = X.isPlaying();
  X.stop();
  state.provider = X.providerReady(id) ? id : 'browser';
  S.settings.set('ttsProvider', state.provider);
  emit();
  if (was) X.resume();
};
X.setSleep = (opt) => {
  state.sleepMode = +opt || 0;
  state.sleepAt = state.sleepMode > 0 ? Date.now() + state.sleepMode * 60000 : null;
  emit();
};
X.sleepRemaining = () => state.sleepAt ? Math.max(0, state.sleepAt - Date.now()) : null;

/** Speak a short sample in the current provider/persona (for Settings). */
X.preview = async (personaId) => {
  const persona = C.PERSONAS.find(p => p.id === personaId) || X.persona();
  const sample = 'This is how I read. Chapter one begins on a quiet morning, and the pages turn at your pace.';
  if (state.provider === 'browser') {
    if (!browser.available()) throw new Error('No browser voices available.');
    if (!browser.voices.length) browser.voices = await browser.loadVoices();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(sample);
    const v = browser.pickVoice(persona, 'en');
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = U.clamp(persona.rate * state.speed, 0.5, 3.5); u.pitch = persona.pitch;
    currentUtterance = u;
    speechSynthesis.speak(u);
    return;
  }
  const saved = state.personaId; state.personaId = persona.id;
  try {
    const { blob } = await synthesize({ text: sample });
    const a = new Audio(URL.createObjectURL(blob)); a.playbackRate = state.speed; await a.play();
  } finally { state.personaId = saved; }
};

X.clearAudioCache = async (bookId) => {
  if (bookId) return S.delWhere('audio', 'bookId', bookId);
  return S.clear('audio');
};
X.audioCacheStats = async () => {
  const rows = await S.all('audio');
  return { count: rows.length, bytes: rows.reduce((a, r) => a + ((r.blob && r.blob.size) || 0), 0), chars: rows.reduce((a, r) => a + (r.chars || 0), 0) };
};
})();
