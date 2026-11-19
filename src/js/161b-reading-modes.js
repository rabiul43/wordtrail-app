  /* ---------- reading modes: English / Both / Translation ----------
     A three-button bar at the top of the reader (inside #reader, so it also follows the reader into the new-reader layout).
     The mode is P.rmode ('en' | 'both' | 'tr', saved with the other settings; missing = 'en' = the app as it always was).
     How it works, and why it costs nothing per audio tick:
       - The mode is one class on #page (rm-both / rm-tr). The translation of a sentence sits in its data-tr attribute and is drawn
         by CSS (::after). So the sentence being read (.now, set by setCurrent in 150 as before) is highlighted in both lines by the
         same rule, and nothing here runs when the sentence changes.
       - Translations are fetched only while the mode is Both or Translation, for the paragraphs near the screen (IntersectionObserver),
         one at a time through TP (160b, owner 'rm'), the sentence being read first. Original mode: no observer, no request.
       - Switching mode keeps the reading place: the sentence being read (or the one in view) is measured, the class is changed,
         and the scroll is corrected in the same frame.
     Without a translation yet, a sentence shows its original text in Translation mode.
     Translation help (Both mode only), P.trHelp: 'full' (every sentence; also what a missing or unknown value means), 'hard' (only a sentence with a
     word of the book's word list that is above the reader's level and not in My words or I KNOW IT), 'tap' (a sentence's line opens when it is tapped),
     'off' (no lines: the page looks and acts as in English mode). A sentence that should show its line has data-show (hard: set by rmShown; tap: set by the
     tap); the CSS (.rm-sel) draws a line only for those, and rmFill/rmPump fetch only for those, so nothing is fetched that will not be shown. Translation mode ignores it. */
  const RM = { mode: 'en', lang: '', io: null, mo: null, q: [], qs: new Set(), busy: false, pause: 0, tm: 0, tok: 0, bar: null, btns: null, lab: null, st: null, mem: new Map(), bad: new Map(), unsub: null };
  const rmNorm = v => (v === 'both' || v === 'tr') ? v : 'en';
  const rmHelp = () => (P.trHelp === 'hard' || P.trHelp === 'tap' || P.trHelp === 'off') ? P.trHelp : 'full';   // missing or unknown = Full: the app as it was
  const rmLive = () => RM.mode === 'tr' || (RM.mode === 'both' && rmHelp() !== 'off');   // translations are wanted at all
  const RM_CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  /* the reader's level from the choice made in onboarding (P.readerLvl: 0 Easy A2-B1, 1 Medium B2, 2 Hard C1-C2): the highest level that is not "hard" for them; none chosen = B1 */
  const rmCap = () => P.readerLvl === 2 ? 4 : P.readerLvl === 1 ? 3 : 2;
  Object.assign(RM, { M: null, mBid: '', mFail: 0, ws: null, wsAt: 0, last: { id: -1, t: 0 }, help: null, hbtns: null });
  const rmSrc = id => (typeof ltSent === 'function' ? ltSent(id) : '');
  function rmLangName() { const l = TR_LANGS.find(x => x[0] === trLang()); return l ? l[1] : 'Translation'; }
  function rmMsg(t) { if (!RM.st) return; RM.st.textContent = t || ''; RM.st.hidden = !t; }
  function rmLabel() { if (RM.lab) { const n = rmLangName(); if (RM.lab.textContent !== n) RM.lab.textContent = n; } }
  function rmPaint() {
    const m = RM.mode;
    const hp = rmHelp();
    el.page.classList.toggle('rm-both', m === 'both' && hp !== 'off');   // help Off: no lines, the page is as in English mode
    el.page.classList.toggle('rm-sel', m === 'both' && (hp === 'hard' || hp === 'tap'));   // only the sentences marked data-show get a line
    el.page.classList.toggle('rm-tr', m === 'tr');
    el.reader.classList.toggle('rm-live', rmLive());   // the reader keeps its place by itself (no browser scroll anchoring) while translations arrive
    if (RM.btns) RM.btns.forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === m)));
    if (RM.help) RM.help.hidden = m !== 'both';
    if (RM.hbtns) RM.hbtns.forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-hv') === hp)));
  }
  /* ----- keeping the reading place ----- */
  function rmAnchor() {
    const r = el.reader; if (!r) return null;
    const rr = r.getBoundingClientRect();
    const vis = s => { if (!s || !s.isConnected) return false; const b = s.getBoundingClientRect(); return b.bottom > rr.top && b.top < rr.bottom; };
    let sp = S.spans && S.spans.get(S.curId);
    if (!(S.follow && vis(sp))) {
      const at = document.elementFromPoint(Math.round(rr.left + rr.width / 2), Math.round(rr.top + rr.height * 0.3));
      sp = at && at.closest ? at.closest('.s') : null;
      if (!vis(sp)) sp = null;
    }
    return sp ? { sp, top: sp.getBoundingClientRect().top - rr.top } : null;
  }
  function rmRestore(a) {
    if (!a || !a.sp.isConnected) return;
    if (typeof scrollStop === 'function') scrollStop();   // a glide to the old position must not fight the correction
    const r = el.reader, d = (a.sp.getBoundingClientRect().top - r.getBoundingClientRect().top) - a.top;
    if (Math.abs(d) > 0.5) r.scrollTop += d;
  }
  /* ----- translations on the page ----- */
  /* ----- Translation help: which sentences are shown ----- */
  function rmSaved() {   // saved words (any stage), rebuilt at most every 3 s
    const now = Date.now(); if (RM.ws && now - RM.wsAt < 3000) return RM.ws;
    const s = new Set();
    try { WS.all().forEach(e => { if (e && typeof e.w === 'string') s.add(e.w.trim().toLowerCase()); }); } catch (e) { /* no saved words */ }
    RM.ws = s; RM.wsAt = now; return s;
  }
  const rmKnown = w => { try { return rmSaved().has(w) || KW.isKnown(w); } catch (e) { return false; } };
  function rmLoadIndex() {   // the book's word list (vocBook, 160) with its CEFR levels; once per book, a failed try is repeated after 30 s
    if (!S.book || typeof vocBook !== 'function' || typeof KUC === 'undefined') return;
    const bid = String(S.book.id);
    if (RM.mBid === bid || (RM.mFail && Date.now() - RM.mFail < 30000)) return;
    RM.mBid = bid; RM.M = null; RM.mFail = 0;
    const done = M => {
      if (RM.mBid !== bid) return;   // another book meanwhile
      RM.M = M || null;
      if (!M) { RM.mFail = Date.now(); RM.mBid = ''; rmMsg('This book has no word list yet, so no sentence counts as hard.'); }
      else if (RM.mode === 'both' && rmHelp() === 'hard') rmObserveAll();   // look at the sentences on screen again
    };
    vocBook(bid).then(d => done(d ? KUC.index(d.w) : null), () => done(null));
  }
  function rmIsHard(text) {   // a word of the book list above the reader's level that is not in My words or I KNOW IT
    const M = RM.M; if (!M) return false;
    const cap = rmCap();
    for (const hit of KUC.match(M, text).hits) {
      const x = M.get(hit.w), lv = RM_CEFR.indexOf(String((x && x.lv) || '').slice(0, 2).toUpperCase());
      if (lv > cap && !rmKnown(hit.w)) return true;
    }
    return false;
  }
  function rmShown(sp) {   // should this sentence have a translation line now?
    if (RM.mode === 'tr') return true;
    const hp = rmHelp();
    if (hp === 'full') return true;
    if (hp === 'off') return false;
    if (hp === 'tap') return sp.hasAttribute('data-show');
    rmLoadIndex();
    const t = rmSrc(+sp.getAttribute('data-i')), hard = !!t && rmIsHard(t);
    if (hard) sp.setAttribute('data-show', ''); else sp.removeAttribute('data-show');
    return hard;
  }
  function rmFill(sp) {
    if (!rmShown(sp)) return true;   // not a sentence that gets a line: nothing to fetch
    if (sp.hasAttribute('data-tr')) return true;
    const id = +sp.getAttribute('data-i'), t = rmSrc(id);
    if (!t) return true;   // a heading or empty: nothing to translate
    const k = ltKey(RM.lang, t), r = RM.mem.get(k) || ltCache.get(k) || TP.peek(t, RM.lang);
    if (!r) return false;
    sp.setAttribute('data-tr', r); return true;
  }
  function rmPut(id, tr) {
    const sp = S.spans.get(id); if (!sp || !sp.isConnected) return;
    const r = el.reader, rr = r.getBoundingClientRect();
    const above = RM.mode === 'both' && sp.getBoundingClientRect().bottom <= rr.top;   // a line added above the screen would push the text down
    const h0 = above ? sp.offsetHeight : 0;
    sp.setAttribute('data-tr', tr);
    if (above) r.scrollTop += sp.offsetHeight - h0;
  }
  function rmWant(sp) {
    const id = +sp.getAttribute('data-i');
    if (RM.qs.has(id) || (RM.bad.get(id) || 0) > Date.now()) return;
    RM.qs.add(id); RM.q.push(id);
  }
  function rmPump() {
    if (RM.busy || !rmLive()) return;
    if (Date.now() < RM.pause) { clearTimeout(RM.tm); RM.tm = setTimeout(rmPump, RM.pause - Date.now() + 50); return; }
    let id = -1, t = '', sp = null;
    while (RM.q.length) {   // the sentence nearest to the one being read goes first
      let bi = 0, bd = Infinity;
      for (let i = 0; i < RM.q.length; i++) { const d = Math.abs(RM.q[i] - S.curId); if (d < bd || (d === bd && RM.q[i] < RM.q[bi])) { bd = d; bi = i; } }
      id = RM.q.splice(bi, 1)[0]; RM.qs.delete(id);
      sp = S.spans.get(id); t = rmSrc(id);
      if (sp && sp.isConnected && t && !sp.hasAttribute('data-tr') && rmShown(sp)) break;
      id = -1;
    }
    if (id < 0) return;
    RM.busy = true;
    const tok = RM.tok, lang = RM.lang;
    TP.get(t, lang, { prio: id === S.curId ? 0 : 1, owner: 'rm' }).then(tr => {
      RM.busy = false; if (tok !== RM.tok) return;
      RM.mem.set(ltKey(lang, t), tr); if (RM.mem.size > 600) RM.mem.delete(RM.mem.keys().next().value);
      rmPut(id, tr); rmMsg(''); rmPump();
    }, e => {
      RM.busy = false; if (tok !== RM.tok || (e && e.code === 'dropped')) return;
      const c = e && LT_MSG[e.code] ? e.code : 'fail';
      if (c === 'fail') { RM.bad.set(id, Date.now() + 30000); RM.tm = setTimeout(rmPump, 400); return; }   // this sentence was refused: leave it for a while
      RM.qs.add(id); RM.q.push(id); rmMsg(LT_MSG[c]);
      RM.pause = Date.now() + Math.min(Math.max((e.retryAt || 0) - Date.now(), 3000), 3600000);
      rmPump();   // sets the timer
    });
  }
  function rmSeen(entries) {
    if (!rmLive()) return;
    if (trLang() !== RM.lang) { rmLangChanged(); return; }
    for (const en of entries) if (en.isIntersecting) for (const sp of en.target.querySelectorAll('.s')) if (!rmFill(sp)) rmWant(sp);
    rmPump();
  }
  function rmObserveAll() {
    if (!RM.io) return;
    RM.io.disconnect();
    for (const n of el.page.children) if (n.tagName === 'P' || n.tagName === 'H2') RM.io.observe(n);
  }
  function rmStart() {
    if (!rmLive()) return;
    RM.lang = trLang(); rmLabel();
    if (!RM.io && 'IntersectionObserver' in window) RM.io = new IntersectionObserver(rmSeen, { root: el.reader, rootMargin: '1500px 0px' });
    if (!RM.mo && window.MutationObserver) {
      RM.mo = new MutationObserver(recs => {   // a chapter or the next steps of a long chapter were drawn
        if (!rmLive()) return;
        for (const r of recs) for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || (n.tagName !== 'P' && n.tagName !== 'H2')) continue;
          for (const sp of n.querySelectorAll('.s')) rmFill(sp);   // cached ones at once, so there is no flash of the original
          if (RM.io) RM.io.observe(n);
        }
        if (!RM.io) rmNear();
      });
    }
    if (RM.mo) RM.mo.observe(el.page, { childList: true });
    if (!RM.unsub) RM.unsub = TP.onState(s => { if (s.state === 'ok' && rmLive()) { RM.pause = 0; rmMsg(''); rmPump(); } });
    rmObserveAll();
    if (!RM.io) rmNear();
  }
  /* Without IntersectionObserver: the sentences around the one being read. */
  function rmNear() {
    for (let id = S.curId - 3; id <= S.curId + 25; id++) { const sp = S.spans.get(id); if (sp && !rmFill(sp)) rmWant(sp); }
    rmPump();
  }
  function rmStop() {
    RM.tok++; RM.busy = false; clearTimeout(RM.tm); RM.pause = 0;
    if (RM.io) RM.io.disconnect();
    if (RM.mo) RM.mo.disconnect();
    if (RM.unsub) { RM.unsub(); RM.unsub = null; }
    TP.drop('rm'); RM.q.length = 0; RM.qs.clear(); rmMsg('');
  }
  function rmLangChanged() {
    rmLabel();
    if (!rmLive()) return;
    RM.tok++; RM.busy = false; clearTimeout(RM.tm); RM.pause = 0; RM.bad.clear();
    TP.drop('rm'); RM.q.length = 0; RM.qs.clear(); rmMsg('');
    RM.lang = trLang();
    for (const sp of el.page.querySelectorAll('.s[data-tr]')) sp.removeAttribute('data-tr');
    for (const n of el.page.children) if (n.tagName === 'P' || n.tagName === 'H2') for (const sp of n.querySelectorAll('.s')) rmFill(sp);
    rmObserveAll();
    if (!RM.io) rmNear();
    ltOnDevice('Hello', RM.lang, true).catch(() => {});
  }
  /* ----- the mode ----- */
  function rmSet(m) {
    m = rmNorm(m);
    if (m === RM.mode) return;
    const a = rmAnchor();
    RM.mode = m; P.rmode = m; savePrefs();
    rmPaint(); rmRestore(a);
    if (!rmLive()) rmStop();
    else { rmStart(); ltOnDevice('Hello', trLang(), true).catch(() => {}); }   // the tap lets the browser download an on-device language pack
  }
  function rmSetHelp(v) {   // Translation help: Full | Hard | On tap | Off
    v = (v === 'hard' || v === 'tap' || v === 'off') ? v : 'full';
    if (P.trHelp === v) return;
    const a = RM.mode === 'both' ? rmAnchor() : null;
    P.trHelp = v; savePrefs();
    el.page.querySelectorAll('.s[data-show]').forEach(x => x.removeAttribute('data-show'));   // what was shown under the old level is decided again
    RM.q.length = 0; RM.qs.clear();
    rmPaint(); if (a) rmRestore(a);
    if (!rmLive()) rmStop(); else rmStart();   // rmStart looks at the sentences on screen again
  }
  function rmBuild() {
    const mk = (m, label, aria) => { const b = h('button', { type: 'button', class: 'rm-b', 'data-m': m, 'aria-pressed': 'false', 'aria-label': aria }, label); b.addEventListener('click', () => rmSet(m)); return b; };
    const b1 = mk('en', 'English', 'Original text only'), b2 = mk('both', 'Both', 'Original and translation'), b3 = mk('tr', rmLangName(), 'Translation only');
    RM.btns = [b1, b2, b3]; RM.lab = b3;
    const mh = (v, label, aria) => { const b = h('button', { type: 'button', class: 'rm-b rm-b2', 'data-hv': v, 'aria-pressed': 'false', 'aria-label': aria }, label); b.addEventListener('click', () => rmSetHelp(v)); return b; };
    RM.hbtns = [mh('full', 'Full', 'Translate every sentence'), mh('hard', 'Hard', 'Translate only hard sentences'), mh('tap', 'On tap', 'Show a translation when a sentence is tapped'), mh('off', 'Off', 'No translation lines')];
    RM.help = h('div', { class: 'rm-help', hidden: true }, h('span', { class: 'rm-hl' }, 'Translation help'), h('div', { class: 'rm-seg rm-seg2', role: 'group', 'aria-label': 'Translation help' }, ...RM.hbtns));
    RM.st = h('p', { class: 'rm-st', role: 'status', 'aria-live': 'polite', hidden: true });
    RM.bar = h('div', { class: 'rm-bar', 'data-lrn': true }, h('div', { class: 'rm-seg', role: 'group', 'aria-label': 'Reading mode' }, b1, b2, b3), RM.help, RM.st);
    el.reader.insertBefore(RM.bar, el.page);
    RM.bar.addEventListener('pointerdown', rmLabel, true);
  }
  /* 169l calls this when Learn mode is switched: Standard shows the original text only, Learn brings back the saved mode. P.rmode is never changed here. */
  function rmSync() {
    const m = learnOn() ? rmNorm(P.rmode) : 'en';
    if (m === RM.mode) return;
    let a = null; try { a = rmAnchor(); } catch (e) { /* reader empty */ }
    RM.mode = m; rmPaint(); try { if (a) rmRestore(a); } catch (e) { /* reader empty */ }
    if (!rmLive()) rmStop(); else rmStart();
  }
  rmBuild();
  RM.mode = learnOn() ? rmNorm(P.rmode) : 'en';   // Standard mode: the original text only (the saved choice P.rmode is kept for Learn mode)
  rmPaint();
  if (rmLive()) rmStart();
  /* On tap: a tap on a sentence opens its line, another tap closes it. The tap still does what it did (the audio goes there); the second tap of a double-tap is not counted. */
  el.page.addEventListener('click', e => {
    if (RM.mode !== 'both' || rmHelp() !== 'tap') return;
    const sp = e.target.closest && e.target.closest('.s'); if (!sp || !sp.hasAttribute('data-i')) return;
    if (typeof trPressAt === 'number' && trPressAt > 0 && performance.now() - trPressAt < 700) return;   // this click ended a long-press
    if (window.getSelection && String(window.getSelection())) return;
    const id = +sp.getAttribute('data-i'), t = performance.now();
    if (RM.last.id === id && t - RM.last.t < 350) { RM.last.t = t; return; }
    RM.last = { id, t };
    if (sp.hasAttribute('data-show')) { sp.removeAttribute('data-show'); return; }
    const a = rmAnchor();
    sp.setAttribute('data-show', '');
    if (!rmFill(sp)) { rmWant(sp); rmPump(); }
    if (a) rmRestore(a);
  });
  /* The translation language can be changed in three places (the live panel, the long-press card, onboarding): look again after any selection change. */
  document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') setTimeout(() => { if (trLang() !== RM.lang) rmLangChanged(); else rmLabel(); }, 0); }, true);
  guideDoc('reading', 'Reading modes', 'The bar at the top of the reader switches between the English text, both lines, or only the translation. The sentence being read is highlighted in both lines. In Both, Translation help chooses which sentences get a line: Full (all), Hard (only sentences with a word above your level that you have not saved or marked as known), On tap (tap a sentence to open its line), or Off. The language is the one chosen for translation.');
