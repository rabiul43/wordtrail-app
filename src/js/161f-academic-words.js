  /* ---------- Academic words and linking words: blue lines, gold marks, panel tag (AWC, AW) ----------
     Task 53. Three separate settings (Settings > Reading), each can be turned off on its own:
       P.acadHl   blue line under Academic Word List words (default OFF)
       P.linkHl   gold mark on linking words and phrases: however, moreover, therefore, in addition ... (default OFF)
       P.acadTag  the tag "Academic · Sublist 3" in the word panel (163) (default ON; read-only, nothing is drawn in the text)
     The two highlights follow Learn mode (like 161d and 161e): Standard mode draws nothing. The tag does not need Learn mode.
     Data   src/data/awl.json, put in the page by build.py as #awl-data, parsed on first use (never at start-up).
            w = [ sublist, headword, "family forms" ] (570 families, 3,112 forms). A word is tagged only when it is a listed form,
            nothing is guessed from spelling. l = linking words and phrases (our own list, not part of the AWL).
     Rules  - A linking mark wins over a blue line on the same words (furthermore, in contrast, hence are in both lists); the panel tag still says Sublist.
            - Never marked: found (past of find; founded/founder stay), max, vol (abbreviations), and a capitalised word in the middle of a
              sentence (a name: General Grant, Mr. Bond). A word at the start of a sentence is marked.
            - Chapter headings are skipped. Nothing runs on an audio tick.
     When it runs  once when a chapter has been built (awChapter, called by buildSents in 150, next to owChapter and kuChapter). Matched in slices of
            about 6 ms when the browser is idle; the answer is kept per book + chapter (8 chapters). Switching a setting repaints from that answer.
     Lines  CSS Custom Highlights wt-acad (blue line) and wt-link (gold), drawn with OW.rangeOf (161d); the sentence spans are not touched.
            A browser without the API shows no lines; the tag still works.
     Storage  none of its own: three flags in wt:prefs (synced with the settings).
       AWC.compile(data) / lookup(M, token) / match(M, text)   pure, tested by tools/academic_words_check.js
       AW.run(i) / repaint(id) / sync() / tag(word) -> { n, h } | null   (n = sublist 1-10, h = headword of the family)
       AW.model() -> { words: [ { h, n, c } ], links: [ { l, c } ] } for the open chapter (counted, most frequent first), or null
     Remove this file, its CSS, the three settings rows, the About credit, its build.py lines, the 3 small hooks (awChapter, awRepaint in 150;
     AW.sync in 169l) and the tag lines in 163 to go back. */
  const AWC = (() => {
    /*AWC-START*/
    const TOK = /\p{L}+(?:['’-]\p{L}+)*/gu;
    const norm = s => String(s).toLowerCase().replace(/’/g, "'");
    const SKIP = new Set(['found', 'max', 'vol']);
    /* data -> { forms: Map form -> { h, n }, link: RegExp | null }. Bad rows are ignored; the first family keeps a form. */
    function compile(data) {
      const forms = new Map(), d = data && typeof data === 'object' ? data : {};
      for (const r of Array.isArray(d.w) ? d.w : []) {
        if (!Array.isArray(r) || typeof r[1] !== 'string' || !(r[0] >= 1 && r[0] <= 10)) continue;
        const h = norm(r[1]);
        for (const f of [h].concat(typeof r[2] === 'string' ? r[2].split(' ') : [])) { const k = norm(f); if (k && !forms.has(k)) forms.set(k, { h, n: r[0] | 0 }); }
      }
      const ph = (Array.isArray(d.l) ? d.l : []).filter(x => typeof x === 'string' && x.trim()).map(x => norm(x).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).sort((a, b) => b.length - a.length);
      const link = ph.length ? new RegExp("(?<![\\p{L}'’-])(?:" + ph.join('|') + ")(?![\\p{L}'’-])", 'giu') : null;
      return { forms, link };
    }
    /* one token (any case) -> { h, n } or null; also foe's -> foe */
    function lookup(M, token) {
      if (!M || !M.forms) return null;
      let t = norm(token).trim();
      if (!t) return null;
      if (!M.forms.has(t) && /'s$/.test(t)) t = t.slice(0, -2);
      return SKIP.has(t) ? null : (M.forms.get(t) || null);
    }
    /* One sentence -> { acad: [ { s, e, h, n } ], link: [ { s, e } ] } (s..e = where it is in the text). */
    function match(M, text) {
      const out = { acad: [], link: [] }; text = String(text || '');
      if (!M || !M.forms) return out;
      if (M.link) { let m; M.link.lastIndex = 0; while ((m = M.link.exec(text))) out.link.push({ s: m.index, e: m.index + m[0].length }); }
      let m; TOK.lastIndex = 0;
      while ((m = TOK.exec(text))) {
        const s = m.index, e = s + m[0].length, hit = lookup(M, m[0]);
        if (!hit) continue;
        if (out.link.some(l => s >= l.s && s < l.e)) continue;   // the gold mark wins
        if (/^\p{Lu}/u.test(m[0]) && /[\p{L}\p{N},]\s*$/u.test(text.slice(0, s))) continue;   // a name in the middle of a sentence
        out.acad.push({ s, e: e - (/'s$/i.test(m[0]) && !M.forms.has(norm(m[0])) ? 2 : 0), h: hit.h, n: hit.n });
      }
      return out;
    }
    /*AWC-END*/
    return { compile, lookup, match };
  })();

  const AW = (() => {
    const st = { M: null, tried: false, cache: new Map(), tok: 0, C: null, hlA: null, hlL: null, rng: new Map() };
    const can = () => typeof Highlight !== 'undefined' && !!(window.CSS && CSS.highlights);
    const wantA = () => P.acadHl === true && learnOn(), wantL = () => P.linkHl === true && learnOn();
    const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 40));
    function lines(kind) {
      if (kind === 'a') { if (!st.hlA) { st.hlA = new Highlight(); CSS.highlights.set('wt-acad', st.hlA); } return st.hlA; }
      if (!st.hlL) { st.hlL = new Highlight(); CSS.highlights.set('wt-link', st.hlL); } return st.hlL;
    }
    function clearLines() { if (st.hlA) st.hlA.clear(); if (st.hlL) st.hlL.clear(); st.rng.clear(); }
    /* the data is read once, the first time a tag or a chapter needs it */
    function data() {
      if (!st.tried) {
        st.tried = true;
        try { st.M = AWC.compile(JSON.parse(document.getElementById('awl-data').textContent)); } catch (e) { st.M = null; /* no list: nothing is marked */ }
      }
      return st.M;
    }

    function paintId(id, C) {
      const old = st.rng.get(id);
      if (old) { for (const x of old) lines(x.k).delete(x.r); st.rng.delete(id); }
      const h = C && C.hits.get(id); if (!h || !can()) return;
      const a = wantA() ? h.acad : [], l = wantL() ? h.link : []; if (!a.length && !l.length) return;
      const sp = S.spans && S.spans.get(id), s = S.model && S.model.sents[id];
      if (!sp || !s || !sp.isConnected || sp.textContent !== s.t) return;   // not on the page, or not the same text: leave it
      const out = [];
      for (const x of a) { const r = OW.rangeOf(sp, x.s, x.e); if (r) { lines('a').add(r); out.push({ r, k: 'a' }); } }
      for (const x of l) { const r = OW.rangeOf(sp, x.s, x.e); if (r) { lines('l').add(r); out.push({ r, k: 'l' }); } }
      if (out.length) st.rng.set(id, out);
    }
    function cacheFor(i, p, bid) {
      const key = bid + '|' + i, c = st.cache.get(key);
      if (c && c.m === S.model) return c;
      const n = { m: S.model, ids: p.ids.slice(), hits: new Map(), cnt: new Map(), lcnt: new Map(), done: false };
      st.cache.set(key, n);
      if (st.cache.size > 8) st.cache.delete(st.cache.keys().next().value);
      return n;
    }
    function off() { st.tok++; clearLines(); st.C = null; }
    function run(i) {
      st.tok++; clearLines(); st.C = null;
      if (!(wantA() || wantL()) || !S.model || !S.plan || !S.book) return;
      const p = S.plan[i]; if (!p || !p.ids || !p.ids.length) return;
      const M = data(); if (!M) return;
      const tok = st.tok, C = cacheFor(i, p, String(S.book.id)); st.C = C; let pos = 0;
      const slice = () => {
        if (tok !== st.tok) return;
        const t0 = performance.now();
        while (pos < C.ids.length && performance.now() - t0 < 6) {
          const id = C.ids[pos++], s = S.model.sents[id];
          if (!C.done && s && !s.h) {
            const r = AWC.match(M, s.t);
            if (r.acad.length || r.link.length) {
              C.hits.set(id, r);
              for (const x of r.acad) C.cnt.set(x.h, { n: x.n, c: (C.cnt.get(x.h) ? C.cnt.get(x.h).c : 0) + 1 });
              for (const x of r.link) { const k = s.t.slice(x.s, x.e).toLowerCase().replace(/\s+/g, ' '); C.lcnt.set(k, (C.lcnt.get(k) || 0) + 1); }
            }
          }
          paintId(id, C);
        }
        if (pos < C.ids.length) idle(slice); else C.done = true;
      };
      idle(slice);
    }
    function repaint(id) { if (st.C && st.C.done && (wantA() || wantL())) paintId(id, st.C); }
    function model() {
      const C = st.C; if (!C || !C.done) return null;
      const words = [], links = [];
      C.cnt.forEach((v, h) => words.push({ h, n: v.n, c: v.c }));
      C.lcnt.forEach((c, l) => links.push({ l, c }));
      words.sort((a, b) => b.c - a.c || (a.h < b.h ? -1 : 1)); links.sort((a, b) => b.c - a.c || (a.l < b.l ? -1 : 1));
      return { words, links };
    }
    /* the panel tag: { n, h } for an Academic Word List word, else null (also null when the tag is switched off) */
    function tag(word) { return P.acadTag === false ? null : AWC.lookup(data(), word); }

    /* a setting changed or Learn mode was switched: matched chapter stays in memory, so this only repaints */
    function sync() {
      if (!(wantA() || wantL())) { off(); return; }
      if (st.C && st.C.done) { st.C.ids.forEach(id => paintId(id, st.C)); return; }
      if (S.model && !S.rb && S.sec != null) run(S.sec);
    }
    function wire(id, key, dflt) {
      const sw = $('#' + id); if (!sw) return;
      sw.checked = dflt ? P[key] !== false : P[key] === true;
      sw.addEventListener('change', e => { P[key] = e.target.checked; savePrefs(); sync(); });
    }
    wire('in-acadhl', 'acadHl', false); wire('in-linkhl', 'linkHl', false); wire('in-acadtag', 'acadTag', true);
    return { run, repaint, sync, tag, model };
  })();
  function awChapter(i) { AW.run(i); }
  function awRepaint(id) { AW.repaint(id); }
