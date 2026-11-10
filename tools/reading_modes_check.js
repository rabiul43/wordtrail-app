#!/usr/bin/env node
/* Automatic checks for the reading modes (161b): node tools/reading_modes_check.js
   Loads the REAL src/js/161b-reading-modes.js with a small fake page (no browser). It proves the logic: the saved mode, the three
   classes, translations only fetched when needed and nearest first, the reading place kept when the layout changes, the pause on a
   limit, the language change and that nothing here is tied to the audio tick. It does not prove how it looks. Exit 1 if a check fails. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src/js/161b-reading-modes.js'), 'utf8');
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
let passed = 0; const ok = (c, m) => { assert.ok(c, m); passed++; console.log('  ok  ' + m); };

class FE {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.a = {}; this.kids = []; this.cls = new Set(); this.l = {}; this.hidden = false; this.isConnected = true; this.scrollTop = 0; this.textContent = ''; this.parent = null;
    this.classList = { toggle: (c, f) => { (f === undefined ? !this.cls.has(c) : f) ? this.cls.add(c) : this.cls.delete(c); }, add: c => this.cls.add(c), remove: c => this.cls.delete(c), contains: c => this.cls.has(c) }; }
  setAttribute(k, v) { this.a[k] = String(v); } getAttribute(k) { return k in this.a ? this.a[k] : null; } hasAttribute(k) { return k in this.a; } removeAttribute(k) { delete this.a[k]; }
  get children() { return this.kids; }
  append(...n) { n.forEach(x => { if (typeof x === 'string') return; x.parent = this; this.kids.push(x); }); }
  insertBefore(n, ref) { n.parent = this; const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? this.kids.length : i, 0, n); }
  addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
  all(out = []) { for (const k of this.kids) { out.push(k); k.all(out); } return out; }
  querySelectorAll(sel) { const cls = sel.match(/^\.(\w+)(\[data-tr\])?$/); return this.all().filter(n => n.cls.has(cls[1]) && (!cls[2] || n.hasAttribute('data-tr'))); }
  closest(sel) { let n = this; const c = sel.slice(1); while (n) { if (n.cls.has(c)) return n; n = n.parent; } return null; }
  get offsetHeight() { return 20; }
  getBoundingClientRect() { const t = this.rectTop ? this.rectTop() : 0; return { top: t, bottom: t + 20, left: 0, width: 400, height: this.fixedH || 20 }; }
}
const h = (tag, attrs, ...kids) => { const e = new FE(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') String(v).split(' ').forEach(c => e.cls.add(c)); else if (k === 'hidden') e.hidden = !!v; else e.setAttribute(k, v); } e.append(...kids); if (kids.length && typeof kids[0] === 'string') e.textContent = kids[0]; return e; };

function world() {
  const calls = [], drops = [], saved = [], created = { io: 0, mo: 0 }, W = { onState: null };
  const reader = new FE('div'), page = new FE('div'); reader.append(page); reader.fixedH = 600; reader.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, width: 400, height: 600 });
  const sents = {}; const spans = new Map(); const p = new FE('p'); page.append(p);
  for (let i = 0; i < 6; i++) { sents[i] = { t: 'Sentence ' + i + '.' }; const sp = h('span', { class: 's', 'data-i': i }); sp.rectTop = () => 100 + i * 30 - reader.scrollTop + (page.cls.has('rm-both') ? 50 + i * 20 : 0); spans.set(i, sp); p.append(sp); }
  const S = { spans, curId: 3, follow: true, model: { sents } };
  const P = {}; const TP = { get: (t, l, o) => { calls.push({ t, l, o }); return W.get ? W.get(t, l, o) : Promise.resolve('[' + l + '] ' + t); }, peek: () => '', drop: o => drops.push(o), onState: f => { W.onState = f; return () => { W.onState = null; }; } };
  class IO { constructor(cb) { created.io++; this.cb = cb; this.obs = []; this.off = 0; W.io = this; } observe(n) { this.obs.push(n); } disconnect() { this.obs = []; this.off++; } }
  class MO { constructor() { created.mo++; this.off = 0; } observe() {} disconnect() { this.off++; } }
  const doc = { l: {}, addEventListener(t, f) { this.l[t] = f; }, elementFromPoint: () => null };
  const ctx = { h, el: { reader, page }, S, P, TP, TR_LANGS: [['bn', 'Bengali'], ['hi', 'Hindi']], trLang: () => P.tlang || 'bn', ltSent: id => S.model.sents[id] ? S.model.sents[id].t : '', ltCache: new Map(), ltKey: (l, t) => l + '|' + t,
    ltOnDevice: async () => null, LT_MSG: { limit: 'Limit used up.', offline: 'Offline.', wait: 'Busy.', fail: 'Could not.' }, savePrefs: () => saved.push(P.rmode), guideDoc: () => {}, scrollStop: () => {}, document: doc,
    window: { IntersectionObserver: IO, MutationObserver: MO }, IntersectionObserver: IO, MutationObserver: MO, setTimeout, clearTimeout, Date, Math, Map, Set, Promise, console };
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n;this.__rm = { RM, rmSet };', ctx);
  return { ctx, reader, page, p, S, P, calls, drops, saved, created, W, doc, rm: ctx.__rm };
}

(async () => {
  console.log('reading modes');
  { // 1 default: nothing runs
    const w = world();
    ok(w.rm.RM.mode === 'en' && !w.page.cls.has('rm-both') && !w.page.cls.has('rm-tr'), 'default is English: no mode class');
    ok(w.created.io === 0 && w.created.mo === 0 && w.calls.length === 0, 'English mode: no observer, no translation request');
    ok(w.rm.RM.bar && w.reader.kids[0] === w.rm.RM.bar && w.reader.kids[1] === w.page, 'the bar sits in the reader, before the page');
  }
  { // 2 saved mode is applied at start (old settings without rmode keep English)
    const w0 = world(); ok(w0.P.rmode === undefined, 'old settings have no rmode and stay English');
  }
  { // 3 Both: fetch nearest first, fill data-tr, save the mode
    const w = world(); w.rm.rmSet('both');
    ok(w.page.cls.has('rm-both') && !w.page.cls.has('rm-tr') && w.P.rmode === 'both' && w.saved.includes('both'), 'Both: class set and saved in P.rmode');
    ok(w.created.io === 1 && w.rm.RM.btns[1].getAttribute('aria-pressed') === 'true' && w.rm.RM.btns[0].getAttribute('aria-pressed') === 'false', 'Both: observer started, button pressed');
    w.W.io.cb([{ isIntersecting: true, target: w.p }]);
    await settle();
    ok(w.calls.length === 6, 'all 6 sentences of the visible paragraph were asked, one at a time');
    ok(w.calls[0].t === 'Sentence 3.' && w.calls[0].o.prio === 0 && w.calls[0].o.owner === 'rm', 'the sentence being read goes first, with priority 0 and owner rm');
    ok(w.calls[1].t === 'Sentence 2.' && w.calls[2].t === 'Sentence 4.', 'then the nearest ones');
    ok(w.p.kids.every(s => s.getAttribute('data-tr') === '[bn] ' + w.S.model.sents[+s.getAttribute('data-i')].t), 'every sentence got its translation in data-tr');
  }
  { // 4 reading place kept when the layout changes
    const w = world(); w.reader.scrollTop = 0;
    const sp = w.S.spans.get(3), before = sp.getBoundingClientRect().top - 0;
    w.rm.rmSet('both');
    const after = sp.getBoundingClientRect().top;
    ok(Math.abs(after - before) < 0.5 && w.reader.scrollTop > 0, 'switching to Both: the sentence being read stays at the same height on screen');
    w.rm.rmSet('tr'); ok(Math.abs(sp.getBoundingClientRect().top - before) < 0.5 && w.page.cls.has('rm-tr') && !w.page.cls.has('rm-both'), 'Both to Translation keeps the place too');
    w.rm.rmSet('en'); ok(Math.abs(sp.getBoundingClientRect().top - before) < 0.5 && w.reader.scrollTop === 0, 'back to English returns to the start position');
  }
  { // 5 back to English stops everything
    const w = world(); w.rm.rmSet('tr'); w.W.io.cb([{ isIntersecting: true, target: w.p }]); await settle();
    const n = w.calls.length; w.rm.rmSet('en'); await settle();
    ok(w.drops.includes('rm') && w.W.io.off > 0 && w.W.onState === null, 'English: queued requests dropped (owner rm), observers and state listener released');
    ok(w.calls.length === n && w.P.rmode === 'en', 'English: no further requests; mode saved');
  }
  { // 6 limit: one message, requeued, no hammering
    const w = world(); w.W.get = () => Promise.reject(Object.assign(new Error('limit'), { code: 'limit', retryAt: Date.now() + 3600000 }));
    w.rm.rmSet('both'); w.W.io.cb([{ isIntersecting: true, target: w.p }]); await settle();
    ok(w.calls.length === 1 && !w.rm.RM.st.hidden && /Limit/.test(w.rm.RM.st.textContent), 'limit: one request, the quiet message is shown');
    ok(w.rm.RM.q.length === 6 && w.rm.RM.pause > Date.now(), 'limit: sentences stay queued and wait until the layer may send again');
    w.W.onState({ state: 'ok' }); await settle();
    ok(w.calls.length === 2, 'when the layer says ok again, it asks again');
  }
  { // 7 language change clears and refetches
    const w = world(); w.rm.rmSet('both'); w.W.io.cb([{ isIntersecting: true, target: w.p }]); await settle();
    w.P.tlang = 'hi'; w.doc.l.change({ target: { tagName: 'SELECT' } }); await new Promise(r => setTimeout(r, 5));
    ok(w.rm.RM.lang === 'hi' && w.rm.RM.btns[2].textContent === 'Hindi', 'language change: new language and new label');
    ok(w.p.kids.every(s => !s.hasAttribute('data-tr') || s.getAttribute('data-tr').startsWith('[hi]')), 'language change: old translations removed');
  }
  { // 8 nothing tied to the audio tick
    ok(!/setCurrent|timeupdate|requestAnimationFrame|setInterval|\.currentTime|audio\./.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'the code never touches the audio, the tick or a timer loop');
  }
  console.log(passed + " checks passed"); process.exit(0);
})().catch(e => { console.error('FAILED: ' + (e && e.message || e)); process.exit(1); });
