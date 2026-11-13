  /* ---------- Timed reading: exam-style questions and review (TQ, TQC; Task 59) ----------
     Sits on top of 169q. When the reader taps "I've finished reading" (speed saved), the panel under the passage becomes a set of questions
     about THAT passage, while the timer keeps running. Calm: no lives, no ranking, no score shown while answering.
     Three kinds, made from the sentences of the passage the reader just read (so the spoiler rule of 169q already holds; nothing outside the
     passage is used). The sentence rules and the word helpers come from the question generator (QG, 167c): QG.usable, QG.askable, QG.split,
     QG.toks and the seeded random numbers QG.rng / QG.seedOf / QG.shuffle.
       sc   Sentence completion (up to 4): a passage sentence with a gap. Type NO MORE THAN TWO WORDS, copied from the passage.
       sum  Summary completion (3 gaps): three sentences that follow each other in the passage, one gap in each, and a box of words
            (the 3 answers and up to 3 other words of the passage). Tap a gap, then a word.
       mh   Matching headings (up to 4 paragraphs): a list of headings, each made from the FIRST SENTENCE of a paragraph (a first sentence of up to 12 words as it is,
            a longer one cut at its first comma or dash). The list holds the headings of the asked paragraphs and 1 or 2 EXTRA headings of other
            paragraphs. Pick a heading for each asked paragraph.
     Without enough good sentences a kind is left out; with nothing at all the screen ends as before (the "Speed saved" panel of 169q).
     One sentence serves one question. The first sentence of a paragraph is never used for sc or sum (it is the heading text).
     The same passage always gives the same questions (seeded). Answers are judged when the set is finished (exam style), not one by one.
       sc   typed words, lower case, punctuation and extra spaces ignored; exactly the removed words; more than 2 words is wrong
       sum  the word chosen for the gap is the removed word
       mh   the heading number (i, ii ...) chosen for the paragraph is the heading made from that paragraph
     Screen (mock-up): the passage stays on top; the question panel is under it: "Questions 1-5" and "2 of 5", the rule, the question cards (the
     one you are on has a gold border), numbered dots (green = answered), and a big NEXT QUESTION button (NEXT PART at the end of a kind, FINISH
     at the end). After Finish, or when the time is up: the review in the same panel. Every question shows right / not quite / no answer in words
     and an icon (not colour alone), your answer, the right answer, the line of the passage, and "Show in text", which marks that line in the
     passage and scrolls to it. Time up = the review of what was answered (nothing is blamed).
     Practice log: a finished set (or time up) with at least ONE answer does IE.log('r') once (169o, Reading). Closing half way logs nothing.
     Storage: NO new key. The set (r.qs), the answers (r.an = { questionId: text | word | heading number }), r.qd = 1 (review reached) and r.lg = 1
     (practice logged) live inside the run in progress, wt:readrun (this device only, not synced, not in backups; dropped when the screen closes).
     That keeps the questions and answers when the phone switches apps or the page is thrown away: TMR.start() carries on at the questions.
     The saved speed in wt:readspeed is not touched. Old saved data is untouched; a saved set of the wrong shape is made again.
     API: TQC (pure, between TQC-START/END): build(paras, { seed }), judge(q, a), score(set, answers), list(set), norm, sents, flat, headOf, pairsOf.
          TQ.show(ui), TQ.timesUp(), TQ.off() are called by 169q (TMR.use). Later tasks: TQC.score(run.qs, run.an) = { n, right, answered, rows }.
     Styles 94za-timed-questions.css (reuses .tr*, .rl*, .wl*, .qs*). To go back: remove this file, the css file, their build.py lines, the QX lines
     in 169q and the strings marked "timed questions" in src/i18n/bn.json. */
  /* TQC-START */
  const TQC = (() => {
    const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'], MAX = { sc: 4, sum: 3, mh: 4 };
    const TITLE = { sc: 'Sentence completion', sum: 'Summary completion', mh: 'Matching headings' };
    const RULE = { sc: 'Complete the sentences. Choose NO MORE THAN TWO WORDS.', sum: 'Complete the summary. Choose words from the box.', mh: 'Choose the best heading for each paragraph.' };
    const FW = new Set(('that this these those with from have been were they them their there then than what when which while would could should about after before also each into more most much only other over ' +
      'some such very will your just like many make made upon onto both being does done even ever every must same still under until where whom whose among along often').split(' '));
    const ABBR = /^(?:mr|mrs|ms|dr|st|prof|sr|jr|vs|etc|mt|capt|col|gen|lt|rev|hon|messrs|fig)$/i;
    const CONN = /^(?:however|but|yet|so|thus|therefore|moreover|furthermore|meanwhile|then|also|indeed|still|instead)\b[,\s]*/i;
    const norm = s => String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").toLowerCase().replace(/[.,;:!?"\u201c\u201d()]+/g, ' ').replace(/\s+/g, ' ').trim();
    const wordsOf = s => { const n = norm(s); return n ? n.split(' ') : []; };
    /* the sentences of one paragraph text, in order; every one is an exact piece of the text. A full stop after Mr, Dr, St, an initial ... does not end a sentence */
    function sents(t) {
      const raw = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); if (!raw) return [];
      const pcs = raw.match(/[^.!?]+[.!?]+["'\u201d\u2019)]*(?:\s+|$)/g) || [raw], out = []; let buf = '';
      pcs.forEach(p => {
        buf += p; const w = (buf.trim().match(/([A-Za-z.]+)\.["'\u201d\u2019)]*$/) || [])[1];
        if (w && (ABBR.test(w) || /^[A-Z]$/.test(w))) return;
        out.push(buf.trim()); buf = '';
      });
      if (buf.trim()) out.push(buf.trim());
      return out;
    }
    function flat(paras) {   // every sentence of the passage: [ { L (paragraph letter), t, first (first sentence of its paragraph) } ]
      const out = [];
      (Array.isArray(paras) ? paras : []).forEach(p => { if (p && typeof p.t === 'string') sents(p.t).forEach((t, k) => out.push({ L: String(p.L), t, first: k === 0 })); });
      return out;
    }
    function freq(fl) { const f = new Map(); fl.forEach(s => QG.toks(s.t).forEach(w => { w = w.toLowerCase(); f.set(w, (f.get(w) || 0) + 1); })); return f; }
    /* two words in a row that can be asked together: lower case, the second a plain word (QG.askable), the first not a function word, the pair once in the sentence */
    function pairsOf(t) {
      const ok = new Set(QG.askable(t)), out = [], re = /(^|[^A-Za-z'\u2019-])([a-z]{4,14}) ([a-z]{4,14})(?![A-Za-z'\u2019-])/g; let m;
      while ((m = re.exec(t))) {
        re.lastIndex = m.index + m[1].length + m[2].length;   // the next pair may start with the second word
        const a = m[2], b = m[3]; if (FW.has(a) || !ok.has(b) || a === b) continue;
        const ph = a + ' ' + b; if (t.indexOf(ph) === t.lastIndexOf(ph) && out.indexOf(ph) < 0) out.push(ph);
      }
      return out;
    }
    /* a heading from the first sentence of a paragraph, or '' */
    function headOf(t) {
      let s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
      if (!s || /\d|[\[\]{}<>]|https?:/i.test(s)) return '';
      s = s.replace(CONN, '').replace(/[.!?]["'\u201d\u2019)]*$/, '').replace(/^["'\u201c\u2018(]+/, '').trim();
      let n = s ? s.split(' ').length : 0;
      if (n > 12) { const cut = s.search(/[,;:\u2014]/); if (cut <= 0) return ''; s = s.slice(0, cut).trim(); n = s ? s.split(' ').length : 0; }
      if (n < 3 || n > 12 || /["\u201c\u201d]/.test(s)) return '';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    const pickOf = (a, r) => a[Math.floor(r() * a.length)];
    function askOne(s, f, r) {   // one sentence completion: one word or two words taken out
      const singles = QG.askable(s.t).filter(w => (f.get(w) || 0) <= 3), pairs = pairsOf(s.t);
      const pick = pairs.length && (!singles.length || r() < 0.5) ? pickOf(pairs, r) : singles.length ? pickOf(singles, r) : '';
      const sp = pick ? QG.split(s.t, pick) : null;
      return sp ? { k: 'sc', L: s.L, pre: sp.pre, post: sp.post, ans: [pick], line: s.t } : null;
    }
    function summary(fl, used, f, r) {   // 3 sentences in a row, one gap each, and a box of words; or null
      const gaps = t => QG.askable(t).filter(w => (f.get(w) || 0) <= 3), ok = i => !used.has(i) && QG.usable(fl[i].t) && gaps(fl[i].t).length > 0, starts = [];
      for (let i = 0; i + 2 < fl.length; i++) if (ok(i) && ok(i + 1) && ok(i + 2)) starts.push(i);
      const pool = new Set(); fl.forEach(s => QG.askable(s.t).forEach(w => pool.add(w)));
      const order = QG.shuffle(starts, r);
      for (let k = 0; k < order.length; k++) {
        const i0 = order[k], ans = [];
        for (let d = 0; d < 3; d++) { const c = gaps(fl[i0 + d].t).filter(w => ans.indexOf(w) < 0); if (!c.length) break; ans.push(pickOf(c, r)); }
        if (ans.length < 3) continue;
        const inRun = new Set(); for (let d = 0; d < 3; d++) QG.toks(fl[i0 + d].t).forEach(w => inRun.add(w.toLowerCase()));
        const ds = QG.shuffle([...pool].filter(w => !inRun.has(w) && ans.some(a => Math.abs(a.length - w.length) <= 3)), r).slice(0, 3);
        if (ds.length < 2) continue;
        const items = ans.map((a, d) => { const s = fl[i0 + d], sp = QG.split(s.t, a); return sp ? { k: 'sum', L: s.L, pre: sp.pre, post: sp.post, ans: a, line: s.t } : null; });
        if (items.some(x => !x)) continue;
        for (let d = 0; d < 3; d++) used.add(i0 + d);
        return { items, box: QG.shuffle(ans.concat(ds), r) };
      }
      return null;
    }
    function headings(fl, r) {   // { items, heads } or null; needs 3 paragraphs with a heading, asks at most 4 and keeps 1 or 2 as extras
      const heads = [], seen = new Set();
      fl.forEach(s => { if (!s.first) return; const hd = headOf(s.t); if (hd && !seen.has(hd.toLowerCase())) { seen.add(hd.toLowerCase()); heads.push({ L: s.L, t: hd, line: s.t }); } });
      if (heads.length < 3) return null;
      const ask = Math.min(MAX.mh, heads.length - 1), sh = QG.shuffle(heads, r);
      const asked = sh.slice(0, ask).sort((a, b) => (a.L < b.L ? -1 : a.L > b.L ? 1 : 0)), extra = sh.slice(ask, ask + 2);
      const list = QG.shuffle(asked.concat(extra), r).map((x, k) => ({ id: ROMAN[k], t: x.t, L: x.L }));
      return { heads: list.map(x => ({ id: x.id, t: x.t })), items: asked.map(x => ({ k: 'mh', L: x.L, ans: list.filter(y => y.L === x.L)[0].id, line: x.line })) };
    }
    /* The question set for a passage (paras = [ { L, t } ]): { v: 1, n, groups: [ { k, title, rule, items, box? (sum), heads? (mh) } ] } or null.
       An item: { id, n, k, L, pre, post, ans, line } (mh has no pre/post; ans is a list of accepted texts for sc, one word for sum, a heading number for mh). */
    function build(paras, o) {
      const fl = flat(paras); if (fl.length < 6) return null;
      const r = QG.rng(QG.seedOf(String(o && o.seed != null ? o.seed : '') + '|' + fl.length + '|' + fl[0].t)), f = freq(fl);
      const mh = headings(fl, r), used = new Set(); fl.forEach((s, i) => { if (s.first) used.add(i); });
      const byP = new Map(); fl.forEach((s, i) => { if (!used.has(i) && QG.usable(s.t)) { if (!byP.has(s.L)) byP.set(s.L, []); byP.get(s.L).push(i); } });
      const sc = [];
      QG.shuffle([...byP.keys()], r).forEach(L => {
        if (sc.length >= MAX.sc) return;
        const cand = QG.shuffle(byP.get(L), r);
        for (let k = 0; k < cand.length; k++) { const q = askOne(fl[cand[k]], f, r); if (q) { q.i = cand[k]; sc.push(q); used.add(cand[k]); break; } }
      });
      sc.sort((a, b) => a.i - b.i); sc.forEach(q => { delete q.i; });
      const sm = summary(fl, used, f, r), groups = []; let n = 0;
      const add = (k, items, extra) => {
        if (!items || items.length < (k === 'sum' ? 3 : 2)) return;
        items.forEach(it => { it.n = ++n; it.id = k + it.n; });
        groups.push(Object.assign({ k, title: TITLE[k], rule: RULE[k], items }, extra || {}));
      };
      add('sc', sc); add('sum', sm && sm.items, sm ? { box: sm.box } : null); add('mh', mh && mh.items, mh ? { heads: mh.heads } : null);
      return groups.length ? { v: 1, n, groups } : null;
    }
    const given = v => typeof v === 'string' ? v.trim() : '';
    function judge(q, a) {
      a = given(a); if (!q || !a) return false;
      if (q.k === 'sc') { const w = wordsOf(a); return w.length >= 1 && w.length <= 2 && (Array.isArray(q.ans) ? q.ans : [q.ans]).some(x => norm(x) === w.join(' ')); }
      if (q.k === 'sum') return a.toLowerCase() === String(q.ans).toLowerCase();
      if (q.k === 'mh') return a === q.ans;
      return false;
    }
    function list(set) { const out = []; ((set && Array.isArray(set.groups)) ? set.groups : []).forEach((g, gi) => (g.items || []).forEach(q => out.push({ q, g: gi }))); return out; }
    function score(set, an) {
      an = an && typeof an === 'object' ? an : {}; const rows = []; let right = 0, answered = 0;
      list(set).forEach(x => {
        const q = x.q, a = given(an[q.id]), has = a !== '' && (q.k !== 'sc' || wordsOf(a).length > 0), ok = has && judge(q, a);
        if (has) answered++; if (ok) right++;
        rows.push({ q, g: x.g, a: has ? a : '', st: ok ? 'right' : has ? 'wrong' : 'none' });
      });
      return { n: rows.length, right, answered, rows };
    }
    return { ROMAN, MAX, norm, sents, flat, pairsOf, headOf, build, judge, list, score };
  })();
  /* TQC-END */

  const TQ = (() => {
    const T = { ui: null, run: null, set: null, items: [], i: 0, g: -1, live: false, sheet: null, body: null, hd: null, of: null, rule: null, dots: null, next: null, cards: {}, paint: null, boxBtns: [] };
    const answer = q => { const v = T.run && T.run.an ? T.run.an[q.id] : ''; return typeof v === 'string' ? v : ''; };
    const done = q => { const v = answer(q); return q.k === 'sc' ? TQC.norm(v) !== '' : v !== ''; };
    const save = () => { try { T.ui.save(); } catch (e) { /* storage unavailable: the answers stay on this screen */ } };
    function setAns(q, v) { if (v === '') delete T.run.an[q.id]; else T.run.an[q.id] = v; save(); paintDots(); }
    const idx = q => T.items.findIndex(x => x.q.id === q.id);
    const grp = () => T.set.groups[T.g];
    const rangeText = g => { const a = g.items[0].n, b = g.items[g.items.length - 1].n; return a === b ? 'Question ' + a : 'Questions ' + a + '\u2013' + b; };
    const validSet = s => !!s && s.v === 1 && Array.isArray(s.groups) && s.groups.length > 0 && s.groups.every(g => g && /^(sc|sum|mh)$/.test(g.k) && Array.isArray(g.items) && g.items.length > 0 && g.items.every(q => q && typeof q.id === 'string' && q.k === g.k && typeof q.line === 'string' && q.ans != null));

    /* ----- the question panel ----- */
    function paintDots() {
      if (!T.dots) return;
      T.items.forEach((x, k) => { const d = T.dots.querySelector('[data-d="' + x.q.id + '"]'); if (!d) return; d.classList.toggle('is-done', done(x.q)); d.classList.toggle('is-active', k === T.i); if (k === T.i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
      if (T.paint) T.paint();
    }
    function paintActive(focus) {
      const g = grp(), it = T.items[T.i], q = it.q, pos = g.items.indexOf(q);
      T.hd.textContent = rangeText(g); T.of.textContent = (pos + 1) + ' of ' + g.items.length; T.rule.textContent = g.rule;
      Object.keys(T.cards).forEach(id => T.cards[id].classList.toggle('is-active', id === q.id));
      const last = T.i >= T.items.length - 1, endOfKind = pos >= g.items.length - 1;
      T.next.textContent = last ? 'Finish' : endOfKind ? 'Next part' : 'Next question';
      paintDots();
      const el = T.cards[q.id]; if (el) { if (focus && q.k === 'sc') { const inp = el.querySelector('input'); if (inp) inp.focus({ preventScroll: true }); } try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* the card stays where it is */ } }
    }
    function go(i, focus) {
      if (i < 0 || i >= T.items.length) return;
      T.i = i; if (T.items[i].g !== T.g) drawGroup(T.items[i].g);
      paintActive(focus);
    }
    function next() { if (T.i >= T.items.length - 1) finishSet(false); else go(T.i + 1, true); }
    function numEl(n) { return h('span', { class: 'tq-n', 'aria-hidden': 'true' }, String(n)); }
    function drawGroup(gi) {
      T.g = gi; T.cards = {}; T.boxBtns = []; T.paint = null; const g = grp(); T.body.textContent = '';
      if (g.k === 'sc') {
        g.items.forEach(q => {
          const inp = h('input', { class: 'tq-blank', type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '40', 'aria-label': 'Question ' + q.n + ' answer', lang: 'en' });
          inp.value = answer(q);
          inp.addEventListener('focus', () => { if (T.items[T.i].q.id !== q.id) { T.i = idx(q); paintActive(false); } });
          inp.addEventListener('input', () => setAns(q, inp.value));
          inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } });
          const card = h('div', { class: 'wl-card tq-card', role: 'group', 'aria-label': 'Question ' + q.n }, numEl(q.n), h('p', { class: 'tq-sent', lang: 'en', translate: 'no' }, q.pre, inp, q.post));
          card.addEventListener('click', () => { if (T.items[T.i].q.id !== q.id) { T.i = idx(q); paintActive(false); } });
          T.cards[q.id] = card; T.body.append(card);
        });
      } else if (g.k === 'sum') {
        const text = h('p', { class: 'tq-sum', lang: 'en', translate: 'no' }), gaps = {};
        g.items.forEach(q => {
          const gap = h('button', { class: 'tq-gap', type: 'button', 'aria-label': 'Gap ' + q.n }, String(q.n));
          gap.addEventListener('click', () => { T.i = idx(q); paintActive(false); });
          gaps[q.id] = gap; T.cards[q.id] = gap; text.append(q.pre, gap, q.post, ' ');
        });
        const box = h('div', { class: 'rl__bank tq-box', role: 'group', 'aria-label': 'Words to choose from' });
        g.box.forEach(w => {
          const b = h('button', { class: 'wl-btn wl-btn--secondary rl__opt tq-word', type: 'button', 'aria-pressed': 'false', lang: 'en' }, w);
          b.addEventListener('click', () => { const q = T.items[T.i].q; setAns(q, answer(q) === w ? '' : w); });
          T.boxBtns.push(b); box.append(b);
        });
        T.paint = () => {
          const cur = T.items[T.i] && T.items[T.i].q, now = cur ? answer(cur) : '';
          g.items.forEach(q => { const a = answer(q); gaps[q.id].textContent = a || String(q.n); gaps[q.id].classList.toggle('is-filled', !!a); gaps[q.id].setAttribute('aria-label', 'Gap ' + q.n + (a ? ': ' + a : '')); });
          T.boxBtns.forEach(b => { const w = b.textContent; b.setAttribute('aria-pressed', String(w === now)); b.classList.toggle('is-used', w !== now && g.items.some(q => answer(q) === w)); });
        };
        T.body.append(h('div', { class: 'wl-card tq-card tq-card--sum' }, text), box);
      } else {
        T.body.append(h('div', { class: 'wl-card tq-heads-card' }, h('p', { class: 'tq-lab' }, 'List of headings'),
          h('ul', { class: 'tq-heads' }, ...g.heads.map(x => h('li', {}, h('strong', { class: 'tq-rn' }, x.id), h('span', { lang: 'en', translate: 'no' }, ' ' + x.t))))));
        g.items.forEach(q => {
          const btns = g.heads.map(x => {
            const b = h('button', { class: 'tq-pick', type: 'button', 'aria-pressed': String(answer(q) === x.id), 'aria-label': 'Heading ' + x.id }, x.id);
            b.addEventListener('click', () => { T.i = idx(q); setAns(q, answer(q) === x.id ? '' : x.id); btns.forEach(y => y.setAttribute('aria-pressed', String(y.textContent === answer(q)))); paintActive(false); });
            return b;
          });
          const card = h('div', { class: 'wl-card tq-card', role: 'group', 'aria-label': 'Paragraph ' + q.L }, numEl(q.n), h('div', { class: 'tq-mh' }, h('p', { class: 'tq-lab' }, 'Paragraph ' + q.L), h('div', { class: 'tq-picks' }, ...btns)));
          card.addEventListener('click', () => { if (T.items[T.i].q.id !== q.id) { T.i = idx(q); paintActive(false); } });
          T.cards[q.id] = card; T.body.append(card);
        });
      }
      T.dots.textContent = '';
      g.items.forEach(q => { const d = h('button', { class: 'tq-dot', type: 'button', 'data-d': q.id, 'aria-label': 'Question ' + q.n }, String(q.n)); d.addEventListener('click', () => go(idx(q), true)); T.dots.append(d); });
    }
    function sheetFrame(cls) {
      T.ui.foot.textContent = '';
      T.hd = h('h2', { class: 'tq__title', tabindex: '-1' }); T.of = h('span', { class: 'tq__of', 'aria-live': 'polite' }); T.rule = h('p', { class: 'tq__rule' });
      T.body = h('div', { class: 'tq__body' }); T.dots = h('nav', { class: 'tq__dots', 'aria-label': 'Questions' });
      T.sheet = h('section', { class: 'tq ' + (cls || ''), 'aria-label': 'Questions' }, h('span', { class: 'tq__grab', 'aria-hidden': 'true' }), h('div', { class: 'tq__head' }, T.hd, T.of), T.rule, T.body);
      T.ui.foot.append(T.sheet);
    }
    function drawAsk() {
      sheetFrame(''); T.next = h('button', { class: 'wl-btn wl-btn--block wl-btn--primary tq__next', type: 'button', onclick: next }, 'Next question');
      T.sheet.append(T.dots, T.next);
      let first = T.items.findIndex(x => !done(x.q)); if (first < 0) first = 0;
      T.g = -1; T.i = first; drawGroup(T.items[first].g); paintActive(false); T.hd.focus({ preventScroll: true });
    }

    /* ----- finishing, the practice log and the review ----- */
    function finishSet(timeUp) {
      if (!T.run) return;
      const s = TQC.score(T.set, T.run.an); T.run.qd = 1; T.live = false;
      if (s.answered > 0 && !T.run.lg) { T.run.lg = 1; try { IE.log('r'); } catch (e) { /* IELTS practice log (169o) not loaded */ } }
      save(); try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }
      drawReview(timeUp);
    }
    function clearMark() {
      T.ui.scroll.querySelectorAll('mark.tq-line').forEach(m => { const p = m.parentNode; m.replaceWith(document.createTextNode(m.textContent)); if (p) p.normalize(); });
    }
    function showInText(q) {   // mark the line in its paragraph of the passage and scroll to it
      clearMark();
      const p = T.ui.scroll.querySelector('.tr-para[data-p="' + q.L + '"]'); if (!p) return;
      const tn = [...p.childNodes].find(n => n.nodeType === 3 && n.nodeValue.indexOf(q.line) >= 0); if (!tn) return;
      const hit = tn.splitText(tn.nodeValue.indexOf(q.line)); hit.splitText(q.line.length);
      const m = h('mark', { class: 'tq-line' }); hit.replaceWith(m); m.append(hit);
      try { m.scrollIntoView({ block: 'center' }); } catch (e) { /* the passage stays where it is */ }
    }
    function lineNodes(q) {   // the line of the passage, with the answer in bold
      if (q.k === 'mh') return [q.line];
      return [q.pre, h('strong', { class: 'tq-hit' }, Array.isArray(q.ans) ? q.ans[0] : q.ans), q.post];
    }
    const headText = (g, id) => { const x = g.heads.filter(y => y.id === id)[0]; return x ? id + ' \u00b7 ' + x.t : id; };
    function drawReview(timeUp) {
      const s = TQC.score(T.set, T.run.an); clearMark();
      sheetFrame('tq--review');
      T.hd.textContent = 'Your answers'; T.of.textContent = s.right + ' of ' + s.n + ' right';
      T.rule.textContent = timeUp ? 'Time is up. Here are your answers.' : s.right === s.n ? 'All right this time. Well done.' : 'Look at the lines in the passage whenever you like.';
      const MARK = { right: ['\u2713', 'Correct'], wrong: ['\u2715', 'Not quite'], none: ['\u2013', 'No answer'] };
      const ol = h('ol', { class: 'tq-rows' });
      s.rows.forEach(r => {
        const q = r.q, g = T.set.groups[r.g], mh = q.k === 'mh', mk = MARK[r.st];
        const shownA = r.a ? (mh ? headText(g, r.a) : r.a) : '', shownR = mh ? headText(g, q.ans) : (Array.isArray(q.ans) ? q.ans[0] : q.ans);
        const btn = h('button', { class: 'wl-btn wl-btn--secondary tq-show', type: 'button' }, 'Show in text'); btn.addEventListener('click', () => showInText(q));
        ol.append(h('li', { class: 'wl-card tq-row tq-row--' + r.st },
          h('div', { class: 'tq-row__top' }, numEl(q.n), h('span', { class: 'tq-mark' }, h('span', { 'aria-hidden': 'true' }, mk[0]), ' ', mk[1])),
          r.a ? h('p', { class: 'tq-ans' }, h('span', { class: 'tq-lab' }, 'Your answer'), ' ', h('strong', { lang: 'en', translate: 'no' }, shownA)) : null,
          q.k === 'sc' && r.st === 'wrong' && r.a.split(/\s+/).length > 2 ? h('p', { class: 'tq-ans' }, 'Use no more than two words.') : null,
          r.st !== 'right' ? h('p', { class: 'tq-ans' }, h('span', { class: 'tq-lab' }, 'Correct answer'), ' ', h('strong', { lang: 'en', translate: 'no' }, shownR)) : null,
          h('p', { class: 'tq-lab' }, 'Paragraph ' + q.L),
          h('p', { class: 'tq-lineq', lang: 'en', translate: 'no' }, '\u201c', ...lineNodes(q), '\u201d'), btn));
      });
      T.body.append(ol);
      T.sheet.append(h('button', { class: 'wl-btn wl-btn--block wl-btn--primary tq__next', type: 'button', onclick: () => T.ui.close() }, 'Done'));
      T.hd.focus({ preventScroll: true });
    }

    /* ----- called by 169q (TMR.use) ----- */
    function show(ui) {
      const r = ui && ui.run; if (!r || !Array.isArray(r.paras)) return false;
      let set = r.qs;
      if (!validSet(set)) { set = TQC.build(r.paras, { seed: String(r.bid) + '|' + r.ch + '|' + r.paras.length }); if (!set) return false; r.qs = set; r.an = {}; delete r.qd; delete r.lg; }
      if (!r.an || typeof r.an !== 'object') r.an = {};
      Object.assign(T, { ui, run: r, set, items: TQC.list(set), live: !r.qd });
      save();
      if (r.qd) drawReview(false); else drawAsk();
      return true;
    }
    function timesUp() { if (T.live && T.run && !T.run.qd) finishSet(true); }
    function off() { T.live = false; T.ui = null; T.run = null; T.set = null; T.items = []; T.cards = {}; }
    return { show, timesUp, off };
  })();
  TMR.use(TQ);
