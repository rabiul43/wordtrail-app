  /* ---------- opening sound ----------
     A short piece of music that fades in when a book starts from its beginning and sinks away under the first words
     of the narration, the way a story video opens. The mood is picked by itself from the book's genres and title
     (gothic, mystery, romance, adventure, fantasy, children, drama, science fiction, or a calm default).
     Each mood plays a real royalty-free clip: one chosen in openings.json on the music host if it lists one, otherwise
     a soft (low-energy) clip from the music library (music.json, same Cloudflare host, same cache as the background
     music), always the same clip for the same book. If no clip can be loaded it plays a soft sound made on the device, so it always works.
     It never plays when a book is resumed from the middle. Sound screen > "Opening sound".
     Option "Narration after the opening" (P.openWait): the first play() of a book is held back while the opening plays; the narrator
     starts when the music is halfway down its fade, so it sinks under the first words. Tapping play skips the wait. */
  const OSND = { armed: '', tok: 0, nodes: null, map: {}, buf: {}, busy: {}, fail: {}, mood: '', cur: null, pv: '', hold: null, gated: false, until: 0 };
  const OS_MOODS = [   // [key, name, pattern on genres + title (first match wins)]
    ['gothic', 'Gothic', /gothic|horror|vampire|ghost|haunt|supernatural|dracula|frankenstein|macabre|\bterror\b|werewolf/],
    ['mystery', 'Mystery', /mystery|detective|crime|thriller|spy|sherlock|murder|suspense|\bnoir\b/],
    ['romance', 'Romance', /romance|love stor|courtship|pride and prejudice|\bemma\b|jane eyre|sense and sensibility|persuasion/],
    ['adventure', 'Adventure', /adventure|sea stor|pirate|treasure|explor|western|voyage|swashbuckl|\bwar\b|military|journey/],
    ['fantasy', 'Fantasy', /fantasy|fairy|myth|legend|folklore|magic|\bfable|arthur|wonderland|\boz\b|dragon|\bepic\b/],
    ['children', 'Children', /child|juvenile|nursery|\bkids?\b|picture book|\bpoems? for\b|jungle book|peter pan|little women|heidi|anne of green/],
    ['scifi', 'Science fiction', /science fiction|sci-?fi|dystopia|utopia|time machine|\bspace\b|\brobot|futur|\bmars\b|martian/],
    ['drama', 'Classic drama', /drama|tragedy|\bplay\b|plays\b|literary|classic|satire|social|historical|realism|philosoph|essay|biograph/]
  ];
  const OS_CALM = ['calm', 'Calm'];
  const OS_FADE = 6;   // seconds the opening takes to sink away at its end (it used to be 4.5 s along a straight line)
  function osMood(b) {   // the mood for this book: [key, name]
    if (!b) return OS_CALM;
    const row = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
    const text = (String(row) + ' ' + (b.title || '')).toLowerCase();
    for (const [k, n, re] of OS_MOODS) if (re.test(text)) return [k, n];
    return OS_CALM;
  }
  /* ---- which clip: openings.json first, else a soft clip from the music library ---- */
  const OS_LIB = { gothic: ['dread', 'tension'], mystery: ['tension', 'dread'], romance: ['romance', 'peace'], adventure: ['danger', 'chase', 'wonder'], fantasy: ['wonder', 'peace'], children: ['merry', 'wonder'], scifi: ['wonder', 'tension'], drama: ['sorrow', 'peace'], calm: ['peace', 'neutral'] };   // opening mood -> music library moods to take a clip from
  function osHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function osClip(k, b) {   // { id, url, by, title, cache, lib } or null (null = the made sound plays)
    const m = OSND.map[k];
    if (m) return { id: 'o:' + k, url: m.url, by: m.by || '', title: '', cache: 'wt-amb-rec', lib: null };
    const mf = typeof MUS !== 'undefined' && MUS.manifest && MUS.manifest.moods; if (!mf) return null;
    const bid = String((b && b.id) || (S.book && S.book.id) || '');
    for (const lm of (OS_LIB[k] || OS_LIB.calm)) {
      const all = (mf[lm] || []).filter(c => c && c.f); if (!all.length) continue;
      const en = c => typeof c.e === 'number' ? c.e : 0.5;
      const pool = all.slice().sort((x, y) => en(x) - en(y) || (x.f < y.f ? -1 : x.f > y.f ? 1 : 0)).slice(0, Math.max(1, Math.ceil(all.length / 2)));   // the calmer half
      const c = pool[osHash(bid + '|' + k) % pool.length];
      return { id: 'm:' + c.f, url: musClipUrl(c.f), by: c.by || '', title: c.t || '', cache: 'wt-music', lib: c };
    }
    return null;
  }
  /* ---- the clip list: openings.json in the repo, like recordings.json ---- */
  async function osMapLoad() {   // openings.json on the music host (optional: a missing file is fine)
    const set = (d, base) => { OSND.map = {}; if (!d || typeof d !== 'object') return; Object.keys(d).forEach(k => { const m = d[k]; if (m && m.file) { try { OSND.map[k] = { url: new URL(m.file, base).href, by: m.by || '', license: m.license || '' }; } catch (e) { /* bad address */ } } }); };
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
  function osLoad(c) {   // fetch, cache and decode one clip; resolves when done (also when there is no clip). Only the first 24 s are kept in memory.
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
        const n = Math.min(full.length, Math.floor(24 * full.sampleRate));
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
  function osChimeKind() { return P.openChime === 'page' || P.openChime === 'off' ? P.openChime : 'chime'; }
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
  /* ---- the made sounds: one soft piece per mood, 14 s, built from a few notes ---- */
  function osNote(dest, t, f, dur, vol, type, atk, vib) {   // one held note that swells in and fades out
    const ctx = AMB.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.setValueAtTime(vol, t + Math.max(atk, dur - atk * 1.4)); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1);
  }
  function osPad(dest, t, freqs, dur, vol, type, vib) { freqs.forEach((f, i) => osNote(dest, t + i * 0.35, f, dur - i * 0.35, vol / Math.sqrt(freqs.length), type, 3.5, vib)); }
  function osPluck(dest, t, f, vol, dec) { ambTone(dest, t, f, 0, dec || 1.6, vol, 'triangle', 0.008); ambTone(dest, t, f * 2, 0, (dec || 1.6) * 0.5, vol * 0.25, 'sine', 0.008); }
  const OS_SYNTH = {
    gothic: (d, t) => { osPad(d, t, [55, 82.4, 110, 130.8], 14, 0.9, 'triangle', 0.2); [[1, 0.35, 7], [2, 0.18, 5], [2.4, 0.14, 4], [3, 0.08, 3]].forEach(([m, v, du]) => ambTone(d, t + 0.4, 196 * m, 0, du, v, 'sine', 0.005)); cueNz(d, t, 'pink', 'bandpass', 300, 1.1, 0.22, 3, 9); },
    mystery: (d, t) => { osPad(d, t, [98, 138.6, 196], 14, 0.8, 'sine', 0.35); for (let i = 0; i < 9; i++) cueNz(d, t + 2 + i * 1.3, 'white', 'bandpass', i & 1 ? 2300 : 1700, 3, 0.14, 0.002, 0.045); },
    romance: (d, t) => { osPad(d, t, [174.6, 220, 261.6, 329.6], 14, 0.8, 'triangle', 4.5); [523.3, 440, 392, 329.6, 392, 440].forEach((f, i) => osPluck(d, t + 3 + i * 1.5, f, 0.22, 2.4)); },
    adventure: (d, t) => { osPad(d, t, [146.8, 220, 293.7], 14, 0.75, 'sawtooth', 0.3); [293.7, 370, 440, 587.3, 440, 587.3, 740].forEach((f, i) => osPluck(d, t + 1.5 + i * 0.7, f, 0.2, 1.2)); },
    fantasy: (d, t) => { osPad(d, t, [130.8, 196, 293.7, 329.6], 14, 0.65, 'sine', 3); const n = [659.3, 784, 880, 987.8, 1174.7]; for (let i = 0; i < 14; i++) osPluck(d, t + 1 + i * 0.85 + Math.random() * 0.2, n[Math.floor(Math.random() * n.length)], 0.12 + Math.random() * 0.08, 2.4); },
    children: (d, t) => { osPad(d, t, [130.8, 196, 261.6], 14, 0.45, 'sine', 0); [523.3, 659.3, 784, 1046.5, 784, 659.3, 523.3, 659.3, 784, 659.3].forEach((f, i) => osPluck(d, t + 0.5 + i * 0.5, f, 0.2, 0.9)); },
    drama: (d, t) => { osPad(d, t, [146.8, 174.6, 220, 261.6], 14, 0.8, 'triangle', 0.5); ambTone(d, t + 1, 73.4, 0, 5, 0.5, 'sine', 0.02); ambTone(d, t + 6, 87.3, 0, 5, 0.4, 'sine', 0.02); },
    scifi: (d, t) => { osPad(d, t, [55, 82.4], 14, 0.7, 'sawtooth', 0.15); osNote(d, t + 1, 880, 12, 0.07, 'sine', 4, 0.3); for (let i = 0; i < 6; i++) ambTone(d, t + 2 + i * 2, 1320, 660, 0.9, 0.06, 'sine', 0.01); },
    calm: (d, t) => { osPad(d, t, [130.8, 196, 261.6, 329.6], 14, 0.7, 'sine', 3.5); }
  };
  /* ---- playing it ---- */
  function osStop(fade) {
    const n = OSND.nodes; OSND.tok++; OSND.nodes = null; OSND.until = 0; sndNowPaint(); osListState(); if (!n) return;
    try { const t = AMB.ctx.currentTime, f = fade == null ? 0.5 : fade; [n.g, n.cg].forEach(x => { if (!x) return; x.gain.cancelScheduledValues(t); x.gain.setValueAtTime(x.gain.value, t); x.gain.linearRampToValueAtTime(0, t + f); }); setTimeout(() => { try { n.g.disconnect(); n.lp.disconnect(); if (n.cg) n.cg.disconnect(); } catch (e) { /* already gone */ } }, (f + 0.3) * 1000); } catch (e) { /* context gone */ }
  }
  async function osPlay(mood, book, quiet, noTitle) {   // mood: [key, name]; quiet = a preview: do not tell the music or the book's memory about the clip; noTitle = leave out the title sound
    if (!ambBuild()) return false;
    const ctx = AMB.ctx, tok = ++OSND.tok, k = mood[0];
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) { /* needs a tap first: skip quietly */ }
    if (tok !== OSND.tok) return false;
    const vol = (P.openVol == null ? 60 : P.openVol) / 100 * sndMul();
    if (!(vol > 0)) return false;
    osStop(0.2); OSND.tok = tok;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + 0.05;
    const kind = noTitle ? 'off' : osChimeKind(), lead = kind === 'off' ? 0 : OS_TITLE[kind], t = t0 + lead;   // the title sound goes first, the music starts a moment later
    lp.type = 'lowpass'; lp.frequency.value = 6000; lp.connect(g); g.connect(ctx.destination);
    const clip = osClip(k, book || S.book), buf = clip && OSND.buf[clip.id], len = buf ? Math.min(buf.duration, 24) : 14, top = 0.85 * vol;
    let cg = null;
    if (lead) { cg = ctx.createGain(); cg.connect(ctx.destination); osTitleSound(cg, t0, kind, top); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(top, t + 1.5);
    const hold = Math.max(2, len - OS_FADE), fade = len - hold;   // the ending: hold, then sink along a soft cosine curve (many small steps, so a stop can still cancel it)
    g.gain.setValueAtTime(top, t + hold);
    for (let i = 1; i <= 24; i++) g.gain.linearRampToValueAtTime(top * 0.5 * (1 + Math.cos(Math.PI * i / 24)), t + hold + fade * i / 24);
    if (buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(lp); s.start(t); s.stop(t + len + 0.1); }
    else (OS_SYNTH[k] || OS_SYNTH.calm)(lp, t);
    OSND.nodes = { g, lp, cg }; OSND.mood = buf ? clip.id : k; OSND.cur = buf ? clip : null; osListState();
    if (buf && clip.lib && !quiet) { try { musRemember(clip.lib); } catch (e) { /* the music just may repeat it */ } }   // background music will not pick this clip right away
    sndNowPaint();
    OSND.until = Date.now() + (lead + Math.max(6, len - OS_FADE / 2)) * 1000;   // music may start halfway down the fade, about 3 s before the opening ends (never earlier than 6 s)
    setTimeout(() => { if (OSND.nodes && OSND.nodes.g === g) osStop(0.1); }, (lead + len + 0.5) * 1000);
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
  async function osOnPlaying() {
    if (!OSND.armed || !S.book || OSND.armed !== String(S.book.id)) return;
    if (!sndOn()) { OSND.armed = ''; return; }
    const id = OSND.armed; OSND.armed = '';
    OSND.until = Date.now() + 2500;   // an opening is about to start: music holds back (osLeadWait)
    const c = typeof cutFor === 'function' ? cutFor(0) : null, floor = c && c[0] > 0 ? c[0] : 0;
    if (S.sec !== 0 || audio.currentTime > floor + 20) { OSND.until = 0; return; }   // already jumped far into the book
    const m = osMood(S.book);
    if (!OSND.map[m[0]] && !MUS.manifest) await Promise.race([osManifest(), new Promise(r => setTimeout(r, 1500))]);   // the music list is not here yet: wait a moment for it
    await Promise.race([osLoad(osClip(m[0], S.book)), new Promise(r => setTimeout(r, 2000))]);   // give the clip a moment; otherwise the made sound plays
    if (audio.paused || !S.book || String(S.book.id) !== id) { OSND.until = 0; return; }
    OSND.pv = '';
    if (!(await osPlay(m))) OSND.until = 0;
  }
  /* Milliseconds music should still wait for the opening sound (0 = start now). */
  function osLeadWait() {
    const left = OSND.until - Date.now();
    if (left > 0) return left;
    if (OSND.armed && S.book && OSND.armed === String(S.book.id) && P.openOn !== false) return 1000;   // armed, narrator just started: the opening decides within a moment
    return 0;
  }
  function osPaint() {
    const on = $('#amb-open'); if (!on) return;
    const tc = $('#amb-open-tc'); if (tc) tc.value = osChimeKind();
    const wt = $('#amb-open-wait'); if (wt) wt.checked = P.openWait === true;
    sndNowPaint(); osListPaint(); osManifest().then(osListPaint);   // the list shows the clip each mood would play for this book
    on.checked = P.openOn !== false; $('#amb-open-vol').value = String(P.openVol == null ? 60 : P.openVol);
    const m = osMood(S.book), c = S.book ? osClip(m[0], S.book) : null, note = $('#amb-open-note');
    if (note) note.textContent = (S.book ? 'This book: ' + m[1] + (c ? ' (real clip' + (c.by ? ', ' + c.by : '') + ').' : ' (made on the device).') : 'Open a book to hear its opening sound.') + ' Plays only when a book starts from the beginning.';
  }
  /* ---- "Hear each mood": every mood's clip in a list, to play and compare ---- */
  const OS_ALL = OS_MOODS.map(m => [m[0], m[1]]).concat([OS_CALM]);
  const OS_ICON_PLAY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', OS_ICON_STOP = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  function osClipTitle(c) {
    if (!c) return '';
    if (c.title) return c.title;
    const slug = String(c.id).replace(/^[mo]:/, '').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    return typeof musPrettyTitle === 'function' ? musPrettyTitle(slug) : slug;
  }
  function osListState() {   // the play/stop look of each row (cheap: runs on every start and stop)
    const box = $('#amb-open-list'); if (!box) return;
    box.querySelectorAll('button[data-k]').forEach(b => {
      const on = !!OSND.nodes && OSND.pv === b.dataset.k, nm = b.dataset.n;
      if (b.getAttribute('aria-pressed') === String(on) && b.firstChild) return;
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', (on ? 'Stop ' : 'Hear ') + nm); b.innerHTML = on ? OS_ICON_STOP : OS_ICON_PLAY;
    });
  }
  function osListPaint() {   // rows for every mood: name, the clip this book would get, play button
    const box = $('#amb-open-list'); if (!box) return;
    const here = osMood(S.book)[0];
    box.textContent = '';
    OS_ALL.forEach(([k, n]) => {
      const c = osClip(k, S.book), sub = (k === here && S.book ? 'This book \u00b7 ' : '') + (c ? [osClipTitle(c), c.by].filter(Boolean).join(' \u00b7 ') : 'made on the device');
      const btn = h('button', { class: 'snd-play', type: 'button', 'data-k': k, 'data-n': n });
      box.append(h('div', { class: 'snd-lrow' }, h('div', { class: 'snd-ltxt' }, h('span', { class: 'snd-mn', text: n }), h('small', { text: sub })), h('div', { class: 'snd-lctl' }, btn)));
    });
    osListState();
  }
  async function osPreview(k) {
    if (OSND.nodes && OSND.pv === k) { osStop(0.4); OSND.pv = ''; osListState(); return; }   // tap again = stop
    const m = OS_ALL.find(x => x[0] === k); if (!m) return;
    if (!ambBuild()) { toast('Sound is not available here.'); return; }
    OSND.pv = k;
    await osManifest();
    if (OSND.pv !== k) return;   // another mood was tapped while this one loaded
    osListPaint();
    await osLoad(osClip(k, S.book));
    if (OSND.pv !== k) return;
    const ok = await osPlay(m, S.book, true, true);
    if (ok) OSND.until = 0;   // a preview must not hold the background music back
    else { OSND.pv = ''; toast('Turn the intro chime volume up to hear it.'); }
    osListState();
  }
  /* ---- narration after the opening: audio.play() is held while the opening plays ---- */
  let osRealPlay = null, osRealPause = null;
  function osHoldWanted() {   // is this play() the start of a book with an opening that the narrator should wait for?
    if (P.openWait !== true || OSND.hold || !OSND.armed || !S.book || OSND.armed !== String(S.book.id)) return false;
    if (P.openOn === false || !sndOn() || !audio.paused) return false;
    const c = typeof cutFor === 'function' ? cutFor(0) : null, floor = c && c[0] > 0 ? c[0] : 0;
    return S.sec === 0 && audio.currentTime <= floor + 20;
  }
  function osHoldEnd(start) {   // the wait is over: start the narrator (start = true) or just drop the wait (a pause, another book)
    const hd = OSND.hold; if (!hd) return;
    clearTimeout(hd.timer); OSND.hold = null;
    if (start && S.book && String(S.book.id) === hd.id) {
      try { const r = osRealPlay(); if (r && r.catch) r.catch(e => { if (typeof onPlayFail === 'function') onPlayFail(e); }); } catch (e) { /* the play button still works */ }
    }
  }
  async function osHoldBegin() {
    const b = S.book, id = String(b.id), m = osMood(b), hd = OSND.hold = { id, timer: 0 };
    OSND.armed = ''; OSND.until = Date.now() + 2500;   // music holds back
    toast('Opening first. Tap play to skip.', 2500);
    hd.timer = setTimeout(() => { if (OSND.hold === hd) { OSND.until = 0; osHoldEnd(true); } }, 8000);   // safety: if anything below hangs (a suspended audio context never resumes), the narrator still starts
    try {
      if (!OSND.map[m[0]] && !MUS.manifest) await Promise.race([osManifest(), new Promise(r => setTimeout(r, 1500))]);
      await Promise.race([osLoad(osClip(m[0], b)), new Promise(r => setTimeout(r, 2000))]);
      if (OSND.hold !== hd) return;   // skipped or stopped meanwhile
      OSND.pv = '';
      const ok = await osPlay(m, b);
      if (OSND.hold !== hd) return;
      if (!ok) { OSND.until = 0; osHoldEnd(true); return; }   // no opening can play (volume 0, sound blocked): start the narrator at once
      clearTimeout(hd.timer); hd.timer = setTimeout(() => osHoldEnd(true), Math.max(1000, OSND.until - Date.now()));   // the narrator starts as the music is halfway down its fade
    } catch (e) { if (OSND.hold === hd) { OSND.until = 0; osHoldEnd(true); } }   // only this book's own wait: a newer book's wait is not ours to end
  }
  function osOnEmptied() { if (!OSND.hold) osStop(0.2); }   // a new source: stop the opening, except while the narrator is waiting for it (the book's own source change fires this just after play())
  function osGateInstall() {
    if (OSND.gated) return; OSND.gated = true;
    osRealPlay = audio.play.bind(audio); osRealPause = audio.pause.bind(audio);
    audio.play = function () {
      if (OSND.hold) { osStop(0.8); osHoldEnd(false); return osRealPlay(); }   // play tapped during the wait: skip the opening, start now
      if (osHoldWanted()) { osHoldBegin(); return Promise.resolve(); }
      return osRealPlay();
    };
    audio.pause = function () { if (OSND.hold) { osHoldEnd(false); osStop(0.6); } return osRealPause(); };
  }
  function osInit() {
    const on = $('#amb-open'); if (!on) return;
    on.addEventListener('change', e => { P.openOn = e.target.checked; savePrefs(); if (!P.openOn) { OSND.armed = ''; osStop(0.3); } });
    $('#amb-open-vol').addEventListener('input', e => { P.openVol = +e.target.value; savePrefs(); });
    $('#amb-open-hear').addEventListener('click', async () => { const m = osMood(S.book); OSND.pv = ''; if (ambBuild()) { await osManifest(); await osLoad(osClip(m[0], S.book)); osPlay(m, S.book, true); } else toast('Sound is not available here.'); });
    const tc = $('#amb-open-tc'); if (tc) tc.addEventListener('change', e => { P.openChime = e.target.value; savePrefs(); osTitleHear(osChimeKind()); });
    const lb = $('#amb-open-list'); if (lb) lb.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) osPreview(b.dataset.k); });
    osGateInstall();
    const wt = $('#amb-open-wait'); if (wt) wt.addEventListener('change', e => { P.openWait = e.target.checked; savePrefs(); });
    audio.addEventListener('playing', osOnPlaying);
    audio.addEventListener('pause', () => { if (OSND.nodes) osStop(0.6); });
    audio.addEventListener('emptied', osOnEmptied);
    ['play', 'pause', 'playing', 'emptied'].forEach(ev => audio.addEventListener(ev, () => setTimeout(sndNowPaint, 50)));   // after the music and ambient listeners have run
    setTimeout(osManifest, 7000); osPaint();
    const sheet = $('#sheet-amb'); if (sheet) new MutationObserver(osPaint).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }
