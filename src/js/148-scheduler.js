  /* ---------- Scheduler for saved words: SM-2 with four grades (SRS) ----------
     Pure functions only: no storage, no clock, no screen, no random numbers. The time is always passed in. Nothing here runs by itself. Review in
     160-learning-tools.js calls review() through WS.update, and isDue() for the due list.

     Why SM-2 and not FSRS:
       1. Saved words already carry SM-2 fields (ease, iv, reps, due, acq), so every old due date and every old word keeps working as it is.
       2. FSRS needs stability and difficulty values and trained weights; with no review history to fit them they would be guesses.
       3. Four grades, how late or early you were, and a small fixed nudge per word give different words different intervals.

     Grades:  0 Again (forgot)   1 Hard (right, with effort)   2 Good   3 Easy.   The old Review buttons were 0, 1, 2: fromOldGrade() maps them.
     Kinds (the level of question, one per review):
       'rec' recognise (see the word, say you know it)   'und' understand (pick the meaning)
       'rcl' recall (type it, or fill in the blank)       'use' use (write it in your own sentence)
       'view' or anything else: a look, never counted and nothing changes (the same object comes back).

     Word fields. Old ones stay exactly as they are: ease, iv (whole days), reps (right in a row), due (ms), acq (ms). New ones:
       sch    1 once the word is on this scheduler (review() converts an old word by itself, fromOld() does it on its own)
       lap    how many times you forgot it (Again)
       lr     time of the last review (ms); for an old word worked out from due and iv
       rdays  the days (whole days since 1970, in your time zone) on which you answered a recall question ('rcl' or 'use') right,
              no repeats, oldest first, the last 10
       cnt    { rec, und, rcl, use }: right answers per level (Hard, Good and Easy are right; Again is not)
       st     'new' | 'learning' | 'familiar' | 'mastered' (stage() below)
     Mastered needs BOTH: right recall answers on 3 separate days AND an interval of 21 days or more. A forgotten word (Again) has no
     interval, so it is not mastered any more until it has grown back. An old word with a long interval but no recall days is 'familiar'.

     How the next interval is worked out (days, whole numbers, at most 365):
       Again   back in 10 minutes, ease -0.20, reps 0, lap +1
       a word with no interval yet (new, or after Again): Hard 1, Good 2, Easy 4 days (after an Again: 1, 1, 3)
       otherwise: base = the old interval, adjusted for time since the last review (early: shrinks toward half; late: half of the extra
                  days is added, at most doubling), then x1.2 for Hard (base never above the old interval), x ease for Good,
                  x ease x1.3 for Easy, then a fixed nudge of up to +-7.5% from the word and its review count (only for 3 days or more),
                  and the result is at least the old interval +1 (Hard, Good) or +2 (Easy), so no word is stuck.
       ease    Hard -0.15, Good 0, Easy +0.15, kept between 1.3 and 3.0 (a word with no ease yet starts at 2.5)
     Tz: minutes your local time is ahead of UTC (Bangladesh 360): the browser's time zone offset with its sign turned round. Default 0. */
  const SRS = (() => {
    const DAY = 864e5, MIN = 6e4, AGAIN = 0, HARD = 1, GOOD = 2, EASY = 3;
    const KINDS = ['rec', 'und', 'rcl', 'use'], RECALL = { rcl: true, use: true };
    const EASE0 = 2.5, EASE_MIN = 1.3, EASE_MAX = 3, IV_MAX = 365, RD_KEEP = 10, STEP_AGAIN = 10 * MIN, NUDGE = 0.15;
    const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
    const whole = x => (typeof x === 'number' && isFinite(x) && x > 0) ? Math.floor(x) : 0;
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const dayOf = (t, tz) => Math.floor((t + (typeof tz === 'number' && isFinite(tz) ? tz : 0) * MIN) / DAY);

    /* A steady number from -0.5 to 0.5 for this word and review count (no random numbers: the same word gets the same answer every time). */
    function nudge(w, n) {
      let h = 2166136261; const s = String(w == null ? '' : w) + ':' + n;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) % 1001) / 1000 - 0.5;
    }
    const counters = c => { const o = {}; KINDS.forEach(k => { o[k] = whole(isObj(c) ? c[k] : 0); }); return o; };
    const days = d => { const u = []; (Array.isArray(d) ? d : []).forEach(x => { if (typeof x === 'number' && isFinite(x) && u.indexOf(x) < 0) u.push(x); }); return u.sort((a, b) => a - b).slice(-RD_KEEP); };

    /* The same rule as srsDue in 160: a word with no due time, or one that is due now or past. */
    const isDue = (e, now) => !e.due || e.due <= now;

    /* When the word was last reviewed (ms), 0 if never. lr when the word has it, else due minus its interval (10 minutes after Again). */
    function lastReview(e) {
      if (!isObj(e)) return 0;
      if (typeof e.lr === 'number' && isFinite(e.lr) && e.lr > 0) return e.lr;
      const due = whole(e.due); return due ? due - (whole(e.iv) ? whole(e.iv) * DAY : STEP_AGAIN) : 0;
    }

    function mastered(e) { return isObj(e) && days(e.rdays).length >= 3 && whole(e.iv) >= 21; }
    function stage(e) {
      if (mastered(e)) return 'mastered';
      if (whole(e && e.iv) >= 14) return 'familiar';
      if (whole(e && e.iv) > 0 || whole(e && e.reps) > 0 || (e && e.due)) return 'learning';
      return 'new';
    }

    /* Old word (ease, iv, reps, due, acq from srsGrade) -> new fields. due and acq are never touched, and nothing is removed.
       A word that never had a Review gets no ease, no due and no lr (the scheduler then treats it as new). Running it twice changes nothing. */
    function fromOld(e) {
      if (!isObj(e) || e.sch === 1) return e;
      const out = Object.assign({}, e);
      if (typeof e.ease === 'number' && isFinite(e.ease)) out.ease = clamp(e.ease, EASE_MIN, EASE_MAX);
      if (e.iv !== undefined) out.iv = whole(e.iv);
      if (e.reps !== undefined) out.reps = whole(e.reps);
      out.lap = whole(e.lap);
      const lr = lastReview(e); if (lr) out.lr = lr;
      out.rdays = days(e.rdays);
      out.cnt = counters(e.cnt);
      out.sch = 1;
      out.st = stage(out);
      return out;
    }
    const fromOldGrade = g => g === 0 ? AGAIN : g === 1 ? GOOD : g === 2 ? EASY : g;

    /* One review. e: the word (old or new fields), grade 0..3, now: ms, o: { kind (default 'rcl'), tz }. Returns a NEW entry; e is not changed.
       A grade that is not 0..3, a view, or an unknown kind returns e itself. */
    function review(e, grade, now, o) {
      o = o || {};
      const kind = o.kind == null ? 'rcl' : o.kind;
      if (!isObj(e) || KINDS.indexOf(kind) < 0 || !(grade >= 0 && grade <= 3) || typeof now !== 'number' || !isFinite(now)) return e;
      grade = Math.floor(grade);
      const s = fromOld(e), out = Object.assign({}, s);
      const iv0 = whole(s.iv), lr = lastReview(s), elapsed = lr ? Math.max(0, (now - lr) / DAY) : 0;
      const ease = clamp((typeof s.ease === 'number' && isFinite(s.ease) ? s.ease : EASE0) + [-0.2, -0.15, 0, 0.15][grade], EASE_MIN, EASE_MAX);
      out.ease = ease; out.lr = now; out.sch = 1;
      if (grade === AGAIN) {
        out.iv = 0; out.reps = 0; out.lap = whole(s.lap) + 1; out.due = now + STEP_AGAIN;
      } else {
        const reps = whole(s.reps);
        let iv;
        if (iv0 === 0) iv = (whole(s.lap) > 0 ? [0, 1, 1, 3] : [0, 1, 2, 4])[grade];
        else {
          let base = elapsed < iv0 ? iv0 * (0.5 + 0.5 * elapsed / iv0) : iv0 + 0.5 * Math.min(elapsed - iv0, iv0);
          if (grade === HARD) base = Math.min(base, iv0);
          iv = base * (grade === HARD ? 1.2 : grade === GOOD ? ease : ease * 1.3);
          if (iv >= 3) iv *= 1 + NUDGE * nudge(s.w, reps);
          iv = Math.max(Math.round(iv), iv0 + (grade === EASY ? 2 : 1));
        }
        iv = Math.min(iv, IV_MAX);
        out.iv = iv; out.reps = reps + 1; out.due = now + iv * DAY;
        if (iv >= 14 && !s.acq) out.acq = now;
        const cnt = counters(s.cnt); cnt[kind]++; out.cnt = cnt;
        if (RECALL[kind]) out.rdays = days((Array.isArray(s.rdays) ? s.rdays : []).concat(dayOf(now, o.tz)));
      }
      out.st = stage(out);
      return out;
    }

    /* The right answers per level, and the highest level with at least one right answer ('' if none). */
    const levels = e => counters(isObj(e) ? e.cnt : null);
    function top(e) { const c = levels(e); for (let i = KINDS.length - 1; i >= 0; i--) if (c[KINDS[i]] > 0) return KINDS[i]; return ''; }

    return { AGAIN, HARD, GOOD, EASY, KINDS, isDue, lastReview, mastered, stage, fromOld, fromOldGrade, review, levels, top, dayOf };
  })();
