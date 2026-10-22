  /* ---------- 205-music-player.js ----------
     Melodic background music that follows the story's mood.
     Clips are CC0/CC-BY files in music/ in the GitHub data repo, listed in music.json.
     The engine crossfades clips seamlessly to cover long chapters, and crossfades between
     moods when the scene changes. Music sits under the narrator (shares AMB duck chain).
     Settings > Audio: Music on/off toggle + volume slider. */

  const MUS = {
    ctx: null,      // AudioContext — shared with AMB once it exists
    master: null,   // GainNode connected to AMB.master
    manifest: null, // parsed music.json
    mood: '',       // current mood key
    queue: [],      // shuffled clip list for current mood
    qi: 0,          // index into queue
    playing: null,  // { src, gain, _file, _lufsGain } for the current clip
    fading: null,   // previous clip still fading out
    xTimer: 0,      // setTimeout handle for the next crossfade
    gen: 0,         // bumped on every mood switch and stop, so a clip that finishes loading late is dropped
    on: false,      // true once attached to AMB.ctx
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
     Returns a playing-node descriptor. */
  function musSchedule(buf, clip, when, fadeIn, vol) {
    const ctx = MUS.ctx;
    const lufsGain = musLufsGain(clip.lufs);
    const gain = ctx.createGain();
    gain.connect(MUS.master);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol * lufsGain, when + fadeIn);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain);
    src.loopStart = (clip.lk && clip.lk[0]) || 0;
    src.loopEnd   = (clip.lk && clip.lk[1]) || clip.dur || buf.duration;
    src.loop = true;   // looping is stopped manually at the crossfade point
    src.start(when);

    return { src, gain, _file: clip.f, _lkEnd: src.loopEnd, _vol: vol, _lufsGain: lufsGain };
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
    const vol = musVol() * (P.musOn !== false ? 1 : 0);
    musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.fading  = MUS.playing;
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE, vol);

    clearTimeout(MUS.xTimer);
    MUS.xTimer = setTimeout(musNextClip, musPlayMs(clip, buf));
  }

  /* Switch to a new mood with a crossfade. */
  async function musSwitchMood(mood, force) {
    if (!MUS.on || !MUS.ctx || (mood === MUS.mood && !force)) return;   // force: restart the same mood after a pause
    MUS.mood  = mood;
    const gen = ++MUS.gen;
    MUS.queue = musQueue(mood);
    MUS.qi    = 0;
    clearTimeout(MUS.xTimer);

    const got = await musLoadNext(gen);
    if (!got || gen !== MUS.gen) return;   // nothing loaded, or a newer mood switch or a stop came in meanwhile
    const { clip, buf } = got;

    const now = MUS.ctx.currentTime;
    const vol = musVol() * (P.musOn !== false ? 1 : 0);
    if (MUS.playing) musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE, vol);

    MUS.xTimer  = setTimeout(musNextClip, musPlayMs(clip, buf));
  }

  /* Stop all music with a short fade. */
  function musStop(fadeDur) {
    MUS.gen++;
    clearTimeout(MUS.xTimer);
    if (!MUS.ctx) return;
    const now = MUS.ctx.currentTime, d = fadeDur || 1.5;
    if (MUS.playing) { musFadeOut(MUS.playing, now, d); MUS.playing = null; }
    if (MUS.fading)  { musFadeOut(MUS.fading,  now, d); MUS.fading  = null; }
  }

  /* Called when the narrator starts playing. */
  function musicPlay() {
    if (!P.musOn || !MUS.on || !MUS.manifest) return;
    if (MUS.playing) return;
    musSwitchMood(MUS.mood || 'neutral', true);   // after a pause MUS.mood is unchanged, so force the restart
  }

  /* Called when the narrator pauses or ends. */
  function musicPause() { musStop(2); }

  /* Called by scene detection when the mood changes (every paragraph). */
  function musicMoodChange(scMood) {
    const m = MUS_MOOD_MAP[scMood] || 'neutral';
    if (m !== MUS.mood) musSwitchMood(m);
  }

  /* Called from the Settings volume slider. */
  function musicVolChange(v) {
    P.musVol = Math.max(0, Math.min(100, Math.round(v)));
    savePrefs();
    if (MUS.playing && MUS.ctx) {
      const now = MUS.ctx.currentTime;
      const target = musVol() * MUS.playing._lufsGain;
      const g = MUS.playing.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);   // start the ramp from the level heard now, so moving the slider mid-fade-in doesn't jump
      g.linearRampToValueAtTime(target, now + 0.3);
    }
  }

  /* Hook into AMB's AudioContext once it exists.
     Idempotent — safe to call on every play event. */
  function musicAttach() {
    if (MUS.on || !AMB.ctx || !AMB.master) return;
    MUS.ctx    = AMB.ctx;
    MUS.master = AMB.master;   // music → same master gain → same duck chain as ambient
    MUS.on     = true;
    if (!MUS.manifest) musFetchManifest().then(() => { if (ambPlaying()) musicPlay(); });
    else if (ambPlaying()) musicPlay();
  }

  /* Called once at startup to pre-fetch the manifest in the background. */
  async function musicInit() {
    if (!MUS.manifest) musFetchManifest();   // fire and forget; attach waits for AMB.ctx
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
