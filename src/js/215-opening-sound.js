  /* ---------- opening sound ----------
     A short piece of music that fades in when a book starts from its beginning and sinks away under the first words
     of the narration, the way a story video opens. The mood is picked by itself from the book's genres and title
     (gothic, mystery, romance, adventure, fantasy, children, drama, science fiction, or a calm default).
     Each mood plays a real royalty-free clip when openings.json in the repo lists one (cached for offline use, like
     the ambient recordings); until a clip is listed it plays a soft sound made on the device, so it always works.
     It never plays when a book is resumed from the middle. Settings: Cinematic sound > "Opening sound". */
  const OSND = { armed: '', tok: 0, nodes: null, map: {}, buf: {}, busy: {}, fail: {}, mood: '', until: 0 };
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
  function osMood(b) {   // the mood for this book: [key, name]
    if (!b) return OS_CALM;
    const row = b.genres || ((CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '';
    const text = (String(row) + ' ' + (b.title || '')).toLowerCase();
    for (const [k, n, re] of OS_MOODS) if (re.test(text)) return [k, n];
    return OS_CALM;
  }
  /* ---- the clip list: openings.json in the repo, like recordings.json ---- */
  async function osManifest() {
    const set = (d, base) => { OSND.map = {}; if (!d || typeof d !== 'object') return; Object.keys(d).forEach(k => { const m = d[k]; if (m && m.file) { try { OSND.map[k] = { url: new URL(m.file, base).href, by: m.by || '', license: m.license || '' }; } catch (e) { /* bad address */ } } }); };
    try {
      const c = store.get('wt:osmap', null);
      if (c && c.d) set(c.d, c.base);
      if (c && Date.now() - c.t < 24 * 3600e3) return;
      const base = 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/';
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'openings.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json(); set(d, base); store.set('wt:osmap', { t: Date.now(), d, base });
    } catch (e) { /* offline, or no openings.json in the repo yet: the made sound plays */ }
  }
  function osLoad(k) {   // fetch, cache and decode the clip for one mood; resolves when done (also when there is no clip)
    const m = OSND.map[k];
    if (!m || OSND.buf[k] || !AMB.ctx || Date.now() - (OSND.fail[k] || 0) < 60000) return Promise.resolve();
    if (OSND.busy[k]) return OSND.busy[k];
    OSND.busy[k] = (async () => {
      try {
        let resp = null, cache = null;
        try { cache = await caches.open('wt-amb-rec'); resp = await cache.match(m.url); } catch (e) { /* no cache here: download each time */ }
        if (!resp) {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
          const r = await fetch(m.url, { signal: ctl.signal }); clearTimeout(to);
          if (!r.ok) throw new Error('http ' + r.status);
          if (cache) { try { await cache.put(m.url, r.clone()); } catch (e) { /* too big or blocked: still play it */ } }
          resp = r;
        }
        OSND.buf[k] = await AMB.ctx.decodeAudioData(await resp.arrayBuffer()); delete OSND.fail[k];
      } catch (e) { OSND.fail[k] = Date.now(); }
      delete OSND.busy[k];
    })();
    return OSND.busy[k];
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
    const n = OSND.nodes; OSND.tok++; OSND.nodes = null; OSND.until = 0; if (!n) return;
    try { const t = AMB.ctx.currentTime; n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0, t + (fade == null ? 0.5 : fade)); setTimeout(() => { try { n.g.disconnect(); n.lp.disconnect(); } catch (e) { /* already gone */ } }, ((fade == null ? 0.5 : fade) + 0.3) * 1000); } catch (e) { /* context gone */ }
  }
  async function osPlay(mood) {   // mood: [key, name]
    if (!ambBuild()) return false;
    const ctx = AMB.ctx, tok = ++OSND.tok, k = mood[0];
    try { if (ctx.state !== 'running') await ctx.resume(); } catch (e) { /* needs a tap first: skip quietly */ }
    if (tok !== OSND.tok) return false;
    const vol = (P.openVol == null ? 60 : P.openVol) / 100;
    if (!(vol > 0)) return false;
    osStop(0.2); OSND.tok = tok;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + 0.05;
    lp.type = 'lowpass'; lp.frequency.value = 6000; lp.connect(g); g.connect(ctx.destination);
    const buf = OSND.buf[k], len = buf ? Math.min(buf.duration, 24) : 14, top = 0.85 * vol;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(top, t + 1.5); g.gain.setValueAtTime(top, t + Math.max(2, len - 4.5)); g.gain.linearRampToValueAtTime(0, t + len);
    if (buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(lp); s.start(t); s.stop(t + len + 0.1); }
    else (OS_SYNTH[k] || OS_SYNTH.calm)(lp, t);
    OSND.nodes = { g, lp }; OSND.mood = k;
    OSND.until = Date.now() + Math.max(6, len - 4) * 1000;   // music may start about 4 s before the opening ends (never earlier than 6 s)
    setTimeout(() => { if (OSND.nodes && OSND.nodes.g === g) osStop(0.1); }, (len + 0.5) * 1000);
    return true;
  }
  /* ---- when: only from the beginning of a book ---- */
  function osArm(b, saved) {   // called by openBook: a start from the first track, near its start, arms the sound; a resume does not
    OSND.armed = ''; osStop(0.3);
    if (P.openOn === false || !b || !b.secs || !b.secs.length) return;
    const t = saved && saved.time > 0 ? saved.time : 0;
    if (S.sec !== 0 || t > 15) return;   // resuming in the middle: stay silent
    OSND.armed = String(b.id);
    const m = osMood(b);
    if (AMB.ctx || ambBuild()) osManifest().then(() => { if (OSND.armed === String(b.id)) osLoad(m[0]); });
  }
  async function osOnPlaying() {
    if (!OSND.armed || !S.book || OSND.armed !== String(S.book.id)) return;
    const id = OSND.armed; OSND.armed = '';
    OSND.until = Date.now() + 2500;   // an opening is about to start: music holds back (osLeadWait)
    const c = typeof cutFor === 'function' ? cutFor(0) : null, floor = c && c[0] > 0 ? c[0] : 0;
    if (S.sec !== 0 || audio.currentTime > floor + 20) { OSND.until = 0; return; }   // already jumped far into the book
    const m = osMood(S.book);
    await Promise.race([osLoad(m[0]), new Promise(r => setTimeout(r, 2000))]);   // give the clip a moment; otherwise the made sound plays
    if (audio.paused || !S.book || String(S.book.id) !== id) { OSND.until = 0; return; }
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
    on.checked = P.openOn !== false; $('#amb-open-vol').value = String(P.openVol == null ? 60 : P.openVol);
    const m = osMood(S.book), note = $('#amb-open-note');
    if (note) note.textContent = (S.book ? 'This book: ' + m[1] + (OSND.map[m[0]] ? ' (real clip' + (OSND.map[m[0]].by ? ', ' + OSND.map[m[0]].by : '') + ').' : ' (made on the device).') : 'Open a book to hear its opening sound.') + ' Plays only when a book starts from the beginning.';
  }
  function osInit() {
    const on = $('#amb-open'); if (!on) return;
    on.addEventListener('change', e => { P.openOn = e.target.checked; savePrefs(); if (!P.openOn) { OSND.armed = ''; osStop(0.3); } });
    $('#amb-open-vol').addEventListener('input', e => { P.openVol = +e.target.value; savePrefs(); });
    $('#amb-open-hear').addEventListener('click', async () => { const m = osMood(S.book); osManifest(); if (ambBuild()) { await osLoad(m[0]); osPlay(m); } else toast('Sound is not available here.'); });
    audio.addEventListener('playing', osOnPlaying);
    audio.addEventListener('pause', () => { if (OSND.nodes) osStop(0.6); });
    audio.addEventListener('emptied', () => osStop(0.2));
    setTimeout(osManifest, 7000); osPaint();
    const sheet = $('#sheet-amb'); if (sheet) new MutationObserver(osPaint).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }
