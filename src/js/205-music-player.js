  /* ---------- 205-music-player.js ----------
     Melodic background music that follows the story's mood.
     Clips are CC0/CC-BY files in music/ in the GitHub data repo, listed in music.json.
     The engine crossfades clips seamlessly to cover long chapters, and crossfades between
     moods when the scene changes. Music has its own audio bus (musicGain -> musicDuck -> destination),
     independent of the ambient engine: it plays with ambient off, and ambient on/off never touches it.
     It shares only the AudioContext (audioCtx() in 210-sound-mixer.js).
     Settings > Audio: Music on/off toggle + volume slider. */

  const MUS = {
    ctx: null,      // the shared AudioContext (audioCtx()); created even when ambient is off
    master: null,   // musicGain: user volume; every clip connects here
    duck: null,     // musicDuck: gain between the carve filters and ctx.destination, driven by the narrator (musDuckTick)
    ca: null, cb: null,   // speech-band carve (3 kHz, 800 Hz): flat until the narrator speaks
    duckIv: 0,      // setInterval handle of musDuckTick (runs only while music is live, ambient on or off)
    duckS: '',      // last duck state applied: s speaking, p pause, u unknown, o off
    live: false,    // music is wanted/playing (a clip is loading or sounding): the context must not be suspended
    sTimer: 0,      // setTimeout handle: suspend the context a moment after music stops (if ambient is silent too)
    manifest: null, // parsed music.json
    mood: '',       // current mood key
    queue: [],      // shuffled clip list for current mood
    qi: 0,          // index into queue
    playing: null,  // { src, gain, _file, _lufsGain } for the current clip
    fading: null,   // previous clip still fading out
    xTimer: 0,      // setTimeout handle for the next crossfade
    rt: 0,          // setTimeout handle: retry after a failed load (offline), while the narrator plays
    lt: 0,          // setTimeout handle: music waits for the opening sound to finish
    gen: 0,         // bumped on every mood switch and stop, so a clip that finishes loading late is dropped
    on: false,      // true once the music bus is built on the shared context
    base: '',       // data root override (local test mode only); '' = GitHub raw
  };

  /* Local test mode: when the app runs on localhost (tools/dev_server.py), music.json and
     the clips are read from /_data/ (your wordtrail-data folder) instead of GitHub. */
  const MUS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  /* Maps scene-detection mood labels → music mood buckets.
     'neutral' plays when no mood has been committed yet. */
  const MUS_MOOD_MAP = {
    dread:  'dread',
    danger: 'danger',
    peace:  'peace',
    sorrow: 'sorrow',
    merry:  'merry',
  };

  /* Loudness normalisation: each clip carries its measured LUFS in the manifest.
     Gain = 10 ^ ((target − measured) / 20). Target is −18 LUFS (quiet under speech). */
  const MUS_TARGET_LUFS = -18;
  function musLufsGain(lufs) {
    return Math.pow(10, (MUS_TARGET_LUFS - (lufs || MUS_TARGET_LUFS)) / 20);
  }

  /* User volume: P.musVol is 0–100, default 40. */
  const musVol = () => (P.musVol == null ? 40 : Math.max(0, Math.min(100, P.musVol))) / 100;

  /* The music bus level: user volume (0 when music is switched off). Clips carry only their LUFS gain. */
  const musBusLevel = () => musVol() * (P.musOn !== false ? 1 : 0);
  function musBusApply(tc) {
    if (!MUS.master || !MUS.ctx) return;
    MUS.master.gain.setTargetAtTime(musBusLevel(), MUS.ctx.currentTime, tc == null ? 0.1 : tc);
  }

  /* True while music is loading or sounding. Read by audioSuspendSoon() so the shared context stays
     running for the music even when ambient is silent. */
  const musicActive = () => !!(MUS.on && MUS.live);

  /* The book's narrator is being played (not paused or finished). Independent of ambient. */
  const musNarrating = () => !!S.book && !audio.paused && !audio.ended;

  /* ---------- Ducking under the narrator ----------
     Same states as the ambient duck (ambVoiceState: s speaking, p pause, u unknown, o off), but its own
     numbers, because music is a louder, denser source than a rain bed:
       speaking: gain 0.28 (about -11 dB) + a gentle carve of the voice band (-4 dB at 3 kHz, -2 dB at 800 Hz)
       pause:    gain 0.70 (opens up between sentences, never to full)
       unknown:  gain 0.50 (no exact times and no analyser: sit lower the whole time)
       off:      gain 1 (narrator not playing, or P.musDuck switched off)
     Fast attack (0.08 s), slow release (0.9 s), so the music dips before the word and breathes back in the gaps. */
  const MUS_DUCK = { s: { v: [0.28, -4, -2], tc: 0.08 }, p: { v: [0.7, 0, 0], tc: 0.9 }, u: { v: [0.5, -2, -1], tc: 0.4 }, o: { v: [1, 0, 0], tc: 0.5 } };
  function musDuckSet(st) {
    if (!MUS.duck || !MUS.ctx) return;
    const r = MUS_DUCK[st] || MUS_DUCK.o, t = MUS.ctx.currentTime;
    MUS.duck.gain.setTargetAtTime(r.v[0], t, r.tc);
    if (MUS.ca) { MUS.ca.gain.setTargetAtTime(r.v[1], t, r.tc); MUS.cb.gain.setTargetAtTime(r.v[2], t, r.tc); }
  }
  function musDuckTick() {
    if (!MUS.on || !MUS.duck) return;
    if (audio.seeking) return;   // a seek is a short gap: keep the music as it is
    let st = 'o';
    if (P.musDuck !== false && musNarrating() && !S.loadingAudio && !audio.error && audio.readyState > 2) st = ambVoiceState();
    if (st !== MUS.duckS) { MUS.duckS = st; musDuckSet(st); }
  }
  function musDuckStart() { if (!MUS.duckIv) MUS.duckIv = setInterval(musDuckTick, 60); }
  function musDuckStop() { clearInterval(MUS.duckIv); MUS.duckIv = 0; MUS.duckS = ''; }

  /* Fetch and cache music.json from the GitHub data repo. */
  async function musFetchManifest() {
    if (MUS_LOCAL) {
      try {
        const r = await fetch('/_data/music.json', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && d.v === 1 && d.moods) {
            MUS.manifest = d; MUS.base = location.origin + '/_data/';
            console.info('[music] local test mode: using /_data/music.json');
            return;
          }
        }
      } catch (e) { /* no local data — fall through to GitHub */ }
    }
    try {
      const cached = store.get('wt:music-manifest', null);
      if (cached && cached.d && Date.now() - cached.t < 24 * 3600e3) {
        MUS.manifest = cached.d; return;
      }
      const base = 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/';
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'music.json', { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return;
      const d = await r.json();
      if (d && d.v === 1 && d.moods) {
        MUS.manifest = d;
        store.set('wt:music-manifest', { t: Date.now(), d });
      }
    } catch (e) { /* offline or not yet published — silent */ }
  }

  /* Build a shuffled clip queue for a mood. Rotates if first clip equals the last-played one. */
  function musQueue(mood) {
    const clips = (MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[mood]) || [];
    if (!clips.length) return [];
    const arr = clips.slice().sort(() => Math.random() - 0.5);
    if (MUS.playing && arr[0] && arr[0].f === MUS.playing._file) arr.push(arr.shift());
    return arr;
  }

  /* Resolve a clip path to an absolute raw GitHub URL. */
  function musClipUrl(f) {
    return (MUS.base || ('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/')) + 'music/' + f;
  }

  /* Fetch a clip, cache it in the Cache API, decode it. Returns AudioBuffer or null. */
  async function musFetch(f) {
    const url = musClipUrl(f);
    try {
      let resp;
      if (MUS.base) {
        resp = await fetch(url, { cache: 'no-store' });   // local test mode: never cache
      } else try {
        const c = await caches.open('wt-music');
        resp = await c.match(url);
        if (!resp) { resp = await fetch(url); if (resp.ok) await c.put(url, resp.clone()); }
      } catch (e) { resp = await fetch(url); }
      if (!resp || !resp.ok) return null;
      return await MUS.ctx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) { return null; }
  }

  /* Schedule one clip at AudioContext time `when`, fading in over `fadeIn` seconds.
     The clip's own gain is only its LUFS normalisation; the user volume lives on the bus (MUS.master).
     Returns a playing-node descriptor. */
  function musSchedule(buf, clip, when, fadeIn) {
    const ctx = MUS.ctx;
    const lufsGain = musLufsGain(clip.lufs);
    const gain = ctx.createGain();
    gain.connect(MUS.master);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(lufsGain, when + fadeIn);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.loopStart = (clip.lk && clip.lk[0]) || 0;
    src.loopEnd   = (clip.lk && clip.lk[1]) || clip.dur || buf.duration;
    src.loop = true;   // looping is stopped manually at the crossfade point
    src.start(when);

    return { src, gain, _file: clip.f, _clip: clip, _lkEnd: src.loopEnd, _lufsGain: lufsGain };
  }

  /* Fade out a playing-node over `dur` seconds starting at `when`, then stop it. */
  function musFadeOut(node, when, dur) {
    if (!node) return;
    node.gain.gain.cancelScheduledValues(when);
    node.gain.gain.setValueAtTime(node.gain.gain.value, when);
    node.gain.gain.linearRampToValueAtTime(0, when + dur);
    try { node.src.stop(when + dur + 0.1); } catch (e) {}
  }

  const MUS_FADE = 6;    // crossfade duration in seconds
  const MUS_PRE  = 10;   // seconds before loop-end to start the next crossfade

  /* How long a clip plays before the next crossfade starts: its first pass (0 → loop end) less MUS_PRE. */
  const musPlayMs = (clip, buf) => Math.max(1, ((clip.lk && clip.lk[1]) || clip.dur || buf.duration) - MUS_PRE) * 1000;

  /* Load the next playable clip of the queue. A clip that fails to load is skipped, and each is tried
     at most once. Returns { clip, buf }, or null if none loaded or a newer switch/stop came in meanwhile. */
  async function musLoadNext(gen) {
    const n = MUS.queue.length;
    for (let i = 0; i < n; i++) {
      const clip = MUS.queue[MUS.qi % n]; MUS.qi++;
      const buf = await musFetch(clip.f);
      if (gen !== MUS.gen) return null;
      if (buf) return { clip, buf };
    }
    return null;
  }

  /* Load the next clip in the same mood and crossfade to it.
     Called MUS_PRE seconds before the current clip's loop-end. */
  async function musNextClip() {
    if (!MUS.on || !MUS.ctx || !MUS.playing) return;
    if (!MUS.queue.length) { MUS.queue = musQueue(MUS.mood); MUS.qi = 0; }
    const gen = MUS.gen;
    const got = await musLoadNext(gen);
    if (!MUS.playing || gen !== MUS.gen) return;   // mood changed or music stopped while fetching
    if (!got) {   // nothing loaded (offline?): the current clip keeps looping, so try again in a minute
      clearTimeout(MUS.xTimer); MUS.xTimer = setTimeout(musNextClip, 60e3); return;
    }
    const { clip, buf } = got;

    const now = MUS.ctx.currentTime;
    musBusApply();
    musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.fading  = MUS.playing;
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE);

    clearTimeout(MUS.xTimer);
    MUS.xTimer = setTimeout(musNextClip, musPlayMs(clip, buf));
    sndNowPaint();
  }

  /* Switch to a new mood with a crossfade. */
  async function musSwitchMood(mood, force) {
    if (!MUS.on || !MUS.ctx || (mood === MUS.mood && !force)) return;   // force: restart the same mood after a pause
    MUS.mood  = mood;
    const gen = ++MUS.gen;
    MUS.queue = musQueue(mood);
    MUS.qi    = 0;
    clearTimeout(MUS.xTimer); clearTimeout(MUS.sTimer); clearTimeout(MUS.rt); clearTimeout(MUS.lt);
    MUS.live = true;   // keeps the shared context from being suspended while this loads and plays
    musDuckStart();    // the narrator duck runs whenever music is live, with ambient on or off
    if (MUS.ctx.state !== 'running') MUS.ctx.resume().catch(() => {});

    const got = await musLoadNext(gen);
    if (gen !== MUS.gen) return;   // a newer mood switch or a stop came in meanwhile
    if (!got) {   // nothing loaded (offline?): stop holding the engine, and try again in 45 s while the story is being read
      if (!MUS.playing) MUS.live = false;
      clearTimeout(MUS.rt);
      MUS.rt = setTimeout(() => { if (P.musOn && !MUS.playing && musNarrating()) musSwitchMood(MUS.mood || 'neutral', true); }, 45e3);
      return;
    }
    const { clip, buf } = got;

    const now = MUS.ctx.currentTime;
    musBusApply();
    if (MUS.playing) musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE);

    MUS.xTimer  = setTimeout(musNextClip, musPlayMs(clip, buf));
    sndNowPaint();
  }

  /* Stop all music with a short fade. */
  function musStop(fadeDur) {
    MUS.gen++;
    clearTimeout(MUS.xTimer); clearTimeout(MUS.rt); clearTimeout(MUS.lt);
    MUS.live = false; musDuckStop();
    if (!MUS.ctx) return;
    const now = MUS.ctx.currentTime, d = fadeDur || 1.5;
    if (MUS.playing) { musFadeOut(MUS.playing, now, d); MUS.playing = null; }
    if (MUS.fading)  { musFadeOut(MUS.fading,  now, d); MUS.fading  = null; }
    audioSuspendSoon((d + 0.6) * 1000, 'sTimer');   // after the fade, stop the engine if ambient is silent too
    sndNowPaint();
  }

  /* ---------- Now playing ----------
     One short block at the top of the sound sheet (#amb-now): the music (mood, track, artist), the scene, and the
     opening sound. Each piece is its own element so the translator can match fixed words one by one. */
  const MUS_MOOD_NAME = { neutral: 'Neutral', dread: 'Dread', danger: 'Danger', peace: 'Peaceful', sorrow: 'Sad', merry: 'Merry' };
  function sndNowPaint() {
    try {
      const box = $('#amb-now'); if (!box) return;
      const rows = [];
      if (P.musOn) {
        const p = MUS.playing, c = p && p._clip;
        if (c) {
          const slug = String(c.f).split('/').pop().replace(/\.mp3$/i, '');
          rows.push(['Music', MUS_MOOD_NAME[MUS.mood] || 'Neutral', c.t || MUS_TITLES[slug] || musPrettyTitle(slug), c.by || '']);
        } else if (!musNarrating()) rows.push(['Music', 'paused']);
        else if (osLeadWait() > 0) rows.push(['Music', 'starts after the opening']);
        else if (MUS.live) rows.push(['Music', 'loading']);
        else rows.push(['Music', 'not playing yet']);
      }
      if (P.ambOn === true && AMB.on && AMB.lbl) rows.push(['Scene', AMB.lbl]);
      if (OSND.nodes) rows.push(['Opening', OSND.buf[OSND.mood] ? 'recorded clip' : 'made on the device']);
      box.textContent = ''; box.hidden = !rows.length;
      rows.forEach(r => {
        const row = h('div', {}, h('span', { class: 'k', text: r[0] }), ' ');
        r.slice(1).filter(Boolean).forEach((t, i) => { if (i) row.append(' \u00b7 '); row.append(h('span', { text: t })); });
        box.append(row);
      });
    } catch (e) { /* a status line must never break playback */ }
  }

  /* Called when the narrator starts playing. */
  function musicPlay() {
    if (!P.musOn || !MUS.on || !MUS.manifest || !musNarrating()) return;   // needs the narrator playing; ambient is irrelevant
    if (MUS.playing) return;
    const wait = osLeadWait();   // a recorded or made opening sound is still playing: music comes in near its end
    if (wait > 0) { clearTimeout(MUS.lt); MUS.lt = setTimeout(musicPlay, wait + 50); sndNowPaint(); return; }
    musSwitchMood(MUS.mood || 'neutral', true);   // after a pause MUS.mood is unchanged, so force the restart
  }

  /* Called when the narrator pauses or ends. */
  function musicPause() { musStop(2); }

  /* Called by scene detection when the mood changes (every paragraph). */
  function musicMoodChange(scMood) {
    if (!P.musOn || !MUS.on || !MUS.manifest || !musNarrating()) return;   // paused, finished or music off: a tap on a sentence must not start music
    const m = MUS_MOOD_MAP[scMood] || 'neutral';
    if (osLeadWait() > 0) { MUS.mood = m; return; }   // opening sound still playing: remember the mood, musicPlay starts it later
    if (m !== MUS.mood || (!MUS.playing && !MUS.live)) musSwitchMood(m, true);   // also starts music that never got going (failed first load)
  }

  /* Called from the Settings volume slider. */
  function musicVolChange(v) {
    P.musVol = Math.max(0, Math.min(100, Math.round(v)));
    savePrefs();
    musBusApply(0.1);   // the user volume is the bus gain, so a clip that is mid-crossfade keeps its own fade untouched
  }

  /* Build the music's own bus on the shared AudioContext (created here if ambient has not made it).
     musicGain (user volume) -> carve filters -> musicDuck -> ctx.destination. Does NOT use AMB.master, so ambient on/off
     never mutes, suspends or restarts music. Idempotent — safe to call on every play event.
     Callers follow it with musicPlay(), so the cached-manifest case needs no play call here. */
  function musicAttach() {
    if (MUS.on) return;
    const ctx = audioCtx(); if (!ctx) return;
    const master = ctx.createGain(), duck = ctx.createGain(), ca = ctx.createBiquadFilter(), cb = ctx.createBiquadFilter();
    master.gain.value = musBusLevel(); duck.gain.value = 1;
    ca.type = 'peaking'; ca.frequency.value = 3000; ca.Q.value = 0.7; ca.gain.value = 0;   // speech-band carve, flat until the narrator speaks
    cb.type = 'peaking'; cb.frequency.value = 800;  cb.Q.value = 0.9; cb.gain.value = 0;
    master.connect(ca); ca.connect(cb); cb.connect(duck); duck.connect(ctx.destination);
    MUS.ctx = ctx; MUS.master = master; MUS.duck = duck; MUS.ca = ca; MUS.cb = cb; MUS.on = true;
    if (!MUS.manifest) musFetchManifest().then(() => { if (musNarrating()) musicPlay(); });
  }

  /* Called once at startup to pre-fetch the manifest in the background. */
  async function musicInit() {
    if (!MUS.manifest) musFetchManifest();   // fire and forget; the bus is built on the first play
  }

  /* ---------- Music credits ----------
     CC BY needs attribution, so About lists every track in music.json.
     Title: the clip's "t" field if present, else MUS_TITLES, else made from the file name.
     Tracks that appear under two moods (placeholders) are listed once. */
  const MUS_TITLES = { 'scp-x1x': 'SCP-x1x', 'ibn-al-noor': 'Ibn Al-Noor' };
  const MUS_SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'it', 'of', 'on', 'the', 'to']);
  function musPrettyTitle(slug) {
    return String(slug).replace(/_/g, '-').split('-').filter(Boolean).map((w, i) =>
      (i && MUS_SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function musLicense(lic) {
    const l = String(lic || '').toUpperCase().replace(/[\s_]+/g, '-');
    if (l === 'CC-BY' || l === 'CC-BY-4.0') return { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    if (l === 'CC0') return { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    return { name: String(lic || ''), url: '' };
  }
  function musCreditList() {
    const moods = (MUS.manifest && MUS.manifest.moods) || {}, seen = new Set(), out = [];
    for (const mood of Object.keys(moods)) for (const c of (moods[mood] || [])) {
      if (!c || !c.f) continue;
      const slug = String(c.f).split('/').pop().replace(/\.mp3$/i, '');
      const title = c.t || MUS_TITLES[slug] || musPrettyTitle(slug);
      const by = c.by || 'Unknown artist', key = (title + '|' + by).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); out.push({ title, by, lic: c.lic || '' });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }
  const musLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
  /* Fills #music-credits-list (About, Account tab). Works with music switched off. */
  async function musRenderCredits() {
    const box = $('#music-credits-list'); if (!box) return;
    if (!MUS.manifest) { box.textContent = 'Loading…'; await musFetchManifest(); }
    const list = musCreditList();
    box.textContent = '';
    if (!list.length) { box.append(h('p', { class: 'help', text: 'The music list could not be loaded. Check your connection and open this again.' })); return; }
    box.append(h('ul', { class: 'credits-list' }, list.map(c => {
      const lic = musLicense(c.lic), kevin = /^kevin macleod$/i.test(c.by);
      return h('li', {},
        '“' + c.title + '” ',
        kevin ? musLink('https://incompetech.com/', c.by) : c.by,
        kevin ? ' (incompetech.com)' : '',
        lic.name ? [' · ', lic.url ? musLink(lic.url, lic.name) : lic.name] : '');
    })));
  }
