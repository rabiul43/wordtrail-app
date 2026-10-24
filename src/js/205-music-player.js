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
    recent: [],     // the last clips played (file names), so the same song does not come straight back
    cand: '', candN: 0,   // a finer mood must show up in two paragraphs in a row before the music changes
    gen: 0,         // bumped on every mood switch and stop, so a clip that finishes loading late is dropped
    on: false,      // true once the music bus is built on the shared context
    base: '',       // data root override (local test mode only); '' = GitHub raw
    fail: false,    // the last load of a clip failed (offline?): the Music panel shows a line about it
    mfT: 0,         // when the manifest was last fetched (ms)
    mfBusy: false,  // a manifest retry is running
    offBusy: false, // the offline panel is fetching the music list
    dl: null,       // { ctl } while "Download music for offline" runs
    dlPick: null,   // Set of moods chosen for the offline download
    slow: false,    // the pause comes from the sleep timer: fade the music out slowly, like the ambient sounds (set in 200 and 150)
    rs: null,       // where a pause left the music: { clip, pos, mood, book, t }, used by the next play to carry on (musResumeSave / musResumeTake)
    tail: null,     // the nodes of the last stop, still fading: cut short if the same clip carries on
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

  /* Finer music moods. Scene detection only knows five moods; these four are read from the paragraph itself and used
     only for music. Until music.json has clips for one, it falls back to the nearest existing mood (MUS_FALLBACK), and it
     starts to sound different on its own once clips are added under that name. */
  const MUS_FALLBACK = { tension: 'dread', wonder: 'peace', romance: 'peace', chase: 'danger' };
  const MUS_FINE_RX = {
    tension: /\b(silence|silent|listened|listening|waited|waiting|footsteps?|creak(?:ed|ing)?|shadows?|hushed|hesitated|trembl\w*|nervous\w*|suspicio\w*|uneasy|dread|whisper(?:ed|s)?|suddenly|hidden|watched|watching)\b/g,
    wonder:  /\b(wonder\w*|marvel\w*|astonish\w*|amaz\w*|magnificent|splendid|glittering|glistening|dazzl\w*|enchant\w*|miracle|vast|majestic|gleaming|shimmer\w*|radiant)\b/g,
    romance: /\b(love[ds]?|loving|beloved|darling|kiss(?:ed|es)?|embrace[ds]?|sweetheart|tender\w*|devotion|passion\w*|affection|adore[ds]?|longing|heart)\b/g,
    chase:   /\b(chase[ds]?|chasing|pursu\w+|fled|flee(?:ing)?|fugitive|galloped|gallop\w*|raced|racing|dashed|sprinted|bolted|escap\w+|hurried|seized|hounds?|hunted)\b/g,
  };
  const MUS_FINE_BASE = { tension: ['neutral', 'dread', 'danger'], chase: ['neutral', 'danger'], wonder: ['neutral', 'peace'], romance: ['neutral', 'peace'] };   // the scene moods each may refine
  const MUS_GENRE_MOOD = [['horror|ghost|gothic|supernatural|vampire|haunt', 'dread'], ['mystery|detective|crime|suspense|thriller', 'tension'], ['romance|love stor', 'romance'], ['fantasy|fairy|myth|legend|science fiction|sci-?fi|magic', 'wonder']];

  function musParaText() {   // the current paragraph (up to 8 sentences), lower case
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      if (!sents || id == null || id < 0 || !sents[id]) return '';
      const p = sents[id].p; let a = id, b = id;
      while (a > 0 && sents[a - 1] && sents[a - 1].p === p && id - a < 7) a--;
      while (sents[b + 1] && sents[b + 1].p === p && b - id < 7) b++;
      let t = ''; for (let i = a; i <= b; i++) t += ' ' + (sents[i].t || '');
      return t.toLowerCase();
    } catch (e) { return ''; }
  }
  function musGenreMood() {   // a book's own default mood, used only when the text itself shows none
    try {
      const b = S.book; if (!b) return '';
      const row = String(b.genres || ((typeof CAT !== 'undefined' && CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '');
      if (!row.trim()) return '';
      const text = (row + ' ' + (b.title || '')).toLowerCase();
      for (const [rx, m] of MUS_GENRE_MOOD) if (new RegExp(rx).test(text)) return m;
    } catch (e) { /* no genre */ }
    return '';
  }
  function musFineMood(scMood) {   // the music mood for this paragraph: a fine one when the words clearly say so, else the scene's
    const base = MUS_MOOD_MAP[scMood] || 'neutral';
    const t = musParaText(); let best = '', bestN = 1;   // needs two or more hits
    if (t) for (const k in MUS_FINE_RX) {
      if (MUS_FINE_BASE[k].indexOf(base) < 0) continue;
      const n = (t.match(MUS_FINE_RX[k]) || []).length;
      if (n > bestN) { best = k; bestN = n; }
    }
    if (best) return best;
    return base === 'neutral' ? (musGenreMood() || base) : base;
  }
  function musHas(k) { const c = MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[k]; return !!(c && c.length); }
  function musResolve(k) {   // the mood that has clips: itself, its nearest existing mood, or neutral. Never a silent mood.
    if (musHas(k)) return k;
    const f = MUS_FALLBACK[k]; if (f && musHas(f)) return f;
    return musHas('neutral') ? 'neutral' : k;
  }

  /* Loudness normalisation: each clip carries its measured LUFS in the manifest.
     Gain = 10 ^ ((target − measured) / 20). Target is −18 LUFS (quiet under speech). */
  const MUS_TARGET_LUFS = -18;
  function musLufsGain(lufs) {
    return Math.pow(10, (MUS_TARGET_LUFS - (lufs || MUS_TARGET_LUFS)) / 20);
  }

  /* User volume: P.musVol is 0–100, default 40. */
  const musVol = () => (P.musVol == null ? 40 : Math.max(0, Math.min(100, P.musVol))) / 100;

  /* The music bus level: user volume (0 when music is switched off). Clips carry only their LUFS gain. */
  const musBusLevel = () => musVol() * (P.musOn !== false ? 1 : 0) * sndMul();   // user volume x the Sound master
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
  /* Scene detection (and so the music's mood) is stepped by the ambient tick (ambDuckTick) only while the ambient engine is on
     and "Scene sounds" is on. Music is independent of both, so when that tick is not running it, the music steps it itself.
     ambAutoStep never touches the ambient sound when AMB.on is false, and ambLevels() ignores its result when P.ambAuto is false. */
  function musSceneStep() {
    if (AMB.on && P.ambAuto !== false) return;   // the ambient tick already does it
    if (S.curId === AMB.autoId && S.sec === AMB.autoSec) return;   // same sentence as last time
    try { ambAutoStep(); } catch (e) { /* the mood is a help, never a reason to stop the music */ }
  }
  function musDuckTick() {
    if (!MUS.on || !MUS.duck) return;
    if (musNarrating()) musSceneStep();
    if (audio.seeking) return;   // a seek is a short gap: keep the music as it is
    let st = 'o';
    if (P.musDuck !== false && musNarrating() && !S.loadingAudio && !audio.error && audio.readyState > 2) st = ambVoiceState();
    if (st !== MUS.duckS) { MUS.duckS = st; musDuckSet(st); }
  }
  function musDuckStart() { if (!MUS.duckIv) MUS.duckIv = setInterval(musDuckTick, 60); }
  function musDuckStop() { clearInterval(MUS.duckIv); MUS.duckIv = 0; MUS.duckS = ''; }

  /* Fetch and cache music.json from the GitHub data repo. `force` skips the 24 hour saved copy (used before an offline download).
     When the network fails, an older saved copy is used whatever its age, so music that is already on the device still plays offline. */
  async function musFetchManifest(force) {
    if (MUS_LOCAL) {
      try {
        const r = await fetch('/_data/music.json', { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && d.v === 1 && d.moods) {
            MUS.manifest = d; MUS.base = location.origin + '/_data/'; MUS.mfT = Date.now();
            console.info('[music] local test mode: using /_data/music.json');
            return;
          }
        }
      } catch (e) { /* no local data — fall through to GitHub */ }
    }
    let cached = null;
    try {
      cached = store.get('wt:music-manifest', null);
      if (!force && cached && cached.d && Date.now() - cached.t < 24 * 3600e3) {
        MUS.manifest = cached.d; MUS.mfT = cached.t; return;
      }
      const base = 'https://raw.githubusercontent.com/' + ghCfg().repo + '/main/';
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(base + 'music.json', { signal: ctl.signal }); clearTimeout(to);
      if (r.ok) {
        const d = await r.json();
        if (d && d.v === 1 && d.moods) {
          MUS.manifest = d; MUS.mfT = Date.now();
          store.set('wt:music-manifest', { t: MUS.mfT, d });
          return;
        }
      }
    } catch (e) { /* offline or not yet published: use the saved copy below */ }
    if (!MUS.manifest && cached && cached.d) { MUS.manifest = cached.d; MUS.mfT = cached.t || 0; }   // an old list is better than silence
  }
  /* The manifest is missing (first play offline, or the first fetch failed): try again, once at a time. */
  function musManifestRetry() {
    if (MUS.mfBusy) return;
    MUS.mfBusy = true;
    musFetchManifest().then(() => {
      MUS.mfBusy = false;
      if (MUS.manifest) { if (musNarrating()) musicPlay(); }
      else if (P.musOn === true && sndOn() && musNarrating()) { MUS.fail = true; musWarnPaint(); }
    });
  }

  /* Build a shuffled clip queue for a mood. Rotates if first clip equals the last-played one. */
  function musQueue(mood) {
    const clips = (MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[mood]) || [];
    if (!clips.length) return [];
    const skip = MUS.recent.slice(-2).concat(MUS.playing ? [MUS.playing._file] : []);   // never the clip now playing or the one before it
    const fresh = clips.filter(c => skip.indexOf(c.f) < 0);
    return (fresh.length ? fresh : clips.filter(c => !MUS.playing || c.f !== MUS.playing._file).length ? clips.filter(c => !MUS.playing || c.f !== MUS.playing._file) : clips).slice();
  }

  /* How busy the music should be for what is being read: quiet under talk, fuller in action. 0 = soft, 1 = full. */
  function musDens() {   // share of the last three sentences that are quoted speech (computed here: AMB.scene.dens only exists while the ambient engine runs, and AMB.scene is also a plain scene name)
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      if (!sents || id == null || id < 0 || !sents[id]) return 0.5;
      let q = 0, n = 0;
      for (let i = Math.max(0, id - 2); i <= id; i++) { const t = sents[i] && sents[i].t; if (t == null) continue; n++; if (/[\"\u201c\u201d]/.test(t)) q++; }
      return n ? q / n : 0.5;
    } catch (e) { return 0.5; }
  }
  function musTargetEnergy() {
    const dens = musDens();
    let t = dens >= 0.5 ? 0.2 : dens >= 0.25 ? 0.4 : 0.55;
    if (MUS.mood === 'danger' || MUS.mood === 'chase') t = Math.max(t, 0.75);
    else if (MUS.mood === 'peace' || MUS.mood === 'sorrow') t = Math.min(t, 0.4);
    return t;
  }
  function musSeenList() { const b = S.book; return (b && P.musSeen && P.musSeen[String(b.id)]) || []; }
  function musRemember(clip) {   // note a clip as played: not repeated soon, and the book prefers clips it has not heard yet
    MUS.recent.push(clip.f); if (MUS.recent.length > 4) MUS.recent.shift();
    try {
      const b = S.book; if (!b) return;
      const all = P.musSeen || (P.musSeen = {}), id = String(b.id), list = all[id] || (all[id] = []);
      const i = list.indexOf(clip.f); if (i >= 0) list.splice(i, 1);
      list.push(clip.f); if (list.length > 80) list.shift();
      const ids = Object.keys(all); if (ids.length > 40) delete all[ids[0]];   // keep the 40 most recent books
      savePrefs();
    } catch (e) { /* memory is a nicety */ }
  }
  function musTake() {   // remove and return the best clip left in the queue for now: unheard in this book first, then the right energy
    const q = MUS.queue; if (!q.length) return null;
    const seen = musSeenList(), want = musTargetEnergy();
    let bi = 0, bs = 1e9;
    q.forEach((c, i) => {
      const s = Math.abs((typeof c.e === 'number' ? c.e : 0.5) - want) + (seen.indexOf(c.f) >= 0 ? 0.6 : 0) + Math.random() * 0.3;   // the random part keeps it varied
      if (s < bs) { bs = s; bi = i; }
    });
    return q.splice(bi, 1)[0];
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
        if (!resp) { resp = await fetch(url); if (resp.ok) { await c.put(url, resp.clone()); sndTouch(url); sndCachePrune(); } }
        else sndTouch(url);
      } catch (e) { resp = await fetch(url); }
      if (!resp || !resp.ok) return null;
      return await MUS.ctx.decodeAudioData(await resp.arrayBuffer());
    } catch (e) { return null; }
  }

  /* Schedule one clip at AudioContext time `when`, fading in over `fadeIn` seconds.
     The clip's own gain is only its LUFS normalisation; the user volume lives on the bus (MUS.master).
     Returns a playing-node descriptor. */
  function musSchedule(buf, clip, when, fadeIn, off) {   // off: start this many seconds into the clip (carrying on after a pause)
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
    off = Math.max(0, Math.min(off || 0, buf.duration - 0.5));
    src.start(when, off);

    return { src, gain, _file: clip.f, _clip: clip, _lkEnd: src.loopEnd, _lufsGain: lufsGain, _t0: when - off };   // _t0: the context time at which the clip would have started from 0
  }

  /* Fade out a playing-node over `dur` seconds starting at `when`, then stop it. */
  function musFadeOut(node, when, dur, tc) {   // tc: fade with this time constant (the slow sleep fade) instead of a straight ramp; dur is then when the clip is stopped
    if (!node) return;
    node.gain.gain.cancelScheduledValues(when);
    node.gain.gain.setValueAtTime(node.gain.gain.value, when);
    if (tc) node.gain.gain.setTargetAtTime(0, when, tc); else node.gain.gain.linearRampToValueAtTime(0, when + dur);
    try { node.src.stop(when + dur + 0.1); } catch (e) {}
  }

  const MUS_FADE = 6;    // crossfade duration in seconds
  const MUS_SLEEP_TC = 3;          // sleep timer: the same time constant as the ambient engine's slow fade (AMB.slow in ambSync)
  const MUS_RESUME_MS = 5 * 60e3;  // a pause shorter than this carries on with the same clip
  const MUS_RESUME_FADE = 2;       // fade-in (seconds) when a clip carries on
  const MUS_PRE  = 10;   // seconds before loop-end to start the next crossfade

  /* How long a clip plays before the next crossfade starts: its first pass (0 → loop end) less MUS_PRE. */
  const musPlayMs = (clip, buf) => Math.max(1, ((clip.lk && clip.lk[1]) || clip.dur || buf.duration) - MUS_PRE) * 1000;

  /* Where the clip is now, in seconds from its start: the first pass runs 0 to loop end, then it loops from loop start. */
  function musPos(node) {
    const end = node._lkEnd, ls = node.src.loopStart || 0, el = MUS.ctx.currentTime - node._t0;
    if (!(el > 0)) return 0;
    if (el < end) return el;
    const len = end - ls;
    return len > 1 ? ls + ((el - end) % len) : 0;
  }
  function musResumeSave() {   // on a pause: remember the clip, the place in it, the mood and the book
    try {
      const n = MUS.playing; if (!n || !n._clip || !MUS.ctx || !S.book) return;
      MUS.rs = { clip: n._clip, pos: musPos(n), mood: MUS.mood, book: String(S.book.id), t: Date.now() };
    } catch (e) { /* carrying on is a nicety */ }
  }
  function musResumeTake(mood) {   // the saved place if it is still good (short pause, same book, same mood, clip still listed); it is used once
    const r = MUS.rs; MUS.rs = null;
    try {
      if (!r || !S.book || r.book !== String(S.book.id) || r.mood !== mood || Date.now() - r.t > MUS_RESUME_MS) return null;
      const list = (MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[mood]) || [];
      const clip = list.find(c => c && c.f === r.clip.f);
      return clip ? { clip, pos: r.pos } : null;
    } catch (e) { return null; }
  }
  async function musLoadResume(rs, gen) {   // the same clip again; no musRemember (it was counted when it first played)
    const buf = await musFetch(rs.clip.f);
    if (gen !== MUS.gen) return null;
    return buf ? { clip: rs.clip, buf, off: rs.pos, resumed: true } : null;
  }

  /* Load the next playable clip of the queue. A clip that fails to load is skipped, and each is tried
     at most once. Returns { clip, buf }, or null if none loaded or a newer switch/stop came in meanwhile. */
  async function musLoadNext(gen) {
    const n = MUS.queue.length;
    for (let i = 0; i < n; i++) {
      const clip = musTake(); if (!clip) break;
      const buf = await musFetch(clip.f);
      if (gen !== MUS.gen) return null;
      if (buf) { musRemember(clip); return { clip, buf }; }
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
    MUS.fail = false; musWarnPaint();

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

    const rs = musResumeTake(mood);   // after a short pause in the same mood: the same clip, from where it stopped
    if (rs) MUS.queue = MUS.queue.filter(c => c.f !== rs.clip.f);   // it is playing, so it is not next in line
    let got = rs ? await musLoadResume(rs, gen) : null;
    if (gen !== MUS.gen) return;
    if (!got) got = await musLoadNext(gen);
    if (gen !== MUS.gen) return;   // a newer mood switch or a stop came in meanwhile
    if (!got) {   // nothing loaded (offline?): stop holding the engine, and try again in 45 s while the story is being read
      MUS.fail = true; musWarnPaint();   // tell the reader in the Music panel
      if (!MUS.playing) MUS.live = false;
      clearTimeout(MUS.rt);
      MUS.rt = setTimeout(() => { if (P.musOn && !MUS.playing && musNarrating()) musSwitchMood(MUS.mood || 'neutral', true); }, 45e3);
      return;
    }
    const { clip, buf } = got;
    MUS.fail = false; musWarnPaint();

    const now = MUS.ctx.currentTime;
    musBusApply();
    if (MUS.playing) musFadeOut(MUS.playing, now, MUS_FADE);
    if (got.resumed && MUS.tail) { MUS.tail.forEach(n => musFadeOut(n, now, 0.4)); }   // the old tail of the same clip would sound twice, a little apart
    MUS.tail = null;
    MUS.playing = musSchedule(buf, clip, now, got.resumed ? MUS_RESUME_FADE : MUS_FADE, got.off);

    MUS.xTimer  = setTimeout(musNextClip, got.resumed ? Math.max((MUS_FADE + 2) * 1000, musPlayMs(clip, buf) - got.off * 1000) : musPlayMs(clip, buf));
    sndNowPaint();
  }

  /* Stop all music with a short fade. slow: the sleep timer ends it, so it fades out slowly, with the ambient engine's time constant. */
  function musStop(fadeDur, slow) {
    MUS.gen++;
    clearTimeout(MUS.xTimer); clearTimeout(MUS.rt); clearTimeout(MUS.lt);
    MUS.live = false; MUS.fail = false; musDuckStop();
    if (!MUS.ctx) return;
    const now = MUS.ctx.currentTime, tc = slow ? MUS_SLEEP_TC : 0, d = slow ? tc * 6 : (fadeDur || 1.5);
    MUS.tail = [MUS.playing, MUS.fading].filter(Boolean);
    if (MUS.playing) { musFadeOut(MUS.playing, now, d, tc); MUS.playing = null; }
    if (MUS.fading)  { musFadeOut(MUS.fading,  now, d, tc); MUS.fading  = null; }
    audioSuspendSoon((d + 0.6) * 1000, 'sTimer');   // after the fade, stop the engine if ambient is silent too
    sndNowPaint();
  }

  /* ---------- Now playing ----------
     One short block at the top of the sound sheet (#amb-now): the music (mood, track, artist), the scene, and the
     opening sound. Each piece is its own element so the translator can match fixed words one by one. */
  const MUS_MOOD_NAME = { neutral: 'Neutral', dread: 'Dread', danger: 'Danger', peace: 'Peaceful', sorrow: 'Sad', merry: 'Merry', tension: 'Tense', wonder: 'Wonder', romance: 'Romantic', chase: 'Chase' };
  function sndNowPaint() {
    musWarnPaint();
    try {
      const box = $('#amb-now'); if (!box) return;
      const rows = [];
      if (!sndOn()) rows.push(['Sound', 'off']);
      else if (P.musOn) {
        const p = MUS.playing, c = p && p._clip;
        if (c) {
          const slug = String(c.f).split('/').pop().replace(/\.mp3$/i, '');
          rows.push(['Music', MUS_MOOD_NAME[MUS.mood] || 'Neutral', c.t || MUS_TITLES[slug] || musPrettyTitle(slug), c.by || '']);
        } else if (!musNarrating()) rows.push(['Music', 'paused']);
        else if (osLeadWait() > 0) rows.push(['Music', 'starts after the opening']);
        else if (MUS.live) rows.push(['Music', 'loading']);
        else rows.push(['Music', 'not playing yet']);
      }
      if (sndOn() && P.ambOn === true && AMB.on && AMB.lbl) rows.push(['Scene', AMB.lbl]);
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
    MUS.slow = false;   // a sleep-timer flag left from an earlier pause must not slow down a later, ordinary pause
    if (!P.musOn || !sndOn() || !MUS.on || !musNarrating()) return;   // needs the narrator playing and Sound on; ambient is irrelevant
    if (!MUS.manifest) { musManifestRetry(); return; }   // the list never loaded (offline at the first play): try again now
    if (MUS.playing) return;
    const wait = osLeadWait();   // a recorded or made opening sound is still playing: music comes in near its end
    if (wait > 0) { clearTimeout(MUS.lt); MUS.lt = setTimeout(musicPlay, wait + 50); sndNowPaint(); return; }
    musSceneStep();   // read the scene here first, so the very first clip already fits the story (this may start the music itself)
    if (MUS.playing || MUS.live) return;
    musSwitchMood(MUS.mood || 'neutral', true);   // after a pause MUS.mood is unchanged, so force the restart
  }

  /* Called when the narrator pauses or ends. */
  function musicPause() {
    const slow = MUS.slow; MUS.slow = false;
    musResumeSave();   // before the stop clears the playing clip
    musStop(2, slow);
  }

  /* Called by scene detection when the mood changes (every paragraph). */
  function musicMoodChange(scMood) {
    if (!P.musOn || !sndOn() || !MUS.on || !MUS.manifest || !musNarrating()) return;   // paused, finished, music off or Sound off: a tap on a sentence must not start music
    const want = musFineMood(scMood), m = musResolve(want);
    if (osLeadWait() > 0) { MUS.mood = m; return; }   // opening sound still playing: remember the mood, musicPlay starts it later
    if (!MUS.playing && !MUS.live) { MUS.cand = ''; musSwitchMood(m, true); return; }   // also starts music that never got going (failed first load)
    if (m === MUS.mood) { MUS.cand = ''; return; }
    if (MUS_FALLBACK[want]) {   // a finer mood only counts once it shows in two paragraphs in a row, so the music does not flap
      if (MUS.cand === m) MUS.candN++; else { MUS.cand = m; MUS.candN = 1; }
      if (MUS.candN < 2) return;
    }
    MUS.cand = ''; musSwitchMood(m);
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
    if (!MUS.manifest) musManifestRetry();
  }

  /* A short line in the Music panel when music is on but a clip could not load. */
  function musWarnPaint() {
    try {
      const box = $('#mus-warn'); if (!box) return;
      const show = P.musOn === true && sndOn() && MUS.fail;
      box.hidden = !show;
      if (show) box.textContent = navigator.onLine === false
        ? 'Music needs a connection for this mood. Download music to use it offline.'
        : 'Music could not load. Check your connection and try again.';
    } catch (err) { /* a status line must never break playback */ }
  }

  /* ---------- Offline music ----------
     "Download music for offline" saves clips into the 'wt-music' cache and puts their addresses on a keep list
     (localStorage 'wt-music-keep', see sndKeepSet in 240). The 150 MB prune never removes a clip on that list.
     The keep list itself is limited to SND_KEEP_CAP, and the panel says so before it starts. Clips are encoded at 128 kbps. */
  const MUS_BYTES_PER_SEC = 16000;
  function musOffMoods() { const m = (MUS.manifest && MUS.manifest.moods) || {}; return Object.keys(m).filter(musHas); }
  function musOffClips(moods) {   // each clip once, even when it sits under two moods
    const m = (MUS.manifest && MUS.manifest.moods) || {}, seen = new Set(), out = [];
    moods.forEach(k => (m[k] || []).forEach(c => { if (c && c.f && !seen.has(c.f)) { seen.add(c.f); out.push({ f: c.f, bytes: Math.round((+c.dur || 90) * MUS_BYTES_PER_SEC) }); } }));
    return out;
  }
  const musMB = n => Math.round(n / 1048576);
  function musOffMsg(t) { const e = $('#mus-off-msg'); if (e) e.textContent = t || ''; }
  async function musKeptInfo() {   // the clips of the current list that are saved for offline: how many and how big
    const keep = sndKeepSet(), want = new Set(musOffClips(musOffMoods()).map(c => new Request(musClipUrl(c.f)).url));
    let n = 0, bytes = 0;
    for (const x of await sndCacheList()) if (x.cache === 'wt-music' && keep.has(x.url)) { bytes += x.size; if (want.has(x.url)) n++; }
    return { n, bytes, total: want.size };
  }
  function musOffPaint(again) {
    try {
      const box = $('#mus-off-moods'); if (!box) return;
      const est = $('#mus-off-est'), have = $('#mus-off-have'), go = $('#mus-off-go'), cancel = $('#mus-off-cancel'), clr = $('#mus-off-clear'), when = $('#mus-off-when');
      cancel.hidden = !MUS.dl; go.disabled = !!MUS.dl;
      if (!MUS.manifest) {
        box.textContent = ''; box.dataset.sig = ''; have.textContent = ''; clr.hidden = true; go.disabled = true; when.hidden = true;
        est.textContent = again ? 'The music list could not load. Connect to the internet and try again.' : 'Loading the music list…';
        if (!again && !MUS.offBusy) { MUS.offBusy = true; musFetchManifest().then(() => { MUS.offBusy = false; musOffPaint(true); }); }
        return;
      }
      const moods = musOffMoods(), sig = moods.join(',');
      if (!MUS.dlPick) MUS.dlPick = new Set();
      if (box.dataset.sig !== sig) {   // build the mood choices once per list; a mood new to the list starts ticked
        const old = (box.dataset.sig || '').split(','); moods.forEach(k => { if (old.indexOf(k) < 0) MUS.dlPick.add(k); });
        box.dataset.sig = sig; box.textContent = '';
        moods.forEach(k => {
          const cb = h('input', { type: 'checkbox' }); cb.checked = MUS.dlPick.has(k); cb.dataset.k = k;
          box.append(h('label', { class: 'amb-opt' }, cb, h('span', { text: MUS_MOOD_NAME[k] || k }), h('small', { class: 'spd-s', text: '~' + Math.max(1, musMB(musOffClips([k]).reduce((a, c) => a + c.bytes, 0))) + ' MB' })));
        });
      }
      when.hidden = !MUS.mfT;
      if (MUS.mfT) { const d = $('#mus-off-date'); if (d) d.textContent = new Date(MUS.mfT).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
      musKeptInfo().then(k => {
        const picked = musOffClips([...MUS.dlPick].filter(x => moods.indexOf(x) >= 0)), keep = sndKeepSet();
        const todo = picked.filter(c => !keep.has(new Request(musClipUrl(c.f)).url));
        const need = todo.reduce((a, c) => a + c.bytes, 0), over = k.bytes + need > SND_KEEP_CAP;
        est.textContent = over ? 'That is more than the 100 MB limit. Choose fewer moods.'
          : !picked.length ? 'Choose at least one mood.'
          : !todo.length ? 'All of this music is already saved.'
          : 'Selected: ' + todo.length + (todo.length === 1 ? ' clip' : ' clips') + ', about ' + Math.max(1, musMB(need)) + ' MB';
        go.disabled = !!MUS.dl || over || !todo.length;
        have.textContent = k.n ? 'Saved on this device: ' + k.n + ' of ' + k.total + (k.total === 1 ? ' clip' : ' clips') + ' (' + musMB(k.bytes) + ' MB)' : '';
        clr.hidden = !k.n || !!MUS.dl;
      }).catch(() => { /* the numbers are a help only */ });
    } catch (err) { /* the offline panel must never break the sound screen */ }
  }
  async function musOffRun() {
    if (MUS.dl) return;
    if (MUS_LOCAL) { musOffMsg('Offline music is not available in local test mode.'); return; }
    if (!self.caches) { musOffMsg('This browser cannot save music for offline.'); return; }
    if (navigator.onLine === false) { musOffMsg('You are offline. Connect to the internet to download music.'); return; }
    const ctl = new AbortController(); MUS.dl = { ctl }; musOffPaint();
    let c = null, done = 0, bytes = 0, failed = 0, full = false, list = [];
    try {
      musOffMsg('Checking the music list…');
      await musFetchManifest(true);   // a fresh list first, so new clips are included
      const moods = musOffMoods().filter(k => MUS.dlPick && MUS.dlPick.has(k));
      list = musOffClips(moods);
      c = await caches.open('wt-music');
      const keep = sndKeepSet();
      for (const clip of list) {
        if (ctl.signal.aborted) break;
        const url = musClipUrl(clip.f);
        try {
          if (!(await c.match(url))) {   // a clip that already played once is in the cache: only mark it as kept
            const resp = await fetch(url, { signal: ctl.signal });
            if (!resp.ok) throw new Error('http ' + resp.status);
            const buf = await resp.arrayBuffer();
            await c.put(url, new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'content-length': String(buf.byteLength) } }));
            bytes += buf.byteLength;
          }
          keep.add(new Request(url).url); sndKeepSave(keep); sndTouch(url); done++;
        } catch (err) {
          if (ctl.signal.aborted) break;
          if (err && err.name === 'QuotaExceededError') { full = true; break; }
          failed++;
        }
        musOffMsg('Saving music: ' + (done + failed) + ' of ' + list.length + ' clips (' + musMB(bytes) + ' MB)');
      }
    } catch (err) { failed++; }
    const cancelled = ctl.signal.aborted;
    MUS.dl = null;
    musOffMsg(cancelled ? 'Download cancelled. Music already saved stays on this device.'
      : full ? 'Not enough space on this device. Remove some files and try again.'
      : failed || !list.length ? 'Some music could not be downloaded. Check your connection and try again.'
      : 'Music saved. It now plays without a connection.');
    try { await sndCachePrune(true); } catch (err) { /* best effort */ }
    musOffPaint(); sndCacheSizePaint();
  }
  async function musOffClear() {
    if (!confirm('Remove the music saved for offline? It downloads again when needed.')) return;
    try {
      const keep = sndKeepSet(), c = await caches.open('wt-music');
      for (const url of keep) { try { await c.delete(url); } catch (err) { /* skip */ } }
      try { localStorage.removeItem(SND_KEEP_KEY); } catch (err) { /* ignore */ }
    } catch (err) { /* ignore */ }
    musOffMsg(''); musOffPaint(); sndCacheSizePaint(); toast('Saved music removed.');
  }
  function musOffInit() {
    const go = $('#mus-off-go'); if (!go) return;
    go.addEventListener('click', musOffRun);
    $('#mus-off-cancel').addEventListener('click', () => { if (MUS.dl) MUS.dl.ctl.abort(); });
    $('#mus-off-clear').addEventListener('click', musOffClear);
    $('#mus-off-moods').addEventListener('change', e => {
      const cb = e.target.closest('input[data-k]'); if (!cb || !MUS.dlPick) return;
      if (cb.checked) MUS.dlPick.add(cb.dataset.k); else MUS.dlPick.delete(cb.dataset.k);
      musOffMsg(''); musOffPaint();
    });
    window.addEventListener('online', () => {   // the connection is back: a mood that failed to load is tried again at once
      try {
        musWarnPaint(); musOffPaint();
        if (P.musOn === true && sndOn() && MUS.on && musNarrating() && (MUS.fail || !MUS.playing) && osLeadWait() <= 0) {
          if (!MUS.manifest) musManifestRetry(); else { clearTimeout(MUS.rt); musSwitchMood(MUS.mood || 'neutral', true); }
        }
      } catch (err) { /* a help only */ }
    });
    window.addEventListener('offline', () => { musWarnPaint(); musOffPaint(); });
  }

  /* Called once at startup to pre-fetch the manifest in the background. */
  async function musicInit() {
    try { musOffInit(); } catch (e) { console.warn('offline music', e); }
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
