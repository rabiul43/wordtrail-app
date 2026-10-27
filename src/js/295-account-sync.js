  /* ---------- Account: sign in with Google and sync across devices ----------
     Optional. Without signing in nothing changes and the Firebase code is never downloaded.
     Signed in, the same items the backup file keeps (settings, favourites, words, bookmarks, clips, highlights,
     positions, stats) are copied to Firestore at users/{uid}/data/{encoded key} as { k, v: the JSON text, t: time it changed, u: server time it was uploaded }.
     Downloaded audio, caches and uploaded book texts stay on the device.
     wt:acct     = { uid, email, name, photo, cats: {settings, library, marks, progress}, first, last, lastT, lastU, lastFull }
                   (lastT: server time the last pull began; lastU: only cloud items uploaded after it are downloaded;
                    lastFull: when everything was last downloaded)
     wt:syncdirty = [keys changed here and not uploaded yet]
     wt:syncmeta = { key: time it last changed here, in Firestore server time }   (decides which copy is newer: last write wins)
     Pull (app open, sign in, "Sync now"): newer cloud copies replace local ones, then the page reloads, the same
     way Restore does, so the in-memory state cannot overwrite them. While audio is playing the reload waits until
     it pauses (see acPending). On the first sync of an account on a device,
     list items (favourites, words, recent searches, listening history) and daily stats are merged, not replaced.
     Push: changes are sent 8 seconds after the last change, and when the page is hidden. */
  const FB_CFG = {
    apiKey: 'AIzaSyBqIqgear6hpbSLrap4yIABBaqD_ZHnaZg',
    authDomain: 'wordtrail-a1b2c.firebaseapp.com',
    projectId: 'wordtrail-a1b2c',
    storageBucket: 'wordtrail-a1b2c.firebasestorage.app',
    messagingSenderId: '323294819807',
    appId: '1:323294819807:web:5a11ede059ce9a05bd406a'
  };
  const FB_VER = '10.12.2', AC_KEY = 'wt:acct', AC_META = 'wt:syncmeta', AC_MAX = 900000;
  /* App Check (optional). Firestore then only answers requests that come from this website, not from scripts that
     copy the public Firebase key. Create a reCAPTCHA v3 key for the site, register it in Firebase console >
     App Check > Apps > Web, paste the SITE key here, and only after the App Check metrics show your own requests
     as verified, turn on enforcement for Cloud Firestore. Empty = App Check is not used. The firebase/firestore
     rules (firebase/firestore.rules) are the real protection; App Check adds to them. */
  const AC_APPCHECK_KEY = '';
  const AC_CHUNK = 300000, AC_TOTAL = 3000000, AC_BIG = 'wt:syncbig';
  const AC_CATS = [
    ['settings', 'Settings', k => k === 'wt:prefs'],
    ['library', 'Favourites, saved words, searches', k => k === 'wt:favs' || k === 'wt:words' || k === 'wt:recent-q' || k === 'wt:myrt' || k === 'wt:follows'],
    ['marks', 'Bookmarks, clips and highlights', k => /^wt:(bm|clips|hl):/.test(k)],
    ['progress', 'Progress and listening stats', k => /^wt:(book|lp|lev):/.test(k) || k === 'wt:stats' || k === 'wt:listens' || k === 'wt:finlv']
  ];
  let acFb = null, acLoading = null, acDb = null, acUser = null, acStale = false, acBusy = false, acTimer = null, acMsg = '', acErr = '';
  /* keys changed here and not uploaded yet. Kept in wt:syncdirty so a closed page or a restart cannot forget them
     (an incremental sync only looks at changed cloud items, so it could not rediscover them). Not part of backups. */
  const AC_DIRTY = 'wt:syncdirty', acDirty = new Set();
  try { JSON.parse(localStorage.getItem(AC_DIRTY) || '[]').forEach(k => { if (typeof k === 'string') acDirty.add(k); }); } catch (e) { /* none saved */ }
  const acDirtySave = () => { try { if (acDirty.size) localStorage.setItem(AC_DIRTY, JSON.stringify([...acDirty])); else localStorage.removeItem(AC_DIRTY); } catch (e) { /* storage unavailable */ } };
  /* The note in localStorage (wt:acct) only remembers WHO signed in. Whether the sign-in still works is decided by Firebase:
     when it reports no user for a remembered account, acStale is set (the screens then ask to sign in again) and it clears
     when Firebase confirms a user. acSignedIn() = remembered AND confirmed (or not yet checked this session). */
  const acSignedIn = () => !!acInfo() && !acStale;
  const acInfo = () => { try { return JSON.parse(localStorage.getItem(AC_KEY) || 'null'); } catch (e) { return null; } };
  const acSaveInfo = o => { try { if (o) localStorage.setItem(AC_KEY, JSON.stringify(o)); else localStorage.removeItem(AC_KEY); } catch (e) { /* storage unavailable */ } };
  const acMeta = () => { try { return JSON.parse(localStorage.getItem(AC_META) || '{}') || {}; } catch (e) { return {}; } };
  const acSaveMeta = m => { try { localStorage.setItem(AC_META, JSON.stringify(m)); } catch (e) { /* storage unavailable */ } };
  /* Server time. Change times are stamped with the Firestore server's clock, not this device's, so a phone whose
     clock is wrong cannot make old data look newer. acOff = server time minus this device's clock, measured at each
     sync and remembered in wt:clockoff (not part of backups). Before the first sync it is 0 (device clock). */
  let acOff = 0; try { acOff = Number(localStorage.getItem('wt:clockoff')) || 0; } catch (e) { /* storage unavailable */ }
  const acNow = () => Date.now() + acOff;
  async function acClock() {
    const ref = acCol().doc('__clock'), t0 = Date.now();
    await ref.set({ t: acFb.firestore.FieldValue.serverTimestamp() });
    const t1 = Date.now(), snap = await ref.get({ source: 'server' }), ts = snap.data() && snap.data().t;
    if (!ts || typeof ts.toMillis !== 'function') return false;
    acOff = Math.round(ts.toMillis() - (t0 + t1) / 2); // the write landed about halfway through its round trip
    try { localStorage.setItem('wt:clockoff', String(acOff)); } catch (e) { /* storage unavailable */ }
    return true;
  }
  /* Large items. A Firestore document holds under 1 MB, so a value over AC_MAX characters is cut into pieces of
     AC_CHUNK characters (300,000 characters is under 1 MB even if every one takes 3 bytes). The piece documents are
     'chunk:<key>:<n>' = { ck: key, i: n, v: piece }. The item's own document then has no v; it holds
     { k, chunks: how many pieces, len: total length, t, u }, and is written in the same batch as the pieces, so
     other devices never see half an item. Older copies of the app ignore both kinds of document. Above AC_TOTAL
     characters an item is still skipped. wt:syncbig = { key: pieces this device knows the cloud holds }, used to
     remove pieces that are no longer needed. */
  const acBig = () => { try { return JSON.parse(localStorage.getItem(AC_BIG) || '{}') || {}; } catch (e) { return {}; } };
  const acSaveBig = m => { try { if (Object.keys(m).length) localStorage.setItem(AC_BIG, JSON.stringify(m)); else localStorage.removeItem(AC_BIG); } catch (e) { /* storage unavailable */ } };
  const acChunkId = (k, i) => 'chunk:' + encodeURIComponent(k) + ':' + i;
  function acSplit(v) { // never cuts between the two halves of a character outside the basic range (an emoji, say)
    const parts = []; let a = 0;
    while (a < v.length) {
      let b = Math.min(v.length, a + AC_CHUNK);
      if (b < v.length) { const c = v.charCodeAt(b - 1); if (c >= 0xD800 && c <= 0xDBFF) b--; }
      parts.push(v.slice(a, b)); a = b;
    }
    return parts;
  }
  function acWanted(k) {
    const i = acInfo(); if (!i) return false;
    return AC_CATS.some(c => i.cats && i.cats[c[0]] === false ? false : c[2](k));
  }
  const acLocalKeys = () => { const out = []; try { Object.keys(localStorage).forEach(k => { if (acWanted(k)) out.push(k); }); } catch (e) { /* storage unavailable */ } return out; };

  /* called by store.set for every saved item */
  function acMark(k) {
    if (!acWanted(k)) return;
    const m = acMeta(); m[k] = acNow(); acSaveMeta(m);
    if (!acDirty.has(k)) { acDirty.add(k); acDirtySave(); }
    clearTimeout(acTimer); acTimer = setTimeout(() => { acPush().catch(() => {}); }, 8000);
  }
  storeHook = k => { try { acMark(k); } catch (e) { /* never break saving */ } };

  function acLoad() {
    if (acFb) return Promise.resolve(acFb);
    if (acLoading) return acLoading;
    const one = n => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-' + n + '-compat.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the sign-in service. Check your connection.'));
      document.head.append(s);
    });
    acLoading = one('app').then(() => Promise.all([one('auth'), one('firestore'), AC_APPCHECK_KEY ? one('app-check').catch(() => {}) : 0])).then(() => {
      const fb = window.firebase; fb.initializeApp(FB_CFG);
      if (AC_APPCHECK_KEY && fb.appCheck) { try { fb.appCheck().activate(AC_APPCHECK_KEY, true); } catch (e) { /* App Check unavailable: carry on without it */ } }
      acFb = fb; acDb = fb.firestore();
      fb.auth().onAuthStateChanged(acAuthChanged);
      fb.auth().getRedirectResult().catch(e => { acErr = acNice(e); renderAcctSync(); });
      return fb;
    }).catch(e => { acLoading = null; throw e; });
    return acLoading;
  }
  /* Optional, more reliable sign-in: Google's own sign-in popup returns a token straight to the page, so it does not
     depend on cross-site storage (which Brave, Safari and newer Chrome block, and which makes the Firebase popup
     close without signing in). Paste the "Web client ID" from Firebase > Authentication > Sign-in method > Google >
     Web SDK configuration, and add this site's address under "Authorized JavaScript origins" of that client in
     Google Cloud > APIs & Services > Credentials. Leave empty to use the Firebase popup. */
  const GIS_CLIENT_ID = '323294819807-apcmd3aughqecjuspgtj71lsvmen5b47.apps.googleusercontent.com';
  function acGisPreload() {
    if (!GIS_CLIENT_ID || window.google && google.accounts || document.getElementById('gis-js')) return;
    const s = document.createElement('script'); s.id = 'gis-js'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.head.append(s);
  }
  function acGisToken() { // must be called straight from a tap, so the popup is allowed
    return new Promise((res, rej) => {
      if (!(window.google && google.accounts && google.accounts.oauth2)) { rej(new Error('Google sign-in is still loading. Tap again in a moment.')); acGisPreload(); return; }
      try {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: GIS_CLIENT_ID, scope: 'openid email profile',
          callback: r => r && r.access_token ? res(r.access_token) : rej({ code: 'gis/denied', message: (r && (r.error_description || r.error)) || 'Google did not complete the sign-in.' }),
          error_callback: e => rej({ code: 'gis/' + ((e && e.type) || 'error'), message: e && e.type === 'popup_failed_to_open' ? 'The sign-in window was blocked. Allow pop-ups for this site and tap again.' : '' })
        });
        tc.requestAccessToken({ prompt: 'select_account' });
      } catch (e) { rej(e); }
    });
  }
  function acNice(e) {
    const c = e && e.code || '';
    if (c === 'auth/unauthorized-domain') return 'This website address is not allowed yet in Firebase (Authentication > Settings > Authorized domains).';
    if (c === 'auth/operation-not-supported-in-this-environment') return 'Sign-in needs the app to be opened from its website address (or http://localhost), not from a file on your computer.';
    if (c === 'auth/popup-closed-by-user') return 'The sign-in window closed before it finished. If you did choose your account, your browser may be blocking the connection (Brave shields, or blocked third-party cookies for this site). Allow them, or try another browser.';
    if (c === 'auth/cancelled-popup-request' || c === 'gis/popup_closed') return '';
    if (c.indexOf('gis/') === 0) return (e && e.message) || '';
    if (c === 'auth/network-request-failed') return 'No connection. Try again when you are online.';
    if (c === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' || c === 'auth/invalid-api-key') return 'The Firebase API key is not valid.';
    return (e && e.message) || 'Sign-in failed.';
  }

  async function acSignIn() {
    acErr = ''; renderAcctSync();
    if (!/^https?:$/.test(location.protocol)) { acErr = 'Sign-in needs the app to be opened from its website address (or http://localhost), not from a file on your computer.'; renderAcctSync(); return; }
    try {
      if (GIS_CLIENT_ID) {
        const tokP = acGisToken(); tokP.catch(() => {}); // starts inside the tap; Firebase loads meanwhile
        const fb = await acLoad();
        const tok = await tokP;
        await fb.auth().signInWithCredential(fb.auth.GoogleAuthProvider.credential(null, tok));
        return;
      }
      const fb = await acLoad();
      const prov = new fb.auth.GoogleAuthProvider(); prov.setCustomParameters({ prompt: 'select_account' });
      try { await fb.auth().signInWithPopup(prov); }
      catch (e) {
        if (e && e.code === 'auth/popup-blocked') { await fb.auth().signInWithRedirect(prov); return; }
        throw e;
      }
    } catch (e) { acErr = acNice(e); renderAcctSync(); }
  }
  async function acSignOut() {
    if (!confirm('Sign out? Your data stays on this device and in your account.')) return;
    try { if (acFb) await acFb.auth().signOut(); } catch (e) { /* ignore */ }
    acUser = null; acStale = false; acSaveInfo(null); try { localStorage.removeItem(AC_META); localStorage.removeItem(AC_BIG); } catch (e) { /* ignore */ }
    acDirty.clear(); acDirtySave(); acMsg = ''; renderAcctSync();
  }

  function acAuthChanged(u) {
    acUser = u || null;
    if (!u) { if (acInfo()) acStale = true; renderAcctSync(); return; }
    acStale = false;
    const old = acInfo(), same = old && old.uid === u.uid;
    acSaveInfo({ uid: u.uid, email: u.email || '', name: u.displayName || '', photo: u.photoURL || '',
      cats: same && old.cats ? old.cats : { settings: true, library: true, marks: true, progress: true },
      first: same ? !!old.first : true, last: same ? old.last || 0 : 0, lastT: same ? old.lastT || 0 : 0,
      lastU: same ? old.lastU || 0 : 0, lastFull: same ? old.lastFull || 0 : 0 });
    if (!same) { try { localStorage.removeItem(AC_META); localStorage.removeItem(AC_BIG); } catch (e) { /* ignore */ } acDirty.clear(); acDirtySave(); }
    renderAcctSync();
    acSync(!same, !same).catch(() => {});
  }

  const acKeyOf = x => typeof x === 'object' && x ? (x.id !== undefined ? String(x.id) : x.w !== undefined ? String(x.w) : JSON.stringify(x)) : String(x);
  function acUnion(k, a, b) { // a = this device, b = cloud. Returns the merged JSON text, or null to let the newer copy win.
    let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
    if (k === 'wt:stats') {
      if (!A || !B || !A.days || !B.days || A.cleared !== B.cleared) return null;
      const days = Object.assign({}, B.days);
      Object.keys(A.days).forEach(d => { const x = A.days[d], y = days[d]; days[d] = y ? { s: Math.max(x.s || 0, y.s || 0), w: Math.max(x.w || 0, y.w || 0) } : x; });
      const seen = new Set(), done = [];
      [].concat(A.done || [], B.done || []).forEach(x => { const q = acKeyOf(x); if (!seen.has(q)) { seen.add(q); done.push(x); } });
      return JSON.stringify(Object.assign({}, B, A, { days, done }));
    }
    if (k === 'wt:myrt' || k === 'wt:follows') {   // your ratings / followed authors, one entry per book: the newer entry wins (a removed rating stays as { r: 0 } so it is not brought back)
      if (!A || !B || typeof A !== 'object' || typeof B !== 'object' || Array.isArray(A) || Array.isArray(B)) return null;
      const out = Object.assign({}, B);
      Object.keys(A).forEach(i => { if (!out[i] || (A[i] && A[i].t || 0) >= (out[i] && out[i].t || 0)) out[i] = A[i]; });
      return JSON.stringify(out);
    }
    if (!Array.isArray(A) || !Array.isArray(B)) return null;
    const map = new Map();
    [].concat(A, B).forEach(x => { const q = k === 'wt:recent-q' ? String(x).toLowerCase() : acKeyOf(x); const o = map.get(q); if (!o || (x && x.ts || 0) > (o && o.ts || 0)) map.set(q, x); });
    let out = [...map.values()];
    if (k === 'wt:listens') out.sort((x, y) => (y.ts || 0) - (x.ts || 0));
    const cap = { 'wt:favs': 300, 'wt:words': 2000, 'wt:recent-q': 8, 'wt:listens': 40 }[k];
    if (cap) out = out.slice(0, cap);
    return JSON.stringify(out);
  }

  /* Conflicts. When this device and the cloud both changed a key since the last sync, the newer copy used to replace
     the other one and a bookmark, clip, highlight or listening position could be lost. These keys are merged instead:
       wt:clips:*, wt:hl:*  items from both copies, matched by id (same id: the newer copy's version)
       wt:lp:*              furthest point reached, per track
       wt:book:*            the furthest position (track, then time); the other fields come from the newer copy
       wt:lev:*             both copies' entries (same track: the newer copy's)
     wt:bm:* is one bookmark per book, so the newer copy still wins there. */
  const AC_MERGE = k => /^wt:(clips|hl|lp|lev|book):/.test(k);
  const acIsObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  function acResolve(k, a, b, mineNewer) { // a = this device, b = cloud. Returns the merged JSON text, or null to let the newer copy win.
    let A, B; try { A = JSON.parse(a); B = JSON.parse(b); } catch (e) { return null; }
    const N = mineNewer ? A : B, O = mineNewer ? B : A; // newer copy, older copy
    if (/^wt:(clips|hl):/.test(k)) {
      if (!Array.isArray(A) || !Array.isArray(B)) return null;
      const map = new Map(); O.concat(N).forEach(x => map.set(acKeyOf(x), x));
      let out = [...map.values()];
      if (k.indexOf('wt:clips:') === 0) out.sort((x, y) => (y && y.ts || 0) - (x && x.ts || 0));
      else out = out.sort((x, y) => (x && x.id || 0) - (y && y.id || 0)).slice(0, 500);
      return JSON.stringify(out);
    }
    if (!acIsObj(A) || !acIsObj(B)) return null;
    if (k.indexOf('wt:lp:') === 0) {
      const out = {}; Object.keys(Object.assign({}, A, B)).forEach(i => { out[i] = Math.max(+A[i] || 0, +B[i] || 0); });
      return JSON.stringify(out);
    }
    if (k.indexOf('wt:lev:') === 0) return JSON.stringify(Object.assign({}, O, N));
    if (k.indexOf('wt:book:') === 0) {
      if (typeof A.sec !== 'number' || typeof B.sec !== 'number') return null;
      const ahead = A.sec > B.sec || (A.sec === B.sec && (A.time || 0) >= (B.time || 0)) ? A : B;
      return JSON.stringify(Object.assign({}, O, N, { sec: ahead.sec, time: ahead.time }));
    }
    return null;
  }

  const acCol = () => acDb.collection('users').doc(acUser.uid).collection('data');
  /* guard: before uploading a mergeable key that changed here, look at the cloud copy. If another device changed it
     since our last sync, upload the merge instead of overwriting that device's change. (acSync already compared
     against a fresh copy of the cloud, so it passes guard = false.) The local copy is left as it is; the next sync
     pulls the merged one. */
  async function acPushKeys(keys, guard) {
    const meta = acMeta(), big = acBig(), col = acCol(), list = [...keys], lastT = (acInfo() || {}).lastT || 0, bigs = [];
    let skipped = 0, bigChanged = false;
    for (let i = 0; i < list.length; i += 250) {
      const batch = acDb.batch(); let n = 0;
      for (const k of list.slice(i, i + 250)) {
        let v = localStorage.getItem(k);
        if (v === null) continue;
        if (!meta[k]) meta[k] = acNow();
        let t = meta[k];
        if (guard && lastT && t > lastT && AC_MERGE(k)) {
          try {
            const r = (await col.doc(encodeURIComponent(k)).get()).data();
            if (r && typeof r.v === 'string' && r.t > lastT && r.v !== v) {
              const m = acResolve(k, v, r.v, t >= r.t);
              if (m !== null) { v = m; t = acNow(); }
            }
          } catch (e) { /* could not check: upload as before */ }
        }
        if (v.length > AC_TOTAL) { skipped++; continue; }
        if (v.length > AC_MAX) { bigs.push([k, v, t]); continue; }
        if (big[k]) { for (let c = 0; c < big[k]; c++) { batch.delete(col.doc(acChunkId(k, c))); n++; } delete big[k]; bigChanged = true; } // it shrank: drop the old pieces
        batch.set(col.doc(encodeURIComponent(k)), { k, v, t, u: acFb.firestore.FieldValue.serverTimestamp() }); n++;
      }
      if (n) await batch.commit();
    }
    for (const [k, v, t] of bigs) { // each large item in its own batch: pieces and header together
      const parts = acSplit(v), old = big[k] || 0, batch = acDb.batch();
      parts.forEach((part, c) => batch.set(col.doc(acChunkId(k, c)), { ck: k, i: c, v: part }));
      for (let c = parts.length; c < old; c++) batch.delete(col.doc(acChunkId(k, c)));
      batch.set(col.doc(encodeURIComponent(k)), { k, chunks: parts.length, len: v.length, t, u: acFb.firestore.FieldValue.serverTimestamp() });
      await batch.commit(); big[k] = parts.length; bigChanged = true;
    }
    if (bigChanged) acSaveBig(big);
    acSaveMeta(meta);
    list.forEach(k => acDirty.delete(k)); acDirtySave();
    return skipped;
  }
  async function acPush() {
    if (!acUser || !acFb || !acInfo() || !acDirty.size || acBusy) return;
    try {
      await acPushKeys([...acDirty].filter(acWanted), true);
      const i = acInfo(); if (i) { i.last = Date.now(); acSaveInfo(i); }
      acMsg = ''; acErr = '';
    } catch (e) { acErr = navigator.onLine ? 'Could not save to your account. It will retry.' : ''; acMsg = navigator.onLine ? '' : 'Offline. Changes will sync when you are back online.'; }
    renderAcctSync();
  }

  /* Pulled data used to reload the page at once, which cuts the audio. Now, while something is playing, the pulled
     items wait in acPending (memory only: nothing is lost if the page closes, because the sync point is not moved
     and the next sync downloads them again). They are applied, and the page reloaded, 6 seconds after playback
     pauses or ends, or right away when the page is hidden and nothing is playing. Anything changed on this device
     after the pull is left alone and merged by the next sync. */
  let acPending = null, acFlushT = 0;
  const acPlaying = () => { try { return (!audio.paused && !audio.ended) || !!(S && S.loadingAudio); } catch (e) { return false; } };
  function acFlushSoon() { clearTimeout(acFlushT); acFlushT = acPending ? setTimeout(acFlush, 6000) : 0; }
  function acFlush() {
    clearTimeout(acFlushT); acFlushT = 0;
    if (!acPending || acPlaying()) return;
    if (acPending.quiet && document.visibilityState !== 'hidden') return;   // a background sync never reloads the screen in front of the person: it waits until the app is hidden (the next flush call)
    if (acBusy) { acFlushT = setTimeout(acFlush, 3000); return; }
    const p = acPending; acPending = null;
    const meta = acMeta(), keys = Object.keys(p.items).filter(k => (meta[k] || 0) <= p.at);
    if (!keys.length) return;
    window.__wtRestoring = true; // pause saving so the old in-memory state cannot overwrite what is applied
    keys.forEach(k => { const it = p.items[k]; try { localStorage.setItem(k, it.v); meta[k] = it.t; if (it.up) acDirty.add(k); } catch (e) { /* storage full: skip */ } });
    acSaveMeta(meta); acDirtySave();
    if (!p.quiet) toast('Synced from your account. Reloading…', 2500);
    setTimeout(() => location.reload(), p.quiet ? 50 : 900);
  }
  try {
    audio.addEventListener('pause', acFlushSoon); audio.addEventListener('ended', acFlushSoon);
    audio.addEventListener('play', () => { clearTimeout(acFlushT); acFlushT = 0; });
  } catch (e) { /* no audio element yet */ }

  /* full = download every cloud item. Otherwise only items uploaded since the last sync are downloaded: each upload
     carries u, the server's upload time, and the query asks for u > lastU. A full download is done when asked for
     (Sync now, a new account, a switched-on category), when there is no lastU yet, and at least once a week, which
     also picks up items written by an older copy of the app that does not set u. */
  const AC_FULL_EVERY = 7 * 864e5, AC_OVERLAP = 120000;
  async function acSync(manual, full) {
    if (!acUser || !acDb || acBusy) return;
    acBusy = true; acErr = ''; acMsg = 'Syncing…'; renderAcctSync();
    let reload = false;
    try {
      let clockOk = false;
      try { clockOk = await acClock(); } catch (e) { /* offline or blocked: keep the last known offset */ }
      const info = acInfo() || {}, first = !!info.first, meta = acMeta(), lastT = info.lastT || 0, syncT = acNow();
      const remote = {}, sinceU = info.lastU || 0;
      const doFull = !!full || !sinceU || Date.now() - (info.lastFull || 0) > AC_FULL_EVERY;
      const snap = await (doFull ? acCol() : acCol().where('u', '>', acFb.firestore.Timestamp.fromMillis(sinceU))).get();
      let maxU = 0;
      const bigMain = {}, pieces = {}, big = acBig(), unreadable = new Set(); let bigChanged = false;
      snap.forEach(d => {
        const x = d.data(); if (!x) return;
        if (typeof x.ck === 'string') { if (typeof x.v === 'string') (pieces[x.ck] = pieces[x.ck] || {})[x.i] = x.v; return; } // a piece of a large item
        if (typeof x.k === 'string' && typeof x.v === 'string') remote[x.k] = x;
        else if (typeof x.k === 'string' && typeof x.chunks === 'number') bigMain[x.k] = x;
        const u = x.u && typeof x.u.toMillis === 'function' ? x.u.toMillis() : 0; if (u > maxU) maxU = u;
      });
      for (const k of Object.keys(bigMain)) { // large items: put the pieces together, but only when this copy could be the newer one
        const m = bigMain[k]; if (!acWanted(k)) continue;
        if (big[k] !== m.chunks) { big[k] = m.chunks; bigChanged = true; }
        const lt0 = meta[k] || 0, mine0 = localStorage.getItem(k);
        if (!(mine0 === null || m.t > lt0 || first || (lt0 > lastT && m.t > lastT))) { remote[k] = { k, t: m.t }; continue; } // no v: only "which side is newer" is looked at below
        try {
          const parts = [];
          await Promise.all(Array.from({ length: m.chunks }, (_, i) => pieces[k] && typeof pieces[k][i] === 'string' ? (parts[i] = pieces[k][i]) :
            acCol().doc(acChunkId(k, i)).get().then(sn => { const y = sn.data(); if (y && typeof y.v === 'string') parts[i] = y.v; })));
          let ok = true; for (let i = 0; i < m.chunks; i++) if (typeof parts[i] !== 'string') ok = false;
          const v = ok ? parts.join('') : '';
          if (ok && v.length === m.len) remote[k] = { k, v, t: m.t, u: m.u }; else unreadable.add(k);
        } catch (e) { unreadable.add(k); /* could not read the pieces: leave this item for the next sync */ }
      }
      if (bigChanged) acSaveBig(big);
      const up = new Set([...acDirty].filter(acWanted)), items = {}; // items: pulled values to apply, key -> { v, t, up }
      Object.keys(remote).forEach(k => {
        if (!acWanted(k)) return;
        const r = remote[k], lt = meta[k] || 0, mine = localStorage.getItem(k);
        if (r.v === undefined) { if (r.t < lt) up.add(k); return; } // a large item that is not newer than this copy
        const conflict = mine !== null && r.v !== mine && lt > lastT && r.t > lastT; // both sides changed since the last sync
        let union = null;
        if (mine !== null && r.v !== mine) {
          if (AC_MERGE(k) && (first || conflict)) union = acResolve(k, mine, r.v, lt >= r.t);
          if (union === null && (first || k === 'wt:stats')) union = acUnion(k, mine, r.v);
        }
        if (union !== null) {
          if (union !== mine) items[k] = { v: union, t: acNow(), up: union !== r.v };
          else { if (union !== r.v) up.add(k); meta[k] = acNow(); }
        }
        else if (mine === null || r.t > lt) { if (r.v !== mine) items[k] = { v: r.v, t: r.t, up: false }; else meta[k] = r.t; }
        else if (r.t < lt) up.add(k);
      });
      if (doFull) acLocalKeys().forEach(k => { if (!remote[k] && !unreadable.has(k)) up.add(k); }); // items the cloud has never seen
      const pulled = Object.keys(items), quiet = !manual && !first;   // quiet = the automatic sync after opening the app: never reload the screen in front of the person
      const deferred = pulled.length > 0 && (acPlaying() || quiet);
      if (deferred) {
        acPending = { at: syncT, items, quiet }; // the newest pull replaces an older one: it was worked out from the same unchanged local state
      } else if (pulled.length) {
        window.__wtRestoring = true; // pause saving so the old in-memory state cannot overwrite what is applied
        pulled.forEach(k => { try { localStorage.setItem(k, items[k].v); meta[k] = items[k].t; if (items[k].up) up.add(k); } catch (e) { /* storage full: skip */ } });
        reload = true;
      }
      acSaveMeta(meta);
      let skipped = 0;
      try { skipped = await acPushKeys(up, false); } catch (e) { if (!reload) throw e; /* merged items are newer here, so the next sync uploads them */ }
      if (deferred) { // keep the sync point where it was, so the waiting items are downloaded again if the page closes first
        if (quiet) acMsg = '';   // silent: applied (and the page refreshed) while the app is in the background
        else { acMsg = 'Newer data from your account is ready. It loads when you pause.'; toast('Newer data from your account is ready. It will load when you pause.', 4000); }
      } else {
        info.first = false; info.last = Date.now(); info.lastT = syncT;
        if (doFull) info.lastFull = Date.now();
        // next time ask for items uploaded after this point (a little earlier, to be safe; seeing an item twice is harmless)
        info.lastU = clockOk ? syncT - AC_OVERLAP : maxU ? Math.max(sinceU, maxU - AC_OVERLAP) : doFull ? 0 : sinceU;
        acSaveInfo(info);
        acMsg = skipped ? 'Synced. ' + skipped + ' item(s) were too large to upload (over 3 MB).' : '';
      }
      if (deferred) { /* told above */ }
      else if (reload) { toast('Synced from your account. Reloading…', 2500); setTimeout(() => location.reload(), 900); }
      else if (manual) toast('Synced.', 2000);
    } catch (e) {
      window.__wtRestoring = false;
      acMsg = ''; acErr = navigator.onLine ? 'Sync failed. ' + ((e && e.code === 'permission-denied') ? 'Check the Firestore rules (and App Check, if it is turned on).' : 'Try again in a moment.') : 'Offline. Sync will run when you are back online.';
    } finally { acBusy = false; renderAcctSync(); }
  }

  async function acWipeCloud() {   // removes every synced item of this account from the cloud (this device keeps its own copy)
    const snap = await acCol().get(); let batch = acDb.batch(), n = 0;
    for (const d of snap.docs) { batch.delete(d.ref); if (++n % 400 === 0) { await batch.commit(); batch = acDb.batch(); } }
    await batch.commit();
    try { localStorage.removeItem(AC_BIG); } catch (e) { /* ignore */ }
  }
  async function acDeleteCloud() {
    if (!acUser) { toast('Still connecting. Try again in a moment.', 3000); return; }
    if (!confirm('Delete everything saved in your account? Data on this device is kept.')) return;
    try { await acWipeCloud(); toast('Cloud data deleted.', 2500); }
    catch (e) { toast('Could not delete the cloud data.', 3500); }
  }
  /* Delete account: two confirmations, then the cloud data, then the sign-in itself. Data on this device is kept, and ratings or
     reviews already published stay (they belong to the book pages). Firebase asks for a recent sign-in before it deletes an
     account; when it does, the cloud data is already gone and the person is told to sign in again and repeat the tap. */
  async function acDeleteAccount() {
    if (!acUser || !acInfo()) { toast('Still connecting. Try again in a moment.', 3000); return; }
    if (!confirm('Delete your account? Everything saved in your account and your sign-in are removed. Data on this device is kept. Ratings and reviews you already published stay unless you remove them first. This cannot be undone.')) return;
    if (!confirm('Last check: delete your account for good?')) return;
    try {
      await acWipeCloud();
      await acUser.delete();
    } catch (e) {
      if (e && e.code === 'auth/requires-recent-login') toast('For safety, sign out, sign in again, then tap Delete account again.', 6000);
      else toast('Could not delete the account.', 4000);
      renderAcctSync(); return;
    }
    acUser = null; acStale = false; acSaveInfo(null); try { localStorage.removeItem(AC_META); localStorage.removeItem(AC_BIG); } catch (e) { /* ignore */ }
    acDirty.clear(); acDirtySave(); acMsg = ''; renderAcctSync();
    toast('Account deleted.', 3500);
  }
  /* Account > Data and privacy: export works signed in or out; the two deletes need a signed-in account */
  function renderAcctData() {
    const box = $('#acct-data'); if (!box) return;
    box.textContent = '';
    const signed = !!acInfo() && !acStale;
    const row = (icon, name, desc, fn, cls) => {
      return h('button', { class: 'acct-link' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, acSvg('<use href="#' + icon + '"/>'), h('span', {}, name, h('small', {}, desc)), acSvg('<use href="#i-go"/>', 'ic go'));
    };
    box.append(h('h2', { id: 'acct-data-h' }, 'Data and privacy'),
      row('i-m-download', 'Export my data', 'Download a backup file of your saved books, words, bookmarks and positions', () => { const b = $('#b-bkdl'); if (b) b.click(); }),   // the same button as Settings > Backup, so the backup code is not called from here
      ...(signed ? [
        row('i-m-trash', 'Delete my cloud data', 'Removes what is synced to your account. Data on this device is kept', acDeleteCloud),
        row('i-m-person', 'Delete account', 'Removes your account and everything saved in it', acDeleteAccount, 'danger')] : []));
    box.hidden = false;
  }

  const acSvg = (d, cls) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('class', cls || 'ic'); n.setAttribute('aria-hidden', 'true'); n.innerHTML = d; return n; };
  const AC_G = '<path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.88 0-5.31-1.94-6.18-4.55H2.17v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.82 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.17a11 11 0 0 0 0 9.86l3.65-2.84z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.46 2.1 14.97 1 12 1A11 11 0 0 0 2.17 7.07l3.65 2.84C6.69 7.3 9.12 5.36 12 5.36z"/>';
  const AC_CLOUD = '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.6 4.7 4.7 0 0 1 17 18H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 13.2 11.4 15l3.2-3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  function renderAcctSync() {
    acTabMark();
    renderAcctData();
    const box = $('#acct-sync'); if (!box) return;
    box.textContent = '';
    const info = acInfo();
    const err = acErr ? h('p', { class: 'acct-err', role: 'alert' }, acErr) : null;
    if (!info || acStale) {
      acGisPreload();
      const gbtn = h('button', { class: 'acct-g', type: 'button', onclick: acSignIn }, h('span', {}), 'Sign in with Google');
      gbtn.firstChild.replaceWith(acSvg(AC_G, 'acct-g-logo'));
      box.append(h('div', { class: 'acct-out' }, acStale ? h('p', { class: 'acct-err', role: 'status' }, 'Your sign-in has expired on this device. Sign in again to keep syncing. Your data is safe.') : null, gbtn, err));
      return;
    }
    const last = info.last ? 'Synced ' + new Date(info.last).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not synced yet';
    const state = acBusy ? 'Syncing…' : (acMsg || last);
    const rows = AC_CATS.map(c => {
      const cb = h('input', { type: 'checkbox', role: 'switch', onchange: e => { const i = acInfo(); if (!i) return; i.cats = Object.assign({}, i.cats, { [c[0]]: e.target.checked }); acSaveInfo(i); if (e.target.checked) acSync(false, true); } });
      cb.checked = !(info.cats && info.cats[c[0]] === false);
      return h('label', { class: 'acct-opt' }, h('span', {}, c[1]), cb, h('i', { class: 'acct-sw', 'aria-hidden': 'true' }));
    });
    const av = info.photo ? h('img', { class: 'acct-av', src: info.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'acct-av' }, (info.name || info.email || '?').slice(0, 1).toUpperCase());
    const syncBtn = () => { if (!acUser) acLoad().then(() => acSync(true, true)).catch(e => { acErr = acNice(e); renderAcctSync(); }); else acSync(true, true); };
    box.append(h('div', { class: 'acct-sync' },
      h('div', { class: 'acct-head' }, av,
        h('span', { class: 'acct-who' }, h('strong', {}, info.name || 'Signed in'), h('small', {}, info.email), h('em', {}, 'Signed in with Google'))),
      h('p', { class: 'acct-state' + (acBusy ? ' busy' : '') }, h('i', {}), state),
      h('div', { class: 'acct-btns' },
        h('button', { class: 'btn', type: 'button', onclick: syncBtn }, 'Sync now'),
        h('button', { class: 'btn ghost', type: 'button', onclick: acSignOut }, 'Sign out')),
      err,
      h('details', { class: 'acct-more' }, h('summary', {}, 'What to sync'),
        h('div', { class: 'acct-opts' }, rows))));
  }
  /* shows who is signed in: a green dot on the Account tab, and the line under the Account title */
  function acTabMark() {
    const i = acInfo(), t = document.querySelector('.tab[data-tab="account"]');
    if (t) t.classList.toggle('signed', !!i && !acStale);
    const p = document.querySelector('#account .tab-head p');
    if (p) p.textContent = i && !acStale ? 'Signed in as ' + (i.email || i.name) : 'Your library, settings and progress. Sign in to sync them across devices.';
    acAvatar(i && !acStale ? i : null);
  }
  /* the round account button (the Library header and the slim bar on the other screens, both `.sb-avatar`): photo, else the first letter of the name or email, else a person icon (signed out). Tapping it opens the Account tab. */
  function acAvatar(i) {
    document.querySelectorAll('.sb-avatar').forEach(b => {
      const ic = b.querySelector('.ic'), ini = b.querySelector('.sb-ini'), img = b.querySelector('.sb-img');
      const who = i ? String(i.name || i.email || '').trim() : '';
      const letter = who ? Array.from(who)[0].toUpperCase() : '';
      ini.textContent = letter; ini.hidden = !letter || !!(i && i.photo);
      ic.style.display = letter ? 'none' : '';
      if (i && i.photo) { if (img.getAttribute('src') !== i.photo) { img.onerror = () => { img.hidden = true; ini.hidden = !letter; ic.style.display = letter ? 'none' : ''; }; img.src = i.photo; } img.hidden = false; ic.style.display = 'none'; }
      else { img.hidden = true; img.removeAttribute('src'); }
      b.classList.toggle('signed', !!i);
      b.setAttribute('aria-label', i ? 'Account: ' + (i.email || i.name) : 'Account: sign in');
    });
  }
  document.querySelectorAll('.sb-avatar').forEach(b => b.addEventListener('click', () => { const t = document.querySelector('.tab[data-tab="account"]'); if (t) t.click(); }));
  acTabMark();

  /* start: signed-in users reconnect a few seconds after the app opens; guests never download the sign-in code */
  setTimeout(() => { if (acInfo()) acLoad().catch(() => { acMsg = 'Offline. Changes will sync when you are back online.'; }); }, 2500);
  window.addEventListener('online', () => { if (acInfo()) acLoad().then(() => acPush()).catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && acInfo()) { clearTimeout(acTimer); acPush().catch(() => {}); acFlush(); } });
  window.addEventListener('pagehide', () => { if (acInfo()) acPush().catch(() => {}); });
