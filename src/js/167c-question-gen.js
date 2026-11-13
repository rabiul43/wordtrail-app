  /* ---------- Question generator from the book text (QG) ----------
     No screen here. Nothing runs at start-up, nothing listens to playback, nothing touches the player. Later tasks (the question
     screen, Today) call it when the reader asks for questions. The core is pure: the book model in, questions out.

     Four kinds of question, all made from the book's own sentences:
       fill   a word is blanked out of a sentence; pick it from 4 words (the other 3 come from the same chapter)
       vocab  "What does <word> mean here?" in a sentence; pick the meaning from 4 (needs short definitions, see below)
     tf     true or false: a sentence shown as it is, or with ONE word changed to another word of the same chapter (same word type)
     order  event order: the chapter's recap sentences (145) shown mixed up; put them in the order of the story (3 or 4 sentences)
     Without definitions (offline, first time) there are no vocab questions; without recap sentences (the book is not open) no order question.
     That is the free fallback; nothing is lost. A sentence is used by one question only.

     Quality filter for a sentence (QG.usable): 8 to 25 words, not a heading, starts like a sentence and ends like one, no footnote or
     page debris (brackets, braces, "Footnote", "Illustration", page numbers, web links), no digits, not mostly capitals.

     SPOILER GUARD. A question may only use a chapter the reader has already reached: chapter <= furthest, where furthest is the
     furthest chapter index (QG.furthest works it out from the saved track progress). It is enforced in four places, so one slip is not enough:
       1. QG.guard(ch, furthest)            false for anything that is not a whole number inside 0..furthest
       2. QG.sentences                      returns nothing past the guard, and keeps only sentences whose own `ch` is the asked chapter
                                            (a wrong start/end range in the model cannot pull in the next chapter)
       3. QG.build                          words, wrong answers and meanings all come from that one chapter's kept sentences, never from
                                            outside definitions: a meaning is used only for a word that is in those sentences
       4. QG.forChapter                     checks the guard BEFORE the cache is read, and throws away a cached entry that is not for
                                            this chapter (key, field `ch` and every question's `ch` must agree) or whose text has changed
     tools/question_gen_check.js proves it.

     Question shape (v 1; later tasks may read these fields, never change them):
       { v: 2, id, type: 'fill' | 'vocab' | 'tf' | 'order', bid, ch, sid,   // sid = index of the sentence in the book model (model.sents)
         pre, post,                                               // the sentence around the blank (fill), the word (vocab) or the changed word (tf)
         word,                                                    // fill: the answer; vocab: the word asked about; tf: the original word ('' if unchanged)
         choices: [4 texts], answer: index of the right one,
         full: the whole sentence }
       tf:    choices ['true', 'false'] (keys, not shown text), answer 0 or 1, text = the sentence on screen, shown = the word put in
              ('' if unchanged), changed = true when a word was swapped; full is always the real sentence, to show after the answer
       order: sids = sentence indexes in story order, choices = the sentences mixed up (3 or 4), answer = for each step of the story the
              index of its sentence in choices, full = the sentences in story order joined with a space, sid = sids[0]
     Choices are words for fill and short meanings for vocab. The order is fixed per book and chapter (a seeded shuffle), so the same
     chapter gives the same questions every time and the cache never changes them behind the reader's back.

     Cache: the existing IndexedDB text cache (idb, 030), key 'qg:<book id>:<chapter>' -> { v, ch, sig, ts, vocab, rc, qs }.
       qgSig is a small fingerprint of the chapter's text: when the text changes (another source, a repair) the entry is made again.
       vocab: false means no meanings were available; it is tried again after a day. rc: recap sentences were available. Derived data: not synced, not in the backup.
       No new localStorage key, so nothing to add to account sync (295).
     Meanings come from DICT.get (149): one request per word, saved on the device, at most 8 words per chapter. Any failure = no vocab questions.

     API (later tasks call these):
       QG.forChapter(bid, model, ch, furthest, opts) -> Promise { ok: true, qs, from: 'cache' | 'new' } or { ok: false, reason: 'locked' | 'none' }
            never rejects. opts = { max: { fill, vocab, tf, order }, define: async word -> text, recap: [sentence texts], idb, now }
            recap defaults to rcList(ch) (145) when the model is the open book's; texts that are not usable sentences of THIS chapter are ignored
       QG.furthest(lp, map, span)      pure: furthest chapter index, or -1 (S.lp, S.map, S.span)
       QG.build(bid, model, ch, furthest, opts)   pure: opts = { defs: { word: text }, recap: [sentence texts], max: { fill, vocab, tf, order } }
       QG.vocabWords(bid, model, ch, furthest, n) pure: the words worth looking up
       QG.sentences, QG.usable, QG.guard, QG.key, QG.sig
     Remove this file, its build.py line and tools/question_gen_check.js to go back. */
  const QG = (() => {
    const QG_VER = 2, MAX = { fill: 6, vocab: 4, tf: 4, order: 1 }, LOOK = 8, WAIT = 6000, RETRY = 864e5;
    const qgToks = s => String(s).match(/[A-Za-z][A-Za-z'\u2019-]*/g) || [];
    const STOP = new Set(('nothing something everything anything another because through without between together himself herself myself itself themselves however whether ' +
      'always perhaps thought getting looking nobody everybody started whatever certain before after around little though people should against almost always ' +
      'again until while where there these those their them they then than what when which would could might never being having doing seemed began really ' +
      'rather quite still often within toward towards across behind beyond during myself yourself ourselves upon under over about above below other others ' +
      'every either neither again enough already ahead along among became become becomes called coming gone going taken taking comes').split(' '));
    const DEBRIS = /[\[\]{}<>^*_|\\\u00a7]|footnote|illustration|transcriber|frontispiece|https?:|www\.|\.com\b|\bpage\s+\d|\bpg\.?\s*\d|\u2026\s*\u2026/i;
    const HEAD = /^[\s"'\u201c\u2018(]*(chapter|book|part|volume|section|preface|contents|appendix|epilogue|prologue|introduction|letter)\b\s*[\divxlc.:]*\s*[.:]?\s*$/i;

    /* ---------- the guard ---------- */
    const guard = (ch, furthest) => Number.isInteger(ch) && Number.isInteger(furthest) && ch >= 0 && furthest >= 0 && ch <= furthest;

    /* The furthest chapter reached, from S.lp (furthest point per track, 0..1), S.map (first chapter of a track, -1 = no text) and S.span (last chapter).
       A finished track counts to its last chapter; a track only started counts to its first chapter (the careful side). */
    function furthest(lp, map, span) {
      let best = -1;
      if (!lp || typeof lp !== 'object' || !Array.isArray(map)) return best;
      Object.keys(lp).forEach(k => {
        const i = Number(k), p = Number(lp[k]);
        if (!Number.isInteger(i) || i < 0 || !(p > 0) || !Number.isInteger(map[i]) || map[i] < 0) return;
        let c = map[i];
        if (p >= 1 && Array.isArray(span) && Number.isInteger(span[i]) && span[i] > c) c = span[i];
        if (c > best) best = c;
      });
      return best;
    }

    /* ---------- one sentence ---------- */
    function usable(t) {
      if (typeof t !== 'string') return false;
      t = t.replace(/\s+/g, ' ').trim();
      const n = (t.match(/\S+/g) || []).length;
      if (n < 8 || n > 25) return false;
      if (DEBRIS.test(t) || /\d/.test(t) || HEAD.test(t)) return false;
      if (!/^[\s"'\u201c\u2018(]*[A-Z]/.test(t) || !/[.!?]["'\u201d\u2019)]*$/.test(t)) return false;
      const w = qgToks(t);
      if (w.length < 6) return false;
      const caps = w.filter(x => x.length > 1 && x === x.toUpperCase()).length;
      return caps / w.length < 0.3;
    }

    /* The usable sentences of ONE chapter, or [] when the guard says no. Only sentences that say they belong to this chapter are kept. */
    function sentences(model, ch, furthestCh) {
      if (!guard(ch, furthestCh) || !model || !Array.isArray(model.sents) || !Array.isArray(model.chapters)) return [];
      const c = model.chapters[ch];
      if (!c || c.front) return [];
      const out = [];
      const a = Math.max(0, c.start | 0), b = Math.min(model.sents.length, c.end | 0);
      for (let k = a; k < b; k++) {
        const s = model.sents[k];
        if (s && s.ch === ch && !s.h && usable(s.t)) out.push({ id: k, t: s.t.replace(/\s+/g, ' ').trim() });
      }
      return out;
    }

    /* ---------- seeded numbers: the same chapter always gives the same questions ---------- */
    function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function shuffle(a, r) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
    const key = (bid, ch) => 'qg:' + bid + ':' + ch;
    function qgSig(model, ch) {
      let h = 2166136261, n = 0;
      sentences(model, ch, ch).forEach(s => { n++; for (let i = 0; i < s.t.length; i++) { h ^= s.t.charCodeAt(i); h = Math.imul(h, 16777619); } });
      return n + ':' + (h >>> 0).toString(36);
    }

    /* ---------- candidate words ---------- */
    const plain = w => /^[a-z]{6,14}$/.test(w) && !STOP.has(w);
    function counts(sents) {
      const f = new Map();
      sents.forEach(s => qgToks(s.t).forEach(w => { w = w.toLowerCase(); f.set(w, (f.get(w) || 0) + 1); }));
      return f;
    }
    // words of a sentence that can be asked: written in lower case, not the first word, once in the sentence
    function askable(t) {
      const ws = qgToks(t), low = ws.map(w => w.toLowerCase()), out = [];
      ws.forEach((w, i) => { if (i > 0 && w === low[i] && plain(w) && low.indexOf(w) === low.lastIndexOf(w)) out.push(w); });
      return out;
    }
    const cls = w => /ly$/.test(w) ? 'ly' : /ing$/.test(w) ? 'ing' : /ed$/.test(w) ? 'ed' : /(tion|sion)$/.test(w) ? 'tion' : /s$/.test(w) ? 's' : 'x';
    function split(t, w) {
      const m = new RegExp('(^|[^A-Za-z])(' + w + ')(?![A-Za-z])').exec(t);
      if (!m) return null;
      const i = m.index + m[1].length;
      return { pre: t.slice(0, i), hit: m[2], post: t.slice(i + m[2].length) };
    }
    const clip = (d, n) => { d = String(d || '').replace(/\s+/g, ' ').trim(); return d.length > n ? d.slice(0, n - 1).trimEnd() + '\u2026' : d; };

    function vocabWords(bid, model, ch, furthestCh, n) {
      const ss = sentences(model, ch, furthestCh);
      if (!ss.length) return [];
      const f = counts(ss), r = rng(seedOf(bid + '|' + ch + '|w|' + QG_VER)), seen = new Set(), out = [];
      shuffle(ss, r).forEach(s => askable(s.t).forEach(w => { if (w.length >= 7 && f.get(w) <= 2 && !seen.has(w)) { seen.add(w); out.push(w); } }));
      return out.slice(0, n || LOOK);
    }

    /* ---------- build ---------- */
    function build(bid, model, ch, furthestCh, opts) {
      opts = opts || {};
      const ss = sentences(model, ch, furthestCh);
      if (!ss.length) return [];
      const mx = Object.assign({}, MAX, opts.max || {});
      const f = counts(ss), r = rng(seedOf(bid + '|' + ch + '|' + QG_VER));
      const pool = [...f.keys()].filter(plain);
      const defs = {};   // only meanings of words that are in THIS chapter's kept sentences
      Object.keys(opts.defs || {}).forEach(w => { const k = w.toLowerCase(); if (f.has(k) && opts.defs[w]) defs[k] = clip(opts.defs[w], 120); });
      const qs = [], usedA = new Set(), order = shuffle(ss, r), usedS = new Set();   // usedS: a sentence serves ONE question only
      // event order: only recap sentences that really are usable sentences of THIS chapter count; anything else in the list is ignored
      let events = [];
      if (mx.order > 0 && Array.isArray(opts.recap)) {
        const byText = new Map(ss.map(x => [x.t, x])), seen = new Set(), ev = [];
        opts.recap.forEach(x => { const m = byText.get(String(x).replace(/\s+/g, ' ').trim()); if (m && !seen.has(m.id)) { seen.add(m.id); ev.push(m); } });
        ev.sort((a, b) => a.id - b.id);
        events = ev.slice(0, 4);
        if (events.length < 3) events = [];
        events.forEach(x => usedS.add(x.id));
      }
      const mk = (type, s, word, choices, answer, sp) => ({ v: QG_VER, id: ch + ':' + s.id + ':' + type[0], type, bid: String(bid), ch, sid: s.id, pre: sp.pre, post: sp.post, word, choices, answer, full: s.t });

      // fill the blank
      for (const s of order) {
        if (qs.length >= mx.fill) break;
        if (usedS.has(s.id)) continue;
        const c = askable(s.t).filter(w => f.get(w) <= 3 && !usedA.has(w));
        if (!c.length) continue;
        const ans = c[Math.floor(r() * c.length)], inS = new Set(qgToks(s.t).map(w => w.toLowerCase()));
        const ds = pool.filter(w => w !== ans && !inS.has(w) && Math.abs(w.length - ans.length) <= 3)
          .map(w => [w, (cls(w) === cls(ans) ? 0 : 10) + Math.abs(w.length - ans.length) + r() * 3]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0]);
        const sp = split(s.t, ans);
        if (ds.length < 3 || !sp) continue;
        usedA.add(ans); usedS.add(s.id);
        const ch4 = shuffle([ans, ...ds], r);
        qs.push(mk('fill', s, ans, ch4, ch4.indexOf(ans), sp));
      }

      // vocabulary in context
      const dw = Object.keys(defs);
      if (dw.length >= 4) {
        let nv = 0;
        for (const s of order) {
          if (nv >= mx.vocab) break;
          if (usedS.has(s.id)) continue;
          const c = askable(s.t).filter(w => defs[w] && !usedA.has('v:' + w));
          if (!c.length) continue;
          const w = c[Math.floor(r() * c.length)], stem = w.slice(0, 5);
          if (defs[w].toLowerCase().indexOf(stem) >= 0) continue;   // the meaning must not give the word away
          const ds = shuffle(dw.filter(x => x !== w && x.slice(0, 5) !== stem && defs[x] !== defs[w] && defs[x].toLowerCase().indexOf(stem) < 0), r).slice(0, 3);
          const sp = split(s.t, w);
          if (ds.length < 3 || !sp) continue;
          usedA.add('v:' + w); usedS.add(s.id); nv++;
          const ch4 = shuffle([defs[w], ...ds.map(x => defs[x])], r);
          qs.push(mk('vocab', s, w, ch4, ch4.indexOf(defs[w]), sp));
        }
      }
      // true or false: the real sentence, or the same sentence with ONE word swapped for a word of the same chapter and the same kind
      let ntf = 0, wantFalse = r() < 0.5;
      for (const s of order) {
        if (ntf >= mx.tf) break;
        if (usedS.has(s.id)) continue;
        if (!wantFalse) {
          usedS.add(s.id); ntf++; wantFalse = true;
          qs.push({ v: QG_VER, id: ch + ':' + s.id + ':t', type: 'tf', bid: String(bid), ch, sid: s.id, pre: '', post: '', word: '', shown: '', changed: false, text: s.t, choices: ['true', 'false'], answer: 0, full: s.t });
          continue;
        }
        const c = askable(s.t); if (!c.length) continue;
        const ans = c[Math.floor(r() * c.length)], inS = new Set(qgToks(s.t).map(w => w.toLowerCase())), sp = split(s.t, ans);
        const ds = pool.filter(w => w !== ans && !inS.has(w) && cls(w) === cls(ans) && Math.abs(w.length - ans.length) <= 3)
          .map(w => [w, Math.abs(w.length - ans.length) + r() * 3]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0]);
        if (!ds.length || !sp) continue;
        const wrong = ds[Math.floor(r() * ds.length)];
        usedS.add(s.id); ntf++; wantFalse = false;
        qs.push({ v: QG_VER, id: ch + ':' + s.id + ':t', type: 'tf', bid: String(bid), ch, sid: s.id, pre: sp.pre, post: sp.post, word: ans, shown: wrong, changed: true, text: sp.pre + wrong + sp.post, choices: ['true', 'false'], answer: 1, full: s.t });
      }

      // event order (the sentences were picked and reserved above)
      if (events.length >= 3) {
        let mixed = events;
        for (let k = 0; k < 8 && mixed.every((x, i) => x === events[i]); k++) mixed = shuffle(events, r);
        if (mixed.every((x, i) => x === events[i])) mixed = events.slice(1).concat(events[0]);
        qs.push({ v: QG_VER, id: ch + ':' + events[0].id + ':o', type: 'order', bid: String(bid), ch, sid: events[0].id, sids: events.map(x => x.id), pre: '', post: '', word: '',
          choices: mixed.map(x => x.t), answer: events.map(x => mixed.indexOf(x)), full: events.map(x => x.t).join(' ') });
      }
      return qs;
    }

    /* ---------- meanings and the cache ---------- */
    async function defaultDefine(w) {
      try { const r = await DICT.get(w); const m = r && r.ok && r.data.meanings[0]; return (m && m.defs[0] && m.defs[0].d) || ''; } catch (e) { return ''; }
    }
    async function lookUp(words, define) {
      const defs = {};
      await Promise.all(words.map(w => Promise.race([
        Promise.resolve().then(() => define(w)).then(d => { if (d && typeof d === 'string') defs[w] = d; }, () => {}),
        new Promise(res => setTimeout(res, WAIT))
      ])));
      return defs;
    }
    function good(e, model, bid, ch, sg) {   // a saved entry is used only if it is for exactly this chapter, this text and this version
      if (!e || e.v !== QG_VER || e.ch !== ch || e.sig !== sg || !Array.isArray(e.qs) || !model || !Array.isArray(model.sents)) return false;
      const inCh = id => Number.isInteger(id) && !!model.sents[id] && model.sents[id].ch === ch;
      const n = { tf: [2], order: [3, 4] };
      return e.qs.every(q => q && q.ch === ch && q.bid === String(bid) && Array.isArray(q.choices) && (n[q.type] || [4]).includes(q.choices.length) &&
        inCh(q.sid) && (q.type !== 'order' || (Array.isArray(q.sids) && q.sids.every(inCh) && Array.isArray(q.answer))));
    }
    function recapFor(model, ch, opts) {   // the recap sentences (145) of the open book; none when the book is not the open one
      if (Array.isArray(opts.recap)) return opts.recap;
      try { if (typeof S !== 'undefined' && S && S.model === model && typeof rcList === 'function') return rcList(ch) || []; } catch (e) { /* no recap */ }
      return [];
    }
    async function forChapter(bid, model, ch, furthestCh, opts) {
      opts = opts || {};
      try {
        if (!guard(ch, furthestCh)) return { ok: false, reason: 'locked' };   // before anything is read or made
        const db = opts.idb || (typeof idb !== 'undefined' ? idb : null), sg = qgSig(model, ch), now = typeof opts.now === 'number' ? opts.now : Date.now();
        let e = null;
        try { if (db) e = await db.get(key(bid, ch)); } catch (x) { e = null; }
        const recap = recapFor(model, ch, opts), rc = recap.length >= 3;
        if (good(e, model, bid, ch, sg) && (e.vocab || now - (e.ts || 0) < RETRY) && (e.rc || !rc)) return { ok: true, qs: e.qs, from: 'cache' };
        const words = vocabWords(bid, model, ch, furthestCh, LOOK);
        const defs = words.length ? await lookUp(words, opts.define || defaultDefine) : {};
        const qs = build(bid, model, ch, furthestCh, { defs, recap, max: opts.max });
        if (!qs.length) return { ok: false, reason: 'none' };
        const vocab = qs.some(q => q.type === 'vocab');
        try { if (db) await db.set(key(bid, ch), { v: QG_VER, ch, sig: sg, ts: now, vocab, rc, qs }); } catch (x) { /* not saved: still returned */ }
        return { ok: true, qs, from: 'new' };
      } catch (e) { return { ok: false, reason: 'none' }; }
    }

    return { VER: QG_VER, guard, furthest, usable, sentences, build, vocabWords, forChapter, key, sig: qgSig, split, askable, toks: qgToks, rng, seedOf, shuffle };
  })();
