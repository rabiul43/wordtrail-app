  /* ---------- Goal: how the person uses Wordtrail (GL) ----------
     One saved choice shapes Home and the bottom bar. It is TWO settings, not three modes:
       learn  true / false   the Learn tab (and the Learn side of My Library) is part of the app
       exam   { on, kind: 'ielts', date: 'YYYY-MM-DD' or '', target: 4-9 in halves or null, from: 'YYYY-MM-DD' }
              an exam countdown on Home; an exam needs learning on (turning learning off turns the exam off, the date and target are kept)
     Saved as P.goal in wt:prefs (so it syncs like every setting): { v: 1, learn, exam, ask: 'done' or '', offered: bool }.
     No P.goal = the person has not chosen yet: the app looks exactly as it did before (Learn switch in My Library, Today card, no exam card).
     The three-way choice in onboarding and in Settings is only a view of the two settings:
       Enjoy stories = learn off   Learn English = learn on, exam off   Prepare for IELTS = learn on, exam on
     What each state changes:
       Learn tab    a tab in the bottom bar / side rail (data-tab="learn", labelled Learn, or IELTS while an exam is on). It opens My Library on its Learn side.
                    The Books | Learn switch inside My Library is hidden once a goal is chosen (the tab replaces it).
       Today card   hidden in Enjoy stories, and while an exam is on (the exam card has the plan button and "N of M done"). TDH.on asks GL.todayOk().
       Exam card    #gl-home on Home: days left, a bar of the preparation time, the plan button; or "set your date", "exam day", "date has passed".
       Ask card     #gl-home for people who have not chosen (existing users): one dismissible card. Dismiss = ask: 'done'.
       Offer        Enjoy stories: after 3 saved words, once, a toast "Want a Learn tab to review these?" (WS.saveWithContext calls GL.newWord).
     The reader's Learn button (P.learnBtn) is NOT tied to the goal. Choosing a goal for the first time sets its default
     (off for Enjoy stories, on otherwise); after that only its own Settings switch changes it.
       GLC (pure, between GLC-START/END): ymd, parse, days, mode, fromChoice, withLearn, withExam, examState, elapsed, tabLabel, normTarget, askOn, offerOn.
       GL (screen): get, mode, tabOn, todayOk, choose, setLearn, setExam, dismiss, paint, openLearn, newWord, label.
     Styles 94t-goal.css (after 99e: the phone bar gets a fifth column). Test: node tools/goal_check.js */
  /* GLC-START */
  const GLC = (() => {
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());   // local calendar day
    function parse(s) {   // 'YYYY-MM-DD' -> { y, m, d } or null (a day that does not exist is null)
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
      if (!m) return null;
      const y = +m[1], mo = +m[2], d = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
      return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
    }
    const utc = p => Date.UTC(p.y, p.m - 1, p.d);
    function days(from, to) {   // whole calendar days from -> to (counted in UTC days, so a daylight-saving change never shifts it)
      const a = parse(from), b = parse(to);
      return a && b ? Math.round((utc(b) - utc(a)) / 86400000) : null;
    }
    const valid = g => !!g && g.v === 1 && typeof g.learn === 'boolean';
    function mode(g) {   // 'unset' | 'stories' | 'learn' | 'exam'
      if (!valid(g)) return 'unset';
      if (g.learn && g.exam && g.exam.on) return 'exam';
      return g.learn ? 'learn' : 'stories';
    }
    function normTarget(v) {
      const n = Number(v);
      if (v === '' || v == null || !isFinite(n) || n < 4 || n > 9) return null;
      return Math.round(n * 2) / 2;
    }
    const newExam = (now, old) => ({ on: true, kind: 'ielts', date: old && parse(old.date) ? old.date : '', target: old ? normTarget(old.target) : null, from: ymd(now) });
    function fromChoice(c, now, old) {   // c: 'stories' | 'learn' | 'ielts'. An earlier exam (date, target) is kept, only switched on or off.
      const ex = old && old.exam ? old.exam : null, keep = { ask: 'done', offered: !!(old && old.offered) };
      if (c === 'stories') return Object.assign({ v: 1, learn: false, exam: ex ? Object.assign({}, ex, { on: false }) : null }, keep);
      if (c === 'ielts') return Object.assign({ v: 1, learn: true, exam: ex ? Object.assign({}, ex, { on: true, from: parse(ex.from) ? ex.from : ymd(now) }) : newExam(now) }, keep);
      return Object.assign({ v: 1, learn: true, exam: ex ? Object.assign({}, ex, { on: false }) : null }, keep);
    }
    function withLearn(g, on, now) {   // turning learning off turns the exam off too
      if (!valid(g)) return fromChoice(on ? 'learn' : 'stories', now, null);
      return fromChoice(on ? (g.exam && g.exam.on ? 'ielts' : 'learn') : 'stories', now, g);
    }
    function withExam(g, on, now) { return fromChoice(on ? 'ielts' : 'learn', now, valid(g) ? g : null); }
    function examState(g, now) {   // { k: 'none' | 'unset' | 'future' | 'today' | 'past', days }
      if (mode(g) !== 'exam') return { k: 'none', days: 0 };
      const dd = days(ymd(now), g.exam.date);
      if (dd == null) return { k: 'unset', days: 0 };
      return dd > 0 ? { k: 'future', days: dd } : dd === 0 ? { k: 'today', days: 0 } : { k: 'past', days: -dd };
    }
    function elapsed(g, now) {   // 0..1 of the time between choosing the exam and the exam day
      if (mode(g) !== 'exam') return 0;
      const total = days(g.exam.from, g.exam.date), left = days(ymd(now), g.exam.date);
      if (total == null || left == null || total <= 0) return 0;
      return Math.max(0, Math.min(1, (total - left) / total));
    }
    const tabLabel = g => mode(g) === 'exam' ? 'IELTS' : 'Learn';
    const askOn = g => !valid(g) && !(g && g.ask === 'done');   // not chosen and not dismissed
    const offerOn = (g, count) => mode(g) === 'stories' && !g.offered && count >= 3;
    return { ymd, parse, days, mode, fromChoice, withLearn, withExam, examState, elapsed, tabLabel, normTarget, askOn, offerOn };
  })();
  /* GLC-END */

  const GL = (() => {
    const get = () => (GLC.mode(P.goal) === 'unset' ? null : P.goal);
    const mode = () => GLC.mode(P.goal);
    const tabOn = () => { const m = mode(); return m === 'learn' || m === 'exam'; };
    const todayOk = () => { const m = mode(); return m !== 'stories' && m !== 'exam'; };   // Enjoy stories: no Today card; an exam has its own card
    const label = () => GLC.tabLabel(P.goal);
    const NAMES = { stories: 'Enjoy stories', learn: 'Learn English', exam: 'Prepare for IELTS' };
    let ob = null;   // onboarding: a choice made on the first card, applied when onboarding finishes (see 300)

    function save(g) { P.goal = g; savePrefs(); paint(); }
    function choose(c, first) {   // c: 'stories' | 'learn' | 'ielts'; first = the very first choice: also sets the reader's Learn button default
      const g = GLC.fromChoice(c, new Date(), P.goal);
      if (first) { P.learnBtn = c !== 'stories'; try { LB.paint(); } catch (e) { /* player not ready */ } }
      save(g);
    }
    function setLearn(on) { save(GLC.withLearn(P.goal, !!on, new Date())); }
    function setExam(on) { save(GLC.withExam(P.goal, !!on, new Date())); }
    function setExamField(date, target) {
      const g = GLC.mode(P.goal) === 'unset' ? null : P.goal; if (!g || !g.exam) return;
      const ex = Object.assign({}, g.exam);
      if (date !== undefined) { ex.date = GLC.parse(date) ? date : ''; if (ex.date) ex.from = GLC.ymd(new Date()); }
      if (target !== undefined) ex.target = GLC.normTarget(target);
      save(Object.assign({}, g, { exam: ex }));
    }
    function dismiss() { save(Object.assign({}, GLC.mode(P.goal) === 'unset' ? { v: 0 } : P.goal, { ask: 'done' })); }

    /* ----- the Learn tab ----- */
    const CAP = '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>';
    function paintTab() {
      const tab = document.querySelector('#tabbar .tab[data-tab="learn"]'); if (!tab) return;
      const on = tabOn();
      tab.hidden = !on;
      document.documentElement.toggleAttribute('data-goal-tab', on);
      const sp = tab.querySelector('.gl-tab-t'); if (sp) sp.textContent = label();
      tab.title = label();
      if (!on && typeof curTab !== 'undefined' && curTab === 'shelf' && LSW.cur === 'learn' && mode() === 'stories') LSW.toBooks();
      try { tabHlPaint(); } catch (e) { /* tab bar not ready */ }
    }
    function openLearn() {
      closeSheets();
      if (shelfMode === 'dl') shelfMode = 'saved';
      LSW.set('learn'); shelfHubNext = true; pendingBack = null; showTab('shelf');
    }

    /* ----- Home: the exam card or the ask card ----- */
    const fmtDate = s => { const p = GLC.parse(s); return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; };
    function openSettingsAt() { closeSheets(); openSheet('sheet-settings'); setTimeout(() => { const n = $('#seg-goal'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' }); }, 120); }
    function examCard(g, now) {
      const st = GLC.examState(g, now), ex = g.exam;
      const btn = (cls, text, fn) => h('button', { type: 'button', class: 'gl-btn ' + cls, onclick: fn }, text);
      const plan = btn('gl-btn--go', 'TODAY\u2019S PLAN', () => { try { TD.open(); } catch (e) { openLearn(); } });
      const kicker = h('span', { class: 'gl-k' }, 'IELTS' + (ex.target ? ' \u00B7 TARGET ' + ex.target.toFixed(1) : ''));
      let big, sub = '', act = plan, bar = null, done = '';
      try { const tk = TD.today().tasks; done = ' \u00B7 ' + tk.filter(x => x.done).length + ' of ' + tk.length + ' done today'; } catch (e) { /* Today (169c) not ready: no count */ }
      if (st.k === 'future') {
        big = st.days + (st.days === 1 ? ' day' : ' days'); sub = 'to go \u00B7 ' + fmtDate(ex.date) + done;
        bar = h('span', { class: 'wl-progress', 'aria-hidden': 'true' }, h('span', { class: 'wl-progress__fill' }));
        bar.style.setProperty('--wl-p', Math.round(GLC.elapsed(g, now) * 100) + '%');
      } else if (st.k === 'today') { big = 'Exam day. Good luck!'; act = null; }
      else if (st.k === 'past') {
        big = 'Your exam date has passed'; sub = 'It was ' + fmtDate(ex.date) + '.';
        act = h('span', { class: 'gl-pair' }, btn('gl-btn--go', 'SET NEW DATE', openSettingsAt), btn('gl-btn--quiet', 'DONE', () => { setExam(false); toast('Exam countdown turned off. Learning stays on.', 3200); }));
      } else { big = 'When is your exam?'; act = btn('gl-btn--go', 'SET DATE', openSettingsAt); }
      const card = h('div', { class: 'wl-card gl-card gl-card--exam', role: 'group', 'aria-label': 'IELTS exam' },
        h('span', { class: 'gl-top' }, h('span', { class: 'gl-txt' }, kicker, h('span', { class: 'gl-big' }, big), sub ? h('span', { class: 'gl-sub' }, sub) : ''), act || ''));
      if (bar) card.append(bar);
      return card;
    }
    function askCard() {
      const pick = (c, text, ic) => h('button', { type: 'button', class: 'gl-opt', onclick: () => choose(c, true) }, h('span', { class: 'gl-opt-ic', 'aria-hidden': 'true' }, ic), h('span', {}, text));
      return h('div', { class: 'wl-card gl-card gl-card--ask', role: 'group', 'aria-label': 'How do you want to use Wordtrail?' },
        h('span', { class: 'gl-top' }, h('span', { class: 'gl-txt' }, h('span', { class: 'gl-k' }, 'NEW'), h('span', { class: 'gl-big' }, 'How do you want to use Wordtrail?'), h('span', { class: 'gl-sub' }, 'Pick one and Home adapts. You can change it any time in Settings.')),
          h('button', { type: 'button', class: 'gl-x', 'aria-label': 'Not now', onclick: dismiss }, '\u00D7')),
        h('span', { class: 'gl-opts' }, pick('stories', 'Enjoy stories', '\uD83C\uDFA7'), pick('learn', 'Learn English', '\uD83C\uDF31'), pick('ielts', 'Prepare for IELTS', '\uD83C\uDF93')));
    }
    function paintHome() {
      const sec = $('#gl-home'); if (!sec) return;
      sec.textContent = '';
      const now = new Date(), m = mode();
      try {
        if (m === 'exam') sec.append(examCard(P.goal, now));
        else if (GLC.askOn(P.goal) && store.get('wt:onboarded', 0)) sec.append(askCard());
      } catch (e) { sec.textContent = ''; }
      sec.hidden = !sec.firstChild;
      try { TDH.paint(); } catch (e) { /* Today card not ready */ }
    }

    /* ----- Settings ----- */
    function paintSettings() {
      const m = mode(), seg = $('#seg-goal'); if (!seg) return;
      $$('#seg-goal button').forEach(b => b.setAttribute('aria-pressed', String((m === 'unset' ? '' : m === 'exam' ? 'ielts' : m) === b.dataset.v)));
      const g = m === 'unset' ? null : P.goal, ex = g && g.exam, rows = $('#gl-exam-rows');
      if (rows) rows.hidden = m !== 'exam';
      const d = $('#in-examdate'), t = $('#in-examtarget');
      if (d) d.value = ex && GLC.parse(ex.date) ? ex.date : '';
      if (t) t.value = ex && ex.target ? String(ex.target.toFixed(1)) : '';
    }
    function wire() {
      $$('#seg-goal button').forEach(b => b.addEventListener('click', () => choose(b.dataset.v, GLC.mode(P.goal) === 'unset')));
      const d = $('#in-examdate'), t = $('#in-examtarget');
      if (d) d.addEventListener('change', e => setExamField(e.target.value, undefined));
      if (t) t.addEventListener('change', e => setExamField(undefined, e.target.value));
      const tab = document.querySelector('#tabbar .tab[data-tab="learn"]');   // the click itself is routed by 300-wiring, like every tab
      if (tab && !tab.querySelector('.gl-tab-t')) { const s = tab.querySelector('span:last-child'); if (s) s.classList.add('gl-tab-t'); }
    }

    /* ----- Enjoy stories: a gentle way in when the person starts saving words ----- */
    function newWord() {
      if (!GLC.offerOn(P.goal, (WS.all() || []).length)) return;
      P.goal = Object.assign({}, P.goal, { offered: true }); savePrefs();
      toast('Want a Learn tab to review these words?', 7000, ['Add it', () => setLearn(true)]);
    }

    function paint() { paintTab(); paintHome(); paintSettings(); }
    function start() { wire(); paint(); document.addEventListener('visibilitychange', () => { if (!document.hidden && GLC.mode(P.goal) === 'exam') paintHome(); }); }   // the day changed while the app was in the background
    return { get, mode, tabOn, todayOk, choose, setLearn, setExam, dismiss, paint, openLearn, newWord, label, start, NAMES };
  })();
