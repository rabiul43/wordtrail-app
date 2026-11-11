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
     Without a translation yet, a sentence shows its original text in Translation mode. */
  const RM = { mode: 'en', lang: '', io: null, mo: null, q: [], qs: new Set(), busy: false, pause: 0, tm: 0, tok: 0, bar: null, btns: null, lab: null, st: null, mem: new Map(), bad: new Map(), unsub: null };
  const rmNorm = v => (v === 'both' || v === 'tr') ? v : 'en';
  const rmSrc = id => (typeof ltSent === 'function' ? ltSent(id) : '');
  function rmLangName() { const l = TR_LANGS.find(x => x[0] === trLang()); return l ? l[1] : 'Translation'; }
  function rmMsg(t) { if (!RM.st) return; RM.st.textContent = t || ''; RM.st.hidden = !t; }
  function rmLabel() { if (RM.lab) { const n = rmLangName(); if (RM.lab.textContent !== n) RM.lab.textContent = n; } }
  function rmPaint() {
    const m = RM.mode;
    el.page.classList.toggle('rm-both', m === 'both');
    el.page.classList.toggle('rm-tr', m === 'tr');
    el.reader.classList.toggle('rm-live', m !== 'en');   // the reader keeps its place by itself (no browser scroll anchoring) while translations arrive
    if (RM.btns) RM.btns.forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('data-m') === m)));
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
  function rmFill(sp) {
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
    if (RM.busy || RM.mode === 'en') return;
    if (Date.now() < RM.pause) { clearTimeout(RM.tm); RM.tm = setTimeout(rmPump, RM.pause - Date.now() + 50); return; }
    let id = -1, t = '', sp = null;
    while (RM.q.length) {   // the sentence nearest to the one being read goes first
      let bi = 0, bd = Infinity;
      for (let i = 0; i < RM.q.length; i++) { const d = Math.abs(RM.q[i] - S.curId); if (d < bd || (d === bd && RM.q[i] < RM.q[bi])) { bd = d; bi = i; } }
      id = RM.q.splice(bi, 1)[0]; RM.qs.delete(id);
      sp = S.spans.get(id); t = rmSrc(id);
      if (sp && sp.isConnected && t && !sp.hasAttribute('data-tr')) break;
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
    if (RM.mode === 'en') return;
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
    if (RM.mode === 'en') return;
    RM.lang = trLang(); rmLabel();
    if (!RM.io && 'IntersectionObserver' in window) RM.io = new IntersectionObserver(rmSeen, { root: el.reader, rootMargin: '1500px 0px' });
    if (!RM.mo && window.MutationObserver) {
      RM.mo = new MutationObserver(recs => {   // a chapter or the next steps of a long chapter were drawn
        if (RM.mode === 'en') return;
        for (const r of recs) for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || (n.tagName !== 'P' && n.tagName !== 'H2')) continue;
          for (const sp of n.querySelectorAll('.s')) rmFill(sp);   // cached ones at once, so there is no flash of the original
          if (RM.io) RM.io.observe(n);
        }
        if (!RM.io) rmNear();
      });
    }
    if (RM.mo) RM.mo.observe(el.page, { childList: true });
    if (!RM.unsub) RM.unsub = TP.onState(s => { if (s.state === 'ok' && RM.mode !== 'en') { RM.pause = 0; rmMsg(''); rmPump(); } });
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
    if (RM.mode === 'en') return;
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
    if (m === 'en') rmStop();
    else { rmStart(); ltOnDevice('Hello', trLang(), true).catch(() => {}); }   // the tap lets the browser download an on-device language pack
  }
  function rmBuild() {
    const mk = (m, label, aria) => { const b = h('button', { type: 'button', class: 'rm-b', 'data-m': m, 'aria-pressed': 'false', 'aria-label': aria }, label); b.addEventListener('click', () => rmSet(m)); return b; };
    const b1 = mk('en', 'English', 'Original text only'), b2 = mk('both', 'Both', 'Original and translation'), b3 = mk('tr', rmLangName(), 'Translation only');
    RM.btns = [b1, b2, b3]; RM.lab = b3;
    RM.st = h('p', { class: 'rm-st', role: 'status', 'aria-live': 'polite', hidden: true });
    RM.bar = h('div', { class: 'rm-bar', 'data-lrn': true }, h('div', { class: 'rm-seg', role: 'group', 'aria-label': 'Reading mode' }, b1, b2, b3), RM.st);
    el.reader.insertBefore(RM.bar, el.page);
    RM.bar.addEventListener('pointerdown', rmLabel, true);
  }
  /* 169l calls this when Learn mode is switched: Standard shows the original text only, Learn brings back the saved mode. P.rmode is never changed here. */
  function rmSync() {
    const m = learnOn() ? rmNorm(P.rmode) : 'en';
    if (m === RM.mode) return;
    let a = null; try { a = rmAnchor(); } catch (e) { /* reader empty */ }
    RM.mode = m; rmPaint(); try { if (a) rmRestore(a); } catch (e) { /* reader empty */ }
    if (m === 'en') rmStop(); else rmStart();
  }
  rmBuild();
  RM.mode = learnOn() ? rmNorm(P.rmode) : 'en';   // Standard mode: the original text only (the saved choice P.rmode is kept for Learn mode)
  rmPaint();
  if (RM.mode !== 'en') rmStart();
  /* The translation language can be changed in three places (the live panel, the long-press card, onboarding): look again after any selection change. */
  document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') setTimeout(() => { if (trLang() !== RM.lang) rmLangChanged(); else rmLabel(); }, 0); }, true);
  guideDoc('reading', 'Reading modes', 'The bar at the top of the reader switches between the English text, both lines, or only the translation. The sentence being read is highlighted in both lines. The language is the one chosen for translation.');
