  /* ---------- ambient-mix.js ----------
     Ambient: applying the mix (levels, volume, master), saving it, resetting on a new book. */
  function ambApply(tc) {   // tc = fade time constant; scene and book changes pass a slow one so the sounds crossfade
    if (!AMB.built) return;
    const L = ambLive(), t = AMB.ctx.currentTime;
    const recOk = !!(AMB.preview || AMB.aud || ambPlaying());   // recordings are fetched only once the book is really playing, so they never compete with the book's own audio while it loads
    AMB_SOUNDS.forEach(([k]) => {
      const lv = L[k] || 0, live = AMB.live[k];
      if (recOk && lv > 0 && P.ambSrc !== 'gen' && AMB_REC_KEYS.has(k) && !AMB.rec[k]) ambRecLoad(k);
      if (lv > 0 && AMB_LAYER[k] && !live) ambLayerOn(k);
      const l = AMB.live[k], g = AMB.g[k]; if (!g) return;
      g.gain.setTargetAtTime(Math.pow(lv / 100, 1.6) * 0.9, t, tc || 0.15);
      if (l) {
        if (lv > 0 && l.off) { clearTimeout(l.off); l.off = 0; }
        else if (lv === 0 && !l.off) l.off = setTimeout(() => { if (!(ambLive()[k] > 0)) ambLayerOff(k); }, Math.max(5000, (tc || 0.15) * 7000));
      }
    });
    if (AMB.sR && !AMB.spaceApplied) { const m = ambRoomMix(L); AMB.sR.gain.setTargetAtTime(m[0], t, 1.2); AMB.sH.gain.setTargetAtTime(m[1], t, 1.2); }   // spatial scene overrides the mix-based send while text context is active
    ambMoodApply(tc);
  }
  const ambVol = () => (P.ambVol == null ? 70 : P.ambVol) / 100;
  const ambGain = () => ambVol() * sndMul() * sndBalAmb();   // what the engine really plays at: the ambient volume times the Sound master (0 when Sound is off) times the automatic balance (sound-core.js)
  function ambMaster(tc) { if (AMB.built && AMB.on) AMB.master.gain.setTargetAtTime(ambGain(), AMB.ctx.currentTime, tc == null ? 0.1 : tc); }
  /* Remember the mix per book, and per kind of book (the last mix used on a gothic book starts the next gothic book). */
  function ambSaveMix() {
    if (!S.book) return;
    const full = ambFull(ambLevels()), id = String(S.book.id), sug = ambSuggest(S.book);
    P.ambBook = P.ambBook || {}; delete P.ambBook[id]; P.ambBook[id] = full;
    const ks = Object.keys(P.ambBook); if (ks.length > 60) delete P.ambBook[ks[0]];
    if (sug) { P.ambG = P.ambG || {}; P.ambG[sug.k] = full; }
    savePrefs();
  }
  function ambSpaceReset() {   // called on pause/end/book change: fall back to mix-driven room routing
    if (!AMB.spaceApplied) return;
    AMB.spaceApplied = '';
    if (AMB.built && AMB.sR) { const L = ambLive(), m = ambRoomMix(L), t = AMB.ctx.currentTime; AMB.sR.gain.setTargetAtTime(m[0], t, 1.8); AMB.sH.gain.setTargetAtTime(m[1], t, 1.8); }
    if (AMB.wf) AMB.wf.frequency.setTargetAtTime(20000, AMB.ctx.currentTime, 1.8);
  }
  function ambBookCheck() {   // when the book changes, switch to its saved mix (or the last one used for its kind)
    if (!S.book || AMB.bookId === String(S.book.id)) return;
    AMB.bookId = String(S.book.id); ambSpaceReset(); AMB.auto = null; AMB.autoId = null;
    const sug = ambSuggest(S.book), m = (P.ambBook || {})[AMB.bookId] || (sug && (P.ambG || {})[sug.k]);
    if (m) { P.amb = Object.assign(ambLevels(), m); savePrefs(); ambApply(0.9); }
    else if (sug && AMB.preset !== 'sleep') { P.amb = ambFull(sug.L); savePrefs(); ambApply(0.9); }   // a book with no saved mix starts on the scene that suits it (not saved as the reader's own choice, so it follows the genre rules)
  }
