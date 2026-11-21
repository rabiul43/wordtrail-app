  /* ---------- opening sound ----------
     A short piece of music that plays when the user presses Play on a book that starts from its beginning (never when a book is opened, never on a resume
     from the middle). Flow: the music fades in over 1.5 s and plays alone for 4-6 s (P.openLen: short / medium / long), then the narrator starts and the music
     sinks away under the first words along a cosine curve (8-10 s). A tap on play or on the screen skips it; pause stops it.
     The music comes only from our own clips: openings.json on the music host if it lists one for the mood, otherwise the best fit among all clips of the mood
     in music.json (same host, same cache as the background music), always the same clip for the same book. The clip is fetched and decoded when the book is
     opened (osArm). If it is not ready at Play (offline, slow) there is no opening and the narrator starts at once: a sound made on the device is never played.
     Sound screen > Opening. */
  const OSND = { armed: '', tok: 0, nodes: null, map: {}, buf: {}, busy: {}, fail: {}, mood: '', cur: null, hold: null, gated: false, until: 0, musAt: 0 };
  /* ---- the mood of a book: its own genre first, then its title, then its language ----
     Each row: [key, name, English words (regular expression), Bengali word stems (plain text: \b does not work for Bengali script, a stem also finds the word with its endings)].
     To add a genre word: add it to the row of its mood. The first row that matches wins, so the order matters. */
  const OS_MOODS = [
    ['gothic', 'Gothic', 'gothic|horror|vampire|ghost|haunt|supernatural|dracula|frankenstein|macabre|\\bterror\\b|werewolf|occult|eerie|\\bcurse', ['ভূত', 'ভুতুড়ে', 'পিশাচ', 'ড্রাকুলা', 'ফ্রাঙ্কেনস্টাইন', 'হরর', 'অতিপ্রাকৃত', 'অলৌকিক', 'গা ছমছম', 'অভিশাপ', 'প্রেতাত্মা', 'আতঙ্ক']],
    ['mystery', 'Mystery', 'mystery|detective|crime|thriller|\\bspy\\b|espionage|sherlock|murder|suspense|\\bnoir\\b|whodunit|police', ['রহস্য', 'গোয়েন্দা', 'অপরাধ', 'খুন', 'হত্যা', 'থ্রিলার', 'গুপ্তচর', 'শার্লক', 'ফেলুদা', 'ব্যোমকেশ', 'কিরীটী', 'পুলিশ']],
    ['romance', 'Romance', 'romance|love stor|courtship|pride and prejudice|\\bemma\\b|jane eyre|sense and sensibility|persuasion|\\blovers?\\b|\\bmarriage|\\bwedding', ['প্রেম', 'ভালোবাস', 'ভালবাস', 'রোম্যান্স', 'রোমান্স', 'প্রণয়', 'বিয়ে', 'বিবাহ', 'মনের মানুষ']],
    ['adventure', 'Adventure', 'adventure|sea stor|pirate|treasure|explor|western|voyage|swashbuckl|\\bwar\\b|military|journey|expedition|\\bhunt(?:er|ing)\\b|survival|travel|\\bnaval', ['অ্যাডভেঞ্চার', 'এডভেঞ্চার', 'অভিযান', 'দুঃসাহসিক', 'জলদস্যু', 'গুপ্তধন', 'সমুদ্র', 'যুদ্ধ', 'ভ্রমণ', 'শিকার', 'সাগর', 'জাহাজ', 'বনজঙ্গল']],
    ['fantasy', 'Fantasy', 'fantasy|fairy|myth|legend|folklore|folk tale|magic|\\bfable|arthur|wonderland|\\boz\\b|dragon|\\bepic\\b|\\bsaga\\b|\\bwitch|wizard|enchant', ['ফ্যান্টাসি', 'রূপকথা', 'পরীর', 'পরীদের', 'পুরাণ', 'পৌরাণিক', 'মিথোলজি', 'কিংবদন্তি', 'কিংবদন্তী', 'লোককথা', 'জাদু', 'যাদু', 'দৈত্য', 'ঠাকুরমার ঝুলি', 'অ্যালিস', 'ডাইনি']],
    ['children', 'Children', 'child|juvenile|nursery|\\bkids?\\b|picture book|\\bpoems? for\\b|jungle book|peter pan|little women|heidi|anne of green|bedtime|\\bboys?\\b stor|\\bgirls?\\b stor', ['শিশু', 'ছোটদের', 'ছোটদের', 'কিশোর', 'ছড়া', 'শিশুতোষ', 'খোকা', 'খুকু', 'ঘুমপাড়ানি', 'টুনটুনি', 'গোপাল ভাঁড়']],
    ['scifi', 'Science fiction', 'science fiction|sci-?fi|dystopia|utopia|time machine|\\bspace\\b|\\brobot|futur|\\bmars\\b|martian|\\balien|\\bcyber', ['কল্পবিজ্ঞান', 'সায়েন্স ফিকশন', 'বিজ্ঞান', 'মহাকাশ', 'রোবট', 'ভবিষ্যৎ', 'ভবিষ্যত', 'মঙ্গল গ্রহ', 'এলিয়েন', 'গ্রহান্তর']],
    ['comedy', 'Comedy', 'comed|humou?r|funny|farce|\\bcomic\\b|satire|\\bwit\\b|parody|\\bjokes?\\b', ['হাস্যরস', 'কৌতুক', 'রম্য', 'হাসির', 'ব্যঙ্গ', 'কমেডি', 'মজার', 'ভাঁড়']],
    ['poetry', 'Poetry', '\\bpoetry\\b|\\bpoems?\\b|\\bverse\\b|sonnet|ballad|\\blyric|\\bodes?\\b|spiritual|devotion|religio|prayer|\\bhymn|sermon|meditat', ['কবিতা', 'কাব্য', 'গীতি', 'গান', 'পদ্য', 'ধর্ম', 'আধ্যাত্মিক', 'ভক্তি', 'প্রার্থনা', 'গীতাঞ্জলি', 'সনেট']],
    ['drama', 'Classic drama', 'drama|tragedy|\\bplay\\b|plays\\b|literary|classic|social|historical|realism|philosoph|essay|biograph|memoir|autobiograph|\\bhistory\\b', ['নাটক', 'ট্র্যাজেডি', 'সামাজিক', 'ঐতিহাসিক', 'ইতিহাস', 'দর্শন', 'প্রবন্ধ', 'জীবনী', 'আত্মজীবনী', 'স্মৃতিকথা', 'ক্লাসিক', 'সাহিত্য']]
  ].map(([k, n, en, bn]) => [k, n, new RegExp(en + '|' + bn.map(w => w.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))]);
  const OS_CALM = ['calm', 'Calm'];
  /* Last step: a book that says nothing in its genres or title falls back to a mood for its language (a language not listed gets Calm). */
  const OS_LANG = { bn: 'drama', ur: 'drama', ar: 'drama', hi: 'drama' };
  const OS_LANG_NAMES = { bengali: 'bn', bangla: 'bn', urdu: 'ur', arabic: 'ar', hindi: 'hi' };   // book language name -> code (the book list gives the name)
  const OS_FADE = 6;   // seconds the opening takes to sink away at its end (it used to be 4.5 s along a straight line)
  function osBookLang(b) {   // the book's language as a code ('' = unknown); Bengali script in the title also counts
    try {
      const n = String((b && b.lang) || '').trim().toLowerCase(), code = n ? (OS_LANG_NAMES[n] || n) : '';
      if (code) return code;
      return /[ঀ-৿]/.test((b && b.title) || '') ? 'bn' : '';
    } catch (e) { return ''; }
  }
  function osMoodFor(text) {   // the first mood whose words are in this text, or null
    if (!text) return null;
    const t = text.normalize ? text.normalize('NFC').toLowerCase() : text.toLowerCase();
    for (const row of OS_MOODS) if (row[2].test(t)) return [row[0], row[1]];
    return null;
  }
  function osMood(b) {   // the mood for this book: [key, name]
    if (!b) return OS_CALM;
    const g = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
    const list = Array.isArray(g) ? g.map(String) : String(g).split(/[,;|\/।]+/);   // each genre on its own: the first one the book lists counts first
    for (const one of list) { const m = osMoodFor(one); if (m) return m; }
    const byTitle = osMoodFor(String(b.title || ''));
    if (byTitle) return byTitle;
    const key = OS_LANG[osBookLang(b)], row = key && OS_MOODS.find(r => r[0] === key);
    return row ? [row[0], row[1]] : OS_CALM;
  }
  /* ---- which clip: openings.json first, else the best fit from ALL clips of the mood's music library moods ---- */
  const OS_LIB = { gothic: ['dread', 'tension'], mystery: ['tension', 'dread'], romance: ['romance', 'peace'], adventure: ['danger', 'chase', 'wonder'], fantasy: ['wonder', 'peace'], children: ['merry', 'wonder'], scifi: ['wonder', 'tension'], comedy: ['merry', 'wonder'], poetry: ['peace', 'sorrow'], drama: ['sorrow', 'peace'], calm: ['peace', 'neutral'] };   // opening mood -> music library moods to take a clip from (the first one that has clips; a second is added when the first has fewer than 3)
  const OS_ENERGY = { gothic: 0.35, mystery: 0.35, romance: 0.3, adventure: 0.6, fantasy: 0.45, children: 0.5, scifi: 0.45, comedy: 0.55, poetry: 0.2, drama: 0.35, calm: 0.25 };   // how busy an opening of this mood should be (0 soft, 1 full); a clip's own energy `e` is compared with it
  function osHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function osFit(c, k, bid) {   // lower = a better opening for this book. Only the book's own id adds the variety, so the same book always gets the same clip.
    const e = typeof c.e === 'number' ? c.e : 0.5, dur = +c.dur || 0;
    let s = Math.abs(e - (OS_ENERGY[k] == null ? 0.3 : OS_ENERGY[k]));
    if (typeof c.o === 'number') s -= 0.15;   // someone chose a good start point for this clip
    if (dur && dur < 20) s += 0.5;   // too short for a medium or long opening
    return s + (osHash(bid + '|' + k + '|' + c.f) % 1000) / 1000 * 0.35;
  }
  function osClip(k, b) {   // { id, url, by, title, cache, lib, o } or null (null = no opening: the narrator just starts). o = start point in seconds, or null
    const m = OSND.map[k];
    if (m) return { id: 'o:' + k, url: m.url, by: m.by || '', title: '', cache: 'wt-amb-rec', lib: null, o: typeof m.o === 'number' ? m.o : null };
    const mf = typeof MUS !== 'undefined' && MUS.manifest && MUS.manifest.moods; if (!mf) return null;
    const bid = String((b && b.id) || (S.book && S.book.id) || '');
    let pool = [];
    for (const lm of (OS_LIB[k] || OS_LIB.calm)) {
      pool = pool.concat((mf[lm] || []).filter(c => c && c.f && !pool.some(p => p.f === c.f)));
      if (pool.length >= 3) break;
    }
    if (!pool.length) return null;
    let best = pool[0], bs = 1e9;
    pool.forEach(c => { const s = osFit(c, k, bid); if (s < bs || (s === bs && c.f < best.f)) { bs = s; best = c; } });
    return { id: 'm:' + best.f, url: musClipUrl(best.f), by: best.by || '', title: best.t || '', cache: 'wt-music', lib: best, o: typeof best.o === 'number' ? best.o : null };
  }
  function osStartAt(buf, o) {   // where in the decoded clip the opening starts (seconds): the chosen point `o`, else just before the first sound (leading silence skipped)
    if (!buf) return 0;
    const room = Math.max(0, buf.duration - 8);   // always leave at least 8 s to play
    if (typeof o === 'number' && o >= 0) return Math.min(o, room);
    const d = buf.getChannelData(0), sr = buf.sampleRate, win = Math.floor(sr * 0.01), lim = Math.min(d.length - win, Math.floor(sr * 15));
    for (let i = 0; i < lim; i += win) {
      let pk = 0; for (let j = i; j < i + win; j++) { const a = d[j] < 0 ? -d[j] : d[j]; if (a > pk) pk = a; }
      if (pk > 0.02) return Math.min(Math.max(0, i / sr - 0.05), room);
    }
    return 0;
  }
  /* ---- the clip list: openings.json in the repo, like recordings.json ---- */
  async function osMapLoad() {   // openings.json on the music host (optional: a missing file is fine)
    const set = (d, base) => { OSND.map = {}; if (!d || typeof d !== 'object') return; Object.keys(d).forEach(k => { const m = d[k]; if (m && m.file) { try { OSND.map[k] = { url: new URL(m.file, base).href, by: m.by || '', license: m.license || '', o: typeof m.o === 'number' ? m.o : null }; } catch (e) { /* bad address */ } } }); };
    try {
      const c = store.get('wt:osmap2', null);
      if (c && c.d) set(c.d, c.base);
      if (c && Date.now() - c.t < 24 * 3600e3) return;
      const base = MUS_HOST;
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'openings.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json(); set(d, base); store.set('wt:osmap2', { t: Date.now(), d, base });
    } catch (e) { /* offline, or no openings.json yet: the music library clip plays */ }
  }
  async function osManifest() {
    await osMapLoad();
    try { if (!MUS.manifest) await musFetchManifest(); } catch (e) { /* no music list yet: the made sound plays */ }
  }
  function osLoad(c) {   // fetch, cache and decode one clip; resolves when done (also when there is no clip). Only the start point (or the first seconds) plus 30 s are kept in memory.
    if (!c || OSND.buf[c.id] || !AMB.ctx || Date.now() - (OSND.fail[c.id] || 0) < 60000) return Promise.resolve();
    if (OSND.busy[c.id]) return OSND.busy[c.id];
    OSND.busy[c.id] = (async () => {
      try {
        let resp = null, cache = null;
        try { cache = await caches.open(c.cache); resp = await cache.match(c.url); if (resp) sndTouch(c.url); } catch (e) { /* no cache here: download each time */ }
        if (!resp) {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
          const r = await fetch(c.url, { signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) throw new Error('http ' + r.status);
          if (cache) { try { await cache.put(c.url, r.clone()); sndTouch(c.url); sndCachePrune(); } catch (e) { /* too big or blocked: still play it */ } }
          resp = r;
        }
        const full = await AMB.ctx.decodeAudioData(await resp.arrayBuffer());
        const n = Math.min(full.length, Math.floor(((typeof c.o === 'number' ? c.o : 0) + 30) * full.sampleRate));   // the start point and 30 s after it (leading silence is skipped inside this)
        if (n >= full.length) OSND.buf[c.id] = full;
        else { const sm = AMB.ctx.createBuffer(full.numberOfChannels, n, full.sampleRate); for (let ch = 0; ch < full.numberOfChannels; ch++) sm.getChannelData(ch).set(full.getChannelData(ch).subarray(0, n)); OSND.buf[c.id] = sm; }
        delete OSND.fail[c.id];
      } catch (e) { OSND.fail[c.id] = Date.now(); }
      delete OSND.busy[c.id];
    })();
    return OSND.busy[c.id];
  }
  /* ---- the title sound: a soft chime or a page turn, just before the opening music ---- */
  const OS_TITLE = { chime: 1.3, page: 0.9 };   // seconds the title sound goes first; the music starts after that
  function osChimeKind() { return P.openChime === 'page' || P.openChime === 'chime' ? P.openChime : 'off'; }   // off unless chosen
  function osTitleSound(d, t, kind, v) {   // d: where it plays, t: start time, v: loudness (the same level the opening music gets)
    if (kind === 'page') {
      cueNz(d, t, 'white', 'bandpass', 2600, 0.7, 0.5 * v, 0.03, 0.28);   // the swish of the leaf
      cueNz(d, t + 0.12, 'pink', 'bandpass', 900, 0.9, 0.3 * v, 0.02, 0.35);   // the paper settling
      cueNz(d, t + 0.38, 'pink', 'lowpass', 240, 0.7, 0.3 * v, 0.01, 0.22);   // a soft thud as the page lands
      return;
    }
    const bell = (tt, f, a) => { ambTone(d, tt, f, 0, 2.2, a, 'sine', 0.006); ambTone(d, tt, f * 2.756, 0, 0.9, a * 0.18, 'sine', 0.004); ambTone(d, tt, f * 5.4, 0, 0.35, a * 0.06, 'sine', 0.003); };
    bell(t, 1046.5, 0.35 * v); bell(t + 0.32, 1568, 0.28 * v);   // two soft bells: C6, then G6
  }
  function osTitleHear(kind) {   // a short try-out when the choice is changed
    if (kind === 'off' || !ambBuild()) return;
    const ctx = AMB.ctx, vol = (P.openVol == null ? 60 : P.openVol) / 100 * sndMul(); if (!(vol > 0)) return;
    try { if (ctx.state !== 'running') ctx.resume(); } catch (e) { /* needs a tap first */ }
    const cg = ctx.createGain(); cg.connect(ctx.destination); osTitleSound(cg, ctx.currentTime + 0.05, kind, 0.85 * vol);
    setTimeout(() => { try { cg.disconnect(); } catch (e) { /* gone */ } }, 3500);
  }
  /* ---- playing it ---- */
  const OS_MUS_GAP = 20000;   // ms the background music waits after the opening has ended (no two musics on top of each other)
  /* mus: what happens to the wait of the background music. Not given: the wait is dropped (a pause, a new book). 'keep': the opening ended by itself, the wait stays.
     'skip': the opening was cut short now, so the wait counts from now. */
  function osStop(fade, mus) {
    const n = OSND.nodes; OSND.tok++; OSND.nodes = null; OSND.until = 0;
    if (mus !== 'keep') OSND.musAt = mus === 'skip' && n ? Date.now() + OS_MUS_GAP : 0;
    sndNowPaint(); if (!n) return;
    try { const t = AMB.ctx.currentTime, f = fade == null ? 0.5 : fade; [n.g, n.cg].forEach(x => { if (!x) return; x.gain.cancelScheduledValues(t); x.gain.setValueAtTime(x.gain.value, t); x.gain.linearRampToValueAtTime(0, t + f); }); setTimeout(() => { try { n.g.disconnect(); n.lp.disconnect(); if (n.cg) n.cg.disconnect(); } catch (e) { /* gone */ } }, f * 1000 + 200); } catch (e) { /* already stopped */ }
  }
  /* The timeline of one opening: the music fades in over 1.5 s, plays alone, then the narrator starts and the music sinks away under it along a cosine curve.
     [seconds the music plays alone counted from its start, seconds the fade under the narrator takes] */
  const OS_LEN = { short: [4, 8], medium: [5, 9], long: [6, 10] };
  function osLen() { return OS_LEN[P.openLen] || OS_LEN.medium; }
  function osVol() { return (P.openVol == null ? 60 : P.openVol) / 100 * sndMul(); }
  /* Plays the opening from a clip that is already decoded. mood: [key, name]; quiet = a preview: do not tell the music or the book's memory about the clip;
     noTitle = leave out the title sound. Returns false (and plays nothing, never a made sound) when the clip is not ready or the volume is 0.
     OSND.narrMs = milliseconds until the narrator should start; OSND.until = timestamp when the opening is over. */
  async function osPlay(mood, book, quiet, noTitle) {
    if (!ambBuild()) return false;
    const ctx = AMB.ctx, tok = ++OSND.tok, k = mood[0];
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) { /* needs a tap first: skip quietly */ }
    if (tok !== OSND.tok) return false;
    const vol = osVol();
    if (!(vol > 0)) return false;
    const clip = osClip(k, book || S.book), buf = clip && OSND.buf[clip.id];
    if (!buf) return false;   // the clip is not ready (offline, slow): no opening
    osStop(0.2); OSND.tok = tok;
    const off = osStartAt(buf, clip.o), room = buf.duration - off;
    let [a, f] = osLen();
    if (room < a + f + 0.5) { const sc = Math.max(room - 0.5, 3) / (a + f); a *= sc; f *= sc; }   // a short clip: the same shape, a little quicker
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + 0.05;
    const kind = noTitle ? 'off' : osChimeKind(), lead = kind === 'off' ? 0 : OS_TITLE[kind], t = t0 + lead, top = 0.85 * vol;   // the title sound goes first, the music starts a moment later
    lp.type = 'lowpass'; lp.frequency.value = 6000; lp.connect(g); g.connect(ctx.destination);
    let cg = null;
    if (lead) { cg = ctx.createGain(); cg.connect(ctx.destination); osTitleSound(cg, t0, kind, top); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(top, t + 1.5);   // in over 1.5 s
    g.gain.setValueAtTime(top, t + a);   // alone until the narrator starts
    const N = 40; for (let i = 1; i <= N; i++) g.gain.linearRampToValueAtTime(top * 0.5 * (1 + Math.cos(Math.PI * i / N)), t + a + f * i / N);   // the cosine fade-out in many small steps, so a stop can still cancel it
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(lp); s.start(t, off); s.stop(t + a + f + 0.6);
    OSND.nodes = { g, lp, cg }; OSND.mood = clip.id; OSND.cur = clip;
    if (clip.lib && !quiet) { try { musRemember(clip.lib); } catch (e) { /* the music just may repeat it */ } }   // background music will not pick this clip right away
    sndNowPaint();
    OSND.narrMs = Math.max(0, (t + a - ctx.currentTime) * 1000);
    OSND.until = Date.now() + Math.max(0, (t + a + f - ctx.currentTime) * 1000);
    OSND.musAt = quiet ? 0 : OSND.until + OS_MUS_GAP;   // a try-out never holds the background music
    setTimeout(() => { if (OSND.nodes && OSND.nodes.g === g) osStop(0.1, 'keep'); }, Math.max(0, (t + a + f - ctx.currentTime + 0.6) * 1000));
    return true;
  }
  /* ---- when: only from the beginning of a book ---- */
  function osArm(b, saved) {   // called by openBook: a start from the first track, near its start, arms the sound; a resume does not
    OSND.armed = ''; osHoldEnd(false); osStop(0.3);
    if (P.openOn === false || !sndOn() || !b || !b.secs || !b.secs.length) return;
    const t = saved && saved.time > 0 ? saved.time : 0;
    if (S.sec !== 0 || t > 15) return;   // resuming in the middle: stay silent
    OSND.armed = String(b.id);
    const m = osMood(b);
    if (AMB.ctx || ambBuild()) osManifest().then(() => { if (OSND.armed === String(b.id)) osLoad(osClip(m[0], b)); });
  }
  /* Milliseconds music should still wait for the opening sound (0 = start now). */
  function osLeadWait() {
    const left = Math.max(OSND.until, OSND.musAt) - Date.now();   // the opening itself, then the gap after it
    if (left > 0) return left;
    if (OSND.armed && S.book && OSND.armed === String(S.book.id) && P.openOn !== false) return 1000;   // armed, narrator just started: the opening decides within a moment
    return 0;
  }
  function osTcPaint() {   // title sound choice: the pressed button follows the saved choice
    const k = osChimeKind();
    $$('#amb-open-tc button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === k)));
  }
  function osVolPaint() {   // opening volume: filled track, % readout, mute icon (same look as the music volume)
    const r = $('#amb-open-vol'); if (!r) return;
    const v = Math.max(0, Math.min(100, +r.value || 0));
    r.style.setProperty('--fill', v + '%');
    const o = $('#open-vpct'); if (o) o.textContent = v + '%';
    const i = $('#open-vic'); if (i) i.classList.toggle('mute', v === 0);
  }
  function osLenPaint() {   // length choice: the pressed button follows the saved choice
    const k = OS_LEN[P.openLen] ? P.openLen : 'medium';
    $$('#amb-open-len button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === k)));
  }
  function osClipTitle(c) {
    if (!c) return '';
    if (c.title) return c.title;
    const slug = String(c.id).replace(/^[mo]:/, '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    return typeof musPrettyTitle === 'function' ? musPrettyTitle(slug) : slug;
  }
  function osNotePaint() {   // one short line: the mood this book gets and the clip it plays
    const note = $('#amb-open-note'); if (!note) return;
    note.textContent = '';
    if (!S.book) { note.textContent = 'Open a book to see which opening it gets.'; return; }
    const m = osMood(S.book), c = osClip(m[0], S.book);
    note.append(h('span', { text: 'Mood:' }), ' ', h('span', { text: m[1] }), ' \u00b7 ', c ? [osClipTitle(c), c.by].filter(Boolean).join(' \u00b7 ') : h('span', { text: 'no clip yet' }));
  }
  function osPaint() {
    const on = $('#amb-open'); if (!on) return;
    osTcPaint(); osLenPaint(); sndNowPaint();
    on.checked = P.openOn !== false; $('#amb-open-vol').value = String(P.openVol == null ? 60 : P.openVol);
    osNotePaint(); osManifest().then(osNotePaint);   // the clip is known once the music list has arrived
    osVolPaint();
  }
  /* ---- the narrator waits for the opening: audio.play() is held while the opening plays ----
     Always on. The narrator starts when the music has played alone for a few seconds; the music then sinks under the first words.
     A tap on play or on the screen skips the opening and starts the narrator at once. If the clip is not decoded yet, there is no opening at all. */
  let osRealPlay = null, osRealPause = null;
  function osHoldWanted() {   // is this play() the start of a book whose opening is ready to play?
    if (OSND.hold || !OSND.armed || !S.book || OSND.armed !== String(S.book.id)) return false;
    if (P.openOn === false || !sndOn() || !audio.paused || !AMB.ctx || !(osVol() > 0)) return false;
    const c = typeof cutFor === 'function' ? cutFor(0) : null, floor = c && c[0] > 0 ? c[0] : 0;
    if (S.sec !== 0 || audio.currentTime > floor + 20) return false;
    const clip = osClip(osMood(S.book)[0], S.book);
    return !!(clip && OSND.buf[clip.id]);   // not decoded yet (offline, slow): skip the opening
  }
  function osHoldEnd(start) {   // the wait is over: start the narrator (start = true) or just drop the wait (a pause, another book)
    const hd = OSND.hold; if (!hd) return;
    clearTimeout(hd.timer); OSND.hold = null;
    if (start && S.book && String(S.book.id) === hd.id) {
      try { const r = osRealPlay(); if (r && r.catch) r.catch(e => { if (typeof onPlayFail === 'function') onPlayFail(e); }); } catch (e) { /* the play button still works */ }
    }
  }
  async function osHoldBegin() {
    const b = S.book, id = String(b.id), m = osMood(b), hd = OSND.hold = { id, timer: 0, t: Date.now() };
    OSND.armed = ''; OSND.until = Date.now() + 2500;   // music holds back
    toast('Opening first. Tap play to skip.', 2500);
    hd.timer = setTimeout(() => { if (OSND.hold === hd) { OSND.until = 0; osHoldEnd(true); } }, 3000);   // safety: if anything below hangs (a suspended audio context never resumes), the narrator still starts
    try {
      const ok = await osPlay(m, b);
      if (OSND.hold !== hd) return;   // skipped or stopped meanwhile (osStop already cancelled the music)
      if (!ok) { OSND.until = 0; osHoldEnd(true); return; }   // no opening can play (volume 0, sound blocked): start the narrator at once
      clearTimeout(hd.timer); hd.timer = setTimeout(() => osHoldEnd(true), OSND.narrMs);   // the narrator starts as the music begins to sink
    } catch (e) { if (OSND.hold === hd) { OSND.until = 0; osHoldEnd(true); } }   // only this book's own wait: a newer book's wait is not ours to end
  }
  function osSkip() {   // see also the play wrapper below   // a tap on the screen during the opening
    const hd = OSND.hold; if (!hd || Date.now() - hd.t < 600) return;   // the tap that pressed play is still on its way up
    osStop(0.8, 'skip'); osHoldEnd(true);
  }
  function osOnEmptied() { if (!OSND.hold) osStop(0.2); }   // a new source: stop the opening, except while the narrator is waiting for it (the book's own source change fires this just after play())
  function osGateInstall() {
    if (OSND.gated) return; OSND.gated = true;
    osRealPlay = audio.play.bind(audio); osRealPause = audio.pause.bind(audio);
    audio.play = function () {
      if (OSND.hold) { osStop(0.8, 'skip'); osHoldEnd(false); return osRealPlay(); }   // play tapped during the wait: skip the opening, start now
      if (osHoldWanted()) { osHoldBegin(); return Promise.resolve(); }
      if (OSND.armed && S.book && OSND.armed === String(S.book.id)) OSND.armed = '';   // no opening can play now: the narrator starts at once and nothing plays over it later
      return osRealPlay();
    };
    audio.pause = function () { if (OSND.hold) { osHoldEnd(false); osStop(0.6); } return osRealPause(); };
  }
  function osInit() {
    const on = $('#amb-open'); if (!on) return;
    on.addEventListener('change', e => { P.openOn = e.target.checked; savePrefs(); if (!P.openOn) { OSND.armed = ''; osStop(0.3); } });
    $('#amb-open-vol').addEventListener('input', e => { P.openVol = +e.target.value; savePrefs(); osVolPaint(); });
    $('#amb-open-hear').addEventListener('click', async () => {
      if (OSND.nodes) { osStop(0.4); return; }   // tap again = stop
      const m = osMood(S.book);
      if (!ambBuild()) { toast('Sound is not available here.'); return; }
      await osManifest(); await osLoad(osClip(m[0], S.book));
      if (await osPlay(m, S.book, true, true)) OSND.until = 0; else toast(osVol() > 0 ? 'The opening clip is not ready yet.' : 'Turn the opening volume up to hear it.');   // a try-out must not hold the background music back
    });
    $$('#amb-open-tc button').forEach(b => b.addEventListener('click', () => { P.openChime = b.dataset.v; savePrefs(); osTcPaint(); osTitleHear(osChimeKind()); }));   // picking one also plays it once
    $$('#amb-open-len button').forEach(b => b.addEventListener('click', () => { P.openLen = b.dataset.v; savePrefs(); osLenPaint(); }));
    osGateInstall();
    document.addEventListener('click', osSkip);   // a tap on the screen during the opening skips it
    audio.addEventListener('pause', () => { if (OSND.nodes) osStop(0.6); OSND.musAt = 0; });   // a pause drops the wait of the music too
    audio.addEventListener('emptied', osOnEmptied);
    ['play', 'pause', 'playing', 'emptied'].forEach(ev => audio.addEventListener(ev, () => setTimeout(sndNowPaint, 50)));   // after the music and ambient listeners have run
    setTimeout(osManifest, 7000); osPaint();
    const sheet = $('#sheet-amb'); if (sheet) new MutationObserver(osPaint).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }
