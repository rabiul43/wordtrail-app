  /* ---------- music-bus.js ----------
     Music: loudness normalising, the music volume and audio bus, and ducking under the narrator. */
  /* Loudness normalisation: each clip carries its measured LUFS in the manifest.
     Gain = 10 ^ ((target − measured) / 20). Target is −18 LUFS (quiet under speech). */
  const MUS_TARGET_LUFS = -18;
  function musLufsGain(lufs) {
    return Math.pow(10, (MUS_TARGET_LUFS - (lufs || MUS_TARGET_LUFS)) / 20);
  }

  /* User volume: P.musVol is 0–100, default 40. */
  const musVol = () => (P.musVol == null ? 40 : Math.max(0, Math.min(100, P.musVol))) / 100;

  /* The music bus level: user volume (0 when music is switched off). Clips carry only their LUFS gain. */
  const musBusLevel = () => musVol() * (P.musOn !== false ? 1 : 0) * sndMul() * sndBalMus();   // user volume x the Sound master x the automatic balance (sound-core.js; 1 unless Music and Background sounds are both on)
  function musBusApply(tc) {
    if (!MUS.master || !MUS.ctx) return;
    MUS.master.gain.setTargetAtTime(musBusLevel(), MUS.ctx.currentTime, tc == null ? 0.1 : tc);
  }

  /* True while music is loading or sounding. Read by audioSuspendSoon() so the shared context stays
     running for the music even when ambient is silent. */
  const musicActive = () => !!(MUS.on && MUS.live);

  /* The book's narrator is really being HEARD (not just asked to play): not paused, finished, failed, loading a recording or stalled
     for lack of data. Same rule as ambPlaying() for the background sounds, so music never plays over a silent, loading book.
     A short seek keeps the music as it is. Independent of ambient. */
  const musNarrating = () => {
    if (!S.book || audio.paused || audio.ended || audio.error) return false;
    if (audio.seeking) return !!(MUS.live || MUS.playing);
    return !S.loadingAudio && audio.readyState > 2;
  };

  /* ---------- Ducking under the narrator ----------
     Same states as the ambient duck (ambVoiceState: s speaking, p pause, u unknown, o off), but its own
     numbers, because music is a louder, denser source than a rain bed:
       speaking: gain 0.28 (about -11 dB) + a gentle carve of the voice band (-4 dB at 3 kHz, -2 dB at 800 Hz)
       pause:    gain 0.70 (opens up between sentences, never to full)
       unknown:  gain 0.50 (no exact times and no analyser: sit lower the whole time)
       off:      gain 1 (narrator not playing, or P.musDuck switched off)
     Fast attack (0.08 s), slow release (0.9 s), so the music dips before the word and breathes back in the gaps. */
  const MUS_DUCK = { s: { v: [0.28, -4, -2], tc: 0.08 }, p: { v: [0.7, 0, 0], tc: 0.9 }, u: { v: [0.5, -2, -1], tc: 0.4 }, o: { v: [1, 0, 0], tc: 0.5 } };
  /* How low the music dips while the narrator speaks (P.musDip). Normal is the table above (about -11 dB). Subtle is about -7 dB,
     Strong about -16 dB; the voice-band carve scales with it. Only the speaking state changes; pauses and unknown stay as they are. */
  const MUS_DIP = { subtle: { g: 0.45, c: 0.5 }, normal: { g: 0.28, c: 1 }, strong: { g: 0.16, c: 1.5 } };
  function musDuckSet(st) {
    if (!MUS.duck || !MUS.ctx) return;
    const r = MUS_DUCK[st] || MUS_DUCK.o, t = MUS.ctx.currentTime, dip = MUS_DIP[P.musDip] || MUS_DIP.normal;
    const v = st === 's' ? [dip.g, r.v[1] * dip.c, r.v[2] * dip.c] : r.v;
    MUS.duck.gain.setTargetAtTime(v[0], t, r.tc);
    if (MUS.ca) { MUS.ca.gain.setTargetAtTime(v[1], t, r.tc); MUS.cb.gain.setTargetAtTime(v[2], t, r.tc); }
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

