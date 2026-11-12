  /* ---------- Goal ask: one gentle question for people who already use Wordtrail (GA) ----------
     The goal question is the first card of onboarding (169l, 300). Someone who finished onboarding before the goal existed never saw it,
     and in Standard (learn mode off) has no Learn tab. So the question is a calm card at the top of My Library (#gl-ask, 10-body-views.html):
       Enjoy stories / Learn English / Prepare for IELTS, and Not now. It is not a screen and blocks nothing.
     Shown only when: onboarding was finished before (wt:onboarded), the goal was never chosen, and the question was never answered or dismissed.
       Choosing   GL.choose(c, false): the same save as Settings. The reader's Learn button setting is left alone (they already have one).
       Not now    P.goal = { ask: 'done' } (GLC.askOn is false from then on). Mode stays 'unset' = the app exactly as before. Settings > Reading still has the switch.
       "Skip for now" in onboarding writes the same { ask: 'done' } (300), so nobody is asked twice.
     Nothing is deleted by any answer: saved words, review schedule, progress, exam date and target are not touched.
     080 calls shelfHooks.ask(show) each time My Library is drawn (show = start of My Library: the phone list, or the desktop Saved page).
     Test: node tools/goal_ask_check.js. Styles 99e5-goal-ask.css. */
  const GA = (() => {
    const OPTS = [
      ['stories', '\uD83C\uDFA7', 'Enjoy stories', 'Just listening and reading'],
      ['learn', '\uD83C\uDF31', 'Learn English', 'Words, speaking, daily plan'],
      ['ielts', '\uD83C\uDF93', 'Prepare for IELTS', 'Exam countdown and practice']];
    const due = () => { let ob = false; try { ob = !!store.get('wt:onboarded', 0); } catch (e) { /* storage unavailable: not asked */ } return ob && GLC.askOn(P.goal); };
    function build(sec) {
      sec.textContent = '';
      const opt = ([c, em, t, d]) => h('button', { type: 'button', class: 'wl-card wl-card--tap gl-ask-opt', 'data-goal': c, onclick: () => pick(c) },
        h('span', { class: 'gl-ask-ic', 'aria-hidden': 'true' }, em), h('span', { class: 'gl-ask-tx' }, h('b', {}, t), h('small', {}, d)));
      sec.append(h('h2', { id: 'gl-ask-h', class: 'gl-ask-h' }, 'How do you use Wordtrail?'),
        h('p', { class: 'gl-ask-p' }, 'Pick a goal and the app shows what fits. Nothing is locked, and you can change it any time in Settings.'),
        h('div', { class: 'gl-ask-list' }, ...OPTS.map(opt)),
        h('button', { type: 'button', class: 'wl-btn wl-btn--secondary wl-btn--small gl-ask-no', onclick: notNow }, 'Not now'));
    }
    function paint(show) {   // show: false when My Library is not on its start page
      const sec = $('#gl-ask'); if (!sec) return;
      const on = show !== false && due();
      if (on && !sec.firstChild) build(sec);
      sec.hidden = !on;
    }
    function settle(msg) {   // the card is gone: keep the keyboard place, say it once, quietly
      paint(false);
      const t = $('#shelf-title'); if (t) { t.tabIndex = -1; try { t.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
      toast(msg, 3200);
    }
    function pick(c) { GL.choose(c, false); settle('Saved. You can change it any time in Settings.'); }
    function notNow() { P.goal = Object.assign({}, P.goal, { ask: 'done' }); savePrefs(); GL.paint(); settle('No problem. You can choose a goal any time in Settings.'); }
    shelfHooks.ask = paint;
    return { due, paint, pick, notNow };
  })();
