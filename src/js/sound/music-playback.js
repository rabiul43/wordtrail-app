  /* ---------- music-playback.js ----------
     Music: scheduling clips, crossfades, resume after a pause, switching mood, stop, play / pause, the warning line. */
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
    if (!musNarrating()) {   // the narrator was paused while the clip loaded: stay silent; the next play starts it
      if (!MUS.playing) { MUS.live = false; musDuckStop(); audioSuspendSoon(600, 'sTimer'); }
      sndNowPaint(); return;
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
    if (MUS.playing) { musCtxHeal(); return; }   // already sounding: make sure the engine is really running
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
    try { if (ctx.addEventListener) ctx.addEventListener('statechange', musCtxHeal); else ctx.onstatechange = musCtxHeal; } catch (e) { /* the other triggers still work */ }
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

