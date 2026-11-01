  /* ------ weak connection: the narrator stalls, the app tells the listener and tries again ------
     Before this the 'stalled' and 'waiting' events of the narrator audio were ignored (only the sound files listened). On a weak mobile
     connection the play icon stayed on, the highlight loop kept ticking and the voice was silent, with no message and no retry.
     How it works: while the audio should be playing but has no data to play (readyState < 3) for STALL_MS, one short message is shown and the
     same track is loaded again at the same spot (the existing pendingSeek / loadedmetadata path puts it back). Up to STALL_MAX tries, a bit
     longer apart each time, then it stops and says so; coming back online tries once more. Saved copies (blob:) are local, never retried. */
  const STALL_MS = 8000, STALL_MAX = 3;
  const STALL = { timer: 0, tries: 0, sec: -1, lastT: -1, gaveUp: false, told: false, src: '' };
  function stallLocal() { return /^blob:/.test(audio.currentSrc || audio.src || ''); }
  /* our own reload keeps loadingAudio true until metadata arrives; on a dead connection that may never happen, so it is still watched */
  function stallMine() { return !!STALL.src && STALL.src === (audio.currentSrc || audio.src) && STALL.sec === S.sec; }
  function stallStarved() { return !!(S.book && !audio.paused && !audio.ended && !audio.seeking && (!S.loadingAudio || stallMine()) && audio.readyState < 3 && audio.networkState !== 3 && !stallLocal()); }
  function stallClear(full) {
    clearTimeout(STALL.timer); STALL.timer = 0;
    if (full) { STALL.src = ''; STALL.tries = 0; STALL.gaveUp = false; STALL.told = false; STALL.lastT = -1; }
  }
  function stallArm() {
    if (STALL.timer || !stallStarved()) return;
    if (STALL.sec !== S.sec) { STALL.sec = S.sec; stallClear(true); }   // a different track starts with a clean count
    STALL.lastT = audio.currentTime;
    STALL.timer = setTimeout(stallCheck, STALL_MS * (1 + STALL.tries * 0.5));
  }
  function stallRetry() {
    const t = audio.currentTime; STALL.src = audio.currentSrc || audio.src;
    S.pendingSeek = t > 0 ? t : 0; S.loadingAudio = true; S.resnap = true;   // loadedmetadata (150) seeks back to t and clears loadingAudio
    audio.load();
    audio.playbackRate = P.speed;
    audio.play().catch(() => { S.loadingAudio = false; });
  }
  function stallCheck() {
    STALL.timer = 0;
    if (!stallStarved()) return;                                            // it recovered by itself, or the listener paused
    if (Math.abs(audio.currentTime - STALL.lastT) > 0.3) { stallArm(); return; }   // still moving, only slow
    if (STALL.tries >= STALL_MAX) {
      STALL.gaveUp = true;
      toast('The connection is too weak to keep playing. It will try again when you are back online, or tap play.', 5000);
      return;
    }
    STALL.tries++;
    if (!STALL.told) { STALL.told = true; toast('Weak connection. Waiting for the audio…', 4000); }
    stallRetry();
    stallArm();
  }
  ['stalled', 'waiting'].forEach(ev => audio.addEventListener(ev, stallArm));
  /* real progress ends the episode; a pause, the end or a new source stops the timer without forgetting the count of this track */
  audio.addEventListener('playing', () => { stallClear(true); });
  audio.addEventListener('timeupdate', () => { if (STALL.tries || STALL.gaveUp) { if (audio.readyState > 2 && !audio.paused && Math.abs(audio.currentTime - STALL.lastT) > 0.3) stallClear(true); } });
  ['pause', 'ended', 'error'].forEach(ev => audio.addEventListener(ev, () => stallClear(false)));
  audio.addEventListener('play', () => { if (STALL.gaveUp) stallClear(true); });   // the listener tapped play: a fresh start
  window.addEventListener('online', () => {
    if (!STALL.gaveUp || !S.book || audio.paused || audio.ended) return;
    stallClear(true); stallRetry(); stallArm();
  });

  /* ------ buffering ring on the play buttons ------
     While the audio waits for data the button keeps its pause icon (the listener still wants to hear it), but a ring turns around it and
     aria-busy is set, so a short wait is not mistaken for a crash. It shows after BUF_MS, so a quick seek does not flicker. Styles: 97-controls-sheet.css. */
  const BUF_MS = 500, BUF = { timer: 0, on: false };
  function bufPaint(on) {
    if (BUF.on === on) return; BUF.on = on;
    $$('#b-play, #mini-play, #nr-play').forEach(b => { b.classList.toggle('buffering', on); if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); });
  }
  function bufWant() { return !!(S.book && !audio.paused && !audio.ended && !audio.error && audio.readyState < 3 && !stallLocal()); }
  function bufArm() {
    if (BUF.timer || BUF.on || !bufWant()) return;
    BUF.timer = setTimeout(() => { BUF.timer = 0; if (bufWant()) bufPaint(true); }, BUF_MS);
  }
  function bufOff() { clearTimeout(BUF.timer); BUF.timer = 0; bufPaint(false); }
  ['waiting', 'stalled'].forEach(ev => audio.addEventListener(ev, bufArm));
  ['playing', 'pause', 'ended', 'error', 'emptied', 'abort'].forEach(ev => audio.addEventListener(ev, bufOff));
  audio.addEventListener('canplay', () => { if (BUF.on && !audio.paused) bufOff(); });
