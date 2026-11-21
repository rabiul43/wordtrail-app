  /* ---------- Audio diagnostics (Settings > Developer > Audio diagnostics) ----------
     Answers "why does the narrator sound choppy / noisy / like a bad phone line" on a real phone: which path the voice takes (the browser's own
     player, or through Web Audio: sound wave, enhancer, mono, balance), the shared AudioContext (rate, latency, state, the ambient engine that
     may be built for nothing), the media element (buffer ahead, source, network), how often it waited or stalled, how busy the main thread is
     (loop lag, long tasks) and, where the browser offers it, the context's own under-run counters (AudioContext.playbackStats).
     Cost: a handful of counters on events that already fire. The 250 ms lag timer and the long-task observer run ONLY while the panel is open.
     "Copy report" puts the text on the clipboard so it can be pasted into a chat. Nothing here is stored or sent anywhere. */
  const AD = { waiting: 0, stalled: 0, errors: 0, lastErr: '', seeks: 0, since: Date.now(), playMs: 0, playAt: 0, lag: [], longTasks: 0, longMs: 0, timer: 0, lagT: 0, lagLast: 0, po: null };
  const adNow = () => performance.now();
  function adPlayStart() { if (!AD.playAt) AD.playAt = adNow(); }
  function adPlayStop() { if (AD.playAt) { AD.playMs += adNow() - AD.playAt; AD.playAt = 0; } }
  audio.addEventListener('playing', adPlayStart);
  ['pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, adPlayStop));
  audio.addEventListener('waiting', () => { if (!audio.paused && !audio.seeking && !S.loadingAudio) AD.waiting++; adPlayStop(); });
  audio.addEventListener('stalled', () => { AD.stalled++; });
  audio.addEventListener('seeking', () => { AD.seeks++; });
  audio.addEventListener('error', () => { AD.errors++; AD.lastErr = audio.error ? 'code ' + audio.error.code : '?'; });
  function adReset() {
    AD.waiting = AD.stalled = AD.errors = AD.seeks = AD.longTasks = AD.longMs = 0; AD.lastErr = ''; AD.since = Date.now(); AD.playMs = 0; AD.playAt = audio.paused ? 0 : adNow(); AD.lag = [];
  }
  function adAhead() {
    try { const b = audio.buffered, t = audio.currentTime; for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.1 && b.end(i) >= t) return +(b.end(i) - t).toFixed(1); return 0; } catch (e) { return -1; }
  }
  function adSource() {
    const s = audio.currentSrc || ''; if (!s) return 'none';
    if (/^blob:/.test(s)) return 'saved copy on this device';
    try { if (typeof PROXY === 'string' && PROXY && s.indexOf(PROXY) === 0) return 'streamed through the proxy Worker'; return 'streamed from ' + new URL(s).hostname; } catch (e) { return 'streamed'; }
  }
  function adReport() {
    const L = [], warn = [], yn = v => v ? 'yes' : 'no';
    const ctx = (typeof AMB !== 'undefined' && AMB) ? AMB.ctx : null, graph = !!vgraph;
    const chain = enh ? (enh.wetIn && enh.wetIn.gain.value > 0.5 ? 'in use (enhancer or even-out-volume is on)' : 'bypassed (dry)') : 'not built';
    L.push('== Voice path ==');
    L.push('Narrator goes through: ' + (graph ? 'Web Audio graph' : 'the browser\'s own player (direct)'));
    L.push('Enhancer chain: ' + chain);
    L.push('Settings: sound wave ' + P.viz + ', enhancer ' + P.enh + ', even-out ' + yn(P.level) + ', skip silence ' + yn(P.silence) + ', mono ' + yn(P.mono) + ', balance ' + (+P.balance || 0));
    L.push('crossorigin attribute: ' + (audio.crossOrigin || 'none'));
    if (graph) warn.push('The voice runs through Web Audio (re-sampled, extra processing). To test without it: Settings > Audio: sound wave Off, enhancer Off, even-out Off, mono Off, balance centre.');
    L.push('');
    L.push('== Shared AudioContext ==');
    if (ctx) {
      L.push('State: ' + ctx.state + ', sample rate: ' + ctx.sampleRate + ' Hz');
      L.push('Base latency: ' + (ctx.baseLatency != null ? (ctx.baseLatency * 1000).toFixed(1) + ' ms' : 'n/a') + ', output latency: ' + (ctx.outputLatency != null ? (ctx.outputLatency * 1000).toFixed(1) + ' ms' : 'n/a'));
      L.push('Ambient engine built: ' + yn(AMB.built) + ', ambient sound playing: ' + yn(AMB.on));
      if (AMB.built && !AMB.on && !(typeof musicActive === 'function' && musicActive())) warn.push('The ambient engine (two reverb convolvers) is built but nothing is playing through it. On a weak phone it can still cost audio-thread time.');
      try {
        const ps = ctx.playbackStats;
        if (ps) { L.push('Context under-runs: ' + ps.underrunEvents + ' events, ' + (ps.underrunDuration * 1000).toFixed(0) + ' ms of ' + ps.totalDuration.toFixed(0) + ' s'); if (ps.underrunEvents > 0) warn.push('The audio context itself reports under-runs (it could not deliver sound in time): ' + ps.underrunEvents + '.'); }
        else L.push('Context under-run counters: not offered by this browser');
      } catch (e) { L.push('Context under-run counters: not available'); }
    } else L.push('No AudioContext yet (nothing has needed one): the voice cannot be affected by it.');
    L.push('');
    L.push('== Narrator audio element ==');
    L.push('Source: ' + adSource());
    L.push('Position ' + (audio.currentTime || 0).toFixed(1) + ' s of ' + (isFinite(audio.duration) ? audio.duration.toFixed(0) : '?') + ' s, ' + (audio.paused ? 'paused' : 'playing') + ', speed ' + audio.playbackRate + 'x');
    const ahead = adAhead();
    L.push('Buffered ahead: ' + (ahead < 0 ? '?' : ahead + ' s') + ', readyState ' + audio.readyState + ', networkState ' + audio.networkState);
    if (!audio.paused && ahead >= 0 && ahead < 4 && !/^blob:/.test(audio.currentSrc || '')) warn.push('Less than 4 s buffered ahead while playing: the connection is not keeping up.');
    const c = navigator.connection;
    L.push('Connection: ' + (c ? (c.effectiveType || '?') + ', ' + (c.downlink != null ? c.downlink + ' Mbit/s' : '?') + ', rtt ' + (c.rtt != null ? c.rtt + ' ms' : '?') + (c.saveData ? ', data saver ON' : '') : 'not reported by this browser') + ', online: ' + yn(navigator.onLine));
    L.push('');
    L.push('== Since ' + new Date(AD.since).toLocaleTimeString() + ' (Reset counters starts again) ==');
    const play = (AD.playMs + (AD.playAt ? adNow() - AD.playAt : 0)) / 1000;
    L.push('Time playing: ' + play.toFixed(0) + ' s');
    L.push('Waited for data while playing: ' + AD.waiting + ', stalled events: ' + AD.stalled + ', load errors: ' + AD.errors + (AD.lastErr ? ' (last ' + AD.lastErr + ')' : '') + ', seeks: ' + AD.seeks);
    L.push('Weak-connection retries on this track: ' + (typeof STALL !== 'undefined' ? STALL.tries : '?') + (typeof STALL !== 'undefined' && STALL.gaveUp ? ' (gave up)' : ''));
    if (AD.waiting >= 3) warn.push('The narrator waited for data ' + AD.waiting + ' times: that sounds like gaps and is network or proxy, not the audio graph.');
    L.push('');
    L.push('== This phone ==');
    const lag = AD.lag.length ? Math.max.apply(null, AD.lag) : 0, avg = AD.lag.length ? AD.lag.reduce((a, b) => a + b, 0) / AD.lag.length : 0;
    L.push('Main-thread delay (last 20 s): worst ' + lag.toFixed(0) + ' ms, average ' + avg.toFixed(0) + ' ms; long tasks since open: ' + AD.longTasks + (AD.longTasks ? ' (' + AD.longMs.toFixed(0) + ' ms)' : ''));
    if (lag > 300) warn.push('The page froze for ' + lag.toFixed(0) + ' ms. A direct player keeps playing through that; a Web Audio path may break up.');
    L.push('Cores: ' + (navigator.hardwareConcurrency || '?') + ', memory: ' + (navigator.deviceMemory ? '~' + navigator.deviceMemory + ' GB' : '?') + ', visible: ' + yn(!document.hidden));
    L.push('Browser: ' + navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110));
    return (warn.length ? '== What stands out ==\n' + warn.map(w => '- ' + w).join('\n') + '\n\n' : '== Nothing stands out ==\n\n') + L.join('\n');
  }
  function adPaint() { const o = $('#ad-out'); if (o) o.textContent = adReport(); }
  function adLagTick() { const n = adNow(); if (AD.lagLast) { AD.lag.push(Math.max(0, n - AD.lagLast - 250)); if (AD.lag.length > 80) AD.lag.shift(); } AD.lagLast = n; }
  function adStart() {
    if (AD.timer) return;
    AD.lagLast = 0; AD.lagT = setInterval(adLagTick, 250);
    try { if (window.PerformanceObserver && !AD.po) { AD.po = new PerformanceObserver(l => { l.getEntries().forEach(e => { AD.longTasks++; AD.longMs += e.duration; }); }); AD.po.observe({ entryTypes: ['longtask'] }); } } catch (e) { AD.po = null; }
    adPaint(); AD.timer = setInterval(adPaint, 1000);
  }
  function adStop() { clearInterval(AD.timer); clearInterval(AD.lagT); AD.timer = AD.lagT = 0; try { if (AD.po) AD.po.disconnect(); } catch (e) { /* ignore */ } AD.po = null; }
  { const d = $('#ad'), cp = $('#ad-copy'), rs = $('#ad-reset');
    if (d) d.addEventListener('toggle', () => { if (d.open) adStart(); else adStop(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) adStop(); else if (d && d.open) adStart(); });
    if (rs) rs.addEventListener('click', () => { adReset(); adPaint(); toast('Counters reset.'); });
    if (cp) cp.addEventListener('click', async () => {
      const t = adReport();
      try { await navigator.clipboard.writeText(t); toast('Report copied.'); }
      catch (e) { const ta = h('textarea', { style: 'position:fixed;opacity:0' }, t); document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); toast(ok ? 'Report copied.' : 'Could not copy. Select the text and copy it by hand.'); }
    });
  }
