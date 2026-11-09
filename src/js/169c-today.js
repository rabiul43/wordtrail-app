  /* ---------- Today: a simple daily plan (TD) ----------
     A full-screen page opened from the Learn hub (tile "Today", registered at the end of this file). It shows a goal ring, a week of dots and up to four small tasks.
     No new storage key. It only READS what the app already keeps and writes one thing, the daily goal:
       goal      ST.goal (090, wt:stats): the same daily minutes goal as Home and Your listening, so there is one goal in the app. Settable here to 5, 15, 30 or any
                 whole number from 1 to 180 (Custom). Older values (10, 20, 60) simply show as Custom.
       minutes   the larger of today's listening seconds in wt:stats and today's m in wt:learnlog (LL, 148b); both come from the same listening clock
       tasks     Review N words      N = words due now + words already reviewed today, at most 80% of the goal (5 to 30). Done = reviews today (LL r) reach N. Left out when
                                     nothing is due and nothing was reviewed today. Tap: the Review lesson (RL), else the old Review tab
                 Learn N new words   N = 2 (goal 5), 5 (goal up to 15), 8 (more). Done = words saved today (LL n). Shown when a book is current (open now, wt:open,
                                     or the latest recent) or a word was saved today. Tap: that book's word list; the book is opened first when it is not the open one
                 Read N minutes      about two thirds of the goal in steps of 5 (the whole goal when it is 5). Done = minutes today. Tap: opens the current book
                 N chapter questions only when a feature has been plugged in with TD.setQuestions (none today). Done = questions answered today (LL q)
       streak    any activity counts: a day with minutes, reviews, new words or questions in wt:learnlog, or one minute of listening in wt:stats. Counted back from today,
                 or from yesterday while today is still empty. It is never shown as lost: with 0 days the chip is simply not drawn
       Calm mode (P.calm) hides the streak, the ring and the week; the tasks stay. Nothing here runs at start-up or during playback: the page is built when it opens.
     API (later tasks call these):
       TD.open() TD.close() TD.refresh()   TD.on   true while open (270 counts it as a Back layer; 168 calls refresh() when the Review lesson closes)
       TD.setQuestions({ count: () => number of questions that can be asked now, open: () => starts them })   plugs in the chapter-questions task; TD.setQuestions(null) removes it
       TD.setGoal(minutes)   saves the daily goal (whole number 1-180), returns it
       TD.plan(inp, now) TD.streak(active, now) TD.week(active, now)   pure functions (tools/today_check.js)
     Styles 94i-today.css. Remove this file, that file, their build.py lines and the TD calls in 168 and 270 to go back. */
  const TD = (() => {
    const GOALS = [5, 15, 30], MAXG = 180, QN = 5, L = { root: null, on: false, edit: false, custom: false, opener: null }, Q = { p: null };
    const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };
    const goalOf = () => { let g = 0; try { g = num(ST.goal); } catch (e) { /* stats not ready */ } return g ? Math.min(MAXG, g) : 15; };

    /* ----- data (no screen code) ----- */
    function minutes(now) {
      const k = key(now); let a = 0, b = 0;
      try { a = Math.floor(((ST.days[k] || {}).s || 0) / 60); } catch (e) { /* stats not ready */ }
      try { b = num(LL.get(k).m); } catch (e) { /* learning log not ready */ }
      return Math.max(a, b);
    }
    const dueNow = () => { try { return WS.all().filter(srsDue).length; } catch (e) { return 0; } };
    function book() {   // the book you are in the middle of: the open one, the remembered one, the latest recent
      let b = null;
      try { b = S.book || store.get('wt:open', null) || (P.recents && P.recents[0]) || null; } catch (e) { /* no book */ }
      return b && b.id != null && b.title ? b : null;
    }
    /* inp = { goal, min, log: today's learn-log record, due, book, q: questions that can be asked now (0 = none) }. Returns { goal, min, left, met, tasks }. */
    function plan(inp, now) {
      const goal = clamp(num(inp.goal) || 15, 1, MAXG), min = num(inp.min), log = inp.log || {}, r = num(log.r), n = num(log.n), q = num(log.q), due = num(inp.due), tasks = [];
      const cap = clamp(Math.round(goal * 0.8), 5, 30);
      if (due > 0 || r > 0) { const t = Math.min(cap, r + due); tasks.push({ id: 'review', target: t, have: Math.min(r, t), done: r >= t, correct: num(log.c) }); }
      if (inp.book || n > 0) { const t = goal <= 5 ? 2 : goal <= 15 ? 5 : 8; tasks.push({ id: 'new', target: t, have: Math.min(n, t), done: n >= t, book: inp.book ? String(inp.book.title) : '' }); }
      const rt = goal <= 5 ? goal : clamp(Math.round(goal * 2 / 3 / 5) * 5, 5, goal);
      tasks.push({ id: 'read', target: rt, have: Math.min(min, rt), done: min >= rt });
      if (num(inp.q) > 0 || q > 0) { const t = Math.min(QN, q + num(inp.q)); tasks.push({ id: 'questions', target: t, have: Math.min(q, t), done: q >= t }); }
      return { goal, min, left: Math.max(0, goal - min), met: min >= goal, tasks };
    }
    /* active(k): did anything happen on that day ('YYYY-MM-DD')? Counted back from today, or from yesterday while today is empty. */
    function streak(active, now) {
      const d = new Date(now); let n = 0;
      if (!active(key(d))) d.setDate(d.getDate() - 1);
      while (active(key(d)) && n < 1000) { n++; d.setDate(d.getDate() - 1); }
      return n;
    }
    function week(active, now) {   // Monday to Sunday of this week
      const t = new Date(now), tk = key(t), d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7)), out = [];
      for (let i = 0; i < 7; i++) {
        const k = key(d);
        out.push({ k, letter: 'MTWTFSS'[i], on: !!active(k), today: k === tk, future: k > tk });
        d.setDate(d.getDate() + 1);
      }
      return out;
    }
    function activeFn() {
      let log = {}; try { log = LL.all(); } catch (e) { /* learning log not ready */ }
      return k => {
        const l = log[k]; if (l && Object.keys(l).length) return true;
        try { return ((ST.days[k] || {}).s || 0) >= 60; } catch (e) { return false; }
      };
    }
    function setGoal(m) {
      const n = num(Number(m)); if (!n) return goalOf();   // empty, text, 0 or below 1: the goal stays
      const g = Math.min(MAXG, n);
      try { ST.goal = g; stDirty = true; stSave(); } catch (e) { return goalOf(); }
      try { homeGoal(); } catch (e) { /* Home strip not ready */ }
      return g;
    }
    function setQuestions(p) { Q.p = p && typeof p.count === 'function' && typeof p.open === 'function' ? p : null; }
    function current() {
      const now = new Date(); let log = {}, q = 0;
      try { log = LL.today(); } catch (e) { /* learning log not ready */ }
      try { q = Q.p ? num(Q.p.count()) : 0; } catch (e) { q = 0; }
      return plan({ goal: goalOf(), min: minutes(now), log, due: dueNow(), book: book(), q }, now);
    }

    /* ----- actions ----- */
    function goBook(then, needPlayer) {   // then(): what to do when that book is already the open one
      const b = book(); close(true);
      if (!b) { try { showTab('library'); } catch (e) { /* tab not ready */ } return; }
      if (S.book && String(S.book.id) === String(b.id) && !(needPlayer && el.player.hidden)) { then(); return; }
      try { openBook(b); } catch (e) { toast('Could not open the book.', 1800); }
    }
    const ACT = {
      review: () => { if (!RL.start()) { close(true); vocOpen('review'); } },
      new: () => goBook(() => vocOpen('book')),
      read: () => goBook(() => { /* already open and showing: closing Today shows it */ }, true),
      questions: () => { const p = Q.p; close(true); try { p && p.open(); } catch (e) { toast('Could not open that.', 1800); } }
    };

    /* ----- screen ----- */
    const T = {
      review: p => 'Review ' + p.target + (p.target === 1 ? ' word' : ' words'),
      new: p => 'Learn ' + p.target + ' new ' + (p.target === 1 ? 'word' : 'words'),
      read: p => 'Read ' + p.target + ' ' + (p.target === 1 ? 'minute' : 'minutes'),
      questions: p => p.target + ' chapter ' + (p.target === 1 ? 'question' : 'questions')
    };
    const SUB = {
      review: p => p.done ? p.correct + ' correct' : p.have + ' of ' + p.target + ' done',
      new: p => p.book ? 'From ' + p.book : 'From your books',
      read: p => p.done ? 'Done' : p.have + ' of ' + p.target + ' done',
      questions: () => 'No spoilers'
    };
    const ICON = { review: '\u21BB', new: '\u2605', read: '\uD83D\uDCD6', questions: '\u2753' };
    const BTN = { review: 'START', new: 'GO', read: 'GO', questions: 'START' };

    function taskCard(p, first) {
      const card = h('div', { class: 'wl-card td-task' + (p.done ? ' is-done' : first ? ' is-next' : ''), 'data-task': p.id });
      card.append(
        h('span', { class: 'td-ic', 'aria-hidden': 'true' }, p.done ? '\u2705' : ICON[p.id]),
        h('span', { class: 'td-txt' }, h('span', { class: 'td-name' }, T[p.id](p)), h('span', { class: 'td-sub' }, SUB[p.id](p)))
      );
      if (p.done) card.append(h('span', { class: 'td-sr' }, 'Done'));
      else card.append(h('button', { type: 'button', class: 'wl-btn wl-btn--small ' + (first ? 'wl-btn--primary' : 'wl-btn--secondary') + ' td-go', onclick: () => { try { ACT[p.id](); } catch (e) { toast('Could not open that.', 1800); } } }, BTN[p.id]));
      return card;
    }
    function goalCard(pl) {
      const pct = Math.min(100, Math.round(pl.min / pl.goal * 100)), card = h('div', { class: 'wl-card td-goal' }), top = h('div', { class: 'td-goal__top' });
      const ring = h('div', { class: 'wl-ring td-ring' + (pl.met ? ' wl-ring--ok' : ''), role: 'img', 'aria-label': pl.min + ' of ' + pl.goal + ' minutes today' }, h('span', { class: 'wl-ring__label', 'aria-hidden': 'true' }, pl.min + '/' + pl.goal));
      ring.style.setProperty('--wl-p', pct + '%');
      const side = h('div', { class: 'td-goal__side' },
        h('div', { class: 'td-goal__t' }, 'Daily goal: ' + pl.goal + ' min'),
        h('div', { class: 'td-goal__s' }, pl.met ? 'Goal reached. Nice work!' : pl.left + (pl.left === 1 ? ' minute to go' : ' minutes to go')),
        h('button', { type: 'button', class: 'wl-btn wl-btn--small wl-btn--secondary td-chg', 'aria-expanded': String(L.edit), onclick: () => { L.edit = !L.edit; L.custom = L.edit && GOALS.indexOf(pl.goal) < 0; draw(); } }, 'Change'));
      top.append(ring, side); card.append(top);
      if (L.edit) card.append(editor(pl));
      const af = activeFn(), row = h('div', { class: 'td-week', role: 'list' });
      week(af, new Date()).forEach(d => row.append(h('div', { class: 'td-day' + (d.on ? ' is-on' : '') + (d.today ? ' is-today' : ''), role: 'listitem', 'aria-label': d.k + (d.on ? ', active' : '') }, h('span', { class: 'td-day__l', 'aria-hidden': 'true' }, d.letter), h('span', { class: 'td-dot', 'aria-hidden': 'true' }))));
      card.append(row);
      return card;
    }
    function editor(pl) {
      const box = h('div', { class: 'td-edit' }), chips = h('div', { class: 'td-chips', role: 'group', 'aria-label': 'Daily goal in minutes' });
      GOALS.forEach(g => chips.append(h('button', { type: 'button', class: 'wl-btn wl-btn--small wl-btn--secondary td-chip', 'aria-pressed': String(!L.custom && pl.goal === g), onclick: () => { setGoal(g); L.edit = false; L.custom = false; draw(); } }, g + ' min')));
      chips.append(h('button', { type: 'button', class: 'wl-btn wl-btn--small wl-btn--secondary td-chip', 'aria-pressed': String(L.custom || GOALS.indexOf(pl.goal) < 0), onclick: () => { L.custom = true; draw(); const i = $('.td-in', L.root); if (i) i.focus(); } }, 'Custom'));
      box.append(chips);
      if (L.custom || GOALS.indexOf(pl.goal) < 0) {
        const inp = h('input', { class: 'td-in', type: 'number', inputmode: 'numeric', min: '1', max: String(MAXG), value: String(pl.goal), 'aria-label': 'Minutes per day' });
        const save = () => { const g = setGoal(inp.value); L.edit = false; L.custom = false; draw(); return g; };
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
        box.append(h('div', { class: 'td-cust' }, inp, h('span', { class: 'td-u' }, 'minutes'), h('button', { type: 'button', class: 'wl-btn wl-btn--small wl-btn--primary', onclick: save }, 'Save')));
      }
      return box;
    }
    function draw() {
      if (!L.root) return;
      const pl = current(), c = calm(), n = c ? 0 : streak(activeFn(), new Date()), main = h('div', { class: 'td-main' });
      const top = h('div', { class: 'td-top' },
        h('button', { type: 'button', class: 'td-x', 'aria-label': 'Close', onclick: () => close() }, '\u2715'),
        h('h2', { class: 'td-title', id: 'td-title', tabindex: '-1' }, 'Today'),
        n > 0 ? h('span', { class: 'td-streak' }, h('span', { 'aria-hidden': 'true' }, '\uD83D\uDD25'), ' ' + n + (n === 1 ? ' day' : ' days')) : '');
      if (!c) main.append(goalCard(pl));
      const first = pl.tasks.find(t => !t.done);
      pl.tasks.forEach(t => main.append(taskCard(t, t === first)));
      L.root.textContent = ''; L.root.append(top, h('div', { class: 'td-scroll' }, main));
    }
    function open() {
      if (!L.root) {
        L.root = h('div', { class: 'td', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'td-title', hidden: true });
        L.root.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !RL.on) { ev.stopPropagation(); close(); } });
        document.body.append(L.root);
      }
      L.on = true; L.edit = false; L.custom = false; L.opener = document.activeElement; L.root.hidden = false; draw();
      const t = $('#td-title'); if (t) t.focus();
      histSoon();
    }
    function close(quiet) {
      if (!L.on) return;
      L.on = false; L.root.hidden = true;
      try { LearnHub.refresh(); } catch (e) { /* hub not ready */ }   // the Today tile shows the new numbers
      try { TDH.paint(); } catch (e) { /* Home card not ready */ }
      if (!quiet) { histSoon(); if (L.opener && L.opener.isConnected) L.opener.focus(); } else histSoon();
    }
    function refresh() { if (L.on) draw(); try { TDH.paint(); } catch (e) { /* Home card not ready */ } }

    return { open, close, refresh, today: current, setGoal, setQuestions, plan, streak, week, get on() { return L.on; } };
  })();

  /* The Today tile: the first tile of the Learn hub. */
  LearnHub.register({
    id: 'today', order: 1, icon: '\u2600', title: 'Today',
    subtitle: () => {
      if (P.calm === true) return 'Your plan for today';
      const g = Math.min(180, Math.max(1, Math.floor(ST.goal) || 15)), m = Math.max(Math.floor(((ST.days[dayKey()] || {}).s || 0) / 60), LL.get(dayKey()).m || 0);
      return m >= g ? 'Goal reached' : m + ' of ' + g + ' min';
    },
    open: () => TD.open()
  });
