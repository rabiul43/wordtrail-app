  /* ---------- Ratings and one-line reviews ----------
     One rating per signed-in user per book: 1-5 stars and an optional review of up to 140 characters. The book's
     page shows the average, how many ratings it is made from, the star breakdown and one top review (All reviews opens the
     full list).
     Stored in Firestore (rules: firebase/firestore.rules):
       ratings/{bookId}              { n: how many ratings, s: sum of the stars, c1..c5: how many of each star }   average = s / n
       ratings/{bookId}/votes/{uid}  { r: 1-5, c: review, n: first name, t: server time, x?: how many people reported it }
       ratings/{bookId}/votes/{uid}/reports/{reporterUid}  { k: spam|offensive|spoiler|other, t }   (nobody can read these in the app)
     The vote id is the user's uid, so a second rating from the same account replaces the first. The totals change
     in the same batch as the vote, by exactly what the vote changed; the rules refuse anything else.
     Reading needs no sign-in and no Firebase code: it uses Firestore's REST address, so a guest never downloads the
     sign-in service. Rating needs an account; the Firebase code (from 295-account-sync.js) loads only then.
     Calm mode hides the whole section (no scores). */
  guideDoc('home', 'Ratings and reviews', "Sign in, then give a book 1 to 5 stars and, if you like, a one-line review (up to 140 characters). You can change or remove your rating at any time. A book's page shows the average rating, how the stars are spread and one top review; only your first name is shown. Tap the three dots on a review to report it (spam, offensive, spoils the story, something else; reports are anonymous), or to edit or delete your own. Reviews with several reports are hidden until they are checked. All reviews opens a page with every review, which you can sort by newest, highest or lowest stars. Your ratings and the books you finished but have not rated are listed on the Account tab, where Edit takes you to the book's page. You can rate a book once you have listened to about a tenth of it (or finished it), and there is a daily limit on ratings and reports to keep reviews honest. Calm mode hides ratings.", '2026-10-19');
  const RT_MAX = 140, RT_HIDE = 3, RT_TTL = 5 * 60e3, RT_CACHE = new Map();
  const rtLen = n => n + ' / ' + RT_MAX;   // the live counter under a review box, e.g. "41 / 140"
  /* ---- limits against abuse (this device) ----
     A new rating needs some listening first: the book is finished, or at least RT_MIN_PCT of it was heard. This reads
     what the app already keeps (wt:listens and recents, the finished list, and the open book), so nothing new is
     tracked. A day also has a cap on saved ratings (RT_DAY_RATE; removing one never counts) and on reports (RT_DAY_REPORT),
     counted in wt:rtlim, which stays on this device and starts again each day. Editing a rating you already made is
     never blocked by the listening rule. These checks slow down careless or scripted use from the app; only the
     Firestore rules can enforce a limit for real. */
  const RT_MIN_PCT = 0.1, RT_DAY_RATE = 20, RT_DAY_REPORT = 10;
  const RT_NEED = 'Listen to a little more of this book (about ' + Math.round(RT_MIN_PCT * 100) + '%) before rating it.';
  const RT_RCAP = 'You have saved a lot of ratings today. Please try again tomorrow.', RT_PCAP = 'You have sent a lot of reports today. Please try again tomorrow.';
  function rtListened(b) {
    const id = String(b.id);
    if ((ST.done || []).some(x => x && String(x.id) === id)) return true;
    let pct = 0;
    try { if (S.book && String(S.book.id) === id) pct = bookPct(); } catch (e) { /* the open book has no position yet */ }
    const rec = listenedList().find(r => String(r.id) === id);
    return Math.max(pct, rec ? +rec.pct || 0 : 0) >= RT_MIN_PCT;
  }
  const rtLim = () => { const d = dayKey(), o = store.get('wt:rtlim', null); return o && typeof o === 'object' && o.d === d ? o : { d, r: 0, p: 0 }; };
  const rtLeft = k => (k === 'p' ? RT_DAY_REPORT : RT_DAY_RATE) - (+rtLim()[k] || 0) > 0;
  const rtCount = k => { const o = rtLim(); o[k] = (+o[k] || 0) + 1; store.set('wt:rtlim', o); };
  const rtBase = () => 'https://firestore.googleapis.com/v1/projects/' + FB_CFG.projectId + '/databases/(default)/documents';
  const rtId = b => encodeURIComponent(String(b.id));
  const rtNum = f => f && (f.integerValue !== undefined ? +f.integerValue : f.doubleValue !== undefined ? +f.doubleValue : 0) || 0;
  const rtStr = f => f && typeof f.stringValue === 'string' ? f.stringValue : '';
  async function rtFetch(url, opts) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try { return await fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(FB_CFG.apiKey), Object.assign({ signal: ctl.signal }, opts)); }
    finally { clearTimeout(to); }
  }
  /* { n, avg, dist, reviews: [{ r, c, n, x, uid }] (latest 30 with text) } or null when it cannot be read (offline) */
  async function rtLoad(b, fresh) {
    const id = rtId(b), hit = RT_CACHE.get(id);
    if (!fresh && hit && Date.now() - hit.t < RT_TTL) return hit.d;
    try {
      const q = { structuredQuery: { from: [{ collectionId: 'votes' }], orderBy: [{ field: { fieldPath: 't' }, direction: 'DESCENDING' }], limit: 30 } };
      const [a, v] = await Promise.all([
        rtFetch(rtBase() + '/ratings/' + id),
        rtFetch(rtBase() + '/ratings/' + id + ':runQuery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) })
      ]);
      if (!a.ok && a.status !== 404) throw new Error('HTTP ' + a.status);
      const tot = a.ok ? (await a.json()).fields || {} : {}, n = rtNum(tot.n), s = rtNum(tot.s);
      const reviews = [];
      if (v.ok) (await v.json()).forEach(x => {
        const f = x && x.document && x.document.fields; if (!f) return;
        const c = rtStr(f.c).trim(), r = rtNum(f.r);
        if (c && r >= 1 && r <= 5) reviews.push({ r, c: c.slice(0, RT_MAX), n: rtStr(f.n).trim().slice(0, 40), x: rtNum(f.x), uid: String(x.document.name || '').split('/').pop() });
      });
      const dist = [1, 2, 3, 4, 5].map(k => Math.max(0, rtNum(tot['c' + k])));
      const d = { n, avg: n ? s / n : 0, dist, reviews };
      RT_CACHE.set(id, { t: Date.now(), d });
      return d;
    } catch (e) { return null; }
  }
  /* the signed-in Firebase user, or null (waits for Firebase to restore a remembered sign-in) */
  async function rtUser() {
    if (!acInfo()) return null;
    const fb = await acLoad(), a = fb.auth();
    const u = a.currentUser || await new Promise(res => { const off = a.onAuthStateChanged(x => { off(); res(x || null); }); });
    if (!u && !acStale) { acStale = true; renderAcctSync(); }   // Firebase says nobody is signed in: the saved note is out of date
    return u;
  }
  const rtRefs = (b, uid) => { const t = acDb.collection('ratings').doc(String(b.id)); return { t, v: t.collection('votes').doc(uid) }; };
  async function rtMine(b) {
    const u = await rtUser(); if (!u) return null;
    const s = await rtRefs(b, u.uid).v.get();
    const m = s.exists ? { r: +s.data().r || 0, c: String(s.data().c || '') } : { r: 0, c: '' };
    try { const old = myRatings()[String(b.id)]; if ((old && old.r || 0) !== m.r || (old && old.c || '') !== m.c) { if (m.r || old) myRtSet(b, m.r, m.c); } } catch (e) { /* the list is only a convenience */ }
    return m;
  }
  /* ---- Your ratings (Account tab) ----
     wt:myrt = { bookId: { r, c, t, title, authors, cover, ia } }, a small list kept in step by rtSave and synced with the
     account (Favourites category), because Firestore cannot list "the votes of this user" without an extra field.
     A removed rating stays as { r: 0, t } so the removal syncs too. wt:rtchk (this device only) remembers books already
     looked up, so ratings given before this list existed are found once and never asked for again. */
  const rtTitle = t => String(t || '').replace(/\s*[\(\[](?:version|ver\.?|v\.?|vol\.?|volume|dramatic reading|librivox recording)[^\)\]]*[\)\]]\s*/ig, ' ').replace(/\s{2,}/g, ' ').trim() || String(t || '');
  const MYRT = 'wt:myrt';
  const myRatings = () => { const o = store.get(MYRT, {}); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; };
  function myRtSet(b, r, c) {
    const o = myRatings();
    o[String(b.id)] = r ? { r, c: String(c || '').slice(0, RT_MAX), t: Date.now(), title: b.title || '', authors: b.authors || '', cover: b.cover || '', ia: b.ia || '' } : { r: 0, t: Date.now() };
    store.set(MYRT, o);
  }
  /* { c1: 0, c2: -1, c3: +1, ... }: the new star goes up by one, the old star (if any) down by one */
  const starMoves = (now, was, inc) => { const o = {}; for (let k = 1; k <= 5; k++) o['c' + k] = inc((now === k ? 1 : 0) - (was === k ? 1 : 0)); return o; };
  /* r = 0 removes the rating. One batch: the vote and the totals change together, by exactly the same amount. */
  async function rtSave(b, r, c) {
    const u = await rtUser(); if (!u) throw Object.assign(new Error('Your sign-in has expired. Tap "Sign in again" to save your rating.'), { code: 'rt/signin' });   // this device still remembers an account, but Firebase has no signed-in user (its sign-in was cleared or expired)
    const inc = acFb.firestore.FieldValue.increment, ref = rtRefs(b, u.uid);
    const first = String((acInfo() || {}).name || u.displayName || '').trim().split(/\s+/)[0].slice(0, 40);
    for (let tries = 0; ; tries++) {
      const prev = await ref.v.get(), had = prev.exists, was = had ? +prev.data().r || 0 : 0, batch = acDb.batch();
      if (r !== 0) {
        if (!had && !rtListened(b)) throw new Error(RT_NEED);
        if (!rtLeft('r')) throw new Error(RT_RCAP);
      }
      if (r === 0) {
        if (!had) return;
        batch.delete(ref.v); batch.set(ref.t, Object.assign({ n: inc(-1), s: inc(-was) }, starMoves(0, was, inc)), { merge: true });
      } else {
        batch.set(ref.v, { r, c: c.slice(0, RT_MAX), n: first, t: acFb.firestore.FieldValue.serverTimestamp() });
        batch.set(ref.t, Object.assign({ n: inc(had ? 0 : 1), s: inc(r - was) }, starMoves(r, was, inc)), { merge: true });
      }
      try {
        await Promise.race([batch.commit(), new Promise((_, no) => setTimeout(() => no(new Error('This is taking too long. Check your connection and try again.')), 15000))]);
        RT_CACHE.delete(String(b.id)); RT_CACHE.delete(rtId(b));
        if (r !== 0) rtCount('r');
        try { myRtSet(b, r, c); } catch (e) { /* the list is only a convenience */ }
        return;
      } catch (e) {
        if (tries < 1 && e && e.code === 'permission-denied') continue;   // another device changed this rating a moment ago: read it again and retry once
        throw e;
      }
    }
  }
  /* ---- reporting ----
     A report is one small document at votes/{reviewer}/reports/{me} (so one per person per review) written in the same
     batch that adds one to the review's counter x. At RT_HIDE reports the review is hidden from everyone but its writer
     until you check it in the Firebase console (see README: "Checking reports"). Reports you sent are remembered on this
     device (wt:rtrep) so the review disappears for you at once. */
  const rtRepKey = (b, uid) => String(b.id) + '/' + uid;
  const rtReported = (b, uid) => !!(store.get('wt:rtrep', {}) || {})[rtRepKey(b, uid)];
  async function rtReport(b, uid, k) {
    const u = await rtUser(); if (!u) throw new Error('Sign in to report a review.');
    if (u.uid === uid) throw new Error('This is your own review.');
    if (!rtLeft('p')) throw new Error(RT_PCAP);
    const vref = rtRefs(b, uid).v, batch = acDb.batch();
    batch.set(vref.collection('reports').doc(u.uid), { k, t: acFb.firestore.FieldValue.serverTimestamp() });
    batch.update(vref, { x: acFb.firestore.FieldValue.increment(1) });
    try { await Promise.race([batch.commit(), new Promise((_, no) => setTimeout(() => no(new Error('This is taking too long. Check your connection and try again.')), 15000))]); }
    catch (e) {
      if (e && e.code === 'not-found') throw new Error('This review is no longer there.');
      if (e && e.code === 'permission-denied') { rtMarkReported(b, uid); throw new Error('You have already reported this review.'); }
      throw e;
    }
    rtMarkReported(b, uid); rtCount('p');
  }
  function rtMarkReported(b, uid) { const o = store.get('wt:rtrep', {}) || {}; o[rtRepKey(b, uid)] = 1; store.set('wt:rtrep', o); }
  const RT_WHY = [['spam', 'Spam or advertising'], ['offensive', 'Offensive or abusive'], ['spoiler', 'Spoils the story'], ['other', 'Something else']];
  /* the "Report this review" sheet (#sheet-report in 20-sheets-player.html); done() runs after a report was sent */
  function reportSheet(b, x, done) {
    const body = $('#rp-body'); if (!body) return;
    let pick = 'spam', busy = false;
    const paint = () => {
      body.textContent = '';
      body.append(
        h('div', { class: 'rt-item rp-quote' }, h('div', { class: 'rt-item-h' }, rtStars(x.r), h('span', {}, x.n || 'A listener')), h('p', {}, x.c)),
        h('div', { class: 'rp-why', role: 'radiogroup', 'aria-label': 'Reason' }, RT_WHY.map(([k, t]) => h('button', { class: 'rp-opt', type: 'button', role: 'radio', 'aria-checked': String(k === pick), disabled: busy, onclick: () => { pick = k; paint(); } }, h('i', { 'aria-hidden': 'true' }), t))),
        h('p', { class: 'rt-note' }, 'Reports are anonymous. Reviews with several reports are hidden until checked.'),
        h('div', { class: 'rp-btns' },
          h('button', { class: 'btn ghost', type: 'button', disabled: busy, onclick: closeSheets }, 'Cancel'),
          h('button', { class: 'btn', type: 'button', disabled: busy, onclick: async () => {
            busy = true; paint();
            try { await rtReport(b, x.uid, pick); closeSheets(); toast('Thanks. We will check this review.'); done(); return; }
            catch (e) { toast((e && e.message) || 'Could not send the report.', 4500); if (rtReported(b, x.uid)) { closeSheets(); done(); return; } }
            busy = false; paint();
          } }, busy ? 'Sending…' : 'Send report')));
    };
    paint(); openSheet('sheet-report');
  }
  /* ---- the "⋯" menu on a review (one open at a time) ---- */
  const RTM = { off: null };
  const rtCloseMenu = () => { if (RTM.off) { RTM.off(); RTM.off = null; } };
  /* makeItems() returns [[label, fn, 'bad'?], ...] */
  function rtMenuBtn(li, more, makeItems) {
    more.addEventListener('click', e => {
      e.stopPropagation();
      if (RTM.off && more.getAttribute('aria-expanded') === 'true') { rtCloseMenu(); return; }
      rtCloseMenu();
      const items = makeItems().map(([t, fn, cls]) => h('button', { class: 'rt-mi' + (cls ? ' ' + cls : ''), type: 'button', role: 'menuitem', onclick: () => { rtCloseMenu(); fn(); } }, t));
      const menu = h('div', { class: 'rt-menu', role: 'menu' }, items);
      li.append(menu); more.setAttribute('aria-expanded', 'true'); items[0].focus();
      const away = ev => { if (!menu.contains(ev.target)) rtCloseMenu(); };
      const key = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); rtCloseMenu(); more.focus(); } };
      setTimeout(() => document.addEventListener('click', away), 0); document.addEventListener('keydown', key, true);
      RTM.off = () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key, true); menu.remove(); more.setAttribute('aria-expanded', 'false'); };
    });
  }
  function rtReportTap(b, x, done) {
    if (!acInfo()) { toast('Sign in to report a review.', 4000, ['Sign in', () => { acSignIn().catch(() => {}); }]); return; }
    if (!rtLeft('p')) { toast(RT_PCAP, 4500); return; }
    reportSheet(b, x, done);
  }
  const rtStars = (r, cls) => h('span', { class: 'rt-stars' + (cls ? ' ' + cls : ''), role: 'img', 'aria-label': r + ' out of 5 stars' }, '★'.repeat(r), h('span', { 'aria-hidden': 'true' }, '★'.repeat(5 - r)));
  const rtAvgText = d => d.avg.toFixed(1);
  /* the whole section for the details page of book b */
  function ratingsSection(b) {
    const avg = h('p', { class: 'rt-avg', 'aria-live': 'polite' }, 'Loading ratings…');
    const mine = h('div', { class: 'rt-mine' }), list = h('ul', { class: 'rt-list', hidden: true });
    const seeAll = h('button', { class: 'btn ghost small rt-all', type: 'button', hidden: true, onclick: () => openReviews(b) }, 'All reviews', h('span', { class: 'rt-arrow', 'aria-hidden': 'true' }, '\u2192'));
    const cap = h('p', { class: 'rt-cap', hidden: true }, 'Top review');
    const live = () => DET.book === b;
    let own = null, draftR = 0, draftC = '', busy = false, expired = false;
    const paintAvg = d => {
      if (!live()) return;
      avg.textContent = '';
      if (!d) { avg.textContent = 'Ratings are not available right now.'; return; }
      if (!d.n) { avg.textContent = 'No ratings yet. Be the first.'; return; }
      const top = Math.max(1, ...d.dist), sum = d.dist.reduce((x, y) => x + y, 0);
      avg.append(
        h('span', { class: 'rt-big' }, h('b', {}, rtAvgText(d)), rtStars(Math.round(d.avg)), h('span', {}, d.n + (d.n === 1 ? ' rating' : ' ratings'))),
        sum ? h('span', { class: 'rt-bars', role: 'group', 'aria-label': 'Ratings by star' }, [5, 4, 3, 2, 1].map(k => h('span', { class: 'rt-bar', 'aria-label': d.dist[k - 1] + ' people gave ' + k + (k === 1 ? ' star' : ' stars') },
          h('span', { 'aria-hidden': 'true' }, k + ' \u2605'), h('i', { 'aria-hidden': 'true' }, h('b', { style: 'width:' + Math.round(d.dist[k - 1] / top * 100) + '%' })), h('span', { 'aria-hidden': 'true' }, fmtCount(d.dist[k - 1]))))) : null);
    };
    /* ONE top review: the highest stars among the latest reviews that others wrote (the list is newest first, so the
       newest wins a tie). Your own review is changed in the box below, so it is not picked here. */
    const paintList = d => {
      if (!live()) return;
      rtCloseMenu(); list.textContent = '';
      const me = (acInfo() || {}).uid;
      const top = (d ? d.reviews : []).filter(x => x.uid !== me && x.x < RT_HIDE && !rtReported(b, x.uid)).reduce((a, x) => !a || x.r > a.r ? x : a, null);
      if (top) {
        const more = h('button', { class: 'rt-more', type: 'button', 'aria-label': 'Review options', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '\u22ef');
        const li = h('li', { class: 'rt-item' }, h('div', { class: 'rt-item-h' }, rtStars(top.r), h('span', {}, top.n || 'A listener'), more), h('p', {}, top.c));
        rtMenuBtn(li, more, () => [['Report', () => rtReportTap(b, top, () => paintList(d))]]);   // a reported review drops out and the next best one takes its place
        list.append(li);
      }
      cap.hidden = list.hidden = !top; seeAll.hidden = !(d && d.reviews.length);
    };
    const reload = fresh => rtLoad(b, fresh).then(d => { paintAvg(d); paintList(d); });
    const run = async (r, c, done) => {
      busy = true; paintMine();
      try { await rtSave(b, r, c); own = { r, c }; draftR = r; draftC = c; toast(done); }
      catch (e) { if (e && e.code === 'rt/signin') expired = true; toast(e && e.code === 'permission-denied' ? 'Could not save your rating. Try again in a moment.' : (e && e.message) || 'Could not save your rating.', 4500); }
      busy = false; paintMine(); reload(true);
    };
    const paintMine = () => {
      if (!live()) return;
      mine.textContent = '';
      if (!acSignedIn() || expired) {
        mine.append(h('button', { class: 'btn ghost small', type: 'button', onclick: () => {
          acSignIn().then(async () => {
            for (let i = 0; i < 25 && !(acInfo() && acUser) && !acErr; i++) await new Promise(r => setTimeout(r, 200));   // the sign-in answer can land a moment after the pop-up closes
            if (!live()) return;
            if (acErr && !(acInfo() && acUser)) toast(acErr, 5000); else { expired = false; init(); }
          }).catch(() => {});
        } }, expired ? 'Sign in again to rate this book' : 'Sign in to rate this book'));
        return;
      }
      if (own === null) { mine.append(h('p', { class: 'rt-note' }, 'Checking your rating…')); return; }
      if (!own.r && !rtListened(b)) { mine.append(h('p', { class: 'rt-note rt-wait' }, 'Listen to a little of this book (about ' + Math.round(RT_MIN_PCT * 100) + '%) and you can rate it here.')); return; }
      const group = h('div', { class: 'rt-pick', role: 'radiogroup', 'aria-label': 'Your rating' });
      const btns = [1, 2, 3, 4, 5].map(i => h('button', { class: 'rt-star' + (i <= draftR ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(i === draftR), 'aria-label': i + (i === 1 ? ' star' : ' stars'), disabled: busy,
        onclick: () => { draftR = i; paintMine(); } }, '★'));
      group.append(...btns);
      const box = h('textarea', { class: 'rt-text', rows: '2', maxlength: String(RT_MAX), placeholder: 'One-line review (optional)', 'aria-label': 'Your one-line review', disabled: busy });
      box.value = draftC;
      const left = h('span', { class: 'rt-left' }, rtLen(draftC.length));
      box.addEventListener('input', () => { draftC = box.value.replace(/\s*\n+\s*/g, ' ').slice(0, RT_MAX); if (box.value !== draftC) box.value = draftC; left.textContent = rtLen(draftC.length); save.disabled = !dirty(); });
      const dirty = () => !busy && draftR >= 1 && (!own.r || draftR !== own.r || draftC.trim() !== own.c);
      const save = h('button', { class: 'btn small', type: 'button', disabled: !dirty(), onclick: () => run(draftR, draftC.trim(), own.r ? 'Rating updated' : 'Thanks for rating') }, own.r ? 'Update' : 'Save rating');
      const clear = own.r ? h('button', { class: 'btn ghost small', type: 'button', disabled: busy, onclick: () => run(0, '', 'Rating removed') }, 'Remove') : null;
      mine.append(h('p', { class: 'rt-note' }, own.r ? 'Your rating' : 'Rate this book'), group, box, h('div', { class: 'rt-row' }, left, h('span', { class: 'rt-btns' }, clear, save)));
    };
    const init = () => {
      const keepR = expired ? draftR : 0, keepC = expired ? draftC : '';
      own = null; draftR = keepR; draftC = keepC; paintMine();
      if (!acInfo()) return;
      rtMine(b).then(m => {
        if (!live()) return;
        if (!m) { expired = true; own = { r: 0, c: '' }; paintMine(); return; }   // remembered account but no Firebase user: ask to sign in again instead of failing on Save
        expired = false; own = m; draftR = keepR || own.r; draftC = keepR ? keepC : own.c; paintMine();
      }).catch(() => { if (!live()) return; own = { r: 0, c: '' }; paintMine(); });
    };
    reload(false); init();
    return h('section', { class: 'det-rate', 'aria-label': 'Ratings and reviews' },
      h('div', { class: 'home-section-head' }, h('h2', {}, 'Ratings and reviews')), avg, cap, list, seeAll, mine);
  }
  /* "How was it?" box on the Finish card (150-player-reader.js), shown to signed-in users who have not rated the
     book. "Not now" is remembered for that book on this device (wt:rtskip), so it is never asked twice.
     show() is called when the box has something to say, so the card can appear even without suggestions. */
  function ratePrompt(b, show) {
    if (!acSignedIn() || P.calm === true) return null;
    const skip = store.get('wt:rtskip', {}) || {};
    if (skip[String(b.id)] || !rtListened(b)) return null;
    const box = h('div', { class: 'rt-prompt', hidden: true });
    let draftR = 0, draftC = '', busy = false;
    const paint = () => {
      box.textContent = '';
      const group = h('div', { class: 'rt-pick', role: 'radiogroup', 'aria-label': 'Your rating' });
      [1, 2, 3, 4, 5].forEach(i => group.append(h('button', { class: 'rt-star' + (i <= draftR ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(i === draftR), 'aria-label': i + (i === 1 ? ' star' : ' stars'), disabled: busy, onclick: () => { draftR = i; paint(); } }, '\u2605')));
      const ta = h('textarea', { class: 'rt-text', rows: '2', maxlength: String(RT_MAX), placeholder: 'One-line review (optional)', 'aria-label': 'Your one-line review', disabled: busy });
      ta.value = draftC;
      const left = h('span', { class: 'rt-left' }, rtLen(draftC.length));
      ta.addEventListener('input', () => { draftC = ta.value.replace(/\s*\n+\s*/g, ' ').slice(0, RT_MAX); if (ta.value !== draftC) ta.value = draftC; left.textContent = rtLen(draftC.length); });
      const save = h('button', { class: 'btn small', type: 'button', disabled: busy || draftR < 1, onclick: async () => {
        busy = true; paint();
        try { await rtSave(b, draftR, draftC.trim()); box.textContent = ''; box.append(h('p', { class: 'rt-note', role: 'status' }, 'Thanks for rating.')); return; }
        catch (e) { toast((e && e.message) || 'Could not save your rating.', 4500); }
        busy = false; paint();
      } }, 'Save rating');
      const later = h('button', { class: 'btn ghost small', type: 'button', disabled: busy, onclick: () => { const o = store.get('wt:rtskip', {}) || {}; o[String(b.id)] = 1; store.set('wt:rtskip', o); box.hidden = true; } }, 'Not now');
      box.append(h('div', { class: 'rt-note' }, 'How was it?'), group, ta, h('div', { class: 'rt-row' }, left, h('span', { class: 'rt-btns' }, later, save)));
    };
    rtMine(b).then(m => { if (!m || m.r) return; paint(); box.hidden = false; if (show) show(); }).catch(() => { /* offline: no prompt */ });
    return box;
  }
  /* ---------- All reviews page ----------
     Opened from "See all reviews" in the Ratings section. It is a layer on top of the book page: DET.rv is set (see
     130-book-detail.js), so Back returns to the book. Reviews come straight from Firestore (REST runQuery) 50 votes
     at a time, in the chosen order, skipping votes that have only stars; "Load more reviews" continues from the last
     vote seen. Newest orders by time, Highest and Lowest by stars; each is a single-field order, so no composite
     index is needed. */
  const RTP_LIMIT = 50, RTP_WANT = 10, RTP_SORTS = [['new', 'Newest'], ['high', 'Highest'], ['low', 'Lowest']];
  const rtAgo = iso => {
    const t = Date.parse(iso); if (!t) return '';
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? days + ' days ago' : days < 14 ? 'last week' : days < 60 ? Math.floor(days / 7) + ' weeks ago' : days < 365 ? Math.floor(days / 30) + ' months ago' : new Date(t).getFullYear() + '';
  };
  /* one page of votes: { rows: [{ r, c, n, x, uid, t }], cursor, done } */
  async function rtPage(b, sort, cursor) {
    const dir = sort === 'low' ? 'ASCENDING' : 'DESCENDING', field = sort === 'new' ? 't' : 'r';
    const q = { structuredQuery: { from: [{ collectionId: 'votes' }], orderBy: [{ field: { fieldPath: field }, direction: dir }], limit: RTP_LIMIT } };
    if (cursor) q.structuredQuery.startAt = { values: cursor, before: false };
    const r = await rtFetch(rtBase() + '/ratings/' + rtId(b) + ':runQuery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const docs = (await r.json()).filter(x => x && x.document && x.document.fields).map(x => x.document);
    const rows = [];
    docs.forEach(d => {
      const f = d.fields, c = rtStr(f.c).trim(), rr = rtNum(f.r);
      if (c && rr >= 1 && rr <= 5) rows.push({ r: rr, c: c.slice(0, RT_MAX), n: rtStr(f.n).trim().slice(0, 40), x: rtNum(f.x), uid: String(d.name || '').split('/').pop(), t: f.t && f.t.timestampValue || '' });
    });
    const last = docs[docs.length - 1];
    return { rows, done: docs.length < RTP_LIMIT, cursor: last ? [sort === 'new' ? { timestampValue: last.fields.t.timestampValue } : { integerValue: String(rtNum(last.fields.r)) }, { referenceValue: last.name }] : null };
  }
  /* how many votes have a review (null when it cannot be counted) */
  async function rtReviewCount(b) {
    try {
      const q = { structuredQuery: { from: [{ collectionId: 'votes' }], where: { fieldFilter: { field: { fieldPath: 'c' }, op: 'GREATER_THAN', value: { stringValue: '' } } } }, aggregations: [{ alias: 'n', count: {} }] };
      const r = await rtFetch(rtBase() + '/ratings/' + rtId(b) + ':runAggregationQuery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
      if (!r.ok) return null;
      const j = await r.json(), f = j && j[0] && j[0].result && j[0].result.aggregateFields;
      return f && f.n ? rtNum(f.n) : null;
    } catch (e) { return null; }
  }
  function openReviews(b) {
    detPush(); DET.book = b; DET.author = null; DET.rv = true;
    drawReviews(b); showView('home'); window.scrollTo(0, 0);
  }
  function drawReviews(b) {
    const d = $('#detail'); d.textContent = '';
    const live = () => DET.book === b && DET.rv;
    const sum = h('div', { class: 'rv-sum' }), chips = h('div', { class: 'pk-chips rv-chips', role: 'group', 'aria-label': 'Sort reviews' });
    const list = h('ul', { class: 'rt-list rv-list' }), more = h('button', { class: 'btn ghost rv-more', type: 'button', hidden: true }, 'Load more reviews');
    const msg = h('div', { class: 'rv-msg' });
    let sort = 'new', cursor = null, done = false, busy = false, gen = 0, shown = 0;
    const paintSum = (t, rc) => {
      sum.textContent = '';
      if (!t) return;
      sum.append(h('b', { class: 'rv-avg' }, rtAvgText(t)), h('div', {}, rtStars(Math.round(t.avg)),
        h('p', {}, t.n + (t.n === 1 ? ' rating' : ' ratings') + (rc ? ' · ' + rc + (rc === 1 ? ' review' : ' reviews') : ''))));
    };
    const paintChips = () => { chips.textContent = ''; RTP_SORTS.forEach(([k, t]) => chips.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === sort), onclick: () => { if (k === sort) return; sort = k; paintChips(); reset(); } }, t))); };
    const addRows = rows => {
      const me = (acInfo() || {}).uid;
      rows.filter(x => x.uid === me || (x.x < RT_HIDE && !rtReported(b, x.uid))).forEach(x => {
        const mineRow = x.uid === me, ago = rtAgo(x.t);
        const head = h('div', { class: 'rt-item-h' }, rtStars(x.r), h('span', {}, (mineRow ? 'You' : (x.n || 'A listener')) + (ago ? ' · ' + ago : '')));
        const li = h('li', { class: 'rt-item' }, head, h('p', {}, x.c));
        if (!mineRow) {
          const btn = h('button', { class: 'rt-more', type: 'button', 'aria-label': 'Review options', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⋯');
          head.append(btn);
          rtMenuBtn(li, btn, () => [['Report', () => rtReportTap(b, x, () => li.remove())]]);
        }
        list.append(li); shown++;
      });
    };
    /* fetch until about RTP_WANT reviews are on screen, the votes run out, or 6 requests were made */
    const fetchMore = async () => {
      if (busy || done) return;
      busy = true; const my = gen; msg.textContent = ''; more.disabled = true; more.textContent = 'Loading…';
      const before = shown;
      try {
        for (let i = 0; i < 6 && !done && shown - before < RTP_WANT; i++) {
          const p = await rtPage(b, sort, cursor);
          if (!live() || my !== gen) return;
          cursor = p.cursor; done = p.done || !p.cursor; addRows(p.rows);
        }
        if (!shown && done) msg.append(stateNode('empty', 'No reviews yet', 'Ratings with a written review will show up here.'));
      } catch (e) {
        if (live() && my === gen) msg.append(stateNode('error', 'Could not load reviews', 'Check your connection and try again.', 'Try again', () => { busy = false; fetchMore(); }));
      } finally { if (my === gen) { busy = false; more.disabled = false; more.textContent = 'Load more reviews'; more.hidden = done || !!msg.firstChild; } }
    };
    const reset = () => { gen++; rtCloseMenu(); cursor = null; done = false; busy = false; shown = 0; list.textContent = ''; msg.textContent = ''; more.hidden = true; fetchMore(); };
    more.addEventListener('click', fetchMore);
    d.append(
      h('div', { class: 'det-top rv-top' }, h('button', { class: 'ib', type: 'button', 'aria-label': 'Back', onclick: closeDetail }, svgIcon('#i-back')), h('div', {}, h('h1', {}, 'Reviews'), h('span', {}, b.title || ''))),
      h('section', { class: 'det-rate rv-page', 'aria-label': 'All reviews' }, sum, chips, list, msg, more));
    paintChips(); reset();
    rtLoad(b, false).then(t => { if (!live()) return; paintSum(t, null); if (t && t.n) rtReviewCount(b).then(rc => { if (live() && rc) paintSum(t, rc); }); });
  }
  /* the "Your ratings" and "Finished, not rated yet" lists on the Account tab (two sections); shown to signed-in users only.
     Each shows its first 3 books, with See all / Show less. */
  let myBack = false;
  shelfHooks.myRatings = renderMyRatings;   // the Rated page in My books (080) draws through this
  function renderMyRatings() {
    const host = $('#acct-rt'), fhost = $('#acct-fin'); if (!host) return;
    host.textContent = ''; if (fhost) fhost.textContent = '';
    if (!acInfo() || rtCalm()) { host.hidden = true; if (fhost) fhost.hidden = true; return; }
    const mine = myRatings(), rated = Object.keys(mine).filter(id => mine[id] && mine[id].r > 0).sort((x, y) => (mine[y].t || 0) - (mine[x].t || 0));
    const book = (id, m) => ({ id, title: m.title || 'Untitled', authors: m.authors || '', cover: m.cover || '', ia: m.ia || '' });
    const open = b => { openDetail(b); requestAnimationFrame(() => { const s = $('.det-rate'); if (s) s.scrollIntoView({ block: 'start' }); }); };
    const SHOW = 3;
    const cardOf = (b, kids, label, edit) => h('li', { class: 'rtl-card' },
      h('button', { class: 'rtl-main', type: 'button', 'aria-label': label, onclick: () => open(b) }, h('span', { class: 'rtl-cover', 'aria-hidden': 'true' }, coverNode(b)), h('span', { class: 'rtl-body' }, h('b', {}, rtTitle(b.title)), ...kids)),
      edit ? h('button', { class: 'rtl-edit', type: 'button', 'aria-label': 'Edit your rating of ' + rtTitle(b.title), onclick: () => open(b) }, 'Edit') : null);
    const more = (n, on, flip) => n > SHOW ? [h('button', { class: 'btn ghost small rtl-all', type: 'button', 'aria-expanded': String(on), onclick: flip }, on ? 'Show less' : 'See all')] : [];
    let all = false, allFin = false;
    const paint = () => {
      host.textContent = '';
      if (rated.length) {
        const avg = rated.reduce((a, id) => a + mine[id].r, 0) / rated.length;
        const shown = all ? rated : rated.slice(0, SHOW);
        host.append(h('div', { class: 'home-section-head rtl-head' }, h('h2', {}, 'Your ratings'), h('span', {}, plural(rated.length, 'book') + ' · average ' + avg.toFixed(1))),
          h('ul', { class: 'rtl-list' }, shown.map(id => { const m = mine[id]; return cardOf(book(id, m), [rtStars(m.r), h('span', { class: m.c ? 'rtl-c' : 'rtl-c none' }, m.c || 'No review written')], 'Open ' + rtTitle(m.title || 'this book'), true); })),
          ...more(rated.length, all, () => { all = !all; paint(); }));
      }
      host.hidden = !host.firstChild;
      if (!fhost) return;
      fhost.textContent = '';
      const ratedSet = new Set(rated), fin = (ST.done || []).filter(x => x && x.id != null && !ratedSet.has(String(x.id))).slice(0, 30), shownF = allFin ? fin : fin.slice(0, SHOW);
      if (fin.length) fhost.append(h('div', { class: 'home-section-head rtl-head' }, h('h2', {}, 'Finished, not rated yet'), h('span', {}, plural(fin.length, 'book'))),
        h('ul', { class: 'rtl-list' }, shownF.map(x => cardOf(book(String(x.id), x), [h('span', { class: 'rt-stars rtl-empty', 'aria-hidden': 'true' }, '★★★★★')], 'Rate ' + rtTitle(x.title || 'this book'), false))),
        ...more(fin.length, allFin, () => { allFin = !allFin; paint(); }));
      fhost.hidden = !fhost.firstChild;
    };
    paint();
    myRtBackfill();
  }
  /* ratings given before the list existed, or on another device before it synced: look up books you have finished, opened or saved, once each */
  async function myRtBackfill() {
    if (myBack || !acInfo()) return;
    myBack = true;
    try {
      const chk = store.get('wt:rtchk', {}) || {}, mine = myRatings(), seen = new Set(), todo = [];
      [].concat(ST.done || [], P.recents || [], getFavs() || []).forEach(x => { if (!x || x.id == null) return; const id = String(x.id); if (seen.has(id) || mine[id] || chk[id]) return; seen.add(id); todo.push(x); });
      let found = false;
      for (const x of todo.slice(0, 30)) {
        const b = { id: String(x.id), title: x.title || '', authors: x.authors || '', cover: x.cover || '', ia: x.ia || '' };
        const m = await rtMine(b);
        if (m === null) break;   // signed out meanwhile
        chk[b.id] = 1; if (m.r) found = true;
        store.set('wt:rtchk', chk);
      }
      if (found && curTab === 'shelf' && shelfMode === 'rt') renderMyRatings();
    } catch (e) { /* offline: try again next time */ }
    finally { myBack = false; }
  }
  /* ---------- Ratings on tiles and lists ----------
     One request per session (cached 6 hours on the device) fetches the totals of the books that have at least
     RTSUM_MIN ratings, most-rated first, up to RTSUM_MAX books. A book outside that list simply shows no rating on its
     tile; its own page still shows everything. Guests need no sign-in. Calm mode hides these (CSS). */
  const RTSUM_MIN = 5, RTSUM_MAX = 400, RTSUM_TTL = 6 * 3600e3, RTSUM = { map: new Map(), ready: false, p: null };
  function rtSumLoad() {
    if (RTSUM.p) return RTSUM.p;
    RTSUM.p = (async () => {
      let rows = null, c = null;
      try { c = await idb.get('rtsum'); } catch (e) { /* no saved copy */ }
      if (c && c.d && Date.now() - c.t < RTSUM_TTL) rows = c.d;
      else {
        try {
          const q = { structuredQuery: { from: [{ collectionId: 'ratings' }],
            where: { fieldFilter: { field: { fieldPath: 'n' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(RTSUM_MIN) } } },
            orderBy: [{ field: { fieldPath: 'n' }, direction: 'DESCENDING' }], limit: RTSUM_MAX } };
          const r = await rtFetch(rtBase() + ':runQuery', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          rows = (await r.json()).filter(x => x && x.document && x.document.fields).map(x => { const f = x.document.fields, n = rtNum(f.n), sm = rtNum(f.s); return [String(x.document.name).split('/').pop(), n, n ? Math.round(sm / n * 10) / 10 : 0]; }).filter(x => x[1] >= RTSUM_MIN);
          try { idb.set('rtsum', { t: Date.now(), d: rows }); } catch (e) { /* not saved */ }
        } catch (e) { rows = c && c.d ? c.d : null; }   // offline: an older saved copy is better than nothing
      }
      if (!rows) { RTSUM.p = null; return; }
      RTSUM.map = new Map(rows.map(x => [decodeURIComponent(x[0]), { n: x[1], avg: x[2] }])); RTSUM.ready = true;
      try { paintCards(); } catch (e) { /* nothing on screen yet */ }
    })().catch(() => { RTSUM.p = null; });
    return RTSUM.p;
  }
  const rtInfo = id => RTSUM.ready && id != null ? RTSUM.map.get(String(id)) || null : null;
  const rtChipText = id => { const i = rtInfo(id); return i ? '\u2605 ' + i.avg.toFixed(1) : ''; };
  const rtLineText = id => { const i = rtInfo(id); return i ? '\u2605 ' + i.avg.toFixed(1) + ' \u00b7 ' + fmtCount(i.n) + ' ratings' : ''; };
  const rtCalm = () => P.calm === true;
  /* order books by rating, best first (average, then how many ratings); books without a rating go last */
  const rtCmp = (x, y) => { const a = rtInfo(x.id), b = rtInfo(y.id); return (b ? b.avg : -1) - (a ? a.avg : -1) || (b ? b.n : 0) - (a ? a.n : 0); };
  const rtSpeak = id => { const i = rtInfo(id); return i ? 'Rated ' + i.avg.toFixed(1) + ' out of 5 by ' + i.n + ' people' : ''; };
