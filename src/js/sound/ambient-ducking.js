  /* ---------- ambient-ducking.js ----------
     Ambient: dipping under the narrator's voice (speaking / pause / unknown). */
  /* Dip under the voice. Two things happen while the narrator speaks: the sounds get a little quieter, and the
     speech band (the consonants, around 0.8 to 3 kHz) is carved out of them, so the words stay clear without
     the room tone vanishing. The exact sentence and word times say when speech starts, so the dip begins a
     moment before the first word and the sounds open up again in the pauses between sentences. If there are no
     exact times, the voice level from the audio analyser is used when it is running (visualizer or enhancer
     on); with neither, the sounds sit a little lower and carved while the book plays. */
  function ambVoiceSoon() {   // true or false from the exact times; null when there are none
    const sec = S.sec, p = S.plan && S.plan[sec];
    if (!p || !p.ids.length || S.loadingAudio || S.pendingSeek > 0 || audio.seeking || !trackDone(sec)) return null;
    const rate = audio.playbackRate || 1, t = nowT() + P.nudge, wt = S.wordT[sec] || {};
    const k = Core.locate(p.starts, t), w = wt[p.ids[k]];
    if (!w || !w.length) return null;
    if (t >= w[0] - 0.2 * rate && t <= w[w.length - 1] + 0.45 * rate) return true;   // inside the sentence (the dip starts just before its first word)
    const nw = wt[p.ids[k + 1]];
    return !!(nw && nw.length && t + 0.2 * rate >= nw[0]);   // the next sentence is about to start
  }
  function ambDuckScene() {   // what is being read decides how deep the dip is: dialogue dips more, description less; also drives spatial reverb
    const sc = AMB.scene = { dens: 0.5, hold: false };
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      AMB.sceneId = id;
      if (AMB.lastSec !== S.sec) { AMB.swellUntil = performance.now() + 5000; AMB.lastSec = S.sec; }   // a new chapter or track: the scene opens up for a few seconds
      if (!sents || id == null || id < 0 || !sents[id]) return;
      if (id > 0 && sents[id - 1] && sents[id - 1].h && AMB.headId !== id) { AMB.headId = id; AMB.swellUntil = performance.now() + 5000; }   // the line after a heading
      let q = 0, n = 0;
      for (let i = Math.max(0, id - 2); i <= id; i++) { const t = sents[i] && sents[i].t; if (t == null) continue; n++; if (/["\u201c\u201d]/.test(t)) q++; }
      sc.dens = n ? q / n : 0.5;   // share of the last three sentences that are quoted speech
      const nx = sents[id + 1];   // a paragraph that ends on a question, a shout, a dash or a trailing-off: a held breath before the next one
      sc.hold = (!nx || nx.p !== sents[id].p) && /(?:[?!\u2026\u2014]|\.\.\.)["\u201d\u2019')\]]*$/.test(sents[id].t);
      /* Spatial: build a context window of recent sentences to stabilise the reading (current wins if explicit; else recent majority) */
      if (P.ambSmart !== false && AMB.on) {
        const window = 3, votes = { indoor: 0, outdoor: 0, occluded: 0, '': 0 };
        for (let i = Math.max(0, id - window + 1); i <= id; i++) {
          const st = sents[i] && sents[i].t, sp = ambSpaceDetect(st || ''), w = i === id ? 2 : 1;   // current sentence counts double
          votes[sp] = (votes[sp] || 0) + w;
        }
        const space = Object.keys(votes).reduce((a, b) => votes[b] > votes[a] ? b : a, '');
        if (space !== AMB.spaceApplied) ambSpaceApply(space, space === 'occluded' ? 0.5 : 1.5);
      }
    } catch (e) {}
  }
  function ambDuckVec(st) {   // [voice-band gain, cut at 3 kHz, cut at 800 Hz] for a state, and how fast to move there
    const v = { s: [0.68, -10, -4], p: [1, 0, 0], u: [0.8, -5, -2], o: [1, 0, 0] }[st] || [1, 0, 0];
    let tc = st === 's' ? 0.08 : (st === 'p' ? 0.35 : 0.4);
    if (P.ambSmart === false || (st !== 's' && st !== 'p')) return { v, tc };
    const sc = AMB.scene || { dens: 0.5, hold: false }, now = performance.now();
    if (st === 's') {
      const open = now < (AMB.swellUntil || 0) ? 1 : 0;
      v[0] = 0.78 - 0.2 * sc.dens + 0.1 * open; v[1] = -8.5 - 3 * sc.dens + 2.5 * open; v[2] = -3.25 - 1.5 * sc.dens + open;   // 0.5 of dialogue gives the old dip
    } else {
      const ps = now - (AMB.pauseSince || now);
      v[0] = sc.hold ? (ps < 2500 ? 0.88 : 1) : (ps > 800 ? 1.06 : 1);   // a long quiet lets the scene breathe up; after a cliffhanger it holds back, then lets go
      tc = sc.hold ? 0.5 : 0.9;
    }
    return { v, tc };
  }
  function ambDuckSet(st, slow) {   // s speaking, p pause, u unknown, o off. Dip fast, let go slowly.
    const ctx = AMB.ctx, t = ctx.currentTime, r = ambDuckVec(st), v = r.v, tc = slow ? Math.max(r.tc, 1.2) : r.tc;
    AMB.duckV = v.join();
    AMB.duck.gain.setTargetAtTime(v[0], t, tc);
    if (AMB.ca) { AMB.ca.gain.setTargetAtTime(v[1], t, tc); AMB.cb.gain.setTargetAtTime(v[2], t, tc); }
  }
  function ambVoiceState() {   // 's' narrator speaking (or about to), 'p' pause between sentences, 'u' unknown (no times, no analyser). Shared by the ambient and the music duck.
    const soon = ambVoiceSoon();
    let heard = null, an = null; try { an = vgraph; } catch (e) {}
    if (an && an.getByteTimeDomainData) {
      const buf = AMB.dbuf || (AMB.dbuf = new Uint8Array(an.fftSize)); an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      if (Math.sqrt(sum / buf.length) > 0.02) AMB.lastVoice = performance.now();
      heard = performance.now() - (AMB.lastVoice || 0) < 400;
    }
    if (soon === null && heard === null) return 'u';
    return (soon === true || heard === true) ? 's' : 'p';
  }
  function ambDuckTick() {
    if (!AMB.on || !AMB.duck) return;
    let st = 'o';
    if (P.ambDuck !== false && ambPlaying()) st = ambVoiceState();
    if (P.ambSmart !== false && (S.curId !== AMB.sceneId || S.sec !== AMB.lastSec)) ambDuckScene();
    if (P.ambAuto !== false && (S.curId !== AMB.autoId || S.sec !== AMB.autoSec)) ambAutoStep();
    if (st !== AMB.duckS) { AMB.duckS = st; if (st === 'p') AMB.pauseSince = performance.now(); ambDuckSet(st); }
    else if ((st === 's' || st === 'p') && ambDuckVec(st).v.join() !== AMB.duckV) ambDuckSet(st, st === 's');   // the scene changed under a steady state: move there smoothly
  }
