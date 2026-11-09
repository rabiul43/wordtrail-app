  /* ---------- Word sense and word family: simple, offline guesses (SENSE) ----------
     Pure functions only: no storage, no network, no screen, no clock. Nothing runs by itself; the word panel (163) calls them.
     Both answers are GUESSES and the panel must label them so. The dictionary text itself is not changed.

       SENSE.pick(data, sentence)  data = the clean object from DICT.get (149), sentence = the sentence the word was pressed in ('' if none).
           Looks at every definition of every part of speech and counts the content words it shares with the sentence (the definition,
           its example and its synonyms count; very common words and the word itself do not). The definition with the most shared
           words wins; a tie goes to the one listed first. Returns { d, ex, pos, score, basis }:
             basis 'overlap'  at least one shared word: a best guess
             basis 'first'    nothing shared (or no sentence): the first listed definition, no evidence it fits this sentence
           Returns null when data has no definition.
       SENSE.family(word, pos, pool)  pos = parts of speech from the dictionary (list, may be empty), pool = words known on this device
           (list; may be empty). Spelling rules only: a prefix (un-, re-, dis-, ...) or a suffix (-ly, -ness, -ful, -less, -er, -ing, -ed,
           -s, ...) is taken off to find a root, and forms of that root are made with the usual spelling changes. Words of the pool that
           have the same root come first. Returns at most 6 other words, never the word itself. Some may not be real words: the panel
           says "guessed from spelling". */
  const SENSE = (() => {
    const STOP = new Set(('the and for are but not you all any can had her was one our out has him his how its may new now old see two way who '
      + 'did get let put say she too use that with have this will your from they been were what when which their there then than them these those '
      + 'into some such only over also very more most much many each just like make made does done being about after again against because before '
      + 'between both could during every other should since still through under until while would where whom whose here there once down off above '
      + 'below same own few nor yet who whom').split(/\s+/));
    const words = s => (String(s == null ? '' : s).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []).map(x => x.replace(/'s$/, ''));
    /* A light stem so that "walked", "walking" and "walks" match "walk". Not a real stemmer. */
    function stem(w) {
      if (w.length > 5 && /ing$/.test(w)) w = w.slice(0, -3);
      else if (w.length > 4 && /ied$/.test(w)) w = w.slice(0, -3) + 'y';
      else if (w.length > 4 && /ed$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 4 && /ly$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 4 && /ies$/.test(w)) w = w.slice(0, -3) + 'y';
      else if (w.length > 4 && /es$/.test(w)) w = w.slice(0, -2);
      else if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
      if (w.length > 3 && /e$/.test(w)) w = w.slice(0, -1);
      return w.length > 3 && /(.)\1$/.test(w) ? w.slice(0, -1) : w;
    }
    const content = (s, skip) => { const out = new Set(); words(s).forEach(w => { if (w.length >= 3 && !STOP.has(w)) { const t = stem(w); if (t.length >= 3 && t !== skip) out.add(t); } }); return out; };

    function pick(data, sentence) {
      const meanings = data && Array.isArray(data.meanings) ? data.meanings : [], me = stem(String(data && data.w || '').toLowerCase());
      const want = content(sentence, me);
      let best = null, i = 0;
      meanings.forEach(m => (Array.isArray(m && m.defs) ? m.defs : []).forEach(x => {
        if (!x || !x.d) return;
        const have = content([x.d, x.ex, (x.syn || []).join(' ')].join(' '), me);
        let score = 0; want.forEach(t => { if (have.has(t)) score++; });
        if (!best || score > best.score) best = { d: x.d, ex: x.ex || '', pos: m.pos || '', score, basis: 'overlap', i };
        i++;
      }));
      if (!best) return null;
      if (best.score === 0) { const m0 = meanings.find(m => m && m.defs && m.defs.length), x0 = m0 && m0.defs[0]; best = { d: x0.d, ex: x0.ex || '', pos: m0.pos || '', score: 0, basis: 'first', i: 0 }; }
      delete best.i; return best;
    }

    /* ----- word family ----- */
    const PREFIX = ['un', 're', 'dis', 'in', 'im', 'il', 'ir', 'mis', 'non', 'over', 'under', 'out', 'pre', 'sub', 'inter', 'de'];
    const SUFFIX = ['ness', 'less', 'ful', 'ment', 'ly', 'ing', 'ed', 'er', 'est', 'ish', 'able', 'ible', 'ity', 'ies', 'es', 's'];
    const VOWEL = /[aeiou]/;
    /* the spellings a root could have after a suffix is taken off: "happi" -> happy, "runn" -> run, "mov" -> move */
    function restore(r) {
      const o = [r];
      if (/i$/.test(r)) o.push(r.slice(0, -1) + 'y');
      if (/(.)\1$/.test(r) && !/(ll|ss|ff|zz)$/.test(r)) o.push(r.slice(0, -1));
      if (!/e$/.test(r)) o.push(r + 'e');
      return o;
    }
    /* All the roots a word could have, shortest-change first (the word itself is always the first one). */
    function roots(w) {
      const out = [w];
      PREFIX.forEach(p => { if (w.length >= p.length + 4 && w.startsWith(p)) { out.push(w.slice(p.length)); } });
      [...out].forEach(b => SUFFIX.forEach(s => {
        if (b.length >= s.length + 3 && b.endsWith(s) && VOWEL.test(b.slice(0, -s.length))) restore(b.slice(0, -s.length)).forEach(r => { if (r.length >= 3 && out.indexOf(r) < 0) out.push(r); });
      }));
      return out;
    }
    const isE = r => /e$/.test(r), isY = r => /[^aeiou]y$/.test(r);
    /* forms of a root by part of speech (the usual spelling changes; "-le" -> "-ly", "y" -> "i") */
    function forms(r, pos) {
      const all = !pos.length, has = p => all || pos.indexOf(p) >= 0, out = [];
      const base = isY(r) ? r.slice(0, -1) + 'i' : r;
      if (has('adjective')) { out.push(/le$/.test(r) ? r.slice(0, -1) + 'y' : base + 'ly'); out.push(base + 'ness'); }
      if (has('noun')) { out.push(/(s|x|z|ch|sh)$/.test(r) ? r + 'es' : isY(r) ? base + 'es' : r + 's'); out.push(r + 'less'); out.push(isY(r) ? base + 'ful' : r + 'ful'); }
      if (has('verb')) {
        const stemE = isE(r) ? r.slice(0, -1) : r, dbl = /[^aeiou][aeiou][^aeiouwxy]$/.test(r) && r.length <= 5 ? r + r.slice(-1) : r;
        out.push(r + (/(s|x|z|ch|sh)$/.test(r) ? 'es' : 's'), isE(r) ? r + 'd' : isY(r) ? base + 'ed' : dbl + 'ed', stemE === r ? dbl + 'ing' : stemE + 'ing', isE(r) ? r + 'r' : dbl + 'er');
      }
      if (has('adverb') && !all) out.push(r);
      return out;
    }
    function family(word, pos, pool) {
      const w = String(word == null ? '' : word).trim().toLowerCase(); if (!/^[a-z]{3,}$/.test(w)) return [];
      const ps = Array.isArray(pos) ? pos : [], known = new Set((Array.isArray(pool) ? pool : []).map(x => String(x).toLowerCase()).filter(x => /^[a-z]+$/.test(x)));
      const hit = roots(w).slice(1).find(r => known.has(r)), sure = /^(.{4,}?)(ly|ness|less|ful|ment)$/.exec(w);   // a root known on this device, else only the surest suffixes
      const root = hit || (sure ? (/i$/.test(sure[1]) ? sure[1].slice(0, -1) + 'y' : sure[1]) : w);
      const seen = new Set([w]), same = [], made = [];
      known.forEach(k => { if (!seen.has(k) && k !== w && roots(k).indexOf(root) >= 0) { seen.add(k); same.push(k); } });
      if (root !== w && !seen.has(root)) { seen.add(root); same.push(root); }
      forms(root, root === w ? ps : /(ly|ness)$/.test(w) ? ['adjective'] : /(less|ful|ment)$/.test(w) ? ['noun'] : []).forEach(f => { if (f.length >= 3 && !seen.has(f)) { seen.add(f); made.push(f); } });
      return same.sort().concat(made).slice(0, 6);
    }
    return { pick, family, stem, roots };
  })();
