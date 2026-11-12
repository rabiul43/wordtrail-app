  /* ---------- Listen and type: hear one sentence, type it (LNC, LN) ----------
     Task 45. The narrator plays ONE sentence of the open track (its own start and end from the sentence timing), the learner types it in an ordinary
     text box (the phone's own keyboard) and taps Check. The answer is compared WORD BY WORD, not letter by letter: capitals, punctuation and
     apostrophes are ignored, one missing or extra word does not spoil the rest, a word with one letter wrong (5+ letters) is "close" (a spelling slip).
     A session is up to 10 sentences, taken from the sentence being heard onwards (then from the start of the track), skipping hidden / not narrated
     sentences, headings, and sentences under 3 or over 20 words. Buttons: speaker (play), turtle (play slowly, 0.7x), Hint (how many words, then how
     many letters in each), Show first letters (the first letter of each word). Help costs nothing: it is only noted in the result.
     No lives, no timer, no score to beat. A wrong answer shows the right sentence with the words to fix marked; Continue goes on.
     It reuses what the app has: shPlan / shClip (140: the sentence timing), Core.locate, seekAudio, the one <audio> element, openSheet. Echo (169h) is not
     touched. When closed in ANY way the audio goes back to the same track and second and plays again if it was playing (same rule as Echo).
     Runs only while the screen is open: a 40 ms check while a clip plays. Nothing at start-up. Playback never depends on this file.
     Task 46 (spelling): UK and US spellings are both accepted (`src/data/spelling-variants.json`, put in the page as #lt-variants by build.py; the answer panel
     and the result screen say which one was typed and that the other is also accepted). A wrong word shows its exact wrong letters (`LNC.diff`): the typed
     word struck through, the right word with the letters to fix marked, and a plain reason (missing "n" before "m"). The end screen is the "Your answers"
     screen: score ring (perfect sentences), the spelling slips, one row per word worth a look, Save N words (wrong words -> My Words), Continue.
     When a word that is already in My Words appears in a checked sentence, its review state is updated through WS.update (SRS.review, kind 'rcl':
     right = Good, one letter off = Hard, wrong or missed = Again; with Show first letters on, a right word counts as Hard). Once per word per session.
     Storage: no key of its own (results live in memory until the next session: LN.last()); My Words entries are changed only through WS.update / WS.saveWithContext.
     Setting: none. Words are in src/i18n/*.json.
     Registered in the Learn hub (169b) as the tile "Listen and type"; the same tile is in the player's "Study this chapter" sheet (169e).
       LNC.check(typed, target, V)   pure (V = LNC.variants(list), optional): { words: [{ w, v: ok|close|no|miss, t, alt? }], nVar, tw: [{ w, v: ok|close|no|extra }], extra: [typed words], ok, close, wrong, miss, nExtra, total, v: ok|near|no }
       LNC.variants(list)   pure: Map word -> [{ w, side }] from "uk|us" pairs   LNC.diff(typed, target)   pure: { tgt, typ: [{ c, bad }], n, why }
       LNC.varNote(side, target)   LNC.rows(items, max)   pure: the rows of the result screen   LNC.spell(row)   true for a spelling slip
       LNC.pickSet(texts, hidden, k, size)   pure: up to `size` indexes   LNC.pattern(target, hint, first)   LNC.spans(text)   LNC.words(text)   LNC.fold(word)
       LN.start()   opens a session at the current sentence; false (with a message) when no book text is lined up with the audio
       LN.close()   LN.on   LN.results()   [{ k, id, text, typed, v, ok, close, wrong, miss, extra, plays, hint, first }] of the session on screen
       LN.last()    { bookId, title, sec, ts, res (each also has `saved`: [{ w, v }] My Words entries updated) } of the last session that was finished or closed with at least one answer, or null
     Remove this file, 94s-listen-type.css, 28d-sheet-listen-type.html and their build.py lines to go back. */
  const LNC = (() => {
    /*LNC-START*/
    const SIZE = 10, SLOW = 0.7, MIN_W = 3, MAX_W = 20;
    const WORD = /[\p{L}\p{N}]+(?:['‘’ʼ`][\p{L}\p{N}]+)*/gu;
    const str = x => (x == null ? '' : String(x)).normalize('NFC');
    const fold = w => str(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['‘’ʼ`]/g, '');
    const words = s => str(s).match(WORD) || [];
    /* the text cut into word pieces and the pieces between them: [{ t, w }], w = index of the word, -1 for punctuation and spaces */
    function spans(s) {
      s = str(s); const out = []; let at = 0, n = 0, m; WORD.lastIndex = 0;
      while ((m = WORD.exec(s))) { if (m.index > at) out.push({ t: s.slice(at, m.index), w: -1 }); out.push({ t: m[0], w: n++ }); at = m.index + m[0].length; }
      if (at < s.length) out.push({ t: s.slice(at), w: -1 });
      return out;
    }
    function dist(a, b) {   // letters changed, added or removed; two letters swapped count 1
      const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
      const d = []; for (let i = 0; i <= n; i++) { d[i] = [i]; } for (let j = 1; j <= m; j++) d[0][j] = j;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      return d[n][m];
    }
    const rel = (t, u) => (t === u ? 'ok' : (t.length >= 5 && dist(t, u) <= 1 ? 'close' : 'no'));
    /* UK and US spellings: "uk|us" pairs -> Map(folded word -> [{ w: the other spelling, side: 'uk'|'us' of that other spelling }]) */
    function variants(list) {
      const M = new Map(), put = (a, b, side) => { const k = fold(a); if (!M.has(k)) M.set(k, []); M.get(k).push({ w: b, side }); };
      (Array.isArray(list) ? list : []).forEach(p => {
        const x = str(p).split('|'); if (x.length !== 2) return;
        const a = x[0].trim(), b = x[1].trim(); if (!a || !b || fold(a) === fold(b)) return;
        put(a, b, 'us'); put(b, a, 'uk');
      });
      return M;
    }
    const altOf = (V, t, u) => { const l = V && V.get(t); return l ? (l.find(x => fold(x.w) === u) || null) : null; };
    const varNote = (side, target) => (side === 'uk' ? 'UK' : 'US') + ' spelling · ' + (side === 'uk' ? 'US' : 'UK') + ' “' + target + '” is also accepted';
    /* the exact letters: typed word against the right word. tgt / typ = letters [{ c, bad }]; n = letters to change (two swapped letters count 1);
       why = a plain reason when there are one or two fixes */
    const fc = c => fold(c) || c;
    function diff(typed, target) {
      const a = Array.from(str(typed)), b = Array.from(str(target)), fa = a.map(fc), fb = b.map(fc), n = a.length, m = b.length;
      const D = [], O = [];
      for (let i = 0; i <= n; i++) { D[i] = []; O[i] = []; }
      D[0][0] = 0;
      for (let i = 1; i <= n; i++) { D[i][0] = i; O[i][0] = 'x'; }
      for (let j = 1; j <= m; j++) { D[0][j] = j; O[0][j] = 'm'; }
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        let best = D[i - 1][j - 1] + (fa[i - 1] === fb[j - 1] ? 0 : 1), op = fa[i - 1] === fb[j - 1] ? '=' : 's';
        if (D[i - 1][j] + 1 < best) { best = D[i - 1][j] + 1; op = 'x'; }
        if (D[i][j - 1] + 1 < best) { best = D[i][j - 1] + 1; op = 'm'; }
        if (i > 1 && j > 1 && fa[i - 1] === fb[j - 2] && fa[i - 2] === fb[j - 1] && fa[i - 1] !== fa[i - 2] && D[i - 2][j - 2] + 1 < best) { best = D[i - 2][j - 2] + 1; op = 'w'; }
        D[i][j] = best; O[i][j] = op;
      }
      const tgt = b.map(c => ({ c, bad: false })), typ = a.map(c => ({ c, bad: false })), ev = [];
      let i = n, j = m;
      while (i > 0 || j > 0) {
        const op = O[i][j];
        if (op === '=') { i--; j--; }
        else if (op === 's') { tgt[j - 1].bad = typ[i - 1].bad = true; ev.unshift({ op, i: i - 1, j: j - 1 }); i--; j--; }
        else if (op === 'w') { tgt[j - 1].bad = tgt[j - 2].bad = typ[i - 1].bad = typ[i - 2].bad = true; ev.unshift({ op, i: i - 2, j: j - 2 }); i -= 2; j -= 2; }
        else if (op === 'x') { typ[i - 1].bad = true; ev.unshift({ op, i: i - 1, j: j }); i--; }
        else { tgt[j - 1].bad = true; ev.unshift({ op, i, j: j - 1 }); j--; }
      }
      const one = e => {
        if (e.op === 'm') { const L = b[e.j], nx = b[e.j + 1]; return e.j === 0 ? 'missing “' + L + '” at the start' : (nx === undefined ? 'missing “' + L + '” at the end' : 'missing “' + L + '” before “' + nx + '”'); }
        if (e.op === 'x') return 'extra “' + a[e.i] + '”';
        if (e.op === 's') return '“' + a[e.i] + '” should be “' + b[e.j] + '”';
        return '“' + a[e.i] + a[e.i + 1] + '” should be “' + b[e.j] + b[e.j + 1] + '”';
      };
      const why = !ev.length ? '' : ev.length === 1 ? one(ev[0]) : ev.length === 2 ? one(ev[0]) + '; ' + one(ev[1]) : ev.length + ' letters to fix';
      return { tgt, typ, n: D[n][m], why };
    }
    /* compare what was typed with the sentence, word by word (the cheapest way to line the two lists up) */
    function check(typed, target, V) {
      const T = words(target), U = words(typed), n = T.length, m = U.length, tf = T.map(fold), uf = U.map(fold);
      const rel2 = (t, u) => (t === u ? 'ok' : altOf(V, t, u) ? 'var' : rel(t, u));   // 'var' = the other UK / US spelling: counts as right
      const C = [], B = [];
      for (let i = 0; i <= n; i++) { C[i] = []; B[i] = []; }
      C[0][0] = 0;
      for (let i = 1; i <= n; i++) { C[i][0] = i; B[i][0] = 't'; }
      for (let j = 1; j <= m; j++) { C[0][j] = j; B[0][j] = 'u'; }
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        const r = rel2(tf[i - 1], uf[j - 1]);
        // a wrong word that is only a letter or two away from this one (4+ letters) lines up with it before a far-away word does
        const near = r === 'no' && Math.max(tf[i - 1].length, uf[j - 1].length) >= 4 && dist(tf[i - 1], uf[j - 1]) <= 2;
        let best = C[i - 1][j - 1] + (r === 'ok' || r === 'var' ? 0 : r === 'close' ? 0.4 : near ? 0.7 : 1), b = 'd';
        if (C[i - 1][j] + 1 < best - 1e-9) { best = C[i - 1][j] + 1; b = 't'; }
        if (C[i][j - 1] + 1 < best - 1e-9) { best = C[i][j - 1] + 1; b = 'u'; }
        C[i][j] = best; B[i][j] = b;
      }
      const ws = new Array(n), tw = new Array(m), extra = [];
      let i = n, j = m;
      while (i > 0 || j > 0) {
        const b = B[i][j];
        if (b === 'd') {
          const r = rel2(tf[i - 1], uf[j - 1]), a = r === 'var' ? altOf(V, tf[i - 1], uf[j - 1]) : null;
          ws[i - 1] = { w: T[i - 1], v: r === 'var' ? 'ok' : r, t: U[j - 1] }; if (a) ws[i - 1].alt = { side: a.side };
          tw[j - 1] = { w: U[j - 1], v: r === 'var' ? 'ok' : r }; i--; j--;
        }
        else if (b === 't') { ws[i - 1] = { w: T[i - 1], v: 'miss', t: '' }; i--; }
        else { tw[j - 1] = { w: U[j - 1], v: 'extra' }; extra.unshift(U[j - 1]); j--; }
      }
      const cnt = v => ws.filter(x => x.v === v).length;
      const ok = cnt('ok'), close = cnt('close'), wrong = cnt('no'), miss = cnt('miss'), nExtra = extra.length;
      const errors = wrong + miss + nExtra;
      return { words: ws, tw, extra, ok, close, wrong, miss, nExtra, nVar: ws.filter(x => x.alt).length, total: n, v: n > 0 && errors === 0 ? (close === 0 ? 'ok' : 'near') : 'no' };
    }
    /* up to `size` sentence numbers for one session: from k to the end of the track, then from its start; texts[i] is the sentence, hidden(i) true when it is not narrated */
    function pickSet(texts, hidden, k, size) {
      const n = Array.isArray(texts) ? texts.length : 0, want = size > 0 ? size : SIZE, out = [], seen = new Set();
      const take = i => {
        if (out.length >= want || hidden(i)) return;
        const t = str(texts[i]); if (!/\p{Ll}/u.test(t)) return;   // a heading in capitals, or no letters
        const c = words(t).length, key = t.trim().toLowerCase();
        if (c < MIN_W || c > MAX_W || seen.has(key)) return;
        seen.add(key); out.push(i);
      };
      const s = Math.max(0, Math.min(k | 0, n - 1));
      for (let i = s; i < n; i++) take(i);
      for (let i = 0; i < s; i++) take(i);
      return out;
    }
    /* the hint line, one piece per word: "___" (letters), "s__" (letters and first letter) or "s…" (first letter only); [] when no hint is on */
    function pattern(target, hint, first) {
      if (!hint && !first) return [];
      return words(target).map(w => { const f = fold(w), head = first ? f.charAt(0) : '_'; return hint ? head + '_'.repeat(Math.max(0, f.length - 1)) : head + '…'; });
    }
    /* a spelling slip: one letter off, or a different word that is only a letter or two away (the typed word is there, so it was heard and written) */
    const spell = r => !!(r && r.typed && (r.v === 'close' || (r.v === 'no' && r.w.length >= 4 && r.diff && r.diff.n <= 2)));
    /* the rows of the result screen. items = [{ chk, saved: { word: 1 } }] (one per checked sentence, in order). A row is a word worth a look:
       wrong, close, missed, typed in the other UK / US spelling, or a word saved in My Words. { w, typed, v: ok|close|no|miss, diff, note, saved, spell }. */
    function rows(items, max) {
      const out = [], seen = new Set();
      (items || []).forEach(it => {
        const sv = (it && it.saved) || {};
        ((it && it.chk && it.chk.words) || []).forEach(x => {
          const isSaved = !!sv[String(x.w).toLowerCase()];
          if (x.v === 'ok' && !x.alt && !isSaved) return;
          const key = fold(x.w) + '|' + fold(x.t || '') + '|' + x.v; if (seen.has(key)) return; seen.add(key);
          const r = { w: x.w, typed: x.t || '', v: x.v, diff: null, note: x.alt ? varNote(x.alt.side, x.w) : '', saved: isSaved, spell: false };
          if (x.v === 'close' || (x.v === 'no' && x.t)) { const d = diff(x.t, x.w); if (d.n <= Math.max(2, Math.floor(Array.from(x.w).length / 2))) r.diff = d; }
          r.spell = spell(r);
          out.push(r);
        });
      });
      return max > 0 && out.length > max ? Object.assign(out.slice(0, max), { more: out.length - max }) : out;
    }
    /*LNC-END*/
    return { SIZE, SLOW, MIN_W, MAX_W, fold, words, spans, check, pickSet, pattern, variants, diff, varNote, rows, spell };
  })();

  const LN = (() => {
    const st = { on: false, p: null, set: [], i: 0, step: '', plays: 0, hint: false, first: false, snap: null, tok: 0, watch: 0, playing: false, fail: false, res: [], chk: null, graded: new Set() };
    let last = null, VM = null;
    const q = id => document.getElementById(id);
    const hid = k => { const s = S.model && st.p && S.model.sents[st.p.ids[k]]; return !s || !!s.h; };
    const kNow = () => st.set[st.i];
    const textNow = () => { const s = S.model.sents[st.p.ids[kNow()]]; return s ? s.t : ''; };
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // these moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }
    function halt() { clearInterval(st.watch); st.watch = 0; st.tok++; }
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(' · '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    const perfect = () => st.res.filter(r => r && r.v === 'ok').length;
    const vmap = () => {   // UK / US pairs from the page (#lt-variants), read once on first use
      if (!VM) { let l = []; try { l = (JSON.parse(q('lt-variants').textContent) || {}).pairs || []; } catch (e) { l = []; } VM = LNC.variants(l); }
      return VM;
    };
    const svMap = r => { const m = {}; ((r && r.saved) || []).forEach(x => { m[x.w] = 1; }); return m; };

    /* ----- exact letters: the right word with the letters to fix marked, a plain reason, the UK / US note ----- */
    const letters = a => h('b', { class: 'lt-r-c' }, ...a.map(x => (x.bad ? h('mark', { class: 'lt-l' }, x.c) : x.c)));
    function detail(r) {
      if (r.v === 'ok') return r.note ? h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-note' }, r.note)) : null;
      if (r.v === 'miss') return h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-lab' }, 'Missing word:'), ' ', h('b', { class: 'lt-r-c' }, r.w));
      const p = h('p', { class: 'lt-r-d' }, h('span', { class: 'lt-r-lab' }, 'Correct:'), ' ', letters(r.diff ? r.diff.tgt : Array.from(r.w).map(c => ({ c, bad: false }))));
      if (r.diff && r.diff.why) p.append(h('span', { class: 'lt-r-sep', 'aria-hidden': 'true' }, ' · '), h('span', { class: 'lt-r-why' }, r.diff.why));
      return p;
    }
    function paintFixes(c) {   // under the answer: one line per word to fix (exact letters) or accepted in the other spelling
      const ul = q('lt-fb-d'); ul.textContent = '';
      LNC.rows([{ chk: c, saved: {} }], 4).forEach(r => {
        const li = h('li', { class: 'lt-d ' + (r.v === 'ok' ? 'is-ok' : 'is-bad') });
        if (r.v === 'ok') li.append(h('b', { class: 'lt-r-w' }, r.typed || r.w)); else if (r.typed) li.append(h('s', { class: 'lt-r-w' }, r.typed));
        const d = detail(r); if (d) li.append(d);
        ul.append(li);
      });
      ul.hidden = !ul.children.length;
      return !ul.hidden;
    }

    /* ----- My Words: a saved word that was in the sentence gets its review updated (right = Good, one letter off = Hard, wrong or missed = Again) ----- */
    function applySaved(c) {
      const out = [];
      if (typeof WS === 'undefined' || typeof SRS === 'undefined') return out;
      const now = Date.now(), tz = -new Date().getTimezoneOffset();
      c.words.forEach(x => {
        const k = String(x.w).toLowerCase(); if (st.graded.has(k)) return;
        let e = null; try { e = WS.get(k); } catch (err) { e = null; }
        if (!e || e.ph) return;   // not saved, or a saved phrase
        st.graded.add(k);
        let g = x.v === 'ok' ? SRS.GOOD : x.v === 'close' ? SRS.HARD : SRS.AGAIN;
        if (g === SRS.GOOD && st.first) g = SRS.HARD;   // the first letters were shown: not full recall
        try { WS.update(k, t => SRS.review(t, g, now, { kind: 'rcl', tz })); try { LL.review(g !== SRS.AGAIN); } catch (err) { /* learning log (148b) not loaded */ } out.push({ w: k, v: x.v, g }); } catch (err) { /* the word stays as it was */ }
      });
      return out;
    }
    function savable() {   // wrong words (4+ letters) that are not in My Words yet
      const seen = new Set(), out = [];
      if (typeof WS === 'undefined') return out;
      st.res.filter(Boolean).forEach(r => r.chk.words.forEach(x => {
        if (x.v === 'ok') return;
        const w = String(x.w).toLowerCase(); if (seen.has(w) || Array.from(w).length < 4) return; seen.add(w);
        let e = null; try { e = WS.get(w); } catch (err) { e = null; } if (e) return;
        out.push({ w, s: r.text });
      }));
      return out.slice(0, 10);
    }
    function saveWords() {
      const l = savable(); if (!l.length) return;
      try { if (WS.all().length + l.length > 2000) { toast('My Words is full. Remove a word first.', 4000); return; } } catch (e) { /* count unknown: try anyway */ }
      l.forEach(x => { try { WS.saveWithContext(x.w, { s: x.s, bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title || '' : '' }, { ex: x.s }); } catch (e) { /* skip this word */ } });
      toast('Saved ' + l.length + (l.length === 1 ? ' word' : ' words') + ' to My Words.', 3500);
      q('lt-save').hidden = true;
    }

    /* ----- the sentence, marked ----- */
    function marked(text, ws, typedLine) {
      const f = document.createDocumentFragment();
      LNC.spans(text).forEach(sp => {
        if (sp.w < 0) { f.append(sp.t); return; }
        const v = ws[sp.w] ? ws[sp.w].v : 'ok';
        f.append(h('span', { class: 'lt-w' + (v === 'close' ? ' is-close' : (v === 'ok' ? '' : ' is-bad' + (typedLine ? ' is-strike' : ''))) }, sp.t));
      });
      return f;
    }
    const fixList = c => { const l = c.words.filter(x => x.v !== 'ok').map(x => x.w); return l.length ? 'Words to fix: ' + l.slice(0, 6).join(', ') + (l.length > 6 ? '…' : '') : ''; };

    /* ----- the screen ----- */
    function paintPlay() {
      q('lt-play').classList.toggle('is-playing', st.playing);
      q('lt-plays').textContent = st.plays ? 'Played ' + st.plays + (st.plays === 1 ? ' time' : ' times') + ' · tap 🐢 for slow' : '';
      q('lt-status').textContent = st.fail ? 'The audio did not start. Tap the speaker to try again.' : '';
    }
    function paint() {
      const end = st.step === 'end', done = st.step === 'checked', n = st.set.length;
      q('lt-title').textContent = end ? 'Your answers' : 'Type what you hear';
      q('lt-main').hidden = end; q('lt-end').hidden = !end;
      q('lt-pos').textContent = end ? '' : 'Sentence ' + (st.i + 1) + ' of ' + n; q('lt-sep').hidden = end;
      q('lt-ch').textContent = chapterOf(st.p.ids[st.set[Math.min(st.i, n - 1)]]);
      const pr = q('lt-prog'), pct = Math.round(100 * (end ? n : st.i + (done ? 1 : 0)) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      const fl = perfect(); q('lt-flame-n').textContent = String(fl); q('lt-flame').setAttribute('aria-label', fl + ' perfect so far');
      if (!end) {
        const T = textNow(), nw = LNC.words(T).length, pat = LNC.pattern(T, st.hint, st.first), pe = q('lt-pat');
        q('lt-hint-l').textContent = 'Hint: ' + nw + (nw === 1 ? ' word' : ' words');
        q('lt-hint').setAttribute('aria-pressed', String(st.hint)); q('lt-first').setAttribute('aria-pressed', String(st.first));
        q('lt-hint').disabled = q('lt-first').disabled = done;
        pe.hidden = !pat.length; pe.textContent = pat.join('   ');
        pe.setAttribute('aria-label', pat.length ? (st.first ? 'First letters: ' : 'Letters per word: ') + LNC.words(T).map((w, x) => (st.first ? LNC.fold(w).charAt(0) : String(LNC.fold(w).length))).join(', ') : '');
        q('lt-in').readOnly = done;
        q('lt-check').hidden = done; q('lt-next').hidden = !done;
        q('lt-check').disabled = !LNC.words(q('lt-in').value).length;
        q('lt-next').textContent = 'Continue';
      } else { q('lt-check').hidden = true; q('lt-next').hidden = false; q('lt-next').textContent = 'Continue'; }
      q('lt-foot').classList.toggle('is-end', end); if (!end) q('lt-save').hidden = true;
      paintPlay();
    }
    function paintFeedback(c, text) {
      const f = q('lt-fb'), foot = q('lt-foot');
      foot.classList.remove('is-ok', 'is-near', 'is-no'); foot.classList.add('is-' + c.v);
      q('lt-fb-t').textContent = c.v === 'ok' ? 'Perfect. Every word is right.' : c.v === 'near' ? 'Almost. Check the spelling of the marked words.' : 'Not quite. Here is the sentence.';
      const a = q('lt-fb-a'); a.textContent = ''; a.append(marked(text, c.words, false));
      const fx = fixList(c), s = q('lt-fb-s'), shown = paintFixes(c); s.textContent = fx; s.hidden = !fx || shown;   // the lines with exact letters say the same, in more detail
      const y = q('lt-fb-y'), yl = q('lt-fb-yl'); y.textContent = ''; y.hidden = yl.hidden = c.v === 'ok';
      if (c.v !== 'ok') y.append(marked(q('lt-in').value, c.tw, true));
      f.hidden = false;
    }
    function hideFeedback() { q('lt-fb').hidden = true; q('lt-foot').classList.remove('is-ok', 'is-near', 'is-no'); }
    function rowEl(r, n) {
      const good = r.v === 'ok';
      const li = h('li', { class: 'wl-card lt-r ' + (good ? 'is-ok' : 'is-bad') },
        h('p', { class: 'lt-r-h' }, h('span', { class: 'lt-r-n' }, String(n)),
          !good && r.typed ? h('s', { class: 'lt-r-w' }, r.typed) : h('span', { class: 'lt-r-w' }, good ? (r.typed || r.w) : r.w),
          h('span', { class: 'lt-r-i', role: 'img', 'aria-label': good ? 'Right' : 'To fix' }, good ? '✓' : '✗')));
      const d = detail(r); if (d) li.append(d);
      if (r.saved) li.append(h('p', { class: 'lt-r-sv' }, good ? 'In My Words · spelled right' : 'In My Words · it comes back in your review soon'));
      return li;
    }
    function paintScore() {   // the "Your answers" part: score ring, spelling slips, a row per word worth a look, Save N words
      const r = st.res.filter(Boolean), n = r.length, ok = r.filter(x => x.v === 'ok').length, pct = n ? Math.round(100 * ok / n) : 0;
      const items = r.map(x => ({ chk: x.chk, saved: svMap(x) })), slips = LNC.rows(items).filter(x => x.spell).length;
      q('lt-ring').style.setProperty('--p', pct + '%'); q('lt-ring-t').textContent = ok + '/' + n;
      q('lt-sc-h').textContent = pct >= 90 ? 'Great listening!' : pct >= 60 ? 'Nice work' : 'Good effort';
      q('lt-sc-s').textContent = slips ? slips + (slips === 1 ? ' spelling mistake cost you a mark' : ' spelling mistakes cost you marks') : (ok === n ? 'Every word was right.' : 'Some words were missed or different.');
      const ol = q('lt-rows'), rs = LNC.rows(items, 12); ol.textContent = ''; ol.hidden = !rs.length;
      rs.forEach((x, i) => ol.append(rowEl(x, i + 1)));
      if (rs.more) ol.append(h('li', { class: 'lt-r-more' }, '+' + rs.more + ' more'));
      const sv = savable().length, b = q('lt-save'); b.hidden = !sv; b.textContent = '★ Save ' + sv + (sv === 1 ? ' word' : ' words');
    }
    function paintEnd() {
      const r = st.res, ok = r.filter(x => x.v === 'ok').length, near = r.filter(x => x.v === 'near').length, no = r.length - ok - near;
      paintScore();
      const sum = q('lt-sum'); sum.textContent = '';
      [['is-ok', ok + ' perfect'], ['is-near', near + ' almost'], ['is-no', no + ' to practise']].forEach(x => sum.append(h('li', { class: 'wl-pill lt-sumi ' + x[0] }, x[1])));
      const bad = r.filter(x => x.v !== 'ok'), list = q('lt-prac'); list.textContent = '';
      q('lt-all').hidden = bad.length > 0; q('lt-prac-h').hidden = list.hidden = !bad.length;
      bad.forEach(x => { const li = h('li', { class: 'wl-card lt-pi' }, h('span', { class: 'lt-pi-t' }, marked(x.text, x.chk.words, false))); const fx = fixList(x.chk); if (fx) li.append(h('span', { class: 'lt-pi-f' }, fx)); list.append(li); });
    }

    /* ----- one clip: the narrator says the sentence once, from its start to the start of the next one ----- */
    function endClip() { halt(); stopAudio(); st.playing = false; paintPlay(); }
    function failed() { halt(); stopAudio(); st.playing = false; st.fail = true; paintPlay(); }
    function play(slow) {
      if (!st.on || st.step === 'end') return;
      halt(); const tok = st.tok, [a, b] = shClip(st.p, kNow());
      st.plays++; st.fail = false; st.playing = true; paintPlay();
      try {
        audio.playbackRate = slow ? LNC.SLOW : 1; quiet(() => seekAudio(a));
        const r = audio.play();
        if (r && r.catch) r.catch(e => { if (tok !== st.tok) return; try { onPlayFail(e); } catch (x) { /* ignore */ } failed(); });
      } catch (e) { failed(); return; }
      const t0 = Date.now(); let seen = false;
      st.watch = setInterval(() => {
        if (tok !== st.tok) return;
        if (!audio.paused) seen = true;
        if (seen && nowT() >= b - 0.03) endClip();
        else if (seen && audio.paused && Date.now() - t0 > 400) endClip();   // paused by hand (headphone button)
        else if (!seen && Date.now() - t0 > 5000) failed();
      }, 40);
    }

    /* ----- the steps: type, check, continue ----- */
    function newSentence() {
      st.step = 'type'; st.plays = 0; st.hint = st.first = false; st.fail = false; st.chk = null;
      const t = q('lt-in'); t.value = ''; hideFeedback();
      paint(); play(false);
    }
    function check() {
      if (!st.on || st.step !== 'type') return;
      const typed = q('lt-in').value; if (!LNC.words(typed).length) return;
      endClip();
      const T = textNow(), c = LNC.check(typed, T, vmap()), k = kNow();
      st.chk = c; st.step = 'checked';
      st.res[st.i] = { k, id: st.p.ids[k], text: T, typed, v: c.v, ok: c.ok, close: c.close, wrong: c.wrong, miss: c.miss, extra: c.nExtra, plays: st.plays, hint: st.hint, first: st.first, chk: c, saved: applySaved(c) };
      try { q('lt-in').blur(); } catch (e) { /* ignore */ }   // the keyboard goes away, so the answer panel has room
      paint(); paintFeedback(c, T);
      try { q('lt-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function next() {
      if (!st.on) return;
      if (st.step === 'end') { close(); return; }
      if (st.step !== 'checked') return;
      endClip();
      if (st.i + 1 >= st.set.length) { st.step = 'end'; try { IE.log('l'); } catch (e) { /* IELTS practice log (169o) not loaded */ } hideFeedback(); paint(); paintEnd(); try { q('lt-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }
      st.i++; newSentence();
      try { q('lt-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- open and close; the audio goes back to where it was ----- */
    function vv() {   // a phone keyboard opens: the screen follows the part that is still visible, so Check stays in reach
      const v = window.visualViewport, sh = q('sheet-lt'); if (!v || !st.on) return;
      sh.style.height = Math.round(v.height) + 'px'; sh.style.top = Math.round(v.offsetTop) + 'px';
    }
    function start() {
      if (st.on) return true;
      const p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      st.p = p;
      const texts = p.ids.map(id => { const s = S.model.sents[id]; return s ? s.t : ''; });
      const set = LNC.pickSet(texts, hid, Core.locate(p.starts, nowT() + P.nudge), LNC.SIZE);
      if (!set.length) { toast('This track has no sentences to type. Try another track.', 4000); return false; }
      st.snap = { bookId: String(S.book.id), sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.set = set; st.i = 0; st.res = []; st.playing = false; st.graded = new Set();
      stopAudio();
      openSheet('sheet-lt');
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); vv(); }
      newSentence();
      try { q('lt-in').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      halt(); stopAudio();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vv); window.visualViewport.removeEventListener('scroll', vv); }
      const sh = q('sheet-lt'); sh.style.height = ''; sh.style.top = '';
      if (st.res.some(Boolean)) last = { bookId: String(S.book ? S.book.id : ''), title: S.book ? S.book.title || '' : '', sec: S.sec, ts: Date.now(), res: st.res.filter(Boolean).map(r => Object.assign({}, r)) };
      const snap = st.snap; st.snap = null;
      if (!snap || !S.book || String(S.book.id) !== snap.bookId) return;
      try {
        if (S.sec !== snap.sec) { goTrack(snap.sec, snap.time, snap.playing, false); return; }
        quiet(() => seekAudio(snap.time));
        if (snap.playing) { const r = audio.play(); if (r && r.catch) r.catch(() => {}); }
      } catch (e) { /* the play button still works */ }
    }
    function close() { if (st.on) closeSheets(); finish(); }

    /* ----- wiring (taps and typing only) ----- */
    q('lt-x').addEventListener('click', close);
    q('lt-play').addEventListener('click', () => play(false));
    q('lt-slow').addEventListener('click', () => play(true));
    q('lt-check').addEventListener('click', check);
    q('lt-next').addEventListener('click', next);
    q('lt-save').addEventListener('click', saveWords);
    q('lt-hint').addEventListener('click', () => { if (st.on && st.step === 'type') { st.hint = !st.hint; paint(); } });
    q('lt-first').addEventListener('click', () => { if (st.on && st.step === 'type') { st.first = !st.first; paint(); } });
    q('lt-in').addEventListener('input', () => { if (st.on && st.step === 'type') q('lt-check').disabled = !LNC.words(q('lt-in').value).length; });
    q('lt-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); check(); } });
    new MutationObserver(() => { if (q('sheet-lt').hidden) finish(); }).observe(q('sheet-lt'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Listen and type', 'Study this chapter > Listen and type: the narrator plays one sentence, you type what you hear and tap Check. The answer is compared word by word. Use the turtle to hear it slowly, Hint for the number of words and letters, and Show first letters if you are stuck. A session is 10 sentences. When you close it, the audio goes back to where you were.');
    return { start, close, results: () => st.res.filter(Boolean).map(r => Object.assign({}, r)), last: () => last, get on() { return st.on; } };
  })();

  LearnHub.register({
    id: 'listentype', order: 50, icon: '✍', title: 'Listen and type', subtitle: 'Type what you hear',
    playerSubtitle: ctx => (ctx && ctx.time ? 'Starts at ' + fmt(ctx.time) : 'Type what you hear'),
    open: () => { LN.start(); }
  });
