#!/usr/bin/env node
/* Checks for Task 11: the word panel (163) Save button and playback safety. No browser, no npm install.
     node tools/word_panel_check.js
   Loads the REAL 146, 147 and 163 files, and the REAL hold/resume functions copied out of 160 (PR, prStop, prHold, trClose,
   vocEntry, myWords). Only the page (DOM, audio, network, dictionary) is faked, so this proves the logic, not a real browser or a real
   audio device. Test it by hand on a phone too (see the handoff note). Exit code 1 if a check fails, 2 if a file cannot be loaded. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

/* take one top-level piece out of 160 by its first line; goes to the matching } or, for a one-line const, to the end of the line */
function grab(src, startRe) {
  const m = startRe.exec(src); if (!m) throw new Error('not found in 160: ' + startRe);
  let i = m.index, end = src.indexOf('\n', i), depth = 0, seen = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{') { depth++; seen = true; } else if (c === '}') { depth--; if (seen && depth === 0) { end = k + 1; break; } }
    else if (c === '\n' && !seen) { end = k; break; }
  }
  return src.slice(i, end);
}

let ctx, api;
try {
  const s160 = rd('160-learning-tools.js');
  const pieces = [
    grab(s160, /const myWords = /), grab(s160, /const PR = \{/), grab(s160, /function prStop\(/), grab(s160, /function prHold\(/),
    grab(s160, /function trClose\(/), grab(s160, /function vocEntry\(/),
  ].join('\n');
  const prelude = `
    var calls = { pause: 0, play: 0 };
    const audio = { paused: false, currentTime: 42.5, currentSrc: 'x.mp3', pause() { this.paused = true; calls.pause++; }, play() { this.paused = false; calls.play++; return Promise.resolve(); } };
    const mem = {}; const store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
    const toasts = []; const toast = t => toasts.push(t);
    const S = { book: { id: 7, title: 'Dracula' }, model: { sents: [{ ch: 0 }, { ch: 0 }, { ch: 1 }, { ch: 2 }] }, sec: 0 };
    let trSid = 3, trCtl = null, trPop = null; const prSpeech = false;
    const VOC = { books: new Map() }; const vocCount = () => {}; const trLang = () => 'bn';
    const pending = () => new Promise(() => {});
    const DICT = { get: pending }; const trFetch = pending; const SENSE = { pick: () => null, family: () => [] };
    const prButtons = () => h('div', {});
    function h(tag, attrs, ...kids) {
      const el = { tag, attrs: Object.assign({}, attrs), kids: [], listeners: {}, hidden: false, children: [], dataset: {}, classList: { toggle() {} } };
      el.append = (...k) => { k.forEach(x => { if (x != null) el.kids.push(x); }); };
      el.addEventListener = (t, f) => { (el.listeners[t] = el.listeners[t] || []).push(f); };
      el.setAttribute = (k, v) => { el.attrs[k] = v; };
      Object.defineProperty(el, 'textContent', { get() { return el.kids.map(x => typeof x === 'string' ? x : x.textContent).join(''); }, set(v) { el.kids = v ? [String(v)] : []; } });
      if (attrs && attrs.onclick) el.addEventListener('click', attrs.onclick);
      el.append(...kids); return el;
    }
  `;
  const code = prelude + rd('146-word-model.js') + '\n' + rd('147-word-store.js') + '\n' + pieces + '\n' + rd('163-word-panel.js') +
    '\nthis.api = { WS, WM, WPNL, PR, prHold, prStop, trClose, audio, calls, mem, toasts, S, h };';
  ctx = vm.createContext({ Promise, JSON, Date, Array, Object, clearTimeout, setTimeout });
  vm.runInContext(code, ctx); api = ctx.api;
} catch (e) { console.error('CANNOT LOAD: ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
function t(name, fn) { try { reset(); fn(); pass++; console.log('ok    ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n        ' + String(e.message).split('\n').slice(0, 6).join('\n        ')); } }
function reset() {
  Object.keys(api.mem).forEach(k => delete api.mem[k]);
  api.audio.paused = false; api.audio.currentTime = 42.5; api.calls.pause = 0; api.calls.play = 0; api.PR.resume = false; api.toasts.length = 0;
}
const find = (el, pred) => { if (pred(el)) return el; for (const k of el.kids) if (k && typeof k === 'object') { const r = find(k, pred); if (r) return r; } return null; };
const SENT = 'She sat alone in the garden, looking forlorn and tired.';
function openPanel(word) { const box = api.h('div', {}); api.WPNL.render(box, word || 'forlorn', SENT, 3); return box; }
const saveBtn = box => find(box, e => e.attrs && String(e.attrs.class || '').includes('wl-btn--primary'));
const backBtn = box => find(box, e => e.attrs && String(e.attrs.class || '').includes('wp-back'));
const click = el => el.listeners.click.forEach(f => f());
const saved = () => plain(api.WS.all());

t('opening the panel while the book plays does not pause, seek or touch the audio', () => {
  openPanel();
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.calls.pause, 0); assert.strictEqual(api.calls.play, 0); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('closing the panel (the popup close) while the book plays leaves it playing at the same place', () => {
  openPanel(); api.trClose();
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.calls.pause, 0); assert.strictEqual(api.calls.play, 0); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('Back to reading closes without touching the audio', () => {
  const b = openPanel(); click(backBtn(b));
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.calls.pause, 0); assert.strictEqual(api.calls.play, 0); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('open and close 25 times in a row: still playing, no pause, no play call, same position', () => {
  for (let i = 0; i < 25; i++) { openPanel(); api.trClose(); }
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.calls.pause, 0); assert.strictEqual(api.calls.play, 0); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('hold and resume still work: a sound button holds the book, closing the panel resumes it at the same place', () => {
  openPanel(); api.prHold();
  assert.strictEqual(api.audio.paused, true); assert.strictEqual(api.PR.resume, true);
  api.trClose();
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.PR.resume, false); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('if the listener had already paused, a sound button does not start the book when the panel closes', () => {
  api.audio.paused = true; openPanel(); api.prHold(); api.trClose();
  assert.strictEqual(api.audio.paused, true); assert.strictEqual(api.calls.play, 0);
});
t('Save adds the word with sentence, book id, book title and chapter', () => {
  const b = openPanel(); click(saveBtn(b));
  const l = saved(); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].w, 'forlorn');
  assert.strictEqual(l[0].ctx.length, 1);
  const c = l[0].ctx[0];
  assert.strictEqual(c.s, SENT); assert.strictEqual(c.bid, '7'); assert.strictEqual(c.bt, 'Dracula'); assert.strictEqual(c.ch, 3);   // sentence 3 is in chapter index 2, shown as 3
  assert.strictEqual(typeof c.t, 'number');
  assert.strictEqual(l[0].bid, '7'); assert.strictEqual(l[0].ex, SENT);   // the old flat fields are still written
});
t('after Save the button shows the saved state (pressed, text Saved, a toast)', () => {
  const b = openPanel(); const s = saveBtn(b);
  assert.strictEqual(s.attrs['aria-pressed'], 'false'); assert.ok(s.textContent.includes('Save word'));
  click(s);
  assert.strictEqual(s.attrs['aria-pressed'], 'true'); assert.ok(s.textContent.includes('Saved')); assert.ok(api.toasts.includes('Saved to My words.'));
});
t('opening the panel again for an already saved word shows Saved at once', () => {
  click(saveBtn(openPanel()));
  const s = saveBtn(openPanel()); assert.strictEqual(s.attrs['aria-pressed'], 'true'); assert.ok(s.textContent.includes('Saved'));
});
t('tapping Saved again removes the word (the old toggle is kept) and the button goes back to Save word', () => {
  const b = openPanel(); const s = saveBtn(b); click(s); click(s);
  assert.strictEqual(saved().length, 0); assert.strictEqual(s.attrs['aria-pressed'], 'false'); assert.ok(s.textContent.includes('Save word')); assert.ok(api.toasts.includes('Removed from My words.'));
});
t('Save while the book plays: still playing, same position, no pause or play call', () => {
  const b = openPanel(); click(saveBtn(b)); api.trClose();
  assert.strictEqual(api.audio.paused, false); assert.strictEqual(api.calls.pause, 0); assert.strictEqual(api.calls.play, 0); assert.strictEqual(api.audio.currentTime, 42.5);
});
t('a sentence with no chapter (heading or no text model) saves with ch null and does not fail', () => {
  api.S.model = null; click(saveBtn(openPanel()));
  assert.strictEqual(saved()[0].ctx[0].ch, null);
  api.S.model = { sents: [{ ch: 0 }, { ch: 0 }, { ch: 1 }, { ch: 2 }] };
});
t('an old saved word (old shape, with Review fields) is not broken by opening and saving the panel', () => {
  const OLD = { ts: 1700000000000, w: 'forlorn', lv: 'C1', ex: 'Old sentence.', bid: '345', bt: 'Dracula', ease: 2.5, iv: 6, reps: 2, due: 1700500000000 };
  api.mem['wt:words'] = JSON.stringify([OLD]);
  const b = openPanel(); const s = saveBtn(b);
  assert.strictEqual(s.attrs['aria-pressed'], 'true');           // it is already saved, shown as saved
  assert.strictEqual(JSON.parse(api.mem['wt:words'])[0].iv, 6);  // opening wrote nothing
  assert.deepStrictEqual(JSON.parse(api.mem['wt:words'])[0], OLD);
});
t('the same word met in a new sentence of the same book keeps its old fields (saveWithContext adds a place)', () => {
  const OLD = { ts: 1700000000000, w: 'forlorn', lv: 'C1', ex: 'Old sentence.', bid: '345', bt: 'Dracula', ease: 2.5, iv: 6, reps: 2, due: 1700500000000 };
  api.mem['wt:words'] = JSON.stringify([OLD]);
  api.WS.saveWithContext('forlorn', { s: SENT, bid: '7', bt: 'Dracula', ch: 3 });
  const w = saved()[0]; assert.strictEqual(w.iv, 6); assert.strictEqual(w.reps, 2); assert.strictEqual(w.ctx.length, 2); assert.strictEqual(w.ctx[0].s, SENT);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
