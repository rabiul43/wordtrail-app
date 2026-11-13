  /* ---------- Paraphrase question generator (PQ, Task 55) ----------
     No screen here. Nothing runs at start-up, nothing listens to playback, nothing touches the player. A later task (the question
     screen) calls it when the reader asks for questions. The core is pure: the book model and word data in, questions out.

     One question: a sentence from the book is shown. Pick the sentence that says the SAME thing in other words (4 choices).
       the right choice   the book sentence with ONE word swapped for a synonym from the word data (DICT, 149)
       the 3 wrong ones   the same sentence with that word swapped for a word that changes the meaning: first an antonym from the
                          word data, then another word of the same chapter with the same part of speech and no shared synonyms
     Without word data (offline, first time, the service has no entry) there are no paraphrase questions. Nothing else is lost.

     Quality filter (on top of QG.usable, 167c: 8-25 words, no headings, no debris, no digits):
       - the asked word is a plain lower-case word of the sentence, once in it; never a name (a word that is written with a capital
         anywhere inside this chapter's sentences) and never a number word (one, twelve, hundred, third ...)
       - same part of speech: the word must have ONE part of speech in its data (a word that is both noun and verb is skipped, because
         the data cannot say which one the book means); the synonym comes from that meaning; when the synonym's own data is known it
         must have that part of speech too; wrong answers must have it as well
       - the swapped word must be one plain lower-case word (no capitals, no digits, no phrase) and must fit the same spot: same ending
         (-ing, -ed, -ly, -s) and the same a/an sound before it
       - one sentence serves one question
     SPOILER GUARD, same rule as QG: only chapter <= furthest. Sentences, asked words and the wrong-answer words all come from that
     one chapter's kept sentences (QG.sentences); only the dictionary's synonyms and antonyms come from outside, and they are not book text.
     The order and the picks are seeded per book and chapter: the same data gives the same questions.

     Question shape (v 1; later tasks may read these fields, never change them):
       { v: 1, id: '<ch>:<sid>:p', type: 'para', bid, ch, sid,
         pre, post,        // the book sentence around the swapped word
         word,             // the word of the book that was swapped
         text,             // the book sentence (what the question shows)
         choices: [4 sentences], answer: index of the right one,
         syn,              // the synonym used in the right choice
         bad: [3 words],   // the words used in the wrong choices, in the order of `choices` without the right one
         ideas,            // [[word, synonym], ...] 1 to 3 swaps that fit this sentence, the asked swap first (the "Swap ideas" chips, added in Task 56)
         full }            // the book sentence again, to show after the answer
     No storage key (QG's cache is not used; DICT keeps each word on the device), so nothing to add to account sync (295).

     API (later tasks call these):
       PQ.forChapter(bid, model, ch, furthest, opts) -> Promise { ok: true, qs } or { ok: false, reason: 'locked' | 'none' }; never rejects
            opts = { max: number (default 4), lookup: async word -> word data (DICT data), wait: ms per word (default 6000) }
       PQ.build(bid, model, ch, furthest, opts)  pure: opts = { data: { word: DICT data }, max }
       PQ.words(bid, model, ch, furthest, n)     pure: the words worth looking up (the same chapter only)
       PQ.number(w), PQ.pos(data)                small helpers
     Remove this file, its build.py line and tools/paraphrase_gen_check.js to go back (QG only gained exports). */
  const PQ = (() => {
    const PQ_VER = 1, MAXQ = 4, LOOK = 20, WAIT = 6000;
    const NUMS = new Set(('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty ' +
      'sixty seventy eighty ninety hundred thousand million billion dozen first second third fourth fifth sixth seventh eighth ninth tenth twentieth hundredth thousandth ' +
      'single double triple twice thrice half').split(' '));
    const lc = w => String(w == null ? '' : w).toLowerCase();
    const one = w => /^[a-z]{4,16}$/.test(w);   // one plain lower-case word
    const shape = w => /ing$/.test(w) ? 'ing' : /ed$/.test(w) ? 'ed' : /ly$/.test(w) ? 'ly' : /(ss|us|is)$/.test(w) ? 'x' : /s$/.test(w) ? 's' : 'x';
    const number = w => NUMS.has(lc(w)) || /\d/.test(String(w));

    // every word written with a capital inside a sentence (not as its first word) is a name here
    function names(ss) {
      const n = new Set();
      ss.forEach(s => QG.toks(s.t).forEach((w, i) => { if (i > 0 && /^[A-Z]/.test(w)) n.add(lc(w)); }));
      return n;
    }
    const posList = d => d && Array.isArray(d.meanings) ? [...new Set(d.meanings.map(m => m && typeof m.pos === 'string' ? lc(m.pos).trim() : '').filter(Boolean))] : [];
    const pos = d => { const p = posList(d); return p.length === 1 ? p[0] : ''; };   // '' = none or more than one: cannot tell which the book means
    function lists(d, key, w) {   // every synonym (or antonym) of the word, one plain lower-case word each, no repeats
      const out = [], seen = new Set([w]);
      const add = a => (Array.isArray(a) ? a : []).forEach(x => { x = typeof x === 'string' ? x.trim() : ''; if (one(x) && !seen.has(x)) { seen.add(x); out.push(x); } });
      if (!d || !Array.isArray(d.meanings)) return out;
      d.meanings.forEach(m => { if (!m) return; add(m[key]); (Array.isArray(m.defs) ? m.defs : []).forEach(f => f && add(f[key])); });
      return out;
    }
    // "a" or "an" just before the swapped word must still be right
    const artOk = (before, a, b) => !/(^|[^A-Za-z])(a|an)\s+$/i.test(before) || /^[aeiou]/.test(a) === /^[aeiou]/.test(b);
    const fits = (before, a, b) => shape(a) === shape(b) && artOk(before, a, b);

    function words(bid, model, ch, furthestCh, n) {
      const ss = QG.sentences(model, ch, furthestCh);
      if (!ss.length) return [];
      const nm = names(ss), f = new Map();
      ss.forEach(s => QG.toks(s.t).forEach(w => { w = lc(w); f.set(w, (f.get(w) || 0) + 1); }));
      const r = QG.rng(QG.seedOf(bid + '|' + ch + '|pw|' + PQ_VER)), seen = new Set(), out = [];
      QG.shuffle(ss, r).forEach(s => QG.askable(s.t).forEach(w => { if (!seen.has(w) && f.get(w) <= 3 && !nm.has(w) && !number(w)) { seen.add(w); out.push(w); } }));
      return out.slice(0, n || LOOK);
    }

    function build(bid, model, ch, furthestCh, opts) {
      opts = opts || {};
      const ss = QG.sentences(model, ch, furthestCh);
      if (!ss.length) return [];
      const max = Number.isInteger(opts.max) && opts.max >= 0 ? opts.max : MAXQ, nm = names(ss), r = QG.rng(QG.seedOf(bid + '|' + ch + '|p|' + PQ_VER));
      const inCh = new Set();
      ss.forEach(s => QG.toks(s.t).forEach(w => inCh.add(lc(w))));
      // word data of words that are in THIS chapter's kept sentences, and only those
      const info = new Map();
      Object.keys(opts.data || {}).forEach(k => {
        const w = lc(k), d = opts.data[k];
        if (!inCh.has(w) || nm.has(w) || number(w) || !one(w)) return;
        const p = pos(d);
        if (p) info.set(w, { p, syn: lists(d, 'syn', w), ant: lists(d, 'ant', w) });
      });
      const known = w => { const d = opts.data && (opts.data[w] || opts.data[lc(w)]); return d ? posList(d) : null; };
      const qs = [];
      for (const s of QG.shuffle(ss, r)) {
        if (qs.length >= max) break;
        const inS = new Set(QG.toks(s.t).map(lc));
        // for one word of the sentence: its split, its data and the synonyms that fit there (null = not a usable word)
        const swaps = w => {
          const me = info.get(w), sp = me && QG.split(s.t, w);
          if (!me || !sp || nm.has(w) || number(w)) return null;
          const ok = x => one(x) && !inS.has(x) && !nm.has(x) && !number(x) && fits(sp.pre, w, x);
          // a synonym of this part of speech; when its own data is known it has that part of speech too
          const good = me.syn.filter(x => ok(x) && (!known(x) || known(x).includes(me.p)));
          return good.length ? { me, sp, ok, good } : null;
        };
        const asked = QG.shuffle(QG.askable(s.t), r);
        for (const w of asked) {
          const sw = swaps(w);
          if (!sw) continue;
          const { me, sp, ok, good } = sw;
          const right = good[Math.floor(r() * Math.min(3, good.length))], mySyn = new Set([w, ...me.syn]);
          // wrong answers: another meaning. Antonyms first, then words of this chapter with the same part of speech and no shared synonym
          const bad = [];
          const take = x => { if (bad.length < 3 && x !== right && !mySyn.has(x) && !bad.includes(x) && ok(x) && (!known(x) || known(x).includes(me.p))) bad.push(x); };
          me.ant.forEach(take);
          QG.shuffle([...info.keys()], r).forEach(x => {
            const o = info.get(x);
            if (o.p !== me.p || x === w || o.syn.includes(w) || o.syn.includes(right) || o.syn.some(y => mySyn.has(y))) return;
            take(x);
          });
          if (bad.length < 3) continue;
          // swap ideas to show after the answer: the asked swap first, then up to 2 other words of the sentence that have a fitting synonym
          const ideas = [[w, right]];
          QG.askable(s.t).forEach(w2 => { if (ideas.length < 3 && w2 !== w) { const o = swaps(w2); if (o) ideas.push([w2, o.good[0]]); } });
          const sent = x => sp.pre + x + sp.post, four = QG.shuffle([right, ...bad], r);
          qs.push({ v: PQ_VER, id: ch + ':' + s.id + ':p', type: 'para', bid: String(bid), ch, sid: s.id, pre: sp.pre, post: sp.post, word: w, text: s.t,
            choices: four.map(sent), answer: four.indexOf(right), syn: right, bad: four.filter(x => x !== right), ideas, full: s.t });
          break;   // one sentence serves one question
        }
      }
      return qs;
    }

    async function defaultLookup(w) {
      try { const r = await DICT.get(w); return r && r.ok ? r.data : null; } catch (e) { return null; }
    }
    async function lookUp(ws, lookup, wait) {
      const data = {};
      await Promise.all(ws.map(w => Promise.race([
        Promise.resolve().then(() => lookup(w)).then(d => { if (d && typeof d === 'object') data[w] = d; }, () => {}),
        new Promise(res => setTimeout(res, wait))
      ])));
      return data;
    }
    async function forChapter(bid, model, ch, furthestCh, opts) {
      opts = opts || {};
      try {
        if (!QG.guard(ch, furthestCh)) return { ok: false, reason: 'locked' };   // before anything is read or looked up
        const ws = words(bid, model, ch, furthestCh, LOOK);
        const data = ws.length ? await lookUp(ws, opts.lookup || defaultLookup, Number.isFinite(opts.wait) ? opts.wait : WAIT) : {};
        const qs = build(bid, model, ch, furthestCh, { data, max: opts.max });
        return qs.length ? { ok: true, qs } : { ok: false, reason: 'none' };
      } catch (e) { return { ok: false, reason: 'none' }; }
    }

    return { VER: PQ_VER, forChapter, build, words, number, pos };
  })();
