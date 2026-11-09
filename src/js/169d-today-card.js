  /* ---------- Today card on Home (TDH) ----------
     One card at the top of Home (#td-home, right under the search box). It shows the plan from the Today screen (169c): "N of M done", a thick bar,
     and a chip for the words due. Tapping it opens the Today screen (TD.open). A gold CONTINUE button is only part of the look: the whole card is the button.
     Setting: Settings > Home > "Today card" (P.todayCard, saved in wt:prefs like every setting; on unless set to false). Calm mode (P.calm) also hides it.
     When the card is off, #td-home stays hidden and empty and Home is exactly as before. When it is on, the older daily-goal strip (#ex-goal, homeGoal in 120)
     is not drawn, because the card shows the same goal.
       TDH.on()      true when the card should show now (setting on, not Calm)
       TDH.paint()   draws or hides the card; called by renderRecents (120), TD.close and TD.refresh (169c)
     Nothing runs at start-up or during playback. Styles 94j-today-card.css. Remove this file, that file, their build.py lines, #td-home in 10-body-views.html,
     the #in-today row in 30-sheets-settings.html and the TDH calls in 120, 169c, 290 and 300 to go back. */
  const TDH = (() => {
    const on = () => { try { return P.todayCard !== false && P.calm !== true; } catch (e) { return false; } };
    function paint() {
      const sec = $('#td-home'); if (!sec) return;
      if (!on()) { sec.hidden = true; sec.textContent = ''; return; }
      try {
        const pl = TD.today(), tasks = pl.tasks, done = tasks.filter(t => t.done).length, all = done === tasks.length;
        const pct = Math.round(done / tasks.length * 100), rv = tasks.find(t => t.id === 'review' && !t.done);
        const card = h('button', { type: 'button', class: 'wl-card wl-card--tap td-home__card', 'aria-label': 'Today: ' + done + ' of ' + tasks.length + ' done', onclick: () => TD.open() });
        const bar = h('span', { class: 'wl-progress' + (all ? ' wl-progress--ok' : ''), 'aria-hidden': 'true' }, h('span', { class: 'wl-progress__fill' }));
        bar.style.setProperty('--wl-p', pct + '%');
        card.append(h('span', { class: 'td-home__top' },
          h('span', { class: 'td-home__txt' }, h('span', { class: 'td-home__k' }, 'TODAY'), h('span', { class: 'td-home__n' }, all ? 'All done. Nice work!' : done + ' of ' + tasks.length + ' done')),
          h('span', { class: 'td-home__go', 'aria-hidden': 'true' }, all ? 'VIEW' : 'CONTINUE')), bar);
        if (rv) card.append(h('span', { class: 'td-home__chips', 'aria-hidden': 'true' }, h('span', { class: 'td-home__chip' }, '\u21BB Review ' + (rv.target - rv.have))));
        sec.textContent = ''; sec.append(card); sec.hidden = false;
      } catch (e) { sec.hidden = true; sec.textContent = ''; }
    }
    return { on, paint };
  })();
