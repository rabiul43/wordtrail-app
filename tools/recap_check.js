#!/usr/bin/env node
/* Automatic checks for the chapter recap sheet (145): it must still appear at the same moments, and the new parts (important words,
   "Practise this chapter") must be there. The same scenarios run on the ORIGINAL 145 file and the NEW one and must give the same
   opens and pauses.   node tools/recap_check.js [path to the original 145-chapter-recap.js]
   The original is taken from tools/samples/145-chapter-recap.orig.js when that file exists, else from the path given. If there is no
   original, only the new file is checked. Simulated page (tiny fake DOM); no browser. Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const origPath = process.argv[2] || path.join(__dirname, 'samples', '145-chapter-recap.orig.js');
class N {
  constructor(tag, attrs, kids) { this.tag = tag; this.attrs = {}; this.kids = []; this.ls = {}; this.cls = new Set();
    Object.keys(attrs || {}).forEach(k => { if (k === 'class') String(attrs[k]).split(/\s+/).forEach(c => c && this.cls.add(c)); else if (k === 'onclick') this.ls.click = [attrs[k]]; else if (k === 'text') this.kids.push({ text: String(attrs[k]) }); else this.attrs[k] = attrs[k]; });
    this.append(...kids); }
  append(...xs) { xs.forEach(x => { if (x != null && x !== '' && x !== false) this.kids.push(typeof x === 'string' ? { text: x } : x); }); }
  click() { (this.ls.click || []).forEach(f => f({})); }
  set textContent(v) { this.kids = v === '' ? [] : [{ text: String(v) }]; } get textContent() { return this.kids.map(k => k.text != null ? k.text : k.textContent).join(''); }
}
const all = (n, f, out = []) => { if (!n || n.text != null) return out; if (f(n)) out.push(n); n.kids.forEach(k => all(k, f, out)); return out; };
const J = x => JSON.parse(JSON.stringify(x));

function make(file, extras) {   // a fresh simulated page around one version of 145
  const log = [], nodes = { '#rc-body': new N('div', {}, []), '#h-recap': new N('h2', {}, []) };
  const S = { book: { id: 7, title: 'Dracula' }, sec: 0, lp: { 0: 0.5 }, map: [0], span: [1], curId: 12,
    plan: [{ ids: [10, 11, 12], starts: [0, 1, 2] }],
    model: { chapters: [{ start: 0, end: 10, title: 'Chapter I' }, { start: 10, end: 20, title: 'Chapter II' }], sumL: { 0: ['One.', 'Two.', 'Three.'], 1: ['Four.', 'Five.', 'Six.'] }, sents: [] } };
  for (let i = 0; i < 20; i++) S.model.sents.push({ t: 's' + i, ch: i < 10 ? 0 : 1 });
  const sb = { S, P: { recap: true, nudge: 0 }, audio: { paused: false, seeking: false, pause() { log.push('pause'); this.paused = true; }, play() { log.push('play'); } },
    el: { backdrop: { hidden: true } }, document: { visibilityState: 'visible' }, guideDoc() {}, SUM_N: 3, sumPick: l => l.slice(0, 3),
    $: s => nodes[s], h: (tag, a, ...k) => new N(tag, a, k), closeSheets() { log.push('closeSheets'); }, openSheet(id) { log.push('open:' + id + ':' + nodes['#h-recap'].textContent); },
    Core: { locate: () => 0 }, nowT: () => 0, sentTime: () => 0, seekAudio() {}, goTrack() {}, Date, Math, Set, String, Number, Promise };
  sb.S.sentSec = []; sb.S.sentPos = []; Object.assign(sb, extras || {}); vm.createContext(sb);
  try { vm.runInContext(fs.readFileSync(file, 'utf8') + '\nthis.rcWatch=rcWatch;this.rcReturn=rcReturn;this.RC=RC;', sb); } catch (e) { console.log('cannot load ' + file + ': ' + e.message); process.exit(2); }
  return { sb, log, S, nodes };
}
const scenarios = {   // each returns what the recap did; the same list is run on the old and the new file
  'chapter ends while listening': p => { p.sb.rcWatch(9, 10); },
  'same chapter again (already shown)': p => { p.sb.rcWatch(9, 10); p.log.length = 0; p.sb.audio.paused = false; p.sb.rcWatch(9, 10); },
  'switched off in Settings': p => { p.sb.P.recap = false; p.sb.rcWatch(9, 10); },
  'audio paused': p => { p.sb.audio.paused = true; p.sb.rcWatch(9, 10); },
  'sleep timer on': p => { p.S.sleep = 'chapter'; p.sb.rcWatch(9, 10); },
  'screen off (page hidden)': p => { p.sb.document.visibilityState = 'hidden'; p.sb.rcWatch(9, 10); },
  'a jump of more than 3 sentences': p => { p.sb.rcWatch(5, 10); },
  'another sheet is open': p => { p.sb.el.backdrop.hidden = false; p.sb.rcWatch(9, 10); },
  'inside one chapter': p => { p.sb.rcWatch(3, 4); },
  'first move after opening a book': p => { p.sb.RC.bk = null; p.sb.rcWatch(9, 10); },
  'back after 4 days': p => { p.sb.RC.prev = Date.now() - 4 * 864e5; p.sb.rcReturn(); },
  'back after 1 day': p => { p.sb.RC.prev = Date.now() - 864e5; p.sb.rcReturn(); },
  'back after 4 days, switched off': p => { p.sb.P.recap = false; p.sb.RC.prev = Date.now() - 4 * 864e5; p.sb.rcReturn(); }
};
const run = (file, name, extras) => { const p = make(file, extras); if (name !== 'first move after opening a book') p.sb.RC.bk = p.S.book; scenarios[name](p); return p; };

let pass = 0, fail = 0; const queue = [];
const t = (n, f) => queue.push([n, f]);
const hasOrig = fs.existsSync(origPath), newFile = path.join(root, 'src/js/145-chapter-recap.js');
const VOC = { vocabWords: () => ['forlorn', 'ancient', 'harbour'], furthest: () => 0 };
const ext = (calls) => ({ QG: VOC, vocDefine: async w => (w === 'forlorn' ? 'adj: sad and lonely' : ''), QS: { start(c) { calls.push(J(c)); } } });

if (hasOrig) Object.keys(scenarios).forEach(name => t('same as before: ' + name, () => {
  const a = run(origPath, name), b = run(newFile, name, ext([]));
  assert.deepStrictEqual(J(b.log), J(a.log)); assert.strictEqual(b.nodes['#h-recap'].textContent, a.nodes['#h-recap'].textContent);
}));
else console.log('note: no original 145 found (' + origPath + '); the "same as before" checks are skipped');
t('the recap does open at a chapter end and after days away', () => {
  assert.deepStrictEqual(J(run(newFile, 'chapter ends while listening', ext([])).log), ['open:sheet-recap:Chapter complete', 'pause']);
  assert.deepStrictEqual(J(run(newFile, 'back after 4 days', ext([])).log), ['open:sheet-recap:Previously…', 'pause']);
});
t('it does not open when it should not (off, paused, sleep, hidden, other sheet, big jump, same chapter, 1 day)', () => {
  ['switched off in Settings', 'audio paused', 'sleep timer on', 'screen off (page hidden)', 'another sheet is open', 'a jump of more than 3 sentences', 'inside one chapter', 'back after 1 day', 'back after 4 days, switched off', 'first move after opening a book']
    .forEach(n => assert.deepStrictEqual(J(run(newFile, n, ext([])).log), [], n));
});
t('new: important words show up, with a meaning when the dictionary has one', async () => {
  const p = run(newFile, 'chapter ends while listening', ext([])); const body = p.nodes['#rc-body'].textContent;
  assert.ok(body.indexOf('Important words') >= 0); ['forlorn', 'ancient', 'harbour'].forEach(w => assert.ok(body.indexOf(w) >= 0, w));
  await new Promise(r => setTimeout(r, 5)); assert.ok(p.nodes['#rc-body'].textContent.indexOf('adj: sad and lonely') >= 0);
});
t('new: the words are for the recapped chapter and are asked with a chapter that was reached', () => {
  const seen = []; const p = run(newFile, 'chapter ends while listening', Object.assign(ext([]), { QG: { furthest: () => -1, vocabWords: (...a) => { seen.push(a); return ['forlorn']; } } }));
  assert.deepStrictEqual(J(seen.map(a => [a[0], a[2], a[3], a[4]])), [['7', 0, 0, 5]]);
});
t('new: no words, a broken generator or a broken dictionary leave the recap as it was', async () => {
  let p = run(newFile, 'chapter ends while listening', Object.assign(ext([]), { QG: { furthest: () => 0, vocabWords: () => [] } })); assert.ok(p.nodes['#rc-body'].textContent.indexOf('Important words') < 0); assert.strictEqual(p.log[0], 'open:sheet-recap:Chapter complete');
  p = run(newFile, 'chapter ends while listening', { QG: { furthest() { throw new Error('x'); }, vocabWords() { throw new Error('x'); } }, vocDefine: async () => ''}); assert.strictEqual(p.log[0], 'open:sheet-recap:Chapter complete');
  p = run(newFile, 'chapter ends while listening', Object.assign(ext([]), { vocDefine: () => Promise.reject(new Error('offline')) })); await new Promise(r => setTimeout(r, 5)); assert.ok(p.nodes['#rc-body'].textContent.indexOf('forlorn') >= 0);
  p = run(newFile, 'chapter ends while listening', {}); assert.strictEqual(p.log[0], 'open:sheet-recap:Chapter complete');   // 167c / 160 / 169g not there at all
});
t('new: "Practise this chapter" is in both recaps, closes the sheet and starts the questions for that chapter', () => {
  [['chapter ends while listening', 0], ['back after 4 days', 0]].forEach(([n, ch]) => {
    const calls = [], p = run(newFile, n, ext(calls)), btns = all(p.nodes['#rc-body'], x => x.tag === 'button');
    const b = btns.find(x => x.textContent === 'Practise this chapter'); assert.ok(b, n); p.log.length = 0; b.click();
    assert.deepStrictEqual(J(p.log), ['closeSheets']); assert.deepStrictEqual(calls, [{ bookId: '7', chapter: ch }]);
  });
});
t('new: the old buttons are all still there, in the same order, with the new one between Continue and the row', () => {
  const p = run(newFile, 'chapter ends while listening', ext([])); const labels = all(p.nodes['#rc-body'], x => x.tag === 'button').map(x => x.textContent);
  assert.deepStrictEqual(labels, ['Continue to the next chapter', 'Practise this chapter', 'Replay chapter', 'Close']);
  const q = run(newFile, 'back after 4 days', ext([])); assert.deepStrictEqual(all(q.nodes['#rc-body'], x => x.tag === 'button').map(x => x.textContent), ['Continue listening', 'Practise this chapter', 'Skip recap']);
});
t('new: a recap with the questions file missing has no Practise button and nothing breaks', () => {
  const e = ext([]); delete e.QS; const sb = make(newFile, e); sb.sb.RC.bk = sb.S.book; sb.sb.rcWatch(9, 10);
  assert.strictEqual(all(sb.nodes['#rc-body'], x => x.textContent === 'Practise this chapter').length, 0); assert.strictEqual(sb.log[0], 'open:sheet-recap:Chapter complete');
});
(async () => { for (const [n, f] of queue) { try { await f(); pass++; console.log('ok    ' + n); } catch (e) { fail++; console.log('FAIL  ' + n + '\n        ' + String(e && e.message).split('\n').slice(0, 5).join('\n        ')); } } console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); })();
