  /* ---------- Review lesson: question types and session summary (RT) ----------
     Pure functions only: no screen, no storage, no clock, no network. The Review lesson (168) calls them. Nothing runs at start-up.
     Three question types. The type is chosen for each word from how well you know it, so a new word gets the easiest one:
       'mm'   MEANING MATCH   you see a meaning, you pick the word from a bank          (new word, or one you just forgot)    grade kind 'und'
       'fill' FILL THE BLANK  a sentence with the word cut out, pick it from a bank     (words you got right 1-2 times)        grade kind 'rcl'
       'type' TYPED RECALL    the sentence (or the meaning) is shown, you type the word  (right 3+ times in a row, or familiar) grade kind 'rcl'
     If the wanted type cannot be made for a word (no sentence, no note, nobody else to fill the bank), the next one in its list is used.
       RT.level(e)                     0 | 1 | 2 from the word's reps (right in a row) and stage. A forgotten word (Again) has reps 0, so it goes back to 0.
       RT.chain(level)                 the types to try, best first
       RT.pick(e, can)                 can = { mm, fill, type } true/false; the first type in the chain that can be made, or null
       RT.bank(w, lv, pool, text, rnd) { bank, answer } or null. The word plus up to 3 other saved words (same level first), none of which sits in `text`
       RT.fold(s)  RT.dist(a, b)       lower case without accents; edit distance (a swap of two letters counts 1)
       RT.judge(typed, w)              'ok' (same word) | 'close' (one letter off, word of 5+ letters) | 'no'
       RT.grading(kind, verdict)       { g: grade for SRS, kind: SRS kind }; 'close' is Hard (right, with effort), 'no' is Again
       RT.summary(res, planned)        { reviewed, right, again: [words], spell: [words], planned } from the answers of one session
     Helpers shared with 168: RT.str, RT.key, RT.rxWord, RT.mask, RT.shuffle. */
  const RT = (() => {
    const LET = 'A-Za-z\\u00C0-\\u024F', BANK = 4;
    const str = x => (typeof x === 'string' ? x : '');
    const key = w => str(w).trim().toLowerCase();
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rxWord = (w, flags) => new RegExp('(^|[^' + LET + '])(' + reEsc(w) + ')(?![' + LET + '])', flags || 'i');
    const mask = (t, w) => str(t).replace(rxWord(w, 'gi'), '$1_____');
    const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

    function level(e) {
      const reps = (e && typeof e.reps === 'number' && e.reps > 0) ? Math.floor(e.reps) : 0, st = e && e.st;
      if (reps >= 3 || st === 'familiar' || st === 'mastered') return 2;
      return reps >= 1 ? 1 : 0;
    }
    const CHAINS = [['mm', 'fill', 'type'], ['fill', 'mm', 'type'], ['type', 'fill', 'mm']];
    const chain = lv => CHAINS[lv] || CHAINS[0];
    function pick(e, can) { const c = chain(level(e)); for (let i = 0; i < c.length; i++) if (can && can[c[i]]) return c[i]; return null; }

    function bank(w, lv, pool, text, rnd) {
      rnd = rnd || Math.random; w = key(w); lv = str(lv);
      const seen = new Set([w]), others = [];
      (pool || []).forEach(x => {
        const k = key(x && x.w); if (!k || seen.has(k)) return; seen.add(k);
        if (text && rxWord(k).test(text)) return;   // a bank word that also sits in the text would be a second right answer
        others.push({ k, lv: str(x.lv) });
      });
      if (!others.length) return null;
      const near = shuffle(others, rnd).sort((a, b) => (b.lv === lv && lv ? 1 : 0) - (a.lv === lv && lv ? 1 : 0));   // same level first
      const bk = shuffle([w].concat(near.slice(0, BANK - 1).map(x => x.k)), rnd);
      return { bank: bk, answer: bk.indexOf(w) };
    }

    const fold = s => str(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
    function dist(a, b) {   // optimal string alignment: insert, delete, change one letter, or swap two neighbours = 1
      const n = a.length, m = b.length; if (!n) return m; if (!m) return n;
      const d = []; for (let i = 0; i <= n; i++) { d[i] = [i]; } for (let j = 1; j <= m; j++) d[0][j] = j;
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      return d[n][m];
    }
    function judge(typed, w) {
      const a = fold(typed), b = fold(w); if (!a || !b) return 'no';
      if (a === b) return 'ok';
      return (b.length >= 5 && dist(a, b) <= 1) ? 'close' : 'no';
    }

    function grading(kind, verdict) {
      const g = verdict === 'ok' ? SRS.GOOD : verdict === 'close' ? SRS.HARD : SRS.AGAIN;
      return { g, kind: kind === 'mm' ? 'und' : 'rcl' };
    }

    function summary(res, planned) {
      const r = Array.isArray(res) ? res : [], again = [], spell = []; let right = 0;
      r.forEach(x => { if (!x) return; if (x.v === 'no') again.push(x.w); else { right++; if (x.v === 'close') spell.push(x.w); } });
      return { reviewed: r.length, right, again, spell, planned: typeof planned === 'number' ? planned : r.length };
    }

    return { level, chain, pick, bank, fold, dist, judge, grading, summary, str, key, rxWord, mask, shuffle };
  })();
