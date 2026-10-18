  guideDoc('account', 'Weekly report', "Account > Your listening > Weekly report: a short summary of your week (Monday to Sunday) with minutes listened, words learned, your streak and the books you finished. Share it as an image or save it. On Sundays it opens on the week that ends today. Counted on this device only.", '2026-10-18');
  /* ---------- Weekly report: a Sunday summary of one Mon-Sun week, drawn as a 1080x1350 image ----------
     Reads the same numbers as the Listening dashboard (ST.days, stSummary().done, myWords()). Nothing is
     stored and nothing is uploaded: the preview in the box IS the image that is shared or saved.
     The image always uses the Midnight Library colours so it looks the same whatever theme the reader uses.
     In Calm mode the streak is replaced by "days listened" (no streaks there). */
  const WR = { mode: null };
  const WR_C = { bg: '#0F1220', surface: '#171B2E', line: '#2A3050', ink: '#F2EBDD', muted: '#B0B2C8', accent: '#E0B15A' };
  const wrMon = d => { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  function wrReport(mode) {
    const now = new Date(), mon = wrMon(now); if (mode === 'last') mon.setDate(mon.getDate() - 7);
    const nextMon = new Date(mon); nextMon.setDate(nextMon.getDate() + 7);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const act = k => !!(ST.days[k] && ST.days[k].s >= ST_ACTIVE);
    const days = []; let secs = 0, listened = 0;
    for (let i = 0; i < 7; i++) {
      const x = new Date(mon); x.setDate(mon.getDate() + i); const k = dayKey(x), s = ST.days[k] ? ST.days[k].s : 0;
      days.push({ k, s, label: 'MTWTFSS'[i] }); secs += s; if (s >= ST_ACTIVE) listened++;
    }
    let e = sun > now ? new Date(now) : new Date(sun);          // the streak is counted up to the end of the week (or today)
    if (!act(dayKey(e)) && e.toDateString() === now.toDateString()) e.setDate(e.getDate() - 1);
    let streak = 0; while (act(dayKey(e))) { streak++; e.setDate(e.getDate() - 1); }
    const a = mon.getTime(), z = nextMon.getTime(), ws = myWords();
    const accAt = w => w.acq || (w.iv >= 14 ? (w.ts || 0) : 0);
    const learned = ws.filter(w => { const t = accAt(w); return t >= a && t < z; }).length;
    const saved = ws.filter(w => w.ts >= a && w.ts < z).length;
    const done = stSummary().done.filter(b => b.ts >= a && b.ts < z);
    const f = (d, o) => d.toLocaleDateString(undefined, o);
    const range = mon.getMonth() === sun.getMonth() ? f(mon, { day: 'numeric' }) + '\u2013' + f(sun, { day: 'numeric', month: 'short' }) : f(mon, { day: 'numeric', month: 'short' }) + ' \u2013 ' + f(sun, { day: 'numeric', month: 'short' });
    return { days, secs, listened, streak, learned, saved, done, range, key: dayKey(sun), empty: secs < ST_ACTIVE && !done.length && !learned && !saved };
  }
  async function wrDraw(cv, r) {
    const W = 1080, H = 1350, g = cv.getContext('2d'), C = WR_C, calm = P.calm === true;
    try { if (document.fonts && document.fonts.load) await Promise.all(['600 80px Fraunces', '600 30px Inter', '500 30px Inter'].map(f => document.fonts.load(f).catch(() => {}))); } catch (e) { /* the fallback fonts are fine */ }
    const SERIF = "Fraunces, 'Newsreader', Georgia, serif", SANS = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
    const rr = (x, y, w, h, rad, fill) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, rad) : g.rect(x, y, w, h); g.fillStyle = fill; g.fill(); };
    const track = px => { if ('letterSpacing' in g) g.letterSpacing = px + 'px'; };
    const fit = (t, w) => { if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '\u2026').width > w) t = t.slice(0, -1); return t.trimEnd() + '\u2026'; };
    cv.width = W; cv.height = H;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * .85, 0, 0, W * .85, 0, 760); glow.addColorStop(0, 'rgba(224,177,90,.20)'); glow.addColorStop(1, 'rgba(224,177,90,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = C.accent; g.font = '700 26px ' + SANS; track(6); g.fillText('WORDTRAIL', 80, 112); track(0);
    g.fillStyle = C.ink; g.font = '600 80px ' + SERIF; g.fillText('My week in listening', 80, 222);
    g.fillStyle = C.muted; g.font = '500 34px ' + SANS; g.fillText(r.range, 80, 284);
    const mins = Math.round(r.secs / 60), hrs = r.secs >= 36000;
    const cells = [
      [hrs ? (r.secs / 3600).toFixed(1).replace(/\.0$/, '') : String(mins), hrs ? 'hours listened' : mins === 1 ? 'minute listened' : 'minutes listened', true],
      [String(r.learned), r.learned === 1 ? 'word learned' : 'words learned', false, r.saved ? r.saved + ' saved' : ''],
      calm ? [r.listened + ' of 7', 'days listened', false] : [String(r.streak), 'day streak', false],
      [String(r.done.length), r.done.length === 1 ? 'book finished' : 'books finished', false]
    ];
    cells.forEach((c, i) => {
      const x = 80 + (i % 2) * 460, y = 340 + Math.floor(i / 2) * 270;
      rr(x, y, 440, 250, 32, C.surface);
      g.fillStyle = c[2] ? C.accent : C.ink; g.font = '600 112px ' + SERIF; g.fillText(c[0], x + 40, y + 140);
      g.fillStyle = C.muted; g.font = '500 30px ' + SANS; g.fillText(c[1], x + 40, y + 196);
      if (c[3]) { g.textAlign = 'right'; g.fillStyle = C.accent; g.font = '600 26px ' + SANS; g.fillText(c[3], x + 400, y + 52); g.textAlign = 'left'; }
    });
    // seven bars, Monday to Sunday
    rr(80, 900, 920, 190, 32, C.surface);
    const mx = Math.max(600, ...r.days.map(d => d.s)), bw = 70, gap = (920 - 80 - bw * 7) / 6;
    r.days.forEach((d, i) => {
      const x = 120 + i * (bw + gap), bh = d.s > 0 ? Math.max(8, d.s / mx * 100) : 8;
      rr(x, 1030 - bh, bw, bh, 12, d.s >= ST_ACTIVE ? C.accent : C.line);
      g.fillStyle = C.muted; g.font = '600 22px ' + SANS; g.textAlign = 'center'; g.fillText(d.label, x + bw / 2, 1070); g.textAlign = 'left';
    });
    // finished books
    g.fillStyle = C.muted; g.font = '700 22px ' + SANS; track(4); g.fillText(r.done.length ? 'FINISHED THIS WEEK' : 'FINISHED', 80, 1160); track(0);
    g.font = '600 38px ' + SERIF;
    if (!r.done.length) { g.fillStyle = C.muted; g.fillText('No book finished this week', 80, 1218); }
    else {
      const shown = r.done.slice(0, 2); g.fillStyle = C.ink;
      shown.forEach((b, i) => { const more = i === shown.length - 1 && r.done.length > 2 ? '  +' + (r.done.length - 2) + ' more' : ''; g.fillText(fit(b.title || 'Untitled', 920 - (more ? 150 : 0)) + more, 80, 1218 + i * 54); });
    }
    g.fillStyle = C.muted; g.font = '500 24px ' + SANS; g.textAlign = 'right'; g.fillText('Counted on my device', 1000, 1300); g.textAlign = 'left';
  }
  function wrBox() {
    if (!WR.mode) WR.mode = new Date().getDay() === 0 ? 'this' : 'last';
    const r = wrReport(WR.mode), box = h('div', { class: 'ls-box wr' });
    const chip = (m, t) => h('button', { class: 'ls-chip', type: 'button', 'aria-pressed': String(WR.mode === m), onclick: () => { if (WR.mode !== m) { WR.mode = m; box.replaceWith(wrBox()); } } }, t);
    box.append(h('h3', {}, 'Weekly report'), h('div', { class: 'ls-chips' }, chip('last', 'Last week'), chip('this', WR.mode === 'this' && new Date().getDay() === 0 ? 'This week (Sunday)' : 'This week')));
    if (r.empty) { box.append(h('p', { class: 'an-note' }, 'Nothing listened ' + (WR.mode === 'this' ? 'this week yet' : 'in this week') + ' (' + r.range + '). Listen for a minute and it appears here.')); return box; }
    const cv = h('canvas', { class: 'wr-cv', width: 1080, height: 1350, role: 'img', 'aria-label': 'Weekly report for ' + r.range + ': ' + Math.round(r.secs / 60) + ' minutes listened, ' + r.learned + ' words learned' + (P.calm === true ? '' : ', ' + r.streak + ' day streak') + ', ' + r.done.length + ' books finished' });
    const ready = wrDraw(cv, r).catch(() => {});
    const blob = async () => { await ready; return new Promise(res => cv.toBlob(res, 'image/png')); };
    const name = 'wordtrail-week-' + r.key + '.png';
    const save = async () => {
      const b = await blob(); if (!b) { toast('Could not make the image.'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Image saved.', 2000);
    };
    const share = async () => {
      const b = await blob(); if (!b) { toast('Could not make the image.'); return; }
      const f = new File([b], name, { type: 'image/png' });
      try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'My week on Wordtrail' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      save();
    };
    box.append(cv, h('div', { class: 'wr-btns' }, h('button', { class: 'btn', type: 'button', onclick: share }, 'Share image'), h('button', { class: 'btn ghost', type: 'button', onclick: save }, 'Save')));
    return box;
  }

