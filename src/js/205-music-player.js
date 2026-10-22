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
    on: false,      // true once attached to AMB.ctx
  };

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
    return 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/music/' + f;
  }

  /* Fetch a clip, cache it in the Cache API, decode it. Returns AudioBuffer or null. */
  async function musFetch(f) {
    const url = musClipUrl(f);
    try {
      let resp;
      try {
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

  /* Load the next clip in the same mood and crossfade to it.
     Called MUS_PRE seconds before the current clip's loop-end. */
  async function musNextClip() {
    if (!MUS.on || !MUS.ctx || !MUS.playing) return;
    if (!MUS.queue.length) { MUS.queue = musQueue(MUS.mood); MUS.qi = 0; }
    const clip = MUS.queue[MUS.qi % MUS.queue.length]; MUS.qi++;
    if (!clip) return;

    const buf = await musFetch(clip.f);
    if (!buf || !MUS.playing) return;   // mood may have changed while fetching

    const now = MUS.ctx.currentTime;
    const vol = musVol() * (P.musOn !== false ? 1 : 0);
    musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.fading  = MUS.playing;
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE, vol);

    const lkLen = (clip.lk ? clip.lk[1] - clip.lk[0] : clip.dur || buf.duration);
    clearTimeout(MUS.xTimer);
    MUS.xTimer = setTimeout(musNextClip, Math.max(1, lkLen - MUS_PRE) * 1000);
  }

  /* Switch to a new mood with a crossfade. */
  async function musSwitchMood(mood) {
    if (!MUS.on || !MUS.ctx || mood === MUS.mood) return;
    MUS.mood  = mood;
    MUS.queue = musQueue(mood);
    MUS.qi    = 0;
    clearTimeout(MUS.xTimer);

    const clip = MUS.queue[MUS.qi % MUS.queue.length]; MUS.qi++;
    if (!clip) return;
    const buf = await musFetch(clip.f);
    if (!buf) return;

    const now = MUS.ctx.currentTime;
    const vol = musVol() * (P.musOn !== false ? 1 : 0);
    if (MUS.playing) musFadeOut(MUS.playing, now, MUS_FADE);
    MUS.playing = musSchedule(buf, clip, now, MUS_FADE, vol);

    const lkLen = (clip.lk ? clip.lk[1] - clip.lk[0] : clip.dur || buf.duration);
    MUS.xTimer  = setTimeout(musNextClip, Math.max(1, lkLen - MUS_PRE) * 1000);
  }

  /* Stop all music with a short fade. */
  function musStop(fadeDur) {
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
    musSwitchMood(MUS.mood || 'neutral');
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
      MUS.playing.gain.gain.cancelScheduledValues(now);
      MUS.playing.gain.gain.linearRampToValueAtTime(target, now + 0.3);
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
