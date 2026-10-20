  /* Scene test (Settings > Developer): runs a list of sample paragraphs through the real scene detection and checks
     each against the scene it should find. A wrong guess is worse than a missed one, so wrong is counted on its own. */
  function sctParse(src) {
    const cases = []; let cur = null, exp = null, buf = [];
    const flush = () => { if (cur && buf.length) { cur.paras.push({ t: buf.join(' '), exp: exp || {} }); exp = null; } buf = []; };
    String(src || '').split(/\r?\n/).forEach(raw => {
      const ln = raw.trim();
      if (ln.startsWith('##')) return;
      if (ln.startsWith('===')) { flush(); const parts = ln.replace(/^=+\s*/, '').split('|').map(x => x.trim()); cur = { id: parts[0] || 'case' + (cases.length + 1), genres: '', trap: false, paras: [] }; parts.slice(1).forEach(x => { if (/^trap$/i.test(x)) cur.trap = true; else { const g = /^genres:\s*(.*)$/i.exec(x); if (g) cur.genres = g[1]; } }); cases.push(cur); exp = null; return; }
      if (!cur) return;
      if (ln.startsWith('#')) { flush(); exp = {}; ln.slice(1).trim().split(/\s+/).forEach(kv => { const i = kv.indexOf('='); if (i > 0) exp[kv.slice(0, i).toLowerCase()] = kv.slice(i + 1).toLowerCase().split('/'); }); return; }
      if (!ln) { flush(); return; }
      buf.push(ln);
    });
    flush();
    return cases;
  }
  function sctRunCase(c) {
    const sents = []; c.paras.forEach((p, i) => { (p.t.match(/[^.!?]+[.!?]+["'\u201d\u2019)]*\s*|[^.!?]+$/g) || [p.t]).forEach(x => { if (x.trim()) sents.push({ t: x.trim(), p: i }); }); });
    const m = { sents }, ix = ambSceneIdx(m), book = c.genres ? { id: 'sct-' + c.id, title: '', genres: c.genres } : null, memo = { p: {}, w: {}, m: {}, t: {} };
    const A = { place: '', wx: '', mood: '', time: '' }, out = [], gp = AMB.gp; let prevPlace = '';
    try {
      c.paras.forEach((p, pi) => {
        const before = A.place, jump = pi === 0, R = ambGenreApply(ambSceneRead(ix, pi), book), n = R.t.night || 0, d = R.t.day || 0;
        A.place = ambPlacePick(ix, pi, R, A.place, jump, memo.p);
        A.wx = ambPick(R.w, A.wx, 3, 1.5, jump, memo.w);
        A.wi = (A.wx && R.wi && R.wi[A.wx]) || 1;
        A.mood = ambPick(R.m, A.mood, 4.5, 2.2, jump, memo.m);
        A.time = ambPick({ night: Math.max(0, n - d * 0.7), day: Math.max(0, d - n * 0.7) }, A.time, 2.5, 1.2, jump, memo.t);
        const got = { place: A.place, weather: A.wx, strength: !A.wx ? 'none' : A.wi > 1.1 ? 'strong' : A.wi < 0.9 ? 'weak' : 'normal', time: A.time, mood: A.mood, trans: A.place && prevPlace && A.place !== prevPlace ? (ambTransKind(prevPlace, A.place) || 'none') : 'none' };
        const sc = { place: R.p, weather: R.w, time: R.t, mood: R.m };
        const checks = Object.keys(p.exp).filter(k => k in got).map(k => {
          const a = got[k] || 'none', ok = p.exp[k].includes(a);
          return { k, want: p.exp[k].join('/'), got: a, st: ok ? 'ok' : a === 'none' ? 'missed' : (k === 'place' && before && a === before) ? 'late' : 'wrong', top: Object.entries(sc[k] || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(e => e[0] + ' ' + e[1].toFixed(1)).join(', ') };
        });
        out.push({ id: c.id, pi, text: p.t, checks });
        prevPlace = A.place;
      });
    } finally { AMB.gp = gp; }
    return out;
  }
  function sctRun(src) {
    const cases = sctParse(src), rows = [], sum = { cases: cases.length, checks: 0, ok: 0, missed: 0, late: 0, wrong: 0, trapWrong: 0 };
    cases.forEach(c => sctRunCase(c).forEach(r => { r.trap = c.trap; rows.push(r); r.checks.forEach(k => { sum.checks++; sum[k.st]++; if (k.st === 'wrong' && c.trap) sum.trapWrong++; }); }));
    return { rows, sum };
  }
  function sctKeyMap(rows) { const o = {}; rows.forEach(r => r.checks.forEach(k => { o[r.id + '#' + r.pi + '#' + k.k] = { g: k.got, s: k.st }; })); return o; }
  function sctDiff(rows, base) {   // against the saved baseline: what is newly wrong, what got fixed, what changed
    const cur = sctKeyMap(rows), d = { newWrong: [], fixed: [], changed: [] };
    if (!base) return null;
    for (const k in cur) { const b = base[k]; if (!b) { if (cur[k].s === 'wrong') d.newWrong.push(k); continue; } if (cur[k].s === 'wrong' && b.s !== 'wrong') d.newWrong.push(k); else if (b.s === 'wrong' && cur[k].s !== 'wrong') d.fixed.push(k); else if (b.g !== cur[k].g) d.changed.push(k); }
    return d;
  }
  function sctReport(res, diff) {
    const s = res.sum, L = [];
    L.push(s.cases + ' cases, ' + s.checks + ' checks: ' + s.ok + ' ok, ' + s.missed + ' missed, ' + s.late + ' late, ' + s.wrong + ' wrong (' + s.trapWrong + ' in trap cases)');
    L.push(diff ? 'Against baseline: ' + diff.newWrong.length + ' new wrong, ' + diff.fixed.length + ' fixed, ' + diff.changed.length + ' changed. ' + (diff.newWrong.length ? 'FAIL' : 'PASS') : 'No baseline saved yet. ' + (s.wrong ? 'FAIL' : 'PASS') + ' (no wrong guesses allowed)');
    ['wrong', 'late', 'missed'].forEach(st => { const list = []; res.rows.forEach(r => r.checks.forEach(k => { if (k.st === st) list.push('[' + st.toUpperCase() + '] ' + r.id + ' para ' + (r.pi + 1) + ' ' + k.k + ': wanted ' + k.want + ', got ' + k.got + (k.top ? ' (scores: ' + k.top + ')' : '') + ' | ' + r.text.slice(0, 70)); })); if (list.length) { L.push(''); list.forEach(x => L.push(x)); } });
    return L.join('\n');
  }
  function sctInit() {
    const ta = $('#sct-src'); if (!ta) return;
    const builtin = () => (($('#scene-tests') || {}).textContent || '').replace(/^\n/, '');
    let saved = null; try { saved = localStorage.getItem('wt:sct-src'); } catch (e) {}
    ta.value = saved != null ? saved : builtin();
    ta.addEventListener('input', () => { try { localStorage.setItem('wt:sct-src', ta.value); } catch (e) {} });
    let res = null, txt = '';
    const run = () => { try { let base = null; try { base = JSON.parse(localStorage.getItem('wt:sct-base') || 'null'); } catch (e) {} if (!base) { try { base = JSON.parse(($('#scene-baseline') || {}).textContent || 'null'); } catch (e) {} } /* no baseline of your own yet: compare with the one that shipped */ res = sctRun(ta.value); txt = sctReport(res, sctDiff(res.rows, base)); $('#sct-out').textContent = txt; } catch (e) { $('#sct-out').textContent = 'The test could not run: ' + e.message; } };
    $('#sct-run').addEventListener('click', run);
    $('#sct-base').addEventListener('click', () => { if (!res) run(); if (!res) return; try { localStorage.setItem('wt:sct-base', JSON.stringify(sctKeyMap(res.rows))); toast('Baseline saved.'); } catch (e) { toast('Could not save the baseline.'); } });
    $('#sct-copy').addEventListener('click', async () => { if (!txt) run(); try { await navigator.clipboard.writeText(txt); toast('Report copied.'); } catch (e) { toast('Could not copy.'); } });
    $('#sct-reset').addEventListener('click', () => { ta.value = builtin(); try { localStorage.removeItem('wt:sct-src'); } catch (e) {} toast('Sample cases restored.'); });
  }
  function ambSceneMix(A, conf) {   // place + weather + time + mood become one set of levels
    const L = {}; AMB_SOUNDS.forEach(([k]) => { L[k] = 0; });
    const put = (m, f) => { for (const k in m) if (k in L) L[k] = Math.max(L[k], m[k] * (f == null ? 1 : f)); };
    const pl = SC_PLACES[A.place], out = !pl || !!pl.out, night = A.time === 'night', wet = A.wx === 'rain' || A.wx === 'storm' || A.wx === 'snow';
    if (pl) put(night && pl.nt ? pl.nt : pl.d);
    if (A.wx) { const w = SC_WX[A.wx].m, fi = A.wi || 1; for (const k in w) if (k in L) L[k] = Math.max(L[k], w[k] * fi * (out ? 1 : k === 'thunder' ? 0.8 : 0.5)); }   // indoors the weather is heard through the walls
    if (wet) { L.birds *= 0.15; L.night *= 0.4; } else if (A.wx === 'fog') L.birds *= 0.6;
    const md = SC_MOOD[A.mood];
    if (md) { if (md.m) put(md.m); if (out && !wet && md.o) put(md.o); if (!out && md.i) put(md.i); }
    AMB_SOUNDS.forEach(([k]) => { L[k] = Math.max(0, Math.min(100, Math.round(L[k] * conf))); });
    return L;
  }
  function ambMoodShape() {   // {g, hp, lp, i}: loudness, high-pass and low-pass (Hz) and intensity for the whole mix
    const A = AMB.auto, md = A && !A.hold && P.ambAuto !== false && A.mood && !A.fix ? SC_MOOD[A.mood] : null, x = md && md.x, s = md ? (A.ms || 0.7) : 0;
    if (!x) return { g: 1, hp: 20, lp: 20000, i: 1 };
    return { g: 1 + (x.g - 1) * s, i: 1 + (x.i - 1) * s, hp: 20 * Math.pow(x.hp / 20, s), lp: 20000 * Math.pow(x.lp / 20000, s) };   // filters blend on a log scale, as hearing does
  }
  function ambMoodApply(tc) {
    if (!AMB.built || !AMB.mg) return;
    const sh = ambMoodShape(), t = AMB.ctx.currentTime, c = (tc || 0.15) * 1.3;
    AMB.mg.gain.setTargetAtTime(sh.g, t, c); AMB.mhp.frequency.setTargetAtTime(sh.hp, t, c); AMB.mlp.frequency.setTargetAtTime(sh.lp, t, c);
  }
  function ambBase() {   // the levels everything is built from: the scene being read, or the reader's own mix
    const A = AMB.auto;
    if (P.ambAuto === false || !A || A.hold || !A.L) return ambLevels();
    return A.L;
  }
  /* "Wrong scene?": the reader's corrections, per book, in P.ambFix[bookId] = { n: sentences in the text, c: [[paragraph, scene key or '-'], ...] }.
     '-' means "no scene here". At most 200 per book (the oldest go first) and 60 books, like the saved mixes. A correction rules the paragraph it was made
     on and the 3 paragraphs either side of it; if the book's text changes (n differs) the old corrections are ignored. */
  const AMB_FIX_MAX = 200, AMB_FIX_NEAR = 3;
  function ambFixGet(m) {
    if (!S.book || !m || !m.sents) return null;
    const e = (P.ambFix || {})[String(S.book.id)];
    return e && e.n === m.sents.length && Array.isArray(e.c) ? e : null;
  }
  function ambFixNear(m, pi) {   // the correction that applies to this paragraph (the closest; the newer one on a tie), or null
    const e = ambFixGet(m); if (!e) return null;
    let best = null, bd = 99;
    e.c.forEach(x => { const d = Math.abs(x[0] - pi); if (d <= AMB_FIX_NEAR && d <= bd) { bd = d; best = { p: x[0], k: x[1] }; } });
    return best;
  }
  function ambFixStore(id, n, pi, k) {   // pure bookkeeping on P: add or replace a correction, cap it, keep the newest books
    P.ambFix = P.ambFix || {}; id = String(id);
    let e = P.ambFix[id]; if (!e || e.n !== n || !Array.isArray(e.c)) e = { n, c: [] };
    e.c = e.c.filter(x => x[0] !== pi); e.c.push([pi, k]);
    if (e.c.length > AMB_FIX_MAX) e.c.splice(0, e.c.length - AMB_FIX_MAX);
    delete P.ambFix[id]; P.ambFix[id] = e;
    const ks = Object.keys(P.ambFix); if (ks.length > 60) delete P.ambFix[ks[0]];
    return e;
  }
  function ambFixRedo() { const A = AMB.auto; if (A) { A.refix = true; A.sig = ''; } ambAutoStep(); }
  function ambFixAdd(k) {   // k: a scene key from AMB_SCENES, or '-' for no scene
    const A = AMB.auto, m = S.model;
    if (!S.book || !A || !m || A.model !== m || !(A.pi >= 0)) { toast('Nothing to correct yet. Play a little first.'); return; }
    ambFixStore(S.book.id, m.sents.length, A.pi, k); savePrefs();
    const sc = k === '-' ? null : AMB_SCENES.find(x => x.k === k);
    ambFixRedo(); ambFixPaint();
    toast(k === '-' ? 'Noted: no scene here. Your own mix plays around this part.' : 'Noted: \u201c' + (sc ? sc.n : k) + '\u201d for this part of the story.');
  }
  function ambFixClear() {
    if (!S.book || !(P.ambFix || {})[String(S.book.id)]) return;
    delete P.ambFix[String(S.book.id)]; savePrefs(); ambFixRedo(); ambFixPaint();
    toast('Corrections cleared for this book.');
  }
  function ambFixPaint() {   // the button row: only with scenes on; the clear link only when this book has corrections
    const row = $('#amb-fixrow'); if (!row) return;
    row.hidden = P.ambAuto === false || !S.book;
    const e = S.book ? (P.ambFix || {})[String(S.book.id)] : null, clr = $('#amb-fix-clear'); if (clr) clr.hidden = !(e && e.c && e.c.length);
    if (P.ambAuto === false) { const pk = $('#amb-wrong-pick'); if (pk) pk.hidden = true; }
  }
  function ambFixChips() {   // the scene list plus "No scene here"
    const box = $('#amb-wrong-chips'); if (!box) return;
    box.textContent = '';
    AMB_SCENES.forEach(sc => box.append(h('button', { class: 'chip', type: 'button', 'data-k': sc.k }, sc.n)));
    box.append(h('button', { class: 'chip', type: 'button', 'data-k': '-' }, 'No scene here'));
  }
