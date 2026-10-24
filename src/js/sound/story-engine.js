  /* ---------- story-engine.js ----------
     Story sounds: categories, names, finding trigger words in a sentence and playing them on the audio's own clock. */
  const CUE_CATS = { nature: 'Nature', home: 'Home', travel: 'Travel', people: 'People' };
  const CUE_CAT = {};   // every sound key belongs to exactly one category switch
  [['nature', 'thunder wind waves splash rain storm sea water crickets frogs wolf bee birds owl rooster fire'], ['home', 'knock creak slam bell clock dooropen doorshut glass match paper coins lock tea'], ['travel', 'steps horse wheels train ship crowd run'], ['people', 'clap laugh sigh gasp heart']].forEach(([c, ks]) => ks.split(' ').forEach(k => { CUE_CAT[k] = c; }));
  const cueCatOff = k => (P.ambCats || {})[CUE_CAT[k]] === false;
  const CUE_NAMES = { thunder: 'Thunder', knock: 'Knocking', creak: 'Creaking', slam: 'Door slam', steps: 'Footsteps', bell: 'Bell', clock: 'Ticking clock', wind: 'Gust of wind', waves: 'Waves', splash: 'Splash', fire: 'Crackling fire', birds: 'Birdsong', owl: 'Owl', horse: 'Galloping horse', rain: 'Rain', storm: 'Storm', sea: 'Sea', water: 'Brook or river', crickets: 'Crickets', frogs: 'Frogs', wolf: 'Wolf howl', bee: 'Buzzing bee', dooropen: 'Door opening', doorshut: 'Door closing', glass: 'Breaking glass', match: 'Striking a match', paper: 'Rustling paper', coins: 'Coins', lock: 'Key and lock', tea: 'Teacups', rooster: 'Rooster', wheels: 'Carriage wheels', train: 'Train', ship: 'Ship and foghorn', crowd: 'Crowd murmur', run: 'Running', clap: 'Applause', laugh: 'Laugh', sigh: 'Sigh', gasp: 'Gasp', heart: 'Heartbeat' };
  function ambStory(id) {   // called when the reader moves to a sentence: find trigger words, play each one as its word is spoken
    try {
      if (!AMB.on || !AMB.cue || P.ambCues === false || P.calm === true || audio.paused || audio.seeking || !S.model || id == null || id < 0) return;
      const s = S.model.sents[id]; if (!s || s.h) return;
      const text = s.t, re = /[a-z0-9]+(?:['\u2019][a-z]+)?/gi, hits = [], seen = new Set();   // hits: [sound, word index, count]
      const cust = Array.isArray(P.ambCueCustom) ? P.ambCueCustom : [];
      const wIdx = idx => (text.slice(0, idx).match(/[a-z0-9]+(?:['\u2019][a-z]+)?/gi) || []).length;
      for (const r of CUE_RULES) if (r[4] && !seen.has(r[0]) && !cueCatOff(r[0])) {   // phrase rules, timed at the phrase's first word
        const pm = r[1].exec(text); if (!pm) continue;
        const fc = text[pm.index], first = !/[a-z0-9]/i.test(text.slice(0, pm.index));
        if (fc !== fc.toLowerCase() && !first) continue;
        if (r[3] && !r[3](pm[0], '', text)) continue;
        seen.add(r[0]); hits.push([r[0], wIdx(pm.index), 0]);
      }
      let m, wi = 0, prev = '';
      while ((m = re.exec(text))) {
        const lw = m[0].toLowerCase(), cap = m[0][0] !== lw[0], first = !/[a-z0-9]/i.test(text.slice(0, m.index));
        const cu = cust.find(c => c && c.w === lw.replace(/\u2019/g, "'"));   // the reader's own words: whole word, any case, names included
        if (cu) { if (CUE_SOUND[cu.k] && !seen.has(cu.k) && !cueCatOff(cu.k)) { seen.add(cu.k); hits.push([cu.k, wi, 0]); } }
        else if (!(cap && !first)) for (const r of CUE_RULES) if (!r[4] && !cueCatOff(r[0]) && r[1].test(lw) && (!r[3] || r[3](lw, prev, text))) { if (!seen.has(r[0])) { seen.add(r[0]); hits.push([r[0], wi, 0]); } break; }
        prev = lw; wi++;
      }
      hits.sort((x, y) => x[1] - y[1]);
      hits.forEach(h => { const f = CUE_COUNT[h[0]], c = f && f(text); if (c) { h[1] = wIdx(c.i); h[2] = c.n; } });   // "struck twelve", "knocked twice": count it and time it at the verb
      hits.sort((x, y) => x[1] - y[1]);
      if (!hits.length) return;
      const times = wordTimesAny(id), rate = audio.playbackRate || 1, now = nowT() + P.nudge + (P.wordShift || 0);
      const pend = AMB.cueT || (AMB.cueT = []);
      for (let j = pend.length - 1; j >= 0; j--) if (pend[j].id === id) { clearTimeout(pend[j].h); pend.splice(j, 1); }   // asked again for this sentence (play pressed): start over
      const exact = !!wordTimesFor(id);   // exact word times: land on the word; estimated ones: a little earlier, as they can be off
      hits.slice(0, 2).forEach(([k, i, n]) => {
        const e = { id, k, n, i, h: 0, T: null, lead: exact ? 0.15 : 0.3 };
        if (times && times[i] != null) { const media = times[i] - now; if (media < -0.4 || media > 15) return; e.T = times[i]; pend.push(e); ambCueWait(e); }
        else { e.h = setTimeout(() => { const x = pend.indexOf(e); if (x >= 0) pend.splice(x, 1); ambCueFire(k, id, n); }, (0.25 + i * 0.3) * 1000); pend.push(e); }
      });
    } catch (e) { console.warn('story sound', e); }   // story sounds are a bonus: never let them break reading
  }
  function ambCueWait(e) {   // wait on the audio's own clock, not on a timer: a stall, a speed change or a re-sync cannot make the sound early or late
    try {
      const pend = AMB.cueT || [], ts = wordTimesAny(e.id);
      if (ts && ts[e.i] != null) e.T = ts[e.i];   // follow the word if its time moved
      const left = e.T - (nowT() + P.nudge + (P.wordShift || 0) + e.lead - (P.ambCueShift || 0));   // seconds of audio still to wait
      if (left <= 0.02) { const x = pend.indexOf(e); if (x >= 0) pend.splice(x, 1); ambCueFire(e.k, e.id, e.n); return; }
      e.h = setTimeout(() => ambCueWait(e), Math.max(15, Math.min(250, left / (audio.playbackRate || 1) * 1000)));
    } catch (x) { console.warn('story sound', x); }
  }
  function ambCueClear() {
    (AMB.cueT || []).forEach(e => clearTimeout(e.h)); AMB.cueT = []; clearTimeout(AMB.transH); AMB.transH = 0;
    (AMB.cueG || []).forEach(g => { try { g.gain.setTargetAtTime(0, AMB.ctx.currentTime, 0.05); } catch (e) {} }); AMB.cueG = [];   // a counted run of strokes stops when the book pauses or jumps
  }
  function ambCueFire(k, id, n) {
    if (!AMB.on || !AMB.cue || P.ambCues === false || cueCatOff(k) || audio.paused || audio.seeking || Math.abs((S.curId == null ? -9 : S.curId) - id) > 1) return;   // paused, jumped away or moved on: skip
    const ms = Date.now(), nx = AMB.cueNx || (AMB.cueNx = {}), log = AMB.cueLog || (AMB.cueLog = []);
    while (log.length && ms - log[0] > 60000) log.shift();
    if (ms < (nx[k] || 0) || ms < (AMB.cueGap || 0) || log.length >= 6) return;
    const rule = CUE_RULES.find(r => r[0] === k); nx[k] = ms + (rule ? rule[2] : 30000); AMB.cueGap = ms + 3500; log.push(ms);
    try { AMB.ctx.resume().catch(() => {}); AMB.pj = 0.95 + Math.random() * 0.1; let dst = AMB.cue; if (n > 1) { dst = AMB.ctx.createGain(); dst.connect(AMB.cue); (AMB.cueG = (AMB.cueG || []).slice(-3)).push(dst); } CUE_SOUND[k](dst, AMB.ctx.currentTime + 0.03, n || undefined); } catch (e) { console.warn('story sound', k, e); }
    AMB.pj = 1;
  }
