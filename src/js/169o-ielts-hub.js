  /* ---------- IELTS hub (IE, IEC) ----------
     When "Prepare for IELTS" is on (GL.mode() === 'exam', 169l) the Learn side of My Library (LearnHub, 169b) starts with this section,
     above the usual tiles (nothing is removed; they stay below):
       exam card   "Exam in N days", date and target, a thin progress bar, "Week N of M". Edit opens date + target right there (GL.setExamField, 169l)
       4 skill cards  Listening, Reading, Writing, Speaking: practice SESSIONS this calendar month, never scores. A ring shows the count (full = 12 sessions);
                      the least-practised skill gets a "Focus" tag (none while all four are equal, e.g. a new month; all lowest ones when tied)
       Today button   opens the focus skill's sheet (or the Today plan, 169c, when there is no focus)
     Goal, exam date and target are NOT stored again here: they stay in P.goal (wt:prefs, already synced), the one place Settings and Home read.
     New synced key (category "Learning stats", 295; also in backups, 290):
       wt:ielts = { 'YYYY-MM-DD': { l: n, r: n, w: n, s: n } }   sessions per local day: l Listening, r Reading, w Writing, s Speaking (missing = 0)
       Merge across devices: per day the LARGER value of each skill (IE.mergeJson), so a merge never loses a day and can be repeated. Last 400 days kept.
     What counts as one session (real activity, logged whatever the goal is, so practice is never lost when the goal changes):
       Listening  a finished Listen and type set (169k)        Reading   a finished set of chapter questions (169g)
       Speaking   an Echo practice with 3 or more sentences (169h)   Writing   a finished Paraphrase set (169p, Task 56); essays elsewhere are added by hand (skill sheet)
       A finished Paraphrase set (169p) adds one Reading AND one Writing session. The skill sheet lists every tool of a skill (TOOL), the first as the main button.
       Any skill can also get a session added by hand ("I practised somewhere else") and the last one of today taken back (Undo).
     API (later tasks call these): IE.log(skill, n = 1) with skill 'l' | 'r' | 'w' | 's'   IE.undo(skill)   IE.month(now) -> { l, r, w, s }   IE.focus(now) -> ['w']
       IE.paint() redraws the section when it is on screen   IE.mergeJson(a, b)   IE.KEY
     Pure rules (IEC, between IEC-START/END): clean, merge, mergeJson, month, focus, ring, weeks. Test: node tools/ielts_check.js
     Nothing here runs at start-up or during playback: the section is built when the hub is drawn; a log call is one small write.
     Styles 94v-ielts-hub.css, sheet markup 28f-sheet-ielts.html. To go back: remove those, this file, the build.py lines, the head() call and the IE.log lines in 169g/169h/169k,
     the wt:ielts lines in 295 and 290. */
  /* IEC-START */
  const IEC = (() => {
    const SK = ['l', 'r', 'w', 's'], NAME = { l: 'Listening', r: 'Reading', w: 'Writing', s: 'Speaking' }, KEEP = 400, DAY = /^\d{4}-\d{2}-\d{2}$/, RING = 12;
    const num = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    function clean(d) { const o = {}; if (!isObj(d)) return o; SK.forEach(f => { const n = num(d[f]); if (n) o[f] = n; }); return o; }
    function prune(log) { const ks = Object.keys(log).sort(); ks.slice(0, Math.max(0, ks.length - KEEP)).forEach(k => { delete log[k]; }); }
    function merge(A, B) {   // per day, the larger value of each skill; neither input is changed
      const out = {}, days = {};
      [A, B].forEach(L => { if (isObj(L)) Object.keys(L).forEach(k => { if (DAY.test(k)) days[k] = 1; }); });
      Object.keys(days).sort().forEach(k => {
        const x = clean(isObj(A) ? A[k] : null), y = clean(isObj(B) ? B[k] : null), o = {};
        SK.forEach(f => { const n = Math.max(x[f] || 0, y[f] || 0); if (n) o[f] = n; });
        if (Object.keys(o).length) out[k] = o;
      });
      prune(out); return out;
    }
    function mergeJson(a, b) { let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; } return isObj(A) && isObj(B) ? JSON.stringify(merge(A, B)) : null; }
    function month(log, now) {   // sessions per skill in the calendar month of `now` (local days)
      const p = dayKey(now).slice(0, 7) + '-', o = { l: 0, r: 0, w: 0, s: 0 };
      if (isObj(log)) Object.keys(log).forEach(k => { if (DAY.test(k) && k.indexOf(p) === 0) { const c = clean(log[k]); SK.forEach(f => { o[f] += c[f] || 0; }); } });
      return o;
    }
    function focus(c) {   // the least-practised skill(s); none when all four are equal
      const v = SK.map(f => num(c && c[f])), lo = Math.min.apply(null, v);
      return v.every(x => x === lo) ? [] : SK.filter(f => num(c[f]) === lo);
    }
    const ring = n => Math.max(0, Math.min(1, num(n) / RING));
    function weeks(g, now) {   // { w, of }: which week of the countdown, or null without a valid exam date
      if (GLC.mode(g) !== 'exam') return null;
      const total = GLC.days(g.exam.from, g.exam.date), done = GLC.days(g.exam.from, GLC.ymd(now));
      if (total == null || done == null || total <= 0) return null;
      const of = Math.ceil(total / 7);
      return { w: Math.max(1, Math.min(of, Math.floor(Math.max(0, done) / 7) + 1)), of };
    }
    return { SK, NAME, RING, num, isObj, dayKey, clean, prune, merge, mergeJson, month, focus, ring, weeks };
  })();
  /* IEC-END */

  const IE = (() => {
    const KEY = 'wt:ielts', NAME = IEC.NAME, SK = IEC.SK;
    const ICON = { l: '\uD83C\uDFA7', r: '\uD83D\uDCD6', w: '\u270E', s: '\uD83C\uDFA4' };
    const TODAY = { l: 'Today: do one listening set', r: 'Today: answer one chapter set', w: 'Today: write one Task 2 essay', s: 'Today: practise speaking aloud' };
    const COUNTS = { l: 'A finished Listen and type set counts as one session.', r: 'A finished set of chapter questions counts as one session.', s: 'An Echo practice of 3 or more sentences counts as one session.', w: 'A finished paraphrase set counts as one session. For writing on paper or elsewhere, add sessions yourself.' };
    const TOOL = { l: ['listentype'], r: ['questions', 'paraphrase'], w: ['writing', 'paraphrase'], s: ['echo'] };   // Learn hub tiles that practise a skill (the first is the main button)
    let cur = null, edit = false;
    const read = () => { let v = null; try { v = store.get(KEY, null); } catch (e) { /* storage unavailable */ } return IEC.isObj(v) ? v : {}; };
    const sessions = n => n + (n === 1 ? ' session' : ' sessions');
    const month = now => IEC.month(read(), now || new Date());
    function bump(sk, n) {   // n = +1 for a session, -1 to take back one of TODAY
      if (SK.indexOf(sk) < 0 || !n) return false;
      const log = read(), k = IEC.dayKey(new Date()), d = IEC.isObj(log[k]) ? log[k] : (log[k] = {}), next = IEC.num(d[sk]) + n;
      if (next < 0 || (n < 0 && !IEC.num(d[sk]))) return false;
      if (next) d[sk] = next; else delete d[sk];
      if (!Object.keys(d).length) delete log[k];
      IEC.prune(log);
      try { store.set(KEY, log); } catch (e) { return false; }
      return true;
    }
    const todayN = sk => IEC.num((read()[IEC.dayKey(new Date())] || {})[sk]);
    const log = (sk, n) => bump(sk, n == null ? 1 : Math.max(1, Math.floor(n)));
    const undo = sk => bump(sk, -1);
    const on = () => { try { return GL.mode() === 'exam'; } catch (e) { return false; } };
    const NS = 'http://www.w3.org/2000/svg';
    function ringEl(sk, n) {
      const R = 26, C = 2 * Math.PI * R, f = IEC.ring(n), mk = (cls, extra) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx', '32'); c.setAttribute('cy', '32'); c.setAttribute('r', String(R)); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '6'); Object.keys(extra || {}).forEach(a => c.setAttribute(a, extra[a])); return c; };
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 64 64'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      svg.append(mk('ie-trk'));
      if (f > 0) svg.append(mk('ie-arc', { 'stroke-linecap': 'round', 'stroke-dasharray': (C * f).toFixed(1) + ' ' + C.toFixed(1), transform: 'rotate(-90 32 32)' }));
      return h('span', { class: 'ie-ring' }, svg, h('span', { class: 'ie-ic' }, ICON[sk]));
    }
    const longDate = s => { const p = GLC.parse(s); return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : ''; };
    function examCard(g, now) {
      const st = GLC.examState(g, now), ex = g.exam, tg = GLC.normTarget(ex.target), card = h('div', { class: 'wl-card ie-exam' });
      const editBtn = h('button', { type: 'button', class: 'wl-btn wl-btn--secondary wl-btn--small ie-edit', onclick: () => { edit = !edit; fill(cur); } }, edit ? 'Cancel' : 'Edit');
      let kick = 'Exam in', big = '', sub = '', bar = null, wk = '';
      if (st.k === 'future') { big = st.days + (st.days === 1 ? ' day' : ' days'); sub = longDate(ex.date) + (tg ? ' \u00B7 target ' + tg.toFixed(1) : ' \u00B7 no target yet'); bar = GLC.elapsed(g, now); const w = IEC.weeks(g, now); if (w) wk = 'Week ' + w.w + ' of ' + w.of; }
      else if (st.k === 'today') { kick = ''; big = 'Exam day'; sub = 'Good luck. Stay calm.'; }
      else if (st.k === 'past') { kick = ''; big = 'Your exam date has passed'; sub = longDate(ex.date); }
      else { kick = ''; big = 'When is your exam?'; sub = 'Pick a date and, if you like, a target.'; }
      card.append(h('div', { class: 'ie-exam-row' }, h('div', { class: 'ie-exam-tx' }, kick ? h('span', { class: 'ie-kick' }, kick) : '', h('span', { class: 'ie-big' }, big)), editBtn), h('p', { class: 'ie-sub' }, sub));
      if (bar != null) card.append(h('div', { class: 'wl-progress ie-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(bar * 100)), 'aria-label': 'Time from choosing the exam to exam day' }, h('span', { class: 'wl-progress__fill', style: 'width:' + Math.round(bar * 100) + '%' })));
      if (wk) card.append(h('p', { class: 'ie-sub ie-wk' }, wk));
      if (edit) {
        const d = h('input', { type: 'date', id: 'ie-date', class: 'ie-in', value: ex.date || '', 'aria-label': 'Exam date' });
        const t = h('select', { id: 'ie-target', class: 'ie-in', 'aria-label': 'Target band, your own goal' }, h('option', { value: '' }, 'No target'));
        for (let b = 5; b <= 9; b += 0.5) t.append(h('option', { value: b.toFixed(1), selected: tg === b ? true : false }, 'Target ' + b.toFixed(1)));
        card.append(h('div', { class: 'ie-edit-row' }, d, t, h('button', { type: 'button', class: 'wl-btn wl-btn--primary wl-btn--small', onclick: () => {
          try { GL.setExamField(d.value !== (ex.date || '') ? d.value : undefined, t.value); } catch (e) { /* goal not ready */ }
          edit = false; fill(cur);
        } }, 'Save')));
      }
      return card;
    }
    function skillCard(sk, c, foc) {
      const n = c[sk], f = foc.indexOf(sk) >= 0;
      return h('button', { type: 'button', class: 'wl-card wl-card--tap ie-skill ie-' + sk + (f ? ' is-selected' : ''), 'data-skill': sk, 'aria-label': NAME[sk] + ', ' + sessions(n) + ' this month' + (f ? ', focus' : ''), onclick: () => openSkill(sk) },
        ringEl(sk, n), h('span', { class: 'ie-name' }, NAME[sk]), h('span', { class: 'ie-n' }, sessions(n)), f ? h('span', { class: 'wl-pill ie-focus' }, 'Focus') : '');
    }
    function fill(sec) {
      if (!sec) return;
      const g = P.goal, now = new Date(), c = IEC.month(read(), now), foc = IEC.focus(c);
      let streak = 0; try { if (!P.calm) streak = (PG.model() || {}).streak || 0; } catch (e) { /* progress not ready */ }
      sec.textContent = '';
      sec.append(
        h('div', { class: 'ie-top' }, h('h2', { class: 'ie-h' }, 'IELTS prep'), streak > 0 ? h('span', { class: 'ie-streak' }, h('span', { 'aria-hidden': 'true' }, '\uD83D\uDD25'), ' ' + streak) : ''),
        examCard(g, now),
        h('div', { class: 'ie-grid' }, ...SK.map(sk => skillCard(sk, c, foc))),
        h('p', { class: 'ie-cap' }, 'Rings show practice done this month, not a score. A full ring is ' + IEC.RING + ' sessions.'),
        h('button', { type: 'button', class: 'wl-btn wl-btn--block ie-books', onclick: () => AC.shelf() }, 'Books for IELTS'),   // 103b
        h('button', { type: 'button', class: 'wl-btn wl-btn--primary wl-btn--block ie-today', onclick: () => { if (foc.length) openSkill(foc[0]); else { try { TD.open(); } catch (e) { /* Today not ready */ } } } }, foc.length ? TODAY[foc[0]] : 'Today\u2019s plan'));
    }
    function section() {   // LearnHub.head: a fresh section each time the hub is drawn
      if (!on()) { cur = null; return null; }
      cur = h('section', { class: 'ie-hub', 'aria-label': 'IELTS prep' }); edit = false; fill(cur); return cur;
    }
    function paint() { if (cur && cur.isConnected && on()) fill(cur); }

    /* ----- skill sheet ----- */
    let open = '';
    function drawSkill() {
      const sk = open, body = $('#ie-sk-body'); if (!sk || !body) return;
      const n = month()[sk], ts = (TOOL[sk] || []).map(id => LearnHub.list().find(x => x.id === id)).filter(Boolean), t = ts[0] || null, td = todayN(sk);
      $('#ie-sk-title').textContent = NAME[sk];
      body.textContent = '';
      body.append(h('p', { class: 'ie-sh-n' }, sessions(n) + ' this month'), h('p', { class: 'ie-sh-p' }, COUNTS[sk]));
      const row = h('div', { class: 'ie-sh-btns' });
      ts.forEach((t, k) => row.append(h('button', { type: 'button', class: 'wl-btn ' + (k ? 'wl-btn--secondary' : 'wl-btn--primary') + ' wl-btn--block', onclick: () => { closeSheets(); let c = null; try { c = LB.ctx(); } catch (e) { /* no player */ } try { t.open(c); } catch (e) { toast('Could not open that.', 1800); } } }, 'Practise: ' + (typeof t.title === 'string' ? t.title : NAME[sk]))));
      row.append(h('button', { type: 'button', class: 'wl-btn wl-btn--secondary wl-btn--block', onclick: () => { log(sk); drawSkill(); paint(); } }, t ? 'I practised somewhere else (add one)' : 'I did a session (add one)'));
      if (td > 0) row.append(h('button', { type: 'button', class: 'wl-btn wl-btn--secondary wl-btn--block', onclick: () => { undo(sk); drawSkill(); paint(); } }, 'Undo one from today'));
      body.append(row);
    }
    function openSkill(sk) { open = sk; drawSkill(); openSheet('sheet-ielts'); try { $('#ie-sk-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    const sh = $('#sheet-ielts'); if (sh) new MutationObserver(() => { if (sh.hidden) { open = ''; paint(); } }).observe(sh, { attributes: true, attributeFilter: ['hidden'] });
    LearnHub.head(section);
    return { KEY, log, undo, month, focus: now => IEC.focus(month(now)), paint, mergeJson: IEC.mergeJson, open: openSkill };
  })();
