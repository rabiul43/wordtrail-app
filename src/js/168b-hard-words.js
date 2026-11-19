  /* ---------- My hard words: a difficulty score for each saved word, a sheet, a practice button, a "hard" badge ----------

     HOW THE SCORE IS WORKED OUT  (HW.score(entry, now) -> a whole number 0..100; 0 = no sign of trouble, 100 = as hard as it gets)

     Nothing new is stored. The score is worked out from fields the scheduler (148) already keeps on every reviewed word, each time it is needed.
     Four parts are added up (their largest values add up to 100), then a discount for words that have grown back:

       ease     up to 40   How far the word's ease sits below the starting ease of 2.5 (the floor is 1.3):  40 x (2.5 - ease) / 1.2.
                           Every Again lowers ease by 0.20 and every Hard by 0.15, Good changes nothing and Easy raises it by 0.15, so ease IS the running
                           record of recent Again / Hard answers. A word you keep answering Again or Hard ends up low; a word that is easy ends up at 2.5 or above (0 points).
       lapses   up to 30   How many times you forgot it (lap, counted on every Again): 6 points each, counted up to 5 lapses.
       run      up to 20   How short your run of right answers is (reps = right answers in a row since the last Again): 20 x (1 - reps / 3), so 20 with a run
                           of 0, about 13 with 1, about 7 with 2 and 0 from 3 on. Only counted for a word that has slipped (lap above 0, or ease below 2.5),
                           so a word answered right once is not "hard" just because its run is short.
       recent   up to 10   Whether the trouble is fresh: 10 x (1 - days since the last review / 14), only for a word that has slipped. Today = 10, 14 days ago or more = 0.

       discount            A word whose interval (iv) has grown to 30 days or more counts for half: it slipped once, but you have brought it back. Between 0 and
                           30 days the score is scaled down smoothly: x (1 - 0.5 x min(iv, 30) / 30).
       A word that has never been reviewed scores 0 (there is nothing to judge yet).

     Rounded to a whole number. Worked examples: forgot it once a minute ago (ease 2.3, lap 1, reps 0)  = 43.  Forgot it twice, now (ease 2.1, lap 2, reps 0) = 55.
     Forgot it 3 times, ease 1.7, reps 0, last seen 3 days ago = 27 + 18 + 20 + 8 = 73.  The same word with a 40-day interval = 36.

     Thresholds:  HARD_AT 50    a word at or above this gets the small "hard" badge on its card.
                  LIST_MIN 15   a word needs at least this to be listed in My hard words (a 3 % wobble is not "hard").
                  LIST_SIZE 20  the sheet lists the 20 highest scores. Ties: more lapses first, then the one reviewed most recently, then A to Z.

     THE LEARN LOG: wt:learnlog (148b) only keeps totals per DAY (reviews, correct), not which word was answered, so it cannot say which word got an Again or a Hard.
     Those answers are already folded into ease, lap and reps (above), which is why the score uses them and leaves the log alone.

     The scoring is a pure function (no storage, no clock: `now` is passed in, no screen). It is between the HW-START / HW-END markers so
     `node tools/hard_words_check.js` can load it by itself (with 148-scheduler.js, whose SRS.lastReview it uses).

     SCREEN (built the first time the sheet opens; nothing runs at start-up and playback is never touched):
       HW.open()        opens the sheet #sheet-hw (28j-sheet-hard-words.html): the 20 hardest words, each with a small meter and its last review date,
                        and the "Practise hard words" button.
       HW.practise()    starts the Review lesson (RL.start in 168) with ONLY those words, even when they are not due yet. Grades go to the scheduler
                        as always, so the scores move.
       HW.badge(entry)  the small "hard" badge for a word card (165), or null.
       HW.any(words)    true when at least one word is listed (166 shows the "My hard words" button only then).
     Calm mode (P.calm): no meter, no scores, no badge, no counts; the list of words, their last review date and the Practise button stay. */
  const HW = (() => {
    /*HW-START*/
    const DAY = 864e5, EASE0 = 2.5, EASE_MIN = 1.3, LAPSE_CAP = 5, RUN_CAP = 3, RECENT_DAYS = 14, GROWN_DAYS = 30, GROWN_CUT = 0.5;
    const P_EASE = 40, P_LAPSE = 30, P_RUN = 20, P_RECENT = 10;
    const HARD_AT = 50, LIST_MIN = 15, LIST_SIZE = 20;
    const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const whole = x => (typeof x === 'number' && isFinite(x) && x > 0) ? Math.floor(x) : 0;
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

    /* The four parts, the discount and the total for one word. Anything that is not a word entry, or a word never reviewed, gives all zeros. */
    function parts(e, now) {
      const none = { ease: 0, lapses: 0, run: 0, recent: 0, keep: 1, total: 0 };
      if (!isObj(e) || typeof now !== 'number' || !isFinite(now)) return none;
      const lr = SRS.lastReview(e); if (!lr) return none;                       // never reviewed: nothing to judge
      const ease = (typeof e.ease === 'number' && isFinite(e.ease)) ? clamp(e.ease, EASE_MIN, 3) : EASE0;
      const lap = whole(e.lap), reps = whole(e.reps), iv = whole(e.iv);
      const slipped = lap > 0 || ease < EASE0;
      const o = {
        ease: P_EASE * clamp((EASE0 - ease) / (EASE0 - EASE_MIN), 0, 1),
        lapses: P_LAPSE * Math.min(lap, LAPSE_CAP) / LAPSE_CAP,
        run: slipped ? P_RUN * clamp(1 - reps / RUN_CAP, 0, 1) : 0,
        recent: slipped ? P_RECENT * clamp(1 - Math.max(0, now - lr) / DAY / RECENT_DAYS, 0, 1) : 0,
        keep: 1 - GROWN_CUT * Math.min(iv, GROWN_DAYS) / GROWN_DAYS
      };
      o.total = clamp(Math.round((o.ease + o.lapses + o.run + o.recent) * o.keep), 0, 100);
      return o;
    }
    const score = (e, now) => parts(e, now).total;
    const isHard = (e, now) => score(e, now) >= HARD_AT;

    /* The hardest words: [{ e, w, score, last }], highest score first, at most `size` (default 20), none under `min` (default 15). The input is not changed. */
    function rank(words, now, size, min) {
      size = size > 0 ? Math.floor(size) : LIST_SIZE; min = typeof min === 'number' ? min : LIST_MIN;
      return (Array.isArray(words) ? words : [])
        .filter(e => isObj(e) && typeof e.w === 'string' && e.w.trim())
        .map(e => ({ e, w: String(e.w).trim().toLowerCase(), score: score(e, now), last: SRS.lastReview(e) }))
        .filter(x => x.score >= min)
        .sort((a, b) => b.score - a.score || whole(b.e.lap) - whole(a.e.lap) || b.last - a.last || (a.w < b.w ? -1 : a.w > b.w ? 1 : 0))
        .slice(0, size);
    }

    /* "Today", "Yesterday", "12 Nov", or "12 Nov 2025" in another year (this device's calendar days). 0 or less: "Not reviewed yet". */
    const dayStart = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    function dateLabel(ms, now) {
      if (!(typeof ms === 'number' && ms > 0)) return 'Not reviewed yet';
      const diff = Math.round((dayStart(now) - dayStart(ms)) / DAY);
      if (diff <= 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      const d = new Date(ms);
      return d.getDate() + ' ' + MON_NAMES[d.getMonth()] + (d.getFullYear() === new Date(now).getFullYear() ? '' : ' ' + d.getFullYear());
    }
    /*HW-END*/

    /* ----- screen ----- */
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };
    const sh = () => $('#sheet-hw');
    const list = () => rank(WS.all(), Date.now());
    const any = words => rank(words, Date.now(), 1).length > 0;

    function meter(x) {
      return h('span', { class: 'hw__meter' + (x.score >= HARD_AT ? ' is-hard' : ''), role: 'img', 'aria-label': 'Difficulty ' + x.score + ' out of 100', style: '--hw-p:' + x.score + '%' },
        h('span', { class: 'hw__fill' }));
    }
    function row(x, now, quiet) {
      return h('li', { class: 'wl-card hw__row' },
        h('span', { class: 'hw__top' }, h('strong', { class: 'hw__w' }, x.w), quiet ? null : meter(x)),
        h('span', { class: 'hw__last' }, x.last ? 'Last reviewed: ' + dateLabel(x.last, now) : dateLabel(0, now)));
    }
    function draw() {
      const root = sh(); if (!root) return;
      const now = Date.now(), quiet = calm(), items = rank(WS.all(), now), ul = $('#hw-list'), help = $('#hw-help'), go = $('#hw-go');
      ul.textContent = '';
      go.hidden = !items.length;
      if (!items.length) { help.textContent = 'No hard words right now. Words you miss in review will show up here, so you can give them extra practice.'; return; }
      help.textContent = quiet ? 'Words that could use another look.'
        : items.length === 1 ? '1 word that needs another look. The longer the bar, the harder it has been for you.' : items.length + ' words that need another look. The longer the bar, the harder they have been for you.';
      items.forEach(x => ul.append(row(x, now, quiet)));
    }
    function open() {
      const root = sh(); if (!root) return;
      if (!root.dataset.ready) {
        root.dataset.ready = '1';
        $('#hw-go').addEventListener('click', practise);
      }
      openSheet('sheet-hw'); draw();
    }
    function practise() {
      const words = list().map(x => x.w);
      if (!words.length) { draw(); return; }
      let ok = false;
      try { ok = RL.start({ words, max: words.length, after: () => { if (sh() && !sh().hidden) draw(); } }); } catch (e) { ok = false; }
      if (!ok) toast('These words need a saved sentence or a note before they can be practised.', 3000);
    }
    function badge(e) {
      if (calm() || !isHard(e, Date.now())) return null;
      return h('span', { class: 'wc__hard', title: 'Hard for you' }, 'hard');
    }

    return { HARD_AT, LIST_MIN, LIST_SIZE, parts, score, isHard, rank, dateLabel, any, open, practise, badge, draw };
  })();
