#!/usr/bin/env node
/* Checks for the tidied Account page, with a tiny stand-in page (no browser, no npm install).
     node tools/account_tidy_check.js
   It pulls the REAL functions out of src/js/ and runs them on a stand-in DOM:
     - Authors you follow / Your ratings / Finished, not rated yet: first 3, See all, Show less, hidden when empty or in Calm mode
     - Data and privacy: Export always; the two deletes only when signed in; Delete account confirms twice
     - Settings home: a Help section (Feature guide with a New badge, How to use, Keyboard shortcuts only with a mouse)
   Exit code 1 if a check fails, 2 if a function it needs was renamed or moved. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src/js', f), 'utf8');

/* ---- take one function (or one const statement) out of a source file, by name ---- */
function grab(file, name) {
  const src = read(file);
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=').exec(src);
  if (!m) { console.error('cannot find ' + name + ' in ' + file); process.exit(2); }
  let i = m.index, depth = 0, started = false, q = null;
  const isFn = /function/.test(m[0]);
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { while (src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) { depth++; if (c === '{' && isFn && !started) started = true; }
    else if (')]}'.includes(c)) { depth--; if (isFn && started && depth === 0) return src.slice(m.index, i + 1); }
    else if (c === ';' && depth === 0 && !isFn) return src.slice(m.index, i + 1);
  }
  console.error('cannot read the end of ' + name); process.exit(2);
}

/* ---- the stand-in page ---- */
class Txt { constructor(t) { this.nodeType = 3; this.data = String(t); } get textContent() { return this.data; } }
class El {
  constructor(tag) { this.nodeType = 1; this.tag = tag; this.kids = []; this.attrs = {}; this.className = ''; this.hidden = false; this.ls = {}; this.innerHTML = ''; }
  append(...n) { n.forEach(x => this.kids.push(x)); }
  get firstChild() { return this.kids[0] || null; }
  set textContent(v) { this.kids = v === '' ? [] : [new Txt(v)]; }
  get textContent() { return this.kids.map(k => k.textContent).join(''); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
  click() { (this.ls.click || []).forEach(f => f({ target: this })); }
  get classList() { const el = this; return { add: c => { if (!el.has(c)) el.className = (el.className + ' ' + c).trim(); }, contains: c => el.has(c) }; }
  has(c) { return (' ' + this.className + ' ').includes(' ' + c + ' '); }
  all(test, out = []) { this.kids.forEach(k => { if (k.nodeType === 1) { if (test(k)) out.push(k); k.all(test, out); } }); return out; }
  byClass(c) { return this.all(k => k.has(c)); }
  byTag(t) { return this.all(k => k.tag === t); }
}
const doc = { createElement: t => new El(t), createElementNS: (ns, t) => new El(t), createTextNode: t => new Txt(t) };
const hosts = {};
const host = id => (hosts[id] = new El('section'));
['#acct-fol', '#acct-rt', '#acct-fin', '#acct-data', '#sh-home', '#b-bkdl'].forEach(host);

/* ---- everything the real functions lean on ---- */
const state = { signed: true, calm: false, toasts: [], confirms: [], answers: [], wiped: 0, deleted: 0, deleteErr: null, fine: true, guideNew: false, followed: [], rated: {}, done: [] };
const ctx = {
  document: doc, $: s => hosts[s] || null, $$: () => [], h: null,
  plural: (n, w) => n + ' ' + w + (n === 1 ? '' : 's'),
  toast: t => state.toasts.push(t),
  confirm: t => { state.confirms.push(t); return state.answers.length ? state.answers.shift() : true; },
  acInfo: () => state.signed ? { uid: 'u1', email: 'a@b.c' } : null,
  rtCalm: () => state.calm, myRtBackfill() {}, rtTitle: t => t, rtStars: r => new El('span'), coverNode: () => new El('i'), openDetail() {},
  myRatings: () => state.rated, ST: { get done() { return state.done; } },
  folList: () => state.followed.map(n => ({ n })), folAll: () => ({}), folKey: n => n, folNew: () => [], folSeen() {}, catReady: () => false, catLoad: () => Promise.resolve(),
  authorBooks: () => [], openAuthor() {}, autIni: n => n[0], followSet(n) { state.followed = state.followed.filter(x => x !== n); },
  acSvg: () => new El('svg'),
  svgIcon: () => new El('svg'), matchMedia: () => ({ matches: state.fine }),
  P: { theme: 'auto', speed: 1 }, S: { book: null, sleep: 0 }, SMH: { from: false, q: '' }, smTheme: () => 'Auto', smDev: () => false, smNorm: s => String(s || '').trim(),
  guideUnseen: () => state.guideNew, initGuide() {}, openSheet() {}, spdPaint() {}, ambOpen() {}, smOpenTab() {}, smH3() {}, qkOpt() {}, qkPaint() {}, closeSheets() {}, window: {}
};
ctx.window.matchMedia = ctx.matchMedia;
ctx.h = (tag, props = {}, ...kids) => {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : doc.createTextNode(kid));
  return e;
};

/* ---- build one function scope with the real code inside ---- */
const code = [
  grab('130-book-detail.js', 'renderFollowing'),
  grab('135-ratings.js', 'renderMyRatings'),
  grab('295-account-sync.js', 'renderAcctData'),
  grab('295-account-sync.js', 'acDeleteCloud'),
  grab('295-account-sync.js', 'acDeleteAccount'),
  grab('290-backup-maintenance.js', 'smRows'),
  grab('290-backup-maintenance.js', 'smShow'),
  grab('290-backup-maintenance.js', 'smSecName'),
  grab('290-backup-maintenance.js', 'smRow'),
  grab('290-backup-maintenance.js', 'smHomePaint'),
  grab('290-backup-maintenance.js', 'smIndex')
].join('\n');
const names = Object.keys(ctx);
const api = new Function(...names, 'api', `
  let acUser = { delete: api.userDelete }, acStale = false, acMsg = 'x';
  const AC_META = 'm', AC_BIG = 'b', acDirty = { clear() { api.cleared = true; } }, acDirtySave = () => {}, acSaveInfo = v => { api.saved = v; }, renderAcctSync = () => { api.rendered = true; };
  const acWipeCloud = async () => { api.wiped++; if (api.wipeErr) throw api.wipeErr; };
  const localStorage = { removeItem() {} };
  ${code}
  return { renderFollowing, renderMyRatings, renderAcctData, acDeleteAccount, acDeleteCloud, smHomePaint, smIndex, smRows, smShow, setUser: u => { acUser = u; } };
`);
const bind = { wiped: 0, userDelete: async () => { state.deleted++; if (state.deleteErr) throw state.deleteErr; } };
const fns = api(...names.map(n => ctx[n]), bind);

let failed = 0;
const ok = (name, fn) => { try { fn(); console.log('ok    ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); } };
const okA = async (name, fn) => { try { await fn(); console.log('ok    ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); } };
const cards = el => el.byClass('rtl-card').length;
const btnText = (el, cls) => el.byClass(cls).map(b => b.textContent);

(async () => {
  /* Authors you follow */
  ok('follow list: 5 authors show 3, then See all shows 5, then Show less goes back to 3', () => {
    state.followed = ['A', 'B', 'C', 'D', 'E']; fns.renderFollowing();
    const f = hosts['#acct-fol'];
    assert.equal(f.hidden, false); assert.equal(cards(f), 3); assert.deepEqual(btnText(f, 'rtl-all'), ['See all']);
    f.byClass('rtl-all')[0].click(); assert.equal(cards(f), 5); assert.deepEqual(btnText(f, 'rtl-all'), ['Show less']);
    f.byClass('rtl-all')[0].click(); assert.equal(cards(f), 3);
  });
  ok('follow list: 3 or fewer authors have no See all; none hides the section', () => {
    state.followed = ['A', 'B', 'C']; fns.renderFollowing();
    assert.equal(cards(hosts['#acct-fol']), 3); assert.equal(btnText(hosts['#acct-fol'], 'rtl-all').length, 0);
    state.followed = []; fns.renderFollowing(); assert.equal(hosts['#acct-fol'].hidden, true);
  });
  ok('follow list: unfollowing from the expanded list keeps it expanded', () => {
    state.followed = ['A', 'B', 'C', 'D']; fns.renderFollowing();
    const f = hosts['#acct-fol']; f.byClass('rtl-all')[0].click(); assert.equal(cards(f), 4);
    f.byClass('fol-un')[0].click(); assert.equal(cards(f), 3);
  });

  /* Ratings and finished: two sections */
  const mk = (n, t0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { r: 4, t: t0 + i, title: 'Book ' + (i + 1) }]));
  ok('ratings and finished are two separate sections of 3 each, each with See all', () => {
    state.signed = true; state.calm = false; state.rated = mk(5, 100);
    state.done = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, title: 'Done ' + i }));
    fns.renderMyRatings();
    const r = hosts['#acct-rt'], f = hosts['#acct-fin'];
    assert.equal(r.hidden, false); assert.equal(f.hidden, false);
    assert.equal(cards(r), 3); assert.equal(cards(f), 3);
    assert.ok(/Your ratings/.test(r.textContent) && !/Finished/.test(r.textContent));
    assert.ok(/Finished, not rated yet/.test(f.textContent) && !/Your ratings/.test(f.textContent));
    r.byClass('rtl-all')[0].click(); assert.equal(cards(r), 5); assert.equal(cards(f), 3);
    f.byClass('rtl-all')[0].click(); assert.equal(cards(f), 5);
    f.byClass('rtl-all')[0].click(); assert.equal(cards(f), 3);
  });
  ok('a finished book that is already rated is not listed as "not rated yet"', () => {
    state.rated = mk(1, 100); state.done = [{ id: 1, title: 'x' }, { id: 7, title: 'y' }]; fns.renderMyRatings();
    assert.equal(cards(hosts['#acct-fin']), 1);
  });
  ok('no ratings: only the finished section shows; nothing finished: it hides', () => {
    state.rated = {}; state.done = [{ id: 9, title: 'z' }]; fns.renderMyRatings();
    assert.equal(hosts['#acct-rt'].hidden, true); assert.equal(hosts['#acct-fin'].hidden, false);
    state.done = []; fns.renderMyRatings(); assert.equal(hosts['#acct-fin'].hidden, true);
  });
  ok('signed out, or Calm mode: both sections are hidden', () => {
    state.rated = mk(2, 1); state.done = [{ id: 9, title: 'z' }];
    state.signed = false; fns.renderMyRatings(); assert.ok(hosts['#acct-rt'].hidden && hosts['#acct-fin'].hidden);
    state.signed = true; state.calm = true; fns.renderMyRatings(); assert.ok(hosts['#acct-rt'].hidden && hosts['#acct-fin'].hidden);
    state.calm = false;
  });

  /* Data and privacy */
  ok('data and privacy, signed in: export, delete cloud data, delete account (last one is red)', () => {
    state.signed = true; fns.renderAcctData();
    const d = hosts['#acct-data'], rows = d.byClass('acct-link');
    assert.equal(d.hidden, false); assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.byTag('span')[0].kids[0].textContent), ['Export my data', 'Delete my cloud data', 'Delete account']);
    assert.ok(rows[2].has('danger') && !rows[0].has('danger') && !rows[1].has('danger'));
    assert.ok(/Data and privacy/.test(d.textContent));
  });
  ok('data and privacy, signed out: only Export my data, and it presses the backup button', () => {
    state.signed = false; fns.renderAcctData();
    const rows = hosts['#acct-data'].byClass('acct-link'); assert.equal(rows.length, 1);
    let pressed = 0; hosts['#b-bkdl'].addEventListener('click', () => pressed++); rows[0].click(); assert.equal(pressed, 1);
    state.signed = true;
  });
  await okA('delete account: first "No" stops everything', async () => {
    fns.setUser({ delete: bind.userDelete }); Object.assign(state, { confirms: [], answers: [false], toasts: [], deleted: 0 }); bind.wiped = 0; bind.rendered = false;
    await fns.acDeleteAccount(); assert.equal(state.confirms.length, 1); assert.equal(bind.wiped, 0); assert.equal(state.deleted, 0);
  });
  await okA('delete account: "Yes" then "No" at the last check stops everything', async () => {
    fns.setUser({ delete: bind.userDelete }); Object.assign(state, { confirms: [], answers: [true, false], toasts: [], deleted: 0 }); bind.wiped = 0;
    await fns.acDeleteAccount(); assert.equal(state.confirms.length, 2); assert.equal(bind.wiped, 0); assert.equal(state.deleted, 0);
  });
  await okA('delete account: two "Yes" wipe the cloud data, delete the sign-in and clear this device\'s sign-in record', async () => {
    fns.setUser({ delete: bind.userDelete }); Object.assign(state, { confirms: [], answers: [true, true], toasts: [], deleted: 0, deleteErr: null }); bind.wiped = 0; bind.saved = 'unset'; bind.cleared = false;
    await fns.acDeleteAccount();
    assert.equal(bind.wiped, 1); assert.equal(state.deleted, 1); assert.equal(bind.saved, null); assert.ok(bind.cleared);
    assert.deepEqual(state.toasts, ['Account deleted.']);
    assert.ok(/Ratings and reviews you already published stay/.test(state.confirms[0]));
  });
  await okA('delete account: Firebase asks for a recent sign-in -> a clear message, still signed in on this device', async () => {
    fns.setUser({ delete: bind.userDelete }); Object.assign(state, { confirms: [], answers: [true, true], toasts: [], deleted: 0, deleteErr: { code: 'auth/requires-recent-login' } }); bind.wiped = 0; bind.saved = 'unset';
    await fns.acDeleteAccount();
    assert.equal(bind.saved, 'unset'); assert.equal(state.toasts.length, 1); assert.ok(/sign in again/.test(state.toasts[0]));
  });
  await okA('delete account: any other failure -> "Could not delete the account."', async () => {
    fns.setUser({ delete: bind.userDelete }); Object.assign(state, { confirms: [], answers: [true, true], toasts: [], deleted: 0, deleteErr: null }); bind.wiped = 0; bind.wipeErr = new Error('offline');
    await fns.acDeleteAccount(); bind.wipeErr = null;
    assert.deepEqual(state.toasts, ['Could not delete the account.']); assert.equal(state.deleted, 0);
  });

  /* Settings home */
  const sections = () => hosts['#sh-home'].byTag('section').map(s => s.byTag('h3')[0].textContent);
  ok('settings home: Basics, Advanced, Help (Feature guide, How to use, Keyboard shortcuts with a mouse)', () => {
    state.fine = true; state.guideNew = false; fns.smHomePaint();
    assert.deepEqual(sections(), ['Basics', 'Advanced', 'Help']);
    const help = hosts['#sh-home'].byTag('section')[2].byClass('mr-t').map(x => x.textContent);
    assert.deepEqual(help, ['Feature guide', 'How to use', 'Keyboard shortcuts']);
    assert.equal(hosts['#sh-home'].byClass('sh-pill').length, 0);
  });
  ok('settings home: no Keyboard shortcuts row on a touch screen', () => {
    state.fine = false; fns.smHomePaint();
    assert.deepEqual(hosts['#sh-home'].byTag('section')[2].byClass('mr-t').map(x => x.textContent), ['Feature guide', 'How to use']);
    state.fine = true;
  });
  ok('settings home: Feature guide shows a New badge only when there is something new', () => {
    state.guideNew = true; fns.smHomePaint();
    const pills = hosts['#sh-home'].byClass('sh-pill'); assert.equal(pills.length, 1); assert.equal(pills[0].textContent, 'New');
    state.guideNew = false;
  });
  ok('settings search finds the Help rows and labels them "Help"', () => {
    state.fine = true; const idx = fns.smIndex();
    const g = idx.find(x => x.name === 'Feature guide'); assert.ok(g && /^Help/.test(g.desc));
    assert.ok(idx.find(x => x.name === 'How to use')); assert.ok(idx.find(x => x.name === 'Keyboard shortcuts'));
  });

  if (failed) { console.log('\n' + failed + ' check(s) failed'); process.exit(1); }
  console.log('\nall account/settings checks passed');
})();
