  /* ---------- Listen-only screen (tracks with no text) ----------
     A track the book has no text for is not an error: the audio is fine. With the switch on (Settings > Reading > "Listen-only
     screen", P.listenOnly, default on) the player gets class `lo` and shows a round cover inside a progress ring, a small
     decorative wave, one quiet line "No text for this track" with an Add text link, and an Up next card with a strip of tracks.
     The dock (seek bar, speed, 15 s, play, sleep) is the normal one. Off: the old note and button, as before.
     Used when the book HAS a text but this track has none lined up (the header said "no text"). A book with no text at all
     keeps its own card (140, attachText) with its Step 1 to 3 choices. Timing still loading or failed keeps its own note.
     `LOC` is pure (between the LOC-START/END markers) and is tested by tools/listen_only_check.js.
     Nothing runs per animation frame: the ring moves on the audio's own 'timeupdate'; the disc and the wave only move while
     playing, never under reduced motion, Calm mode or the light-effects setting (CSS). */
  /*LOC-START*/
  const LOC = {
    BARS: [10, 18, 26, 14, 22, 8, 20, 26, 12, 18, 24, 10, 16, 22, 12, 26, 14, 20, 9, 18],
    pct(t, d) { return d > 0 && isFinite(d) && isFinite(t) ? Math.max(0, Math.min(100, Math.round(t / d * 1000) / 10)) : 0; },
    /* the track strip: at most `max` segments; each says 'cur' (holds the open track), 'done' (before it) or 'off' (after it) */
    strip(n, cur, max) {
      const k = Math.min(n, max || 48), out = [];
      for (let i = 0; i < k; i++) {
        const a = Math.floor(i * n / k), b = Math.max(a, Math.floor((i + 1) * n / k) - 1);
        out.push(cur >= a && cur <= b ? 'cur' : (b < cur ? 'done' : 'off'));
      }
      return out;
    },
    /* true when the book has a text, this track has no text lined up, its length is known and nothing is loading or failed */
    noText(o) { return !!(o && o.model && (!o.p || !o.p.ids || !o.p.ids.length) && o.dur > 0 && !o.loading && !o.fail); }
  };
  /*LOC-END*/
  const LO = (() => {
    const pl = $('#player'), wave = $('#lo-wave'), st = { on: false };
    const enabled = () => P.listenOnly !== false;
    function state(i) {
      i = i == null ? S.sec : i;
      return !!(enabled() && S.book && LOC.noText({ model: !!S.model, p: S.plan && S.plan[i], dur: S.durs && S.durs[i], loading: trkLoading(i), fail: TM.fail }));
    }
    function buildWave() {
      if (!wave || wave.firstChild) return;
      LOC.BARS.forEach((v, k) => { const b = document.createElement('i'); b.style.height = v + 'px'; b.style.animationDelay = (k * 0.09).toFixed(2) + 's'; wave.append(b); });
    }
    function paintP() {
      if (!st.on || !pl) return;
      const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (S.durs[S.sec] || 0);
      pl.style.setProperty('--lo-p', String(LOC.pct(audio.currentTime, d)));
    }
    function paintPlay() { if (pl) pl.classList.toggle('lo-play', st.on && !audio.paused); }
    function sync(i) {
      if (!pl) return;
      st.on = state(i);
      pl.classList.toggle('lo', st.on);
      if (st.on) { buildWave(); paintP(); } else pl.style.removeProperty('--lo-p');
      paintPlay();
    }
    /* the note under the cover: one quiet line, then Up next */
    function node() {
      const n = S.secs.length, cur = S.sec, nxt = S.secs[cur + 1];
      const line = h('div', { class: 'lo-line', role: 'status' }, h('span', {}, 'No text for this track. Just listen.'), h('button', { class: 'lo-add', type: 'button', onclick: () => openSheet('sheet-text') }, 'Add text'));
      const strip = h('div', { class: 'lo-strip', 'aria-hidden': 'true' }, LOC.strip(n, cur).map(k => h('i', { class: k })));
      const next = nxt ? h('div', { class: 'lo-next' },
        h('div', { class: 'lo-next-t' }, h('small', {}, 'Up next'), h('b', {}, nxt.title || 'Track ' + (cur + 2))),
        h('button', { class: 'lo-all', type: 'button', onclick: () => openSheet('sheet-tracks') }, 'All ' + n + ' tracks'), strip) : null;
      return h('div', { class: 'lo-note' }, line, next);
    }
    /* ----- wiring ----- */
    audio.addEventListener('timeupdate', paintP);
    ['play', 'playing', 'pause', 'ended'].forEach(ev => audio.addEventListener(ev, paintPlay));
    const sw = $('#in-listenonly');
    if (sw) {
      sw.checked = enabled();
      sw.addEventListener('change', e => {
        P.listenOnly = e.target.checked; savePrefs();
        try { if (S.book && S.model && S.sec != null && el.page) renderSection(S.sec); else sync(); } catch (x) { sync(); }
      });
    }
    guideDoc('reading', 'Tracks without text', 'When a track has no text, the player shows a round cover and the next track instead of a warning. Add text is still one tap away. You can turn this off in Settings > Reading.');
    return { sync, node, state, on: () => st.on };
  })();
  function loSync(i) { try { LO.sync(i); } catch (e) { /* cosmetic: the player still works */ } }
  function loNode() { return LO.node(); }
  function loActive(i) { try { return LO.state(i); } catch (e) { return false; } }
