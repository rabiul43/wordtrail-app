  /* ---------- Goal: how the person uses Wordtrail (GL) ----------
     One saved choice shapes Home and the bottom bar. It is TWO settings, not three modes:
       learn  true / false   the Learn tab (and the Learn side of My Library) is part of the app
       exam   { on, kind: 'ielts', date: 'YYYY-MM-DD' or '', target: 4-9 in halves or null, from: 'YYYY-MM-DD' }
              an exam countdown on Home; an exam needs learning on (turning learning off turns the exam off, the date and target are kept)
     LEARN MODE IS OFF BY DEFAULT: a person who has not chosen counts as off (no Learn tab, no Today card, no Books/Learn switch).
     Settings > Reading > Learning has a Learn mode switch and, under it, a Prepare for IELTS switch with the date and target.
     Saved as P.goal in wt:prefs (so it syncs like every setting): { v: 1, learn, exam, ask: 'done' or '', offered: bool }.
     No P.goal = the person has not chosen yet: the app looks exactly as it did before (Learn switch in My Library, Today card, no exam card).
     The three-way choice in onboarding and in Settings is only a view of the two settings:
       Enjoy stories = learn off   Learn English = learn on, exam off   Prepare for IELTS = learn on, exam on
     What each state changes:
       Learn tab    a tab in the bottom bar / side rail (data-tab="learn", labelled Learn, or IELTS while an exam is on). It opens My Library on its Learn side.
                    The Books | Learn switch inside My Library is hidden (the tab replaces it).
       Today card   hidden in Enjoy stories, and while an exam is on (the exam card has the plan button and "N of M done"). TDH.on asks GL.todayOk().
       Exam card    #gl-home on Home: days left, a bar of the preparation time, the plan button; or "set your date", "exam day", "date has passed".
       First visit  the goal card is the first onboarding screen (40-onboarding.html, 300-wiring). There is no card on Home: someone who skipped it, or
                    used the app before, has learn mode off and can turn it on in Settings.
       Offer        Enjoy stories: after 3 saved words, once, a toast "Want a Learn tab to review these?" (WS.saveWithContext calls GL.newWord).
     The reader's Learn button (P.learnBtn) is NOT tied to the goal. Choosing a goal for the first time sets its default
     (off for Enjoy stories, on otherwise); after that only its own Settings switch changes it.
       GLC (pure, between GLC-START/END): ymd, parse, days, mode, fromChoice, withLearn, withExam, examState, elapsed, tabLabel, normTarget, askOn, offerOn.
       GL (screen): get, mode, tabOn, todayOk, choose, setLearn, setExam, paint, openLearn, newWord, label.
     STANDARD | LEARN GATE (one switch, Settings > Reading > Learning > Learn mode): Standard = learn mode off (the default). Learn mode on sets data-learn on <html>.
       Hidden in Standard by CSS ([data-lrn], 99e3-learn-gate.css): Learn tab, Learn button (169e) and menu item, Words tile in Controls, Save word (163), Save phrase and the eye bubbles (161c),
       the English / Both / Translation bar (161b; Standard shows the original text only, RM sync via rmSync, P.rmode is kept),
       coverage chip and card (161e), book preview (131b), Account > Learning progress (#pg), the learning rows in Settings. Switched off in code with learnOn() (030):
       Underline new words (161e, KU.sync), the morning review card (120), the progress block (169f), the preview request (131b).
       STAYS in Standard: tap-a-word card and dictionary (163), press-and-hold translate (160), Live translate, old words and idioms.
       Nothing is deleted when the mode changes. Existing users with saved words get one toast (P.learnNote). Test: node tools/learn_gate_check.js
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
    const offerOn = (g, count) => (mode(g) === 'stories' || mode(g) === 'unset') && !(g && g.offered) && count >= 3;   // learn mode off, from the third saved word, once
    return { ymd, parse, days, mode, fromChoice, withLearn, withExam, examState, elapsed, tabLabel, normTarget, askOn, offerOn };
  })();
  /* GLC-END */

  const GL = (() => {
    const get = () => (GLC.mode(P.goal) === 'unset' ? null : P.goal);
    const mode = () => GLC.mode(P.goal);
    const tabOn = () => { const m = mode(); return m === 'learn' || m === 'exam'; };
    const todayOk = () => mode() === 'learn';   // Learn mode is off by default (no Today card); an exam has its own card
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

    /* ----- the Learn tab ----- */
    const CAP = '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>';
    function paintTab() {
      const tab = document.querySelector('#tabbar .tab[data-tab="learn"]'); if (!tab) return;
      const on = tabOn();
      tab.hidden = !on;
      document.documentElement.toggleAttribute('data-goal-tab', on);
      const sp = tab.querySelector('.gl-tab-t'); if (sp) sp.textContent = label();
      tab.title = label();
      if (!on && typeof curTab !== 'undefined' && curTab === 'shelf' && LSW.cur === 'learn') LSW.toBooks();
      try { tabHlPaint(); } catch (e) { /* tab bar not ready */ }
    }
    function openLearn() {
      closeSheets();
      if (shelfMode === 'dl') shelfMode = 'saved';
      LSW.set('learn'); shelfHubNext = true; pendingBack = null; showTab('shelf');
    }

    /* ----- Home: the exam card or the ask card ----- */
    const fmtDate = s => { const p = GLC.parse(s); return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''; };
    function openSettingsAt() { closeSheets(); openSheet('sheet-settings'); setTimeout(() => { const n = $('#in-learnmode'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' }); }, 120); }
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
    function paintHome() {
      const sec = $('#gl-home'); if (!sec) return;
      sec.textContent = '';
      const now = new Date(), m = mode();
      try {
        if (m === 'exam') sec.append(examCard(P.goal, now));
      } catch (e) { sec.textContent = ''; }
      sec.hidden = !sec.firstChild;
      try { TDH.paint(); } catch (e) { /* Today card not ready */ }
    }

    /* ----- Settings ----- */
    function paintSettings() {
      const m = mode(), sw = $('#in-learnmode'); if (!sw) return;
      sw.checked = m === 'learn' || m === 'exam';
      const lr = $('#gl-learn-rows'); if (lr) lr.hidden = !sw.checked;
      const eo = $('#in-examon'); if (eo) eo.checked = m === 'exam';
      const g = m === 'unset' ? null : P.goal, ex = g && g.exam, rows = $('#gl-exam-rows');
      if (rows) rows.hidden = m !== 'exam';
      const d = $('#in-examdate'), t = $('#in-examtarget');
      if (d) d.value = ex && GLC.parse(ex.date) ? ex.date : '';
      if (t) t.value = ex && ex.target ? String(ex.target.toFixed(1)) : '';
    }
    function wire() {
      const lm = $('#in-learnmode'), eo = $('#in-examon');
      if (lm) lm.addEventListener('change', e => { if (GLC.mode(P.goal) === 'unset') choose(e.target.checked ? 'learn' : 'stories', true); else setLearn(e.target.checked); });
      if (eo) eo.addEventListener('change', e => setExam(e.target.checked));
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

    /* ----- Standard | Learn: the one gate (learnOn() in 030, [data-lrn] in 99e3-learn-gate.css) ----- */
    function paintGate() {
      document.documentElement.toggleAttribute('data-learn', tabOn());   // no attribute = Standard: every [data-lrn] element is hidden by CSS
      try { KU.sync(); } catch (e) { /* reader not ready */ }          // underline new words + coverage chip follow the mode, live
      try { loadTod(); } catch (e) { /* Home not ready */ }            // the morning review card on Home
      try { rmSync(); } catch (e) { /* reader not ready */ }           // reading modes (English / Both / Translation): Standard = English only
      if (!tabOn()) document.querySelectorAll('[data-rv]').forEach(n => n.removeAttribute('data-rv'));   // translations opened with the eye bubbles close
    }
    /* Someone who used saved words before the switch existed would find the tools gone: say so once, with a way back. */
    function legacyNote() {
      if (GLC.mode(P.goal) !== 'unset' || P.learnNote) return;
      let n = 0; try { n = (WS.all() || []).length; } catch (e) { /* no words store */ }
      if (!n) return;
      P.learnNote = true; savePrefs();
      toast('Learning tools are now optional. Turn on Learn mode to bring them back.', 9000, ['Turn on', () => choose('learn', false)]);
    }
    function paint() { paintGate(); paintTab(); paintHome(); paintSettings(); }
    function start() { wire(); paint(); setTimeout(legacyNote, 3000); document.addEventListener('visibilitychange', () => { if (!document.hidden && GLC.mode(P.goal) === 'exam') paintHome(); }); }   // the day changed while the app was in the background
    return { get, mode, tabOn, todayOk, choose, setLearn, setExam, paint, openLearn, newWord, label, start, NAMES };
  })();
