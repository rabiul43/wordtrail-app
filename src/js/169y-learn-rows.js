  /* ---------- Live state on the Listening rows of Learn (LRW) ----------
     Task 5. The Learn hub (169b) draws a tile for Listen and type and one for Echo. Until now each had a fixed line ("Type what you hear",
     "Hear it, say it back"). This file lets them show where the learner is, from data that is already kept. It adds no key and no storage.
       Listen and type   "2 sets today" (wt:ielts, today's Listening sessions)  >  "Last set: 7 of 10 right" (LN.last(): the last set of this visit)  >  the usual line
       Echo              "1 practice today" (wt:ielts, Speaking sessions today)  >  "4 on your practice list" (wt:echo)  >  "6 takes this week" (wt:echo)  >  the usual line
       Both rows also get a small ring: this month's sessions of the skill, full at 12 (the same ring the IELTS hub draws, IEC.RING). Nothing for 0.
     Calm mode (P.calm): the usual line, no ring, no counts (the hub also hides rings and pills with CSS). Without data the lines stay generic, so a new learner sees
     what they saw before. Nothing runs at start-up: the lines are worked out each time the hub is drawn (a few small reads), and nothing here touches audio.
     The ring has a screen-reader line ("3 of 12 this month"). The "Today" pill is the hub's (LearnHub.today): the daily plan (task 12) will feed it; it is not used here.
     "Resume: chapter 3" and "Your weakest sound: th" are not here: Listen and type keeps no position, and weak-sound tracking comes with task 9. Both can be added to LRW.
       LRW.listen({ calm, today, month, last })  -> { sub, ring }        last = { right, total } or null
       LRW.echo({ calm, today, month, list, week }) -> { sub, ring }     list = practice-list length, week = takes in the last 7 days
       LRW.LINES  the usual lines     LRW.FULL  sessions that fill the ring (12)     ring = { p 0..100, label } or null
     Pure rules between LRW-START/END; the wiring below reads wt:ielts through IEC (169o), LN.last() (169k) and ECX/ECM (169j).
     Remove this file and its build.py line to go back: the rows show their usual lines (the icons and the hub's ring support stay). Test: node tools/learn_rows_check.js */
  const LRW = (() => {
    /*LRW-START*/
    const LINES = { listen: 'Type what you hear', echo: 'Hear it, say it back' }, FULL = 12;
    const n0 = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const cnt = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const ring = m => { const n = n0(m); return n ? { p: Math.min(100, Math.round(100 * n / FULL)), label: Math.min(n, FULL) + ' of ' + FULL + ' this month' } : null; };
    function listen(s) {
      s = s || {};
      if (s.calm === true) return { sub: LINES.listen, ring: null };
      const t = n0(s.today), l = s.last && typeof s.last === 'object' ? s.last : null, tot = l ? n0(l.total) : 0;
      let sub = LINES.listen;
      if (t) sub = cnt(t, 'set today', 'sets today');
      else if (tot) sub = 'Last set: ' + Math.min(n0(l.right), tot) + ' of ' + tot + ' right';
      return { sub, ring: ring(s.month) };
    }
    function echo(s) {
      s = s || {};
      if (s.calm === true) return { sub: LINES.echo, ring: null };
      const t = n0(s.today), pl = n0(s.list), wk = n0(s.week);
      let sub = LINES.echo;
      if (t) sub = cnt(t, 'practice today', 'practices today');
      else if (pl) sub = pl + ' on your practice list';
      else if (wk) sub = cnt(wk, 'take this week', 'takes this week');
      return { sub, ring: ring(s.month) };
    }
    /*LRW-END*/
    return { LINES, FULL, listen, echo };
  })();

  (() => {
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };
    const log = () => { let v = null; try { v = store.get('wt:ielts', null); } catch (e) { /* storage unavailable */ } return IEC.isObj(v) ? v : {}; };
    const today = sk => IEC.num((log()[IEC.dayKey(new Date())] || {})[sk]);
    const month = sk => IEC.month(log(), new Date())[sk];
    const lastSet = () => { try { const l = LN.last(), r = l && Array.isArray(l.res) ? l.res : []; return r.length ? { right: r.filter(x => x && x.v === 'ok').length, total: r.length } : null; } catch (e) { return null; } };
    const history = () => { try { return typeof ECX === 'object' && ECX ? ECX.history() : null; } catch (e) { return null; } };
    const listenState = () => LRW.listen({ calm: calm(), today: today('l'), month: month('l'), last: lastSet() });
    const echoState = () => {
      const h = history(), now = Date.now();
      let wk = 0; try { wk = h && h.days ? ECM.weekCount(h, now) : 0; } catch (e) { wk = 0; }
      return LRW.echo({ calm: calm(), today: today('s'), month: month('s'), list: h && Array.isArray(h.pl) ? h.pl.length : 0, week: wk });
    };
    LearnHub.patch('listentype', { subtitle: () => listenState().sub, ring: () => listenState().ring });
    LearnHub.patch('echo', { subtitle: () => echoState().sub, ring: () => echoState().ring });
  })();
