  /* ---------- Minimal pairs and connected speech: "Which word did you hear?" and "Write it in full" (SDC, SDK, SD) ----------
     Task 9. Two short drills on the narrator's own sentences, from small packs that were made offline and approved by a person (SOUND-PACKS.md,
     tools/make_sound_pack.py). No live AI call, no text-to-speech: every sound you hear is the narrator of the open book.
       Which word did you hear?  The sentence plays with ONE word missing. Two buttons: the word that was said and its minimal pair (ship / sheep). The answer is
                                 shown at once with the sound pair ("i / ee"). It trains one thing: hearing the difference.
       Write it in full          The sentence plays; a small phrase of it is one box ("going to", said "gonna"; "kind of", said "kinda"). The learner types the words in
                                 full. Graded word by word through LNC.check (the same rule as Listen and type: capitals, punctuation and apostrophes ignored, UK / US
                                 spellings both fine, one letter off = "close", an extra or missing word = wrong). After the answer: the phrase in full and how it is said fast.
     A session is up to 10 items of the TRACK THAT IS OPEN, picked by SDC.pick: sentences near the learner's level first (the level engine of 169x, skills "pair" and "full",
     each its own level), then the sounds the learner finds hardest, never two items on one sentence or the same word twice, never more than 3 of one sound.
     Packs (made with tools/make_sound_pack.py): packs/<book id>.sound-index.json lists the passages, packs/<book id>.<passage>.sound.json.gz holds one passage: its sentences
     as [key, text] rows (the key is the same hash as the translation and TFNG packs, TP.fnv) and the approved items (r: 1). The reader uses an item only when its sentence is in the
     open track (same hash) and the pack matches the open book (half of its lines found in the book). A pack with sample: true, an unreviewed pack or a pack of another version
     is REFUSED (there is no developer switch: the sample pack is for the tests). An item whose word or phrase is not in its sentence is dropped, not the whole pack.
     No pack for the book (or offline with no saved copy) = a plain message, and nothing opens. Packs are saved in the text store (idb 'texts': 'sound:<book id>' and
     'soundp:<book id>|<passage id>'), used offline and refreshed after 14 days. Nothing is fetched until the learner taps one of the two tiles, and nothing runs during playback.
     Weak sounds: every answer is noted in `wt:snd` (this device only, not synced, not in the backup, about 1 KB): the last 12 answers per sound contrast (16) and per phrase (24).
     A sound is "weak" with 5 or more answers and under 75% right; the weakest one is the Learn row subtitle: "Your weakest sound: th / s" or "Hardest to catch: gonna".
     Calm mode (P.calm): the usual line on the row and no weak-sound line at the end; the level is one word (Comfortable / Stretching / Challenging), never a number.
     Counts as a Listening session in the IELTS hub (IE.log('l') when the last item is answered). Runs only while the screen is open (a 40 ms check while a clip plays); when closed in
     ANY way the audio goes back to the same track and second and plays again if it was playing (same rule as Echo, Listen and type, Fill the gaps). The clip player is a copy of the one in
     169z (and 169k): if one is ever changed, change the others. Words from the book are marked class "sd-word" so the Bengali layer (200) never translates them ("light", "right" are in its list).
       SDC (pure, between SDC-START/END; tools/sound_drill_check.js): parse, parseIndex, where, locate, cands, pick, choices, sidOf, label, hintOf, grade, result, clean, track, weak, weakness, sub
       SDK.passages(book, sents)  -> Promise<[ pass ]>          SDS.get() / SDS.add(sid, right)   the weak-sound notes
       SD.start('p' | 'c')   SD.close()   SD.on   SD.results()   SD.last()  { kind, bookId, title, sec, ts, res } of the last session finished or closed with an answer, or null
     Registered in the Learn hub (169b) as "Which word did you hear?" and "Write it in full" (and so in the player's "Study this chapter" sheet, 169e).
     Remove this file, 94zf-sound-drill.css, 28i-sheet-sound-drill.html, the "sd-word" part of I18N_SKIP in 200 and their build.py lines to go back (the "i-m-pair" and "i-m-chunk" icons can stay).
     Test: node tools/sound_drill_check.js */
  const SDC = (() => {
    /*SDC-START*/
    const FORMAT = 'wordtrail-sound-pack', INDEX = 'wordtrail-sound-index', KEYF = 'fnv1a-utf16-base36', ID = /^[A-Za-z0-9]{1,40}$/, KEEPN = 12, WEAK_MIN = 5, WEAK_BELOW = 0.75;
    /* the same lists as tools/sound-tables.json (tools/sound_drill_check.js compares them): sound id -> label; written phrase -> how it is said fast */
    const SOUNDS = { 'i-ee': 'i / ee', 'u-oo': 'u / oo', 'a-e': 'a / e', 'a-u': 'a / u', 'e-ay': 'e / ay', 'o-oa': 'o / oa', 'th-s': 'th / s', 'th-t': 'th / t', 'v-w': 'v / w', 's-sh': 's / sh', 'ch-sh': 'ch / sh', 'l-r': 'l / r', 'p-b': 'p / b', 't-d': 't / d', 'k-g': 'k / g', 'f-p': 'f / p' };
    const CHUNKS = { 'going to': 'gonna', 'want to': 'wanna', 'wants to': 'wanna', 'got to': 'gotta', 'have to': 'hafta', 'has to': 'hasta', 'had to': 'hadda', 'used to': 'usta', 'ought to': 'oughta', 'kind of': 'kinda', 'sort of': 'sorta', 'a lot of': 'a lotta', 'lots of': 'lotsa', 'out of': 'outta', 'let me': 'lemme', 'give me': 'gimme', 'did you': 'didja', 'would have': 'woulda', 'could have': 'coulda', 'should have': 'shoulda', 'must have': 'musta', 'might have': 'mighta', 'what do you': 'whaddya', "don't know": 'dunno' };
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const csid = said => 'cs:' + String(said).replace(/[^a-z]/g, '');
    const CSLAB = {}; Object.keys(CHUNKS).forEach(c => { CSLAB[csid(CHUNKS[c])] = CHUNKS[c]; });
    const known = k => has(SOUNDS, k) || has(CSLAB, k);
    const fin = x => typeof x === 'number' && isFinite(x), int = x => Number.isInteger(x);
    const fw = s => LNC.words(s).map(LNC.fold);
    const sidOf = it => (it.k === 'p' ? it.snd : csid(it.said));
    const label = sid => (has(SOUNDS, sid) ? SOUNDS[sid] : has(CSLAB, sid) ? CSLAB[sid] : '');
    /* where the word (pair) or the phrase (connected speech) sits in its sentence: { wi: first word number, n: words } or null. A pair whose other word is in the sentence too is refused: both would be right. */
    function locate(text, it) {
      const ws = fw(text);
      if (it.k === 'p') { const i = ws.indexOf(LNC.fold(it.w)); return i < 0 || ws.indexOf(LNC.fold(it.o)) >= 0 ? null : { wi: i, n: 1 }; }
      const seq = LNC.words(it.c).map(LNC.fold), n = seq.length;
      for (let i = 0; i + n <= ws.length; i++) { let ok = true; for (let j = 0; j < n; j++) if (ws[i + j] !== seq[j]) { ok = false; break; } if (ok) return { wi: i, n }; }
      return null;
    }
    /* A parsed pack -> { ok: true, lines: [[key, text]], items: [valid approved items], meta } or { ok: false, why }. A damaged or unapproved item is left out, not the whole pack. */
    function parse(j, book, pid) {
      if (!j || typeof j !== 'object' || j.format !== FORMAT) return { ok: false, why: 'not a pack' };
      if (j.v !== 1) return { ok: false, why: 'version' };
      if (j.key !== KEYF) return { ok: false, why: 'key' };
      if (String(j.book) !== String(book) || String(j.passage) !== String(pid)) return { ok: false, why: 'book or passage' };
      if (j.sample === true) return { ok: false, why: 'sample pack' };   // never used by the reader
      if (!(j.reviewed && typeof j.reviewed.by === 'string' && j.reviewed.by.trim() && j.reviewed.by !== 'none')) return { ok: false, why: 'not reviewed' };
      if (!Array.isArray(j.lines) || j.lines.length < 3 || j.lines.length > 60) return { ok: false, why: 'lines' };
      const lines = [];
      for (const r of j.lines) { if (!(Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && r[1].trim())) return { ok: false, why: 'lines' }; lines.push([r[0], r[1]]); }
      const items = [], seen = new Set(), W = /^[a-z]{2,14}$/;
      for (const it of Array.isArray(j.items) ? j.items : []) {
        if (!it || it.r !== 1 || (it.k !== 'p' && it.k !== 'c') || !int(it.line) || it.line < 1 || it.line > lines.length) continue;
        if (typeof it.id !== 'string' || !it.id || seen.has(it.id)) continue;
        let o;
        if (it.k === 'p') { if (!(typeof it.w === 'string' && typeof it.o === 'string' && W.test(it.w) && W.test(it.o) && it.w !== it.o && has(SOUNDS, it.snd))) continue; o = { id: it.id, k: 'p', line: it.line, w: it.w, o: it.o, snd: it.snd }; }
        else { if (!(typeof it.c === 'string' && has(CHUNKS, it.c) && CHUNKS[it.c] === it.said)) continue; o = { id: it.id, k: 'c', line: it.line, c: it.c, said: it.said }; }
        const at = locate(lines[it.line - 1][1], o); if (!at) continue;
        seen.add(it.id); items.push(Object.assign(o, { wi: at.wi, n: at.n }));
      }
      if (items.length < 3) return { ok: false, why: 'few items' };
      return { ok: true, lines, items, meta: { license: String(j.license || ''), by: String(j.reviewed.by || ''), made: String(j.made || '') } };
    }
    /* The index of a book -> list of passage ids, or null. */
    function parseIndex(j, book) {
      if (!j || typeof j !== 'object' || j.format !== INDEX || j.v !== 1 || String(j.book) !== String(book) || !Array.isArray(j.passages)) return null;
      const ids = [];
      for (const p of j.passages) if (p && typeof p.id === 'string' && ID.test(p.id) && ids.indexOf(p.id) < 0) ids.push(p.id);
      return ids.length ? ids.slice(0, 20) : null;
    }
    /* Does the pack belong to the open book? sents = S.model.sents ({ t, h }), fnv = the app's hash (TP.fnv) -> { n: lines found, ok: at least half of the lines were found } */
    function where(lines, sents, fnv) {
      const at = new Set();
      for (const s of Array.isArray(sents) ? sents : []) { const t = s && !s.h && typeof s.t === 'string' ? s.t.trim() : ''; if (t) at.add(fnv(t)); }
      let n = 0; for (const l of lines) if (at.has(l[0])) n++;
      return { n, ok: n > 0 && n * 2 >= lines.length };
    }
    /* The items of the open track: texts[k] = sentence k of the track, hidden(k) true when it is not narrated. kind = 'p' | 'c' | undefined (both).
       -> [{ k, it, sid, pid }] */
    function cands(pass, texts, hidden, fnv, kind) {
      const at = new Map();
      (Array.isArray(texts) ? texts : []).forEach((t, k) => { if (hidden(k)) return; const s = String(t == null ? '' : t).trim(); if (!s) return; const h = fnv(s); if (!at.has(h)) at.set(h, k); });
      const out = [];
      for (const it of pass.items) { if (kind && it.k !== kind) continue; const k = at.get(pass.lines[it.line - 1][0]); if (k == null) continue; out.push({ k, it, sid: sidOf(it), pid: pass.id }); }
      return out;
    }
    /* Up to `size` of the candidates for one session. opt = { target (level 0..100 or null), d(c) (difficulty of its sentence), weak(c) (0..1: how hard this learner finds its sound), rnd }.
       Score = a little chance + closeness to level + 6 (slightly above: where learning happens) + the weak-sound share. No repeats (a sentence, a word), at most
       ceil(size / 3) of one sound while others are left; the set is then shuffled. Without a level and weak sounds it is a random set. */
    function pick(cs, size, opt) {
      opt = opt || {}; const rnd = typeof opt.rnd === 'function' ? opt.rnd : Math.random, want = size > 0 ? Math.floor(size) : 10, lv = fin(opt.target) ? opt.target : null;
      const sc = (Array.isArray(cs) ? cs : []).map(c => {
        let s = rnd() * 0.3;
        if (lv != null && typeof opt.d === 'function') { let d = null; try { d = opt.d(c); } catch (e) { d = null; } if (fin(d)) s += 1 - Math.min(1, Math.abs(d - (lv + 6)) / 50); }
        if (typeof opt.weak === 'function') { let w = 0; try { w = +opt.weak(c) || 0; } catch (e) { w = 0; } s += 0.9 * Math.max(0, Math.min(1, w)); }
        return { c, s };
      }).sort((a, b) => b.s - a.s);
      const cap = Math.max(2, Math.ceil(want / 3)), out = [], line = new Set(), used = new Set(), per = {};
      const tk = c => (c.it.k === 'p' ? 'p:' + LNC.fold(c.it.w) : 'c:' + c.it.c);
      const pass = lim => { for (const x of sc) { const c = x.c; if (out.length >= want) return; if (out.indexOf(c) >= 0 || line.has(c.k) || used.has(tk(c)) || (per[c.sid] || 0) >= lim) continue; out.push(c); line.add(c.k); used.add(tk(c)); per[c.sid] = (per[c.sid] || 0) + 1; } };
      pass(cap); pass(Infinity);
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    }
    const choices = (it, rnd) => ((typeof rnd === 'function' ? rnd : Math.random)() < 0.5 ? [it.o, it.w] : [it.w, it.o]);
    /* one placeholder per word of the phrase: letters as underscores ("going to" -> "_____ __") */
    const hintOf = c => String(c).split(' ').map(w => '_'.repeat(Math.max(1, Array.from(LNC.fold(w)).length))).join(' ');
    /* grade one item: pair -> picked a word; connected speech -> typed words. -> { v: 'ok' | 'near' | 'no', chk (connected speech only) } */
    function grade(it, answer, V) {
      if (it.k === 'p') return { v: LNC.fold(answer) === LNC.fold(it.w) ? 'ok' : 'no' };
      const typed = String(answer == null ? '' : answer).trim(); if (!typed) return { v: 'no', chk: LNC.check('', it.c, V) };
      const c = LNC.check(typed, it.c, V); return { v: c.v === 'ok' ? 'ok' : c.v === 'near' ? 'near' : 'no', chk: c };
    }
    /* the record LVE.outcome (169x) takes, for one answered item */
    function result(it, g, plays, hint) {
      if (it.k === 'p') return { ok: g.v === 'ok' ? 1 : 0, close: 0, wrong: g.v === 'ok' ? 0 : 1, miss: 0, extra: 0, plays: plays || 1, hint: false, first: false, v: g.v };
      const c = g.chk; return { ok: c.ok, close: c.close, wrong: c.wrong, miss: c.miss, extra: c.nExtra || 0, plays: plays || 1, hint: !!hint, first: false, v: g.v };
    }
    /* weak-sound notes: { v: 1, s: { sid: { h: last answers as 1 / 0 (12 at most), ts } } }; only known sounds and phrases are kept, so the state cannot grow */
    function clean(raw) {
      let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
      const out = { v: 1, s: {} }; if (!o || typeof o !== 'object' || !o.s || typeof o.s !== 'object') return out;
      for (const k of Object.keys(o.s)) { const x = o.s[k]; if (known(k) && x && typeof x.h === 'string' && /^[01]{1,12}$/.test(x.h)) out.s[k] = { h: x.h, ts: fin(x.ts) ? x.ts : 0 }; }
      return out;
    }
    function track(state, sid, right, now) {
      const st = clean(state); if (!known(sid)) return st;
      const cur = st.s[sid] || { h: '', ts: 0 }; st.s[sid] = { h: (cur.h + (right ? '1' : '0')).slice(-KEEPN), ts: fin(now) ? now : cur.ts };
      return st;
    }
    const rate = x => { let n = 0; for (const c of x.h) if (c === '1') n++; return n / x.h.length; };
    /* the weakest sound (kind 'p') or phrase (kind 'c'): 4 or more answers, under 80% right; ties go to the one practised last. -> { sid, label, rate } or null */
    function weak(state, kind) {
      const st = clean(state); let best = null;
      for (const k of Object.keys(st.s)) {
        if ((kind === 'c') !== (k.indexOf('cs:') === 0)) continue;
        const x = st.s[k]; if (x.h.length < WEAK_MIN) continue; const r = rate(x); if (r >= WEAK_BELOW) continue;
        if (!best || r < best.rate - 1e-9 || (Math.abs(r - best.rate) < 1e-9 && x.ts > best.ts)) best = { sid: k, rate: r, ts: x.ts };
      }
      return best ? { sid: best.sid, label: label(best.sid), rate: Math.round(best.rate * 100) / 100 } : null;
    }
    const weakness = (state, sid) => { const x = clean(state).s[sid]; return !x || x.h.length < 3 ? 0 : 1 - rate(x); };
    /* the Learn row line. kind 'p' | 'c'; s = { calm, weak: { label } | null }. No data or Calm mode: the usual line. */
    function sub(kind, s) {
      s = s || {}; const usual = kind === 'c' ? 'Hear it fast, write it in full' : 'Tell similar words apart';
      if (s.calm === true || !s.weak || !s.weak.label) return usual;
      return (kind === 'c' ? 'Hardest to catch: ' : 'Your weakest sound: ') + s.weak.label;
    }
    /*SDC-END*/
    return { FORMAT, INDEX, SOUNDS, CHUNKS, csid, parse, parseIndex, where, locate, cands, pick, choices, sidOf, label, hintOf, grade, result, clean, track, weak, weakness, sub };
  })();

  /* ----- weak-sound notes on this device (wt:snd) ----- */
  const SDS = (() => {
    const KEY = 'wt:snd'; let cache = null;
    const get = () => { if (cache) return cache; let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { /* blocked: start empty */ } return (cache = SDC.clean(raw)); };
    const add = (sid, right) => { cache = SDC.track(get(), sid, right, Date.now()); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* full or blocked: it still works this session */ } };
    return { get, add };
  })();

  /* ----- the packs of a book (a copy of the way 167h reads TFNG packs; fetched only when a tile is tapped) ----- */
  const SDK = (() => {
    const CFG = { fetch: 10000, fresh: 14 * 24 * 3600e3, miss: 10 * 60e3 }, st = { busy: new Map(), miss: new Map() }, enc = encodeURIComponent;
    const iname = b => 'packs/' + enc(b) + '.sound-index.json', pname = (b, id) => 'packs/' + enc(b) + '.' + enc(id) + '.sound.json.gz';
    async function remote(file, parse) {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), CFG.fetch);
      try { const r = await fetchText(file, ctl.signal); clearTimeout(to); return r && r.ok ? parse(await TPK.readJson(r)) : null; } catch (e) { clearTimeout(to); return null; }
    }
    function once(key, work) {   // one request at a time per file; a miss is not asked again for 10 minutes
      if (st.busy.has(key)) return st.busy.get(key);
      const m = st.miss.get(key); if (m && Date.now() - m < CFG.miss) return Promise.resolve(null);
      const p = work().then(v => { if (!v) st.miss.set(key, Date.now()); return v; }, () => { st.miss.set(key, Date.now()); return null; });
      st.busy.set(key, p); p.then(() => st.busy.delete(key)); return p;
    }
    const index = book => once('i|' + book, async () => {
      let d = null; try { d = await idb.get('sound:' + book); } catch (e) { d = null; }
      if (!(d && d.v === 1 && Array.isArray(d.ids) && Date.now() - (d.fetched || 0) < CFG.fresh)) {
        const ids = await remote(iname(book), j => SDC.parseIndex(j, book));
        if (ids) { d = { v: 1, ids, fetched: Date.now() }; try { idb.set('sound:' + book, d); } catch (e) { /* not saved */ } }
      }
      return d && d.v === 1 && Array.isArray(d.ids) && d.ids.length ? d.ids : null;
    });
    const passage = (book, id) => once('p|' + book + '|' + id, async () => {
      const key = 'soundp:' + book + '|' + id; let d = null; try { d = await idb.get(key); } catch (e) { d = null; }
      if (!(d && d.v === 1 && Array.isArray(d.lines) && Array.isArray(d.items) && Date.now() - (d.fetched || 0) < CFG.fresh)) {
        const p = await remote(pname(book, id), j => { const r = SDC.parse(j, book, id); return r.ok ? r : null; });
        if (p) { d = { v: 1, lines: p.lines, items: p.items, meta: p.meta, fetched: Date.now() }; try { idb.set(key, d); } catch (e) { /* not saved */ } }
      }
      return d && d.v === 1 && Array.isArray(d.lines) && d.items.length >= 3 ? { id, lines: d.lines, items: d.items, meta: d.meta || {} } : null;
    });
    /* every usable passage of the book (the pack matches the book: half of its lines are sentences of it) */
    async function passages(book, sents) {
      const ids = await index(book); if (!ids) return [];
      return (await Promise.all(ids.map(id => passage(book, id)))).filter(p => p && SDC.where(p.lines, sents, TP.fnv).ok);
    }
    return { passages, _t: { st, CFG } };
  })();

  const SD = (() => {
    const st = { on: false, busy: false, mode: 'p', p: null, cs: [], i: 0, step: '', plays: 0, hint: false, snap: null, tok: 0, watch: 0, playing: false, fail: false, res: [], dif: {}, word: '', typed: '', picked: '' };
    let last = null, VM = null;
    const q = id => document.getElementById(id), ui = (t, a) => h('span', Object.assign({ class: 'wt-ui' }, a || {}), t), wd = (tag, t, c) => h(tag, { class: 'sd-word' + (c ? ' ' + c : ''), lang: 'en' }, t);
    const cur = () => st.cs[Math.min(st.i, st.cs.length - 1)];
    const kNow = () => cur().k;
    const textNow = () => { const s = S.model.sents[st.p.ids[kNow()]]; return s ? s.t : ''; };
    const skill = () => (st.mode === 'p' ? 'pair' : 'full');
    const inp = () => q('sd-sent').querySelector('input.sd-gap');
    function quiet(f) { S.quietJump = true; try { f(); } finally { S.quietJump = false; } }   // these moves are not "jumps" for the jump history (060)
    function stopAudio() { try { if (!audio.paused) audio.pause(); } catch (e) { /* nothing to stop */ } try { audio.playbackRate = P.speed; } catch (e) { /* ignore */ } }
    function halt() { clearInterval(st.watch); st.watch = 0; st.tok++; }
    function chapterOf(id) {
      try { const c = S.model.chapters && S.model.chapters.find(x => id >= x.start && id < x.end); return [S.book.title, c && c.title].filter(Boolean).join(' · '); } catch (e) { return S.book ? S.book.title : ''; }
    }
    const perfect = () => st.res.filter(r => r && r.v === 'ok').length;
    const vmap = () => { if (!VM) { let l = []; try { l = (JSON.parse(q('lt-variants').textContent) || {}).pairs || []; } catch (e) { l = []; } VM = LNC.variants(l); } return VM; };
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };

    /* ----- the sentence: a gap that shows nothing (pairs) or one box for the phrase (connected speech) ----- */
    function buildSentence(filled) {
      const box = q('sd-sent'), c = cur(), it = c.it; box.textContent = '';
      const sp = LNC.spans(textNow()), a = sp.findIndex(x => x.w === it.wi), b = sp.findIndex(x => x.w === it.wi + it.n - 1);
      if (a < 0 || b < a) { box.append(textNow()); return; }
      sp.slice(0, a).forEach(x => box.append(x.t));
      if (st.mode === 'p') box.append(filled ? wd('b', it.w, 'sd-got') : h('span', { class: 'sd-blank', role: 'img', 'aria-label': 'blank' }, '\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'));
      else {
        const i = h('input', { class: 'sd-gap sd-word', type: 'text', maxlength: '60', lang: 'en', dir: 'ltr', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'The words in full' });
        i.addEventListener('input', () => { if (st.on && st.step === 'type') paintCheck(); });
        i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); check(); } });
        box.append(i);
      }
      sp.slice(b + 1).forEach(x => box.append(x.t));
    }
    function buildOptions() {
      const box = q('sd-opts'); box.textContent = '';
      SDC.choices(cur().it).forEach(w => {
        const bt = h('button', { class: 'wl-btn sd-opt sd-word', type: 'button', lang: 'en', 'data-w': w }, w);
        bt.addEventListener('click', () => answer(w)); box.append(bt);
      });
    }
    const paintCheck = () => { q('sd-check').disabled = !(inp() && LNC.words(inp().value).length); };
    function paintHint() { const i = inp(); if (i) i.placeholder = st.hint ? SDC.hintOf(cur().it.c) : ''; }
    function paintPlay() {
      q('sd-play').classList.toggle('is-playing', st.playing);
      q('sd-plays').textContent = st.plays ? 'Played ' + st.plays + (st.plays === 1 ? ' time' : ' times') : '';
      q('sd-status').textContent = st.fail ? 'The audio did not start. Tap the speaker to try again.' : '';
    }
    function paint() {
      const end = st.step === 'end', done = st.step === 'checked', n = st.cs.length, pair = st.mode === 'p';
      q('sd-title').textContent = end ? 'Your answers' : pair ? 'Which word did you hear?' : 'Write it in full';
      q('sd-main').hidden = end; q('sd-end').hidden = !end;
      q('sd-pos').textContent = end ? '' : 'Sentence ' + (st.i + 1) + ' of ' + n; q('sd-sep').hidden = end;
      q('sd-ch').textContent = chapterOf(st.p.ids[kNow()]);
      q('sd-lv').textContent = end ? '' : st.word; q('sd-lv-w').hidden = end || !st.word;   // level: one word, never a number
      const pr = q('sd-prog'), pct = Math.round(100 * (end ? n : st.i + (done ? 1 : 0)) / n);
      pr.setAttribute('aria-valuenow', String(pct)); pr.style.setProperty('--wl-p', pct + '%');
      const fl = perfect(); q('sd-flame-n').textContent = String(fl); q('sd-flame').setAttribute('aria-label', fl + ' perfect so far');
      q('sd-prompt').textContent = pair ? 'Choose the word you heard.' : 'Type the words in full.';
      q('sd-opts').hidden = !pair; q('sd-hint').hidden = pair;
      if (!end) {
        q('sd-hint').setAttribute('aria-pressed', String(st.hint)); q('sd-hint').disabled = done;
        const i = inp(); if (i) i.readOnly = done;
        q('sd-check').hidden = pair || done; q('sd-next').hidden = !done; if (!pair) paintCheck();
      } else { q('sd-check').hidden = true; q('sd-next').hidden = false; }
      q('sd-foot').classList.toggle('is-end', end);
      paintPlay();
    }
    function marked(text, it, v) {   // the whole sentence; the word or phrase is marked right / close / wrong
      const f = document.createDocumentFragment(), sp = LNC.spans(text);
      sp.forEach(x => {
        const on = x.w >= it.wi && x.w < it.wi + it.n;
        f.append(on ? h('span', { class: 'lt-w' + (v === 'ok' ? '' : v === 'near' ? ' is-close' : ' is-bad') }, x.t) : x.t);
      });
      return f;
    }
    function paintFeedback(r) {
      const it = r.it, foot = q('sd-foot'), v = r.v; foot.classList.remove('is-ok', 'is-near', 'is-no'); foot.classList.add('is-' + v);
      q('sd-fb-t').textContent = it.k === 'p' ? (v === 'ok' ? 'Right. You heard it.' : 'Not quite. Listen again.') : (v === 'ok' ? 'Perfect. Written in full.' : v === 'near' ? 'Almost. Check the spelling.' : 'Not quite. Here is the sentence.');
      const a = q('sd-fb-a'); a.textContent = ''; a.append(marked(r.text, it, v));
      const ul = q('sd-fb-d'); ul.textContent = '';
      const li = (...kids) => ul.append(h('li', { class: 'lt-d' }, ...kids));
      if (it.k === 'p') {
        if (v !== 'ok') li(ui('The word was:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.w, 'lt-r-c'), ' · ', ui('You chose:', { class: 'wt-ui lt-r-lab' }), ' ', wd('s', r.picked));
        li(ui('Sound pair:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.w + ' / ' + it.o, 'lt-r-c'), ' · ', wd('span', SDC.label(it.snd)));
      } else {
        li(ui('In full:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.c, 'lt-r-c'));
        li(ui('Said fast it can sound like:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.said, 'lt-r-c'));
        if (v !== 'ok' && r.typed) li(ui('You wrote:', { class: 'wt-ui lt-r-lab' }), ' ', wd('s', r.typed));
      }
      ul.hidden = !ul.children.length; q('sd-fb').hidden = false;
    }
    function hideFeedback() { q('sd-fb').hidden = true; q('sd-foot').classList.remove('is-ok', 'is-near', 'is-no'); }
    function rowEl(r, n) {
      const it = r.it, li = h('li', { class: 'wl-card lt-r is-bad' },
        h('p', { class: 'lt-r-h' }, h('span', { class: 'lt-r-n' }, String(n)), wd('span', it.k === 'p' ? it.w + ' / ' + it.o : it.c, 'lt-r-w'),
          h('span', { class: 'lt-r-i', role: 'img', 'aria-label': 'To fix' }, '✗')));
      li.append(it.k === 'p'
        ? h('p', { class: 'lt-r-d' }, ui('The word was:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.w, 'lt-r-c'), ' · ', ui('You chose:', { class: 'wt-ui lt-r-lab' }), ' ', wd('s', r.picked))
        : h('p', { class: 'lt-r-d' }, ui('In full:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.c, 'lt-r-c'), ' · ', ui('Said fast it can sound like:', { class: 'wt-ui lt-r-lab' }), ' ', wd('b', it.said, 'lt-r-c')));
      return li;
    }
    function paintEnd() {
      const r = st.res.filter(Boolean), n = r.length, ok = r.filter(x => x.v === 'ok').length, pct = n ? Math.round(100 * ok / n) : 0;
      q('sd-ring').style.setProperty('--p', pct + '%'); q('sd-ring-t').textContent = ok + '/' + n;
      q('sd-sc-h').textContent = pct >= 90 ? 'Great listening!' : pct >= 60 ? 'Nice work' : 'Good effort';
      q('sd-sc-s').textContent = ok === n ? 'Every answer was right.' : 'Some answers were different. Here they are.';
      const bad = r.filter(x => x.v !== 'ok'), ol = q('sd-rows'); ol.textContent = ''; ol.hidden = !bad.length;
      bad.slice(0, 12).forEach((x, i) => ol.append(rowEl(x, i + 1)));
      if (bad.length > 12) ol.append(h('li', { class: 'lt-r-more' }, '+' + (bad.length - 12) + ' more'));
      const w = !calm() ? SDC.weak(SDS.get(), st.mode) : null, p = q('sd-weak'); p.textContent = ''; p.hidden = !w;
      if (w) p.append(ui(st.mode === 'p' ? 'Your weakest sound so far:' : 'Hardest to catch so far:'), ' ', wd('b', w.label));
    }

    /* ----- one clip: the narrator says the sentence once, from its start to the start of the next one (a copy of the player in 169z) ----- */
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

    /* ----- the steps: answer, continue ----- */
    function newSentence() {
      st.step = 'type'; st.plays = 0; st.hint = false; st.fail = false;
      hideFeedback(); buildSentence(false); if (st.mode === 'p') buildOptions(); else paintHint(); paint(); play(false);
    }
    function record(a, typed) {   // one answered item: the grade, the weak-sound note, the saved result
      endClip();
      const c = cur(), it = c.it, g = SDC.grade(it, a, vmap()), T = textNow();
      st.step = 'checked';
      st.res[st.i] = Object.assign({ k: c.k, id: it.id, text: T, it, sid: c.sid, picked: st.mode === 'p' ? a : '', typed: typed || '' }, SDC.result(it, g, st.plays, st.hint));
      try { SDS.add(c.sid, g.v === 'ok'); } catch (e) { /* the notes are only a helper */ }
      return st.res[st.i];
    }
    function answer(w) {   // pairs: a tap on one of the two words
      if (!st.on || st.step !== 'type' || st.mode !== 'p') return;
      const r = record(w, '');
      q('sd-opts').querySelectorAll('button').forEach(b => { b.disabled = true; const m = b.getAttribute('data-w'); b.classList.toggle('is-ok', m === r.it.w); b.classList.toggle('is-bad', m === w && m !== r.it.w); });
      buildSentence(true); paint(); paintFeedback(r);
      try { q('sd-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function check() {   // connected speech: the typed words
      if (!st.on || st.step !== 'type' || st.mode !== 'c') return;
      const i = inp(); if (!i || !LNC.words(i.value).length) return;
      const typed = i.value.trim(), r = record(typed, typed);
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }   // the keyboard goes away, so the answer panel has room
      i.classList.add(r.v === 'ok' ? 'is-ok' : r.v === 'near' ? 'is-close' : 'is-bad'); paint(); paintFeedback(r);
      try { q('sd-next').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    function next() {
      if (!st.on) return;
      if (st.step === 'end') { close(); return; }
      if (st.step !== 'checked') return;
      endClip();
      if (st.i + 1 >= st.cs.length) { st.step = 'end'; try { IE.log('l'); } catch (e) { /* IELTS practice log (169o) not loaded */ } hideFeedback(); paint(); paintEnd(); try { q('sd-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; }
      st.i++; newSentence();
      try { const f = inp(); if (f) f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    /* ----- open and close; the audio goes back to where it was ----- */
    function vv() {   // a phone keyboard opens: the screen follows the part that is still visible, so Check stays in reach
      const v = window.visualViewport, sh = q('sheet-sd'); if (!v || !st.on) return;
      sh.style.height = Math.round(v.height) + 'px'; sh.style.top = Math.round(v.offsetTop) + 'px';
    }
    async function start(mode) {
      if (st.on || st.busy) return true;
      const m = mode === 'c' ? 'c' : 'p', p = typeof shPlan === 'function' ? shPlan() : null;
      if (!S.book || !S.model || !p) { toast('Open a book that has its text lined up with the audio first.', 4000); return false; }
      const bookId = String(S.book.id), sec = S.sec; st.busy = true;
      toast('Looking for practice for this book…', 1800);
      let list = []; try { list = await SDK.passages(bookId, S.model.sents); } catch (e) { list = []; }
      st.busy = false;
      if (st.on || !S.book || String(S.book.id) !== bookId || S.sec !== sec) return false;   // the learner moved on while the pack was on its way
      if (!list.length) { toast('No sound practice found for this book. It may not exist yet, or you may be offline.', 5000); return false; }
      const texts = p.ids.map(id => { const s = S.model.sents[id]; return s ? s.t : ''; }), hid = k => { const s = S.model.sents[p.ids[k]]; return !s || !!s.h; };
      let all = []; list.forEach(pass => { all = all.concat(SDC.cands(pass, texts, hid, TP.fnv, m)); });
      if (all.length < 3) { toast('This track has too little practice. Try another track.', 4000); return false; }
      const dur = i => (i + 1 < p.starts.length && p.starts[i + 1] > p.starts[i] ? p.starts[i + 1] - p.starts[i] : null), dif = c => LVX.d(texts[c.k], dur(c.k));
      let target = null; try { target = LVX.target(m === 'p' ? 'pair' : 'full'); } catch (e) { target = null; }   // level (169x): sentences a little above the learner
      const ws = SDS.get(), cs = SDC.pick(all, LNC.SIZE, { target, d: dif, weak: c => SDC.weakness(ws, c.sid) });
      st.p = p; st.mode = m; st.cs = cs;
      st.snap = { bookId, sec: S.sec, time: nowT(), playing: !audio.paused && !audio.ended };
      st.on = true; st.i = 0; st.res = []; st.playing = false; st.dif = {}; st.word = '';
      try { cs.forEach(c => { st.dif[c.k] = dif(c); }); if (target != null) st.word = LVX.word(skill(), cs.map(c => st.dif[c.k])); } catch (e) { st.dif = {}; st.word = ''; }   // level: never stops a session
      stopAudio();
      openSheet('sheet-sd');
      if (window.visualViewport) { window.visualViewport.addEventListener('resize', vv); window.visualViewport.addEventListener('scroll', vv); vv(); }
      newSentence();
      try { const f = inp(); if (f) f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() {   // however the screen was closed
      if (!st.on) return; st.on = false;
      halt(); stopAudio();
      if (window.visualViewport) { window.visualViewport.removeEventListener('resize', vv); window.visualViewport.removeEventListener('scroll', vv); }
      const sh = q('sheet-sd'); sh.style.height = ''; sh.style.top = '';
      try { LVX.record(skill(), st.res.filter(r => r && st.dif[r.k] != null).map(r => ({ d: st.dif[r.k], o: LVE.outcome(r) }))); } catch (e) { /* the level is only a helper */ }
      if (st.res.some(Boolean)) last = { kind: st.mode, bookId: String(S.book ? S.book.id : ''), title: S.book ? S.book.title || '' : '', sec: S.sec, ts: Date.now(), res: st.res.filter(Boolean).map(r => Object.assign({}, r)) };
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
    q('sd-x').addEventListener('click', close);
    q('sd-play').addEventListener('click', () => play(false));
    q('sd-slow').addEventListener('click', () => play(true));
    q('sd-check').addEventListener('click', check);
    q('sd-next').addEventListener('click', next);
    q('sd-hint').addEventListener('click', () => { if (st.on && st.step === 'type' && st.mode === 'c') { st.hint = !st.hint; paintHint(); paint(); } });
    new MutationObserver(() => { if (q('sheet-sd').hidden) finish(); }).observe(q('sheet-sd'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Sound practice', 'Study this chapter > Which word did you hear? plays one sentence with a word missing: tap the word you heard, from two that sound almost the same. Write it in full plays a sentence where a short phrase is one box, for example "going to", which people often say as "gonna": type the words in full. Use the turtle to hear it slowly. A session is up to 10 sentences from the track you are in. These drills need a practice pack made for the book; when a book has none, you will see a message. When you close it, the audio goes back to where you were.');
    return { start, close, results: () => st.res.filter(Boolean).map(r => Object.assign({}, r)), last: () => last, get on() { return st.on; } };
  })();

  (() => {
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };
    const sub = kind => { let w = null; try { w = SDC.weak(SDS.get(), kind); } catch (e) { w = null; } return SDC.sub(kind, { calm: calm(), weak: w }); };
    LearnHub.register({ id: 'soundpairs', order: 53, icon: '#i-m-pair', title: 'Which word did you hear?', subtitle: () => sub('p'), playerSubtitle: () => sub('p'), open: () => { SD.start('p'); } });
    LearnHub.register({ id: 'fullform', order: 54, icon: '#i-m-chunk', title: 'Write it in full', subtitle: () => sub('c'), playerSubtitle: () => sub('c'), open: () => { SD.start('c'); } });
  })();
