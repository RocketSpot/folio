// Node smoke tests for src/03_text.js (pure logic, no DOM)
global.window = {};
require('../src/03_text.js');
const T = window.F.text;
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(__dirname, '../test-assets/pg11.txt'), 'utf8');

// block classification preview
const body = raw.split(/\*\*\* ?START OF[^\n]*\n/)[1] || raw;
const blocks = body.split(/\n[ \t]*\n+/).map(b => b.replace(/^\n+|\n+$/g, '')).filter(b => b.trim().length).slice(0, 14);
blocks.forEach((b, i) => { const c = T.classifyBlock(b); console.log('block', i, c && c.kind, JSON.stringify((c && c.text || '').slice(0, 70))); });

const book = T.parsePlainText(raw);
console.log('\nTITLE:', book.title, '| AUTHOR:', book.author, '| LANG:', book.language, '| chapters:', book.chapters.length);
book.chapters.forEach((c, i) => console.log(String(i).padStart(2), c.title.slice(0, 58).padEnd(58), 'paras', String(c.paras.length).padStart(4), 'words', c.pwc.reduce((a, b) => a + b, 0)));
console.log('first para of chapter[1]:', JSON.stringify((book.chapters[1] || book.chapters[0]).paras[0].slice(0, 140)));
const verse = book.chapters.flatMap(c => c.paras).find(p => p.includes('\n'));
console.log('verse sample:', JSON.stringify(verse && verse.slice(0, 120)));

const tests = [
  'Mr. Darcy said "Hello there." She left. It was 3.5 miles away! Really? yes. Dr. J. R. Smith arrived… Then what?',
  '“Curiouser and curiouser!” cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English). “Now I’m opening out like the largest telescope that ever was! Good-bye, feet!”',
  'The U.S. economy grew. See e.g. the chart. It ended at 5 p.m. Then night fell.',
  'What? No! Fine. we go now.',
];
console.log('\nsentence splits:');
for (const t of tests) console.log(JSON.stringify(T.splitSentences(t).map(s => s.text)));

const content = { chapters: book.chapters };
T.ensureCounts(content);
console.log('\ntotal words', content.totalWords);
let ok = 0, bad = 0;
for (let i = 0; i < 3000; i++) {
  const g = Math.floor(Math.random() * content.totalWords);
  const loc = T.globalToLoc(content, g);
  const g2 = T.locToGlobal(content, loc);
  if (g === g2) ok++; else { bad++; if (bad < 5) console.log('mismatch', g, g2, loc); }
}
console.log('roundtrip ok', ok, 'bad', bad);
const loc = { c: 3, p: 2, s: 1, w: 2 };
const g = T.locToGlobal(content, loc);
console.log('loc', loc, '-> g', g, '-> back', T.globalToLoc(content, g), 'pct', T.percent(content, loc).toFixed(3));
let n = T.firstLoc(), count = 0;
while (n && count < 200000) { n = T.nextSentence(content, n); count++; }
console.log('sentences via nextSentence:', count);
let pv = T.globalToLoc(content, content.totalWords - 1), back = 0;
while (pv && back < 200000) { pv = T.prevSentence(content, pv); back++; }
console.log('sentences via prevSentence:', back);
console.log('readability', T.readability(content));
console.log('normalize:', JSON.stringify(T.normalize('“Rabbit-Hole” — don’t; Ælfred café 3.5 naïve')));
console.log('syllables', ['Alice', 'wonderland', 'curiouser', 'the', 'beautiful', 'cat'].map(w => w + ':' + T.syllables(w)).join(' '));
