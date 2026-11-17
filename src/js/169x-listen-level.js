  /* ---------- Listening level: how hard is a sentence, how well does the learner hear (LVE, LVX) ----------
     Task 6. Two questions, answered without any screen:
       1. How hard is this sentence to HEAR? `LVE.sent(text, dur, rare)` gives a number 0 (very easy) to 100 (very hard) from what makes listening hard:
          the number of words (3 to 20), the average word length, rare words, the speaking rate (words per second, from the sentence timing),
          contractions (don't, I'll: they run together when spoken) and numbers. A part that cannot be measured (no timing, no word list) is left
          out and the others share its weight, so the score is still fair.
       2. How hard a sentence can THIS learner hear? `LVE.update(state, skill, items, now)` moves the learner's level after each answered sentence
          (items = [{ d: sentence difficulty, o: outcome 0..1 }]). The level is the difficulty at which the learner gets about 80% of the words
          right. It is an Elo-style estimate: a right answer to a hard sentence moves it more than a right answer to an easy one, the step is large
          at first and small later (never more than 4 points for one sentence), and only the last 30 answers are kept.
          Skills are separate (`type` = Listen and type; later modes use their own key), each with its own level.
     The outcome of one answered sentence (`LVE.outcome(r)`): the share of words right (a word one letter off counts 0.6, an extra word 0.5 against),
     minus a little for every play after the second (0.06 each, at most 0.18), for Hint (0.1) and for Show first letters (0.15).
     A level is only used once there are 5 answers (`LVE.MIN_N`); before that the engine says "no level" and Listen and type picks as it always did.
     `LVE.word(level, ds)` turns a set of sentences into ONE plain word: Comfortable (mostly below the learner's level), Stretching (a little above:
     where learning happens) or Challenging (clearly above). It is the only thing shown to the learner: never a number, never a score, so Calm mode
     needs nothing hidden. In Calm mode the word is still shown (it is a word, not a score).
     LVX (screen part): reads and writes the small state in `wt:lvl` (this device only, not synced, not in the backup, lazily read, about 1 KB per skill),
     gives the rare-word test (Academic Word List through AW.tag, only when 161f is present) and the target for a set. Nothing runs at start-up and
     nothing runs while a screen is closed: LVX is called by Listen and type (169k) when a session opens and when it ends.
       LVE.sent(text, dur, rare)   pure: { d, n, wps, parts } (d 0..100; dur = seconds the sentence is spoken or null; rare = word -> 0..1 or null)
       LVE.outcome(r)              pure: 0..1 for one answered sentence ( r = { ok, close, wrong, miss, extra, plays, hint, first } )
       LVE.expect(level, d)        pure: the outcome a learner at `level` is expected to get on a sentence of difficulty d
       LVE.update(state, skill, items, now)   pure: new state { v, s: { skill: { l, n, ts, h: [[d, o x 100] ... last 30] } } }; the old state is not changed
       LVE.level(state, skill)     pure: { l, n } once there are MIN_N answers, else null      LVE.clean(raw)   pure: a safe state from stored text
       LVE.word(level, ds)         pure: 'Comfortable' | 'Stretching' | 'Challenging' | '' (no level or no sentences)
       LVX.target(skill)           the level to aim at, or null (no level yet)     LVX.d(text, dur)   difficulty of one sentence on this device
       LVX.rare(word)              0..1 from the Academic Word List (0 without it): Fill the gaps (169z) uses it to choose blanks
       LVX.record(skill, items)    saves a finished session     LVX.word(skill, ds)   the word for a set     LVX.get()   the state (for the Learn rows, task 5)
     Remove this file, its build.py line and the hooks in 169k (marked "level") to go back: Listen and type then picks 10 sentences by length only.
     Test: node tools/listen_level_check.js */
  const LVE = (() => {
    /*LVE-START*/
    const MIN_N = 5, KEEP = 30, INIT = 35, SPREAD = 12, HI = 1, LO = 0.3, SHIFT = 1.0, STEP_MAX = 4;
    const W = { len: 28, lng: 12, rare: 24, rate: 20, con: 9, num: 7 };   // the weights add up to 100
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const fin = x => typeof x === 'number' && isFinite(x);   // isFinite(null) is true: only real numbers count
    const num = (x, d) => (fin(x) ? x : d);
    const WORD = /[\p{L}\p{N}]+(?:['‘’ʼ`][\p{L}\p{N}]+)*/gu;
    const words = s => (s == null ? '' : String(s)).normalize('NFC').match(WORD) || [];
    const letters = w => Array.from(w.replace(/['‘’ʼ`]/g, '')).length;
    /* a long word is probably a rare word, when no word list says so: 10+ letters 0.6, 8 to 9 letters 0.25 */
    const heur = w => { const n = letters(w); return n >= 10 ? 0.6 : n >= 8 ? 0.25 : 0; };
    function sent(text, dur, rare) {
      const ws = words(text), n = ws.length;
      if (!n) return { d: 0, n: 0, wps: null, parts: {} };
      const p = {};
      p.len = clamp((n - 3) / 17, 0, 1);
      p.lng = clamp((ws.reduce((a, w) => a + letters(w), 0) / n - 3.6) / 2.4, 0, 1);
      let r = 0;
      for (const w of ws) { let v = 0; if (typeof rare === 'function') { try { v = num(rare(w), 0); } catch (e) { v = 0; } } r += Math.max(clamp(v, 0, 1), heur(w) * 0.6); }
      p.rare = clamp(r / n / 0.25, 0, 1);
      const wps = typeof dur === 'number' && isFinite(dur) && dur >= 0.8 && dur <= 40 && n >= 3 ? n / dur : null;
      p.rate = wps == null ? null : clamp((wps - 1.6) / 1.8, 0, 1);
      p.con = clamp(ws.filter(w => /['‘’ʼ`]/.test(w)).length / 3, 0, 1);
      p.num = clamp(ws.filter(w => /\p{N}/u.test(w)).length / 2, 0, 1);
      let got = 0, tot = 0;
      for (const k of Object.keys(W)) { if (p[k] == null) continue; got += W[k] * p[k]; tot += W[k]; }
      return { d: Math.round(clamp(tot ? 100 * got / tot : 0, 0, 100)), n, wps: wps == null ? null : Math.round(wps * 100) / 100, parts: p };
    }
    /* one answered sentence -> 0..1 */
    function outcome(r) {
      r = r || {};
      const ok = num(r.ok, 0), close = num(r.close, 0), wrong = num(r.wrong, 0), miss = num(r.miss, 0), extra = num(r.extra, 0), total = ok + close + wrong + miss;
      if (total <= 0) return 0;
      let a = r.v === 'ok' ? 1 : clamp((ok + 0.6 * close - 0.5 * extra) / total, 0, 1);
      a -= clamp((num(r.plays, 1) - 2) * 0.06, 0, 0.18) + (r.hint ? 0.1 : 0) + (r.first ? 0.15 : 0);
      return Math.round(clamp(a, 0, 1) * 1000) / 1000;
    }
    /* what a learner at `level` is expected to get on a sentence of difficulty d: about 0.81 at the same difficulty, 0.65 twelve points above, 0.3 at the very hard end */
    const expect = (level, d) => LO + (HI - LO) / (1 + Math.exp(-((level - d) / SPREAD + SHIFT)));
    const empty = () => ({ v: 1, s: {} });
    function clean(raw) {
      let o = raw; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
      const out = empty(); if (!o || typeof o !== 'object' || !o.s || typeof o.s !== 'object') return out;
      for (const k of Object.keys(o.s).slice(0, 12)) {
        const x = o.s[k]; if (!x || typeof x !== 'object' || !fin(x.l) || !fin(x.n)) continue;
        out.s[String(k).slice(0, 24)] = { l: clamp(+x.l, 0, 100), n: clamp(Math.round(+x.n), 0, 1e6), ts: num(x.ts, 0),
          h: (Array.isArray(x.h) ? x.h : []).filter(p => Array.isArray(p) && fin(p[0]) && fin(p[1])).slice(-KEEP).map(p => [clamp(Math.round(p[0]), 0, 100), clamp(Math.round(p[1]), 0, 100)]) };
      }
      return out;
    }
    function update(state, skill, items, now) {
      const st = clean(state), cur = st.s[skill] || { l: INIT, n: 0, ts: 0, h: [] };
      let l = cur.l, n = cur.n; const h = cur.h.slice();
      for (const it of Array.isArray(items) ? items : []) {
        if (!it || !fin(it.d) || !fin(it.o)) continue;
        const d = clamp(it.d, 0, 100), o = clamp(it.o, 0, 1), K = Math.max(4, 12 - n * 0.25);
        l = clamp(l + clamp(K * (o - expect(l, d)), -STEP_MAX, STEP_MAX), 0, 100); n++;
        h.push([Math.round(d), Math.round(o * 100)]);
      }
      st.s[skill] = { l: Math.round(l * 100) / 100, n, ts: num(now, cur.ts), h: h.slice(-KEEP) };
      return st;
    }
    const level = (state, skill) => { const x = clean(state).s[skill]; return x && x.n >= MIN_N ? { l: x.l, n: x.n } : null; };
    /* ONE word for a set of sentences (their difficulties) against the learner's level */
    function word(lv, ds) {
      const l = lv && typeof lv === 'object' ? lv.l : lv;
      const a = (Array.isArray(ds) ? ds : []).filter(fin);
      if (!fin(l) || !a.length) return '';
      const m = a.reduce((s, x) => s + x, 0) / a.length - l;
      return m <= 2 ? 'Comfortable' : m <= 9 ? 'Stretching' : 'Challenging';
    }
    /*LVE-END*/
    return { MIN_N, KEEP, INIT, W, sent, outcome, expect, empty, clean, update, level, word };
  })();

  const LVX = (() => {
    const KEY = 'wt:lvl';
    let cache = null;
    function get() {
      if (cache) return cache;
      let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { /* blocked: start empty */ }
      return (cache = LVE.clean(raw));
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* full or blocked: it still works this session */ } }
    /* the Academic Word List (161f) tells which words are rare; sublist 1 is the most common, 10 the rarest. Without 161f only word length is used. */
    function rare(w) {
      try { const t = typeof AW === 'object' && AW && AW.tag ? AW.tag(w) : null; return t && t.n ? 0.25 + 0.075 * t.n : 0; } catch (e) { return 0; }
    }
    return {
      get, rare,
      d: (text, dur) => LVE.sent(text, dur, rare).d,
      target: skill => { const lv = LVE.level(get(), skill); return lv ? lv.l : null; },
      word: (skill, ds) => LVE.word(LVE.level(get(), skill), ds),
      record: (skill, items) => { if (!items || !items.length) return; cache = null; cache = LVE.update(get(), skill, items, Date.now()); save(); }   // read fresh first, so another tab's change is kept
    };
  })();
