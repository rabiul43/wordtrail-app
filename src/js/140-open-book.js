  /* ---------- opening a book ---------- */
  function updateHeader() {
    if (!S.book) return;
    nrHead();
    el.title.textContent = S.book.title;
    { const pt = $('#ptitle'); if (pt) { const au = String(S.book.authors || '').trim(); pt.firstChild.textContent = S.book.title; pt.lastChild.textContent = /^unknown/i.test(au) ? '' : au; } }   // title and author under the cover
    const pc = $('#pcover');
    if (pc && pc._wtId !== S.book.id) { pc._wtId = S.book.id; pc.textContent = ''; pc.append(coverBox(S.book, 'pcover-bg'), h('div', { class: 'pcover-poster' }, coverBox(S.book, 'pcover-art'))); }
    const t = S.secs[S.sec];
    el.sub.textContent = 'Track ' + (S.sec + 1) + ' of ' + S.secs.length + (S.model && S.plan[S.sec] && !S.plan[S.sec].ids.length && !trkLoading(S.sec) ? ' · no text' : '') + (S.bgTrack === S.sec ? ' · syncing' : '') + dlNote() + (S.syncWatch === S.book.id && S.syncText ? ' · ' + S.syncText : '') + ' · ' + S.book.authors;
    updateSyncUI(); verChip(); paintBookProg();
    if (S._miniBook !== S.book.id) { S._miniBook = S.book.id; setMini(false); } // each book opens with the full controls
    { const nt = $('#b-nexttrack'); if (nt) nt.disabled = S.sec >= S.secs.length - 1; }
    document.title = t ? t.title + ' · ' + S.book.title + ' · Wordtrail' : 'Wordtrail';
  }
  function prefetchText(b) {
    const saved = store.get('wt:book:' + b.id, null) || {};
    if (saved.text && saved.text.kind === 'file') return;
    (async () => {
      try {
        const st = saved.text;
        const id = st && st.kind === 'gutenberg' ? st.id : (await findGutenbergFor(b)).id;
        await getGutenberg(id);
      } catch (e) { /* attachText will retry and report */ }
    })();
  }
  /* While a book's track list is still loading, S.book is still the book that was open before. The player must not show that old
     book's cover, title, times and progress under the new book's name, so the new book's own details are painted at once
     (updateHeader() takes over when the book is ready, or puts the old book back if opening fails). */
  function openingIdentity(b) {
    try {
      const pt = $('#ptitle'), pc = $('#pcover');
      if (pt) { const au = String(b.authors || '').trim(); pt.firstChild.textContent = b.title || ''; pt.lastChild.textContent = /^unknown/i.test(au) ? '' : au; }
      if (pc && pc._wtId !== b.id) { pc._wtId = b.id; pc.textContent = ''; pc.append(coverBox(b, 'pcover-bg'), h('div', { class: 'pcover-poster' }, coverBox(b, 'pcover-art'))); }
      if (nrEl.title) nrEl.title.textContent = b.title || '';
      el.cur.textContent = '0:00'; el.left.textContent = '-0:00'; el.seek.value = 0; el.seek.style.setProperty('--fill', '0%');
      ['#book-prog', '#nr-bp', '#trk-sum'].forEach(q => { const x = $(q); if (x) x.hidden = true; });
      document.title = (b.title || 'Wordtrail') + ' \u00b7 Wordtrail';
    } catch (e) { /* cosmetic: the header above still names the right book */ }
  }
  let openSeq = 0;   // each openBook() takes a number; one that is no longer the newest stops when it wakes up (a slow book must not take over the player from a book opened after it)
  let listing = false, listingId = null, listingAt = 0;   // listingAt: a stuck request must never block the Listen button for good
  async function openBook(b, opts) {   // opts.play: start the narration as soon as the book opens (the Listen button)
    if (offBlock(b)) return;
    const autoplay = !!(opts && opts.play === true);
    RC.prev = ((P.recents || []).find(r => String(r.id) === String(b.id)) || {}).ts || 0;   // last listened, read before persist() stamps it
    if (listing && !b.secs.length && String(listingId) === String(b.id) && Date.now() - listingAt < 25000) return;   // same book already loading: ignore the double tap (but only for 25 s)
    if (DET.book && String(DET.book.id) !== String(b.id)) { DET.book = null; DET.author = null; DET.rv = false; DET.stack = []; $('#detail').textContent = ''; }
    else if (DET.book) DET.stale = true;
    const asked = b, seq = ++openSeq;
    warmParsed(b.id); // start reading the saved book text now, in parallel with everything below
    let failure = null;
    if (!b.secs.length) { const c = await idb.get('b:' + b.id); if (c && c.secs && c.secs.length) b = c; }
    if (!b.secs.length) {
      // Show the player straight away; the track list and the text load behind it.
      listing = true; listingId = b.id; listingAt = Date.now();
      try {
        startOpen(b.title, false);
        audio.pause();
        el.title.textContent = b.title; el.sub.textContent = b.authors || '';
        openingIdentity(b);
        el.page.textContent = ''; el.page.append(loadingNote());
        showView('player');
        const fp = fetchFull(b); // first: it registers the combined request that prefetchText then reuses
        try { prefetchText(b); } catch (e) { /* the text is fetched again later */ }
        const lim = new Promise((_, rej) => setTimeout(() => rej(new Error('The track list took too long')), 30000));
        try { const full = await Promise.race([fp, lim]); if (full) b = full; } catch (e) { failure = e; }
      } catch (e) { failure = e; }
      finally { if (seq === openSeq) listing = false; }
    } else if (!OP.active) startOpen(b.title, false);
    if (seq !== openSeq) return;   // another book was opened while this one loaded: it owns the player now
    if (!b.secs.length) {
      endOpen(); showView('home'); restoreBack();
      if (S.book) { try { updateHeader(); updateSeekUI(audio.currentTime || 0); } catch (e) { /* the previous book's screen is repainted when it is opened again */ } }   // the player went back to the book that was open before
      if (failure) {
        setStatus('Could not load the tracks for "' + asked.title + '".', 'error', ['Try again', () => openBook(asked)]);
        toast('Could not load the tracks. Check your connection and try again.', 4500);
      } else { setStatus(''); toast('LibriVox lists no playable tracks for this recording.', 4500); }
      return;
    }
    let saved = await loadSaved(b.id);
    if (VER.carry) saved = verApply(saved, b);
    await Promise.race([Promise.all([loadCuts(), loadExtras(b)]), new Promise(r => setTimeout(r, 2500))]);
    await dlReady; // which tracks are saved on this device; the first one's blob URL is made before it is needed
    if (seq !== openSeq) return;
    if (OFF.on && b.secs.length) {   // offline with chapters missing: start at the first saved one at or after the saved position (else the nearest earlier one)
      const at = Math.min(Math.max(0, saved.sec || 0), b.secs.length - 1);
      if (!offTrackOn(b, at)) {
        let j = offNearSaved(b, at, 1); if (j < 0) j = offNearSaved(b, at, -1);
        if (j >= 0) { saved = Object.assign({}, saved, { sec: j, time: 0 }); toast('Chapter ' + (at + 1) + ' is not on this device. Starting at chapter ' + (j + 1) + '.', 4500); }
      }
    }
    const first = Math.min(Math.max(0, saved.sec || 0), b.secs.length - 1);
    if (isLocal(b.id, first, b.secs[first].url)) await warmUrl(b.id, first);
    OP.home = false; progress(false); setStatus('');
    audio.pause();
    dlClearUrls(dlKey(b.id, first));
    hideDlHint(); // new book — clear any previous download nudge
    S.book = b; S.secs = b.secs; S.durs = b.secs.map(s => s.dur); try { bspdApply(b); } catch (e) { /* speed stays as it is */ } try { clStop(); CL.ed = null; clPaintCount(); } catch (e) { /* clips not ready yet */ }
    setReaderLang(b.lang);
    S.sec = Math.min(Math.max(0, saved.sec || 0), S.secs.length - 1);
    S.anchors = saved.anchors || {}; S.ranges = saved.ranges || {}; S.autoSrc = saved.auto || {};
    S.lead = typeof saved.lead === 'number' && saved.lead !== 12 ? saved.lead : null; // null = estimate from the spoken LibriVox notice
    S.outro = typeof saved.outro === 'number' ? saved.outro : 5;
    S.autoTried = new Set(); S.alignFailed = new Set(); job.q = []; S.model = null; S.plan = []; S.mode = 'chapter'; S.map = []; S.span = []; S.textSrc = null; S.note = null; S.timings = null; S.tdone = new Map(); S.tstat = {}; S.wordT = {}; S.skip = {}; S.edge = {}; S.nn = null; S.merged = null; S.mergedBad = false; S.tPending = false; TM.fail = ''; S.heavyBlob = ''; S.sharing = false; driftReset(); fetchTimings(b);
    S.seg = {}; S.ainfo = {}; S.refining = false; S.undo = null;
    S.lp = store.get('wt:lp:' + b.id, {}) || {}; S.lpLast = null; S.lpSaved = 0;
    S.calibrate = false; syncCalUI();
    S.playWhenReady = false;
    showView('player');
    rememberOpen(b);
    try { osArm(b, saved); } catch (e) { /* the opening sound is optional */ }   // before loadAudio: its first play() may need to wait for the opening
    loadAudio(S.sec, resumeBack(b, saved.time || 0), autoplay);
    persist();
    attachText(saved);
  }
  function noteNode(msg, actions, detail) {
    return h('div', { class: 'note wt-ui' }, h('strong', {}, msg), actions && actions.length ? h('div', { class: 'row note-act', style: 'justify-content:center' }, actions.map(([label, fn], i) => h('button', { class: i ? 'note-link' : 'btn small', type: 'button', onclick: fn }, label))) : null, detail ? h('details', { class: 'note-d' }, h('summary', {}, 'Details'), h('small', { style: 'overflow-wrap:anywhere' }, String(detail).slice(0, 220))) : null);
  }
  /* ---------- parsed-book cache ----------
     Splitting a whole book into chapters and sentences takes a moment, and the result never changes for
     the same text. It is kept in IndexedDB (key: parser version + text source), so reopening a book
     skips both the parsing and, for Project Gutenberg texts, even reading the raw text back.
     Raise PARSE_V whenever Core.parseBook, splitSentences or spokenCost change, so old copies are ignored. */
  const PARSE_V = 1;
  function parsedKey(src, raw) {
    if (!src) return null;
    if (src.kind === 'gutenberg' && src.id) return 'p:' + PARSE_V + ':g:' + src.id;
    if (src.kind === 'file' && raw) { // an own text: length plus a few dozen sampled characters
      let hsh = 2166136261;
      const step = Math.max(1, Math.floor(raw.length / 64));
      for (let i = 0; i < raw.length; i += step) { hsh ^= raw.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
      return 'p:' + PARSE_V + ':f:' + raw.length + ':' + hsh.toString(36);
    }
    return null;
  }
  const preParse = new Map();
  function warmParsed(id) {
    try {
      preParse.clear();
      const st = (store.get('wt:book:' + id, null) || {}).text, key = st && st.kind === 'gutenberg' && st.id ? parsedKey(st) : null;
      if (key) preParse.set(key, readParsed(key));
    } catch (e) { /* nothing saved yet */ }
  }
  async function loadParsed(key) {
    if (!key) return null;
    const pre = preParse.get(key);
    if (pre) { preParse.delete(key); return pre; }
    return readParsed(key);
  }
  async function readParsed(key) {
    const c = await idb.get(key);
    const ok = c && c.v === PARSE_V && Array.isArray(c.sents) && c.sents.length && Array.isArray(c.chapters) && c.chapters.length
      && c.sents[0] && typeof c.sents[0].t === 'string' && c.chapters[c.chapters.length - 1].end === c.sents.length;
    return ok ? { sents: c.sents, chapters: c.chapters } : null;
  }
  /* ---------- Step 3: the text from archive.org, only when the person taps for it ----------
     LibriVox's archive.org text links are sometimes wrong (another issue, or a book holding several plays), so nothing from
     archive.org is ever loaded by itself. The tap downloads <id>_djvu.txt, archiveCheck() looks at it first, and only a text
     that passes is loaded, like an own text, with a note on the page. */
  const openLink = u => { try { window.open(u, '_blank', 'noopener'); } catch (x) { /* blocked: nothing to do */ } };
  function archiveIdOf(link) {
    const m = String(link || '').match(/^https?:\/\/(?:www\.)?archive\.org\/(?:details|stream|download)\/([^\/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  }
  /* The buttons of the "not on Gutenberg" card, in the order they are shown. */
  function noTextActions(link, aid) {
    return [].concat(link ? [['Open the text source', () => openLink(link)]] : [],
      aid ? [['Try the text from archive.org', () => tryArchiveText(link, aid)]] : [],
      [['Use my own text', () => openSheet('sheet-text')]]);
  }
  /* Looks at a downloaded archive.org text before it is used. Returns { ok: true } or { ok: false, why } with a plain sentence. */
  function archiveCheck(raw, book) {
    const t = String(raw || ''), b = book || {};
    const no = why => ({ ok: false, why: 'The archive.org text wasn\'t used: ' + why });
    if (/^\s*<(!doctype|html)/i.test(t)) return no('archive.org sent back a web page, not a book.');
    if (t.length < 8000) return no('it is far too short to be a book.');
    // Readable: mostly letters, and mostly real-looking words.
    const sample = t.slice(0, 200000), toks = sample.split(/\s+/).filter(Boolean);
    const plainCh = (sample.match(/[\p{L}\p{N}\s.,;:!?'"“”‘’()\-—_]/gu) || []).length / sample.length;
    const wordLike = toks.filter(w => /^\p{L}+(?:['’-]\p{L}+)*$/u.test(w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))).length / (toks.length || 1);
    if (plainCh < 0.9 || wordLike < 0.75) return no('it is mostly unreadable scan errors.');
    if (!b.lang || /^en/i.test(b.lang)) {   // English prose is full of these little words; scan garbage and other languages are not
      const stop = new Set('the and of to a in that was he it is with as his for had you her but not be at on by this which from she they have were'.split(' '));
      const share = toks.filter(w => stop.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length / (toks.length || 1);
      if (share < 0.12) return no('it is mostly unreadable scan errors, or not in English.');
    }
    // The title or the author must show near the start.
    const head = ' ' + t.slice(0, 8000).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    const skip = new Set('the and for with from his her its vol volume part book dramatic reading version complete illustrated'.split(' '));
    const tw = (Core.gutTitle(b.title || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !skip.has(w));
    const titleHit = tw.length > 0 && tw.filter(w => head.includes(' ' + w)).length >= Math.ceil(tw.length * 0.6);
    const last = String(b.authorLast || '').toLowerCase().replace(/[^a-z]/g, '');
    const authorHit = last.length >= 3 && head.includes(' ' + last);
    if (!titleHit && !authorHit) return no('the title and author don\'t appear at its start, so it may be a different book.');
    // A dated issue (a magazine): its month and year must show near the start, or it is another issue.
    const mon = (String(b.title || '').toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/) || [])[1];
    const yr = (String(b.title || '').match(/\b(1[89]\d\d|20\d\d)\b/) || [])[1];
    if (mon && yr && !(head.includes(' ' + mon + ' ') && head.includes(' ' + yr + ' '))) return no('it doesn\'t mention this issue\'s month and year, so it may be a different issue.');
    // About as long as the recording (about 150 words a minute); far longer means other books or plays are inside.
    if (+b.total >= 600) {
      const ratio = toks.length === 0 ? 0 : t.split(/\s+/).filter(Boolean).length / (b.total / 60 * 150);
      if (ratio > 2.5) return no('it is much longer than this recording, so it probably holds other books or plays too.');
      if (ratio < 0.25) return no('it is much shorter than this recording.');
    }
    return { ok: true };
  }
  async function tryArchiveText(link, aid) {
    const book = S.book, tok = ++S.textToken;
    const show = (msg, acts) => { if (tok !== S.textToken || S.book !== book) return false; S.note = noteNode(msg, acts); renderSection(S.sec); return true; };
    show('Downloading the text from archive.org…', null);
    let raw;
    try { raw = await fetchVia('https://archive.org/download/' + encodeURIComponent(aid) + '/' + encodeURIComponent(aid) + '_djvu.txt', r => r.text(), 45000); }
    catch (e) {
      if (e && e.message === 'HTTP 404') show('archive.org has no plain text file for this item.', noTextActions(link, ''));
      else show('Couldn\'t download the text from archive.org. Check your connection.', [['Try again', () => tryArchiveText(link, aid)]].concat(link ? [['Open the text source', () => openLink(link)]] : [], [['Use my own text', () => openSheet('sheet-text')]]));
      return;
    }
    if (tok !== S.textToken || S.book !== book) return;
    const v = archiveCheck(raw, book);
    if (!v.ok) { show(v.why, noTextActions(link, '')); return; }   // refused: no archive button again, the other choices stay
    try { await useRaw(String(raw).replace(/\r\n?/g, '\n'), { kind: 'file', label: 'Text from archive.org', from: 'archive.org', ref: aid }); }
    catch (e) { console.error('Wordtrail: archive.org text failed', e); show('The text downloaded but could not be processed.', noTextActions(link, '')); }
  }
  /* The note on the page for a text that came from archive.org (it comes back every time the book is opened). */
  function srcNoteNode() {
    return h('div', { class: 'note wt-ui', role: 'status', style: 'margin:.4rem auto;padding:.5rem .8rem' }, h('small', {}, 'Text from archive.org, may have errors'),
      h('button', { class: 'note-link', type: 'button', onclick: () => openSheet('sheet-text') }, 'Switch text'));
  }
  /* The text link LibriVox gives for a book (its "text source"), or ''.
     A book opened from LibriVox carries it as book.textUrl. The catalog keeps only Gutenberg links, so when it is missing the small
     details file (details/<id div 1000>.json, key "s") is asked, for at most 4 s. The answer is remembered for this visit. */
  const srcLinkMem = new Map();
  const httpsLink = u => { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u.replace(/^http:/i, 'https:') : ''; };
  async function textSourceLink(book) {
    const id = String((book && book.id) || '');
    const direct = httpsLink(book && book.textUrl);
    if (direct) return direct;
    if (!/^\d+$/.test(id)) return '';
    if (srcLinkMem.has(id)) return srcLinkMem.get(id);
    let link = '';
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetchText('details/' + Math.floor(+id / 1000) + '.json', ctl.signal);
      if (r) {
        const d = await r.json();
        let e = null;
        if (Array.isArray(d)) e = d.find(x => x && String(x.id) === id);
        else if (d && typeof d === 'object') e = d[id] !== undefined ? d[id] : (d.b && d.b[id] !== undefined ? d.b[id] : (d.books && d.books[id]));
        if (e && typeof e === 'object' && !Array.isArray(e)) link = httpsLink(e.s);
      }
    } catch (x) { /* no link: the card simply has no source button */ }
    finally { clearTimeout(to); }
    if (!ctl.signal.aborted) srcLinkMem.set(id, link);   // a timeout is not remembered, the next try may work
    return link;
  }
  /* ---------- Step 2: text made from the speech-recognition timing file ----------
     For a book whose text is not on Gutenberg, the timing file (the same "pack" the app already loads for synced books:
     tracks[i] = { u: audio url, w: recognized words as one string, t: a start time for every word }) holds what the narrator
     said. The book text is built from those words and shown with the word times in the file. Only used when a file exists. */
  const ASR_LABEL = 'Text made from speech recognition';
  const asrSent = /[.!?]["'”’)\]]*$/;
  const asrKey = u => String(u || '').split(/[?#]/)[0].split('/').pop().toLowerCase();   // the audio file name: the same recording has the same name
  const asrDur = w => Math.min(0.9, 0.12 + 0.055 * String(w).replace(/[^A-Za-z0-9]/g, '').length);
  /* One track: its words and start times -> paragraphs of text. a / o = seconds where the story starts and the outro begins
     (0 / null = keep everything). Adds full stops at pauses, a capital after each, and a new paragraph at long pauses.
     Clear slips only: a split "'S" is joined, LibriVox is spelled one way. Nothing is guessed or re-worded. */
  function asrTrackText(words, times, a, o) {
    const paras = [[]];
    let sinceEnd = 0, cap = true, prevT = -1, prevW = '', n = 0;
    for (let j = 0; j < words.length; j++) {
      const t = +times[j]; let w = String(words[j]).trim();
      if (!w || !isFinite(t)) continue;
      if (a > 0 && t < a - 0.05) continue;
      if (o != null && t >= o) continue;
      const cur = paras[paras.length - 1];
      if (cur.length && (/^[.,;:!?]+$/.test(w) || /^['’](?:s|t|d|ll|re|ve|m)$/i.test(w))) {   // a lone mark or "'S" belongs to the word before it
        cur[cur.length - 1] += w; prevW = cur[cur.length - 1];
        if (asrSent.test(prevW)) { cap = true; sinceEnd = 0; }
        continue;
      }
      if (/^lib\w{0,4}vox\w?(?=[.,;:!?]*$)/i.test(w)) w = 'LibriVox' + (w.match(/[.,;:!?]+$/) || [''])[0];
      if (cur.length) {
        const gap = t - prevT - asrDur(prevW), ends = asrSent.test(prevW);
        let brk = false;
        if (ends ? gap >= 1.6 : gap >= 2.2) brk = true;
        else if (!ends && ((gap >= 0.9 && sinceEnd >= 6) || (sinceEnd >= 40 && gap >= 0.4) || (sinceEnd >= 75 && gap >= 0.2) || sinceEnd >= 110)) { cur[cur.length - 1] = cur[cur.length - 1].replace(/[,;:]+$/, '') + '.'; cap = true; sinceEnd = 0; }
        if (brk) {
          if (!ends) cur[cur.length - 1] = cur[cur.length - 1].replace(/[,;:]+$/, '') + '.';
          paras.push([]); cap = true; sinceEnd = 0;
        }
      }
      if (cap) w = w.replace(/^(["'“‘(]*)([a-z])/, (m, q, c) => q + c.toUpperCase());
      cap = false;
      paras[paras.length - 1].push(w); prevT = t; prevW = w; sinceEnd++; n++;
      if (asrSent.test(w)) { cap = true; sinceEnd = 0; }
    }
    const last = paras[paras.length - 1];
    if (last.length && !asrSent.test(last[last.length - 1])) last[last.length - 1] = last[last.length - 1].replace(/[,;:]+$/, '') + '.';
    /* A spoken "Chapter eight." standing alone would become a chapter of its own and break the one-part-per-track layout:
       it stays in the text, joined to the paragraph that follows (or the one before, at the very end). */
    const ps = paras.filter(x => x.length).map(x => x.join(' ')), out = [];
    for (let k = 0; k < ps.length; k++) {
      let x = ps[k];
      while (k + 1 < ps.length && Core.isHeading(x)) x += ' ' + ps[++k];
      if (out.length && k === ps.length - 1 && Core.isHeading(x)) out[out.length - 1] += ' ' + x; else out.push(x);
    }
    return { text: out.join('\n\n'), n };
  }
  /* The timing-file entry that belongs to track i, or null. It must be the same audio file, and its times must fit the track length. */
  function asrTrackFor(sec, i, tracks) {
    const key = asrKey(sec.url);
    let tr = null;
    for (const k of Object.keys(tracks || {})) { const x = tracks[k]; if (x && x.u && asrKey(x.u) === key) { tr = x; break; } }
    if (!tr && tracks && tracks[i] && !tracks[i].u) tr = tracks[i];
    if (!tr) return null;
    const w = String(tr.w || '').split(' '), T = tr.t;
    if (!Array.isArray(T) || w.length < 20 || w.length !== T.length) return null;
    const end = +T[T.length - 1];
    if (!(end > 0) || (sec.dur > 0 && end > sec.dur + 30)) return null;   // times that run past the recording: a different recording
    return { w, T };
  }
  /* Whole book: one "Track N" heading per track that has words, then its text. cutOf(i) -> [introEnd, outroStart]. Returns
     { raw, idx (track numbers that got text), words } or null when there is too little to read. */
  function asrBuild(secs, tracks, cutOf) {
    const parts = [], idx = []; let words = 0;
    secs.forEach((sec, i) => {
      const x = asrTrackFor(sec, i, tracks); if (!x) return;
      let c = [0, null]; try { c = cutOf ? cutOf(i, x) || c : c; } catch (e) { /* keep everything */ }
      const r = asrTrackText(x.w, x.T, c[0] > 0 ? c[0] : 0, c[1] > 0 ? c[1] : null);
      if (r.n < 20) return;
      parts.push('Track ' + (i + 1) + '\n\n' + r.text); idx.push(i); words += r.n;
    });
    return words >= 300 ? { raw: parts.join('\n\n'), idx, words } : null;
  }
  /* The intro/outro cut of a track, from the notice engine (265). Only trusted finds are used; a weak find keeps the words. */
  function asrCutFor(i) {
    try {
      const W = neTimingWords(i); if (!W) return [0, null];
      const sec = S.secs[i], dur = S.durs[i] || (sec && sec.dur) || 0;
      const ri = neFindIntro(W.filter(x => x.s < 160), null), ro = dur ? neFindOutro(W.filter(x => x.s > dur - 140), dur) : { o: null, c: 'n' };
      return [ri.c === 'h' ? ri.a : 0, ro.c === 'h' ? ro.o : null];
    } catch (e) { return [0, null]; }
  }
  /* Called after the "not on Gutenberg" card is shown. Waits (quietly) for the timing file. Returns true when the text was made, false when
     there is no file or no usable words (nothing changes), null when the person moved on meanwhile. */
  async function tryAsrText(token) {
    const b = S.book, t0 = Date.now();
    const gone = () => S.book !== b || token !== S.textToken || !!S.model;
    while (!gone() && S.timingWait && !(S.timings && S.timings.tracks && Object.keys(S.timings.tracks).length) && Date.now() - t0 < 40000) await new Promise(r => setTimeout(r, 300));
    if (gone()) return null;
    const tracks = S.timings && S.timings.tracks;
    if (!tracks || !Object.keys(tracks).length) return false;   // no file (404): the card stays as it is
    const built = asrBuild(S.secs, tracks, asrCutFor);
    if (!built) return false;
    const src = { kind: 'file', label: ASR_LABEL, asr: 1 };
    try { await idb.set('f:' + b.id, built.raw); } catch (e) { return false; }
    const fresh = await BG.call('parseBook', [built.raw]).catch(() => null);
    if (gone()) return null;
    applyText(built.raw, src, {}, null, fresh);
    /* Every track with words starts at its own "Track N" heading; the chapters up to the next such heading belong to it. */
    const ch = S.model.chapters, pos = built.idx.map(ti => ch.findIndex(c => !c.front && c.title === 'Track ' + (ti + 1)));
    if (pos.every(x => x >= 0)) {
      S.mode = 'chapter'; S.map = S.secs.map(() => -1); S.span = S.map.slice();
      built.idx.forEach((ti, k) => { S.map[ti] = pos[k]; S.span[ti] = k + 1 < pos.length ? pos[k + 1] - 1 : ch.length - 1; });
      S.anchors = {}; S.ranges = {}; S.autoSrc = {}; S.skip = {}; S.edge = {};
      replan(true); persist();
    }
    endOpen();
    return true;
  }
  function asrBanner() {
    const row = h('div', { class: 'row note-act', style: 'justify-content:center' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => openSheet('sheet-text') }, 'Choose another text'));
    const box = h('div', { class: 'note wt-ui asr-note', role: 'note', style: 'margin-bottom:.8rem' }, h('strong', {}, 'Text made from speech recognition, may have errors.'), row);
    textSourceLink(S.book).then(link => { if (link && box.isConnected) row.append(h('button', { class: 'note-link', type: 'button', onclick: () => { try { window.open(link, '_blank', 'noopener'); } catch (x) { /* blocked */ } } }, 'Open the text source')); });
    return box;
  }
  async function attachText(saved) {
    const token = ++S.textToken;
    if (!OP.active) startOpen(S.book.title, false);
    const note = (msg, actions, detail) => { if (token !== S.textToken) return; endOpen(); S.note = noteNode(msg, actions, detail); renderSection(S.sec); };
    S.note = loadingNote(); renderSection(S.sec);
    const dl = ev => {
      if (token !== S.textToken) return;
      if (ev.type === 'cached') setOpen(0.85, 'dl', 'already on this device');
      else if (ev.type === 'try') setOpen(0.35, 'dl', ev.i > 0 ? 'trying another copy' : '', true);
      else {
        const frac = ev.total ? Math.min(1, ev.n / ev.total) : ev.n / (ev.n + 800000) * 0.95;
        setOpen(0.35 + 0.5 * frac, 'dl', mb(ev.n) + (ev.total ? ' of ' + mb(ev.total) : ''));
      }
    };
    let raw, src, parsed = null;
    try {
      const st = saved && saved.text;
      if (st && st.kind === 'gutenberg') { parsed = await loadParsed(parsedKey(st)); if (parsed) src = st; } // saved parse: no download, no raw text, no parsing
      if (!parsed && st && st.kind === 'file') { setOpen(0.35, 'dl', '', true); raw = await idb.get('f:' + S.book.id); src = st; }
      else if (!parsed && st && st.kind === 'gutenberg') { setOpen(0.35, 'dl', '', true); raw = await getGutenberg(st.id, dl); src = st; }
      if (!raw && !parsed) {
        setOpen(0.27, 'find', '', true);
        const g = await findGutenbergFor(S.book);
        src = { kind: 'gutenberg', id: g.id, label: g.label };
        parsed = await loadParsed(parsedKey(src));
        if (!parsed) { setOpen(0.35, 'dl', '', true); raw = await getGutenberg(g.id, dl); }
      }
      if (raw && !parsed) parsed = await loadParsed(parsedKey(src, raw)); // an own text, or a text first met here
    } catch (e) {
      if (e && e.noGutenberg) {   // not a failure: this recording's text is simply not on Project Gutenberg
        console.info('Wordtrail: no Gutenberg text for this book');
        const link = await textSourceLink(S.book);
        if (token !== S.textToken) return;
        const msg = 'This recording\'s text isn\'t on Project Gutenberg. You can still listen.', aid = archiveIdOf(link), bk = S.book;
        note(msg, noTextActions(link, ''));   // no archive.org button yet: it is offered only once we know there is no timing-file text
        const again = () => { if (aid && token === S.textToken && S.book === bk && !S.model) note(msg, noTextActions(link, aid)); };
        tryAsrText(token).then(made => { if (made === false) again(); }, again);
        return;
      }
      console.error('Wordtrail: text download failed', e);
      note('Couldn\'t load the book text. You can still listen.', [['Retry', () => attachText(saved)], ['Use my own text', () => openSheet('sheet-text')]], e && e.message);   // a real network problem: Retry makes sense here
      return;
    }
    if (token !== S.textToken) return;
    setOpen(0.88, 'prep', parsed ? 'from the saved copy' : '', true);
    let fresh = null;
    if (!parsed) {   // the parse runs in the background worker (same Core code); if the worker is off or fails, BG.call runs it here as before
      await new Promise(r => setTimeout(r, 40));   // lets the progress bar paint first
      if (token !== S.textToken) return;
      try { fresh = await BG.call('parseBook', [raw]); } catch (e) { fresh = null; }
      if (token !== S.textToken) return;
    }
    try {
      applyText(raw, src, saved || {}, parsed, fresh);
      endOpen();
    } catch (e) {
      console.error('Wordtrail: text processing failed', e);
      note('The text downloaded but could not be processed.', [['Use my own text', () => openSheet('sheet-text')]], e && e.message);
    }
  }
  function applyText(raw, src, saved, parsed, fresh) {   // fresh: a model already parsed in the worker
    S.textSrc = src;
    if (parsed) S.model = parsed;
    else {
      S.model = fresh || Core.parseBook(raw);
      const key = parsedKey(src, raw);
      if (key && !(src && src.kind === 'gutenberg' && textUnverified.has(String(src.id)))) idb.set(key, { v: PARSE_V, sents: S.model.sents, chapters: S.model.chapters });   // a text that did not look like a Gutenberg book is not kept
    }
    driftReset(); S.note = null; S.autoTried = new Set(); S.alignFailed = new Set(); job.q = [];
    const dm = Core.defaultMap(S.model.chapters, S.secs);
    const same = saved.text && JSON.stringify(saved.text) === JSON.stringify(src);
    // Saves from before chapter numbers and ranges were read (mv < 2) that fell back to
    // 'continuous' are rebuilt; they started the text at the wrong chapter.
    const keep = same && Array.isArray(saved.map) && saved.map.length === S.secs.length && saved.mode && (saved.mv === MAP_VERSION || saved.mode === 'chapter');
    if (keep) { S.mode = saved.mode; S.map = saved.map; S.span = Array.isArray(saved.span) && saved.span.length === S.secs.length ? saved.span : saved.map.slice(); }
    else {
      S.mode = dm.mode; S.map = dm.map; S.span = dm.span; S.anchors = {}; S.ranges = {}; S.autoSrc = {}; S.skip = {}; S.edge = {};
    }
    replan(true); updateHeader(); persist();
    /* The last-read page is on screen now. Fitting the saved or shared sync to it can take a moment,
       so that runs after the first paint (fetchTimings waits for it through S.tPending). */
    const bk = S.book, md = S.model;
    S.tPending = true;
    afterPaint(() => { if (S.book !== bk || S.model !== md) return; try { applyTimings(); } finally { S.tPending = false; }
      const cp = S.plan[S.sec]; if (!cp || !cp.ids.length) renderSection(S.sec); if (!bmGoPending()) rcReturn(); });
  }
  function trkLoading(i) { return !!(S.timingWait || S.tPending || S.bgTrack === i); }
  /* What the wait is for, in plain words, so a reader can tell a normal wait from a failure. */
  function tmText(i) {
    if (S.bgTrack === i) return 'Aligning the audio\u2026';
    if (S.tPending) return 'Fitting the timing to the text\u2026';
    if (S.timingWait) return 'Checking the shared timing\u2026';
    return 'Preparing the text\u2026';
  }
  function retryTiming() {
    const b = S.book; if (!b) return;
    TM.fail = ''; fetchTimings(b); renderSection(S.sec);
  }
  function tmWaitNode(i) {
    clearInterval(TM.iv);
    const t0 = Date.now();
    const head = h('strong', {}, 'Finding this track\u2019s text\u2026'), line = h('small', {}), act = h('div', { class: 'row', style: 'justify-content:center', hidden: true });
    act.append(h('button', { class: 'btn small ghost', type: 'button', onclick: retryTiming }, 'Try again'));
    const box = h('div', { class: 'note', role: 'status' }, h('div', {}, h('span', { class: 'wt-spin', 'aria-hidden': 'true' }), head), line, act);
    const paint = first => {
      if (!first && (!box.isConnected || !S.book || S.sec !== i)) { clearInterval(TM.iv); return; }
      if (!first && !trkLoading(i)) { clearInterval(TM.iv); renderSection(i); return; }
      const sec = Math.floor((Date.now() - t0) / 1000);
      const slow = S.timingWait && !S.tPending && S.bgTrack !== i && sec >= 30;
      head.textContent = slow ? 'Timing is slow to load' : 'Finding this track\u2019s text\u2026';
      line.textContent = slow ? 'Still trying to reach the timing (' + sec + 's). Try again, or keep waiting.'
        : tmText(i) + (sec >= 3 ? ' ' + sec + 's' : '') + (sec >= 12 ? ' \u00b7 slow connections can take a minute' : '');
      act.hidden = !slow;
    };
    paint(true); TM.iv = setInterval(paint, 1000);
    return box;
  }

  /* ---------- plan + reader ---------- */
  /* ---------- intro/outro cuts: cuts.json (built by wt_cuts.py) gives the exact end of the spoken intro and start of the outro ---------- */
  const CUTS = { d: null, p: null };
  function loadCuts() {
    return CUTS.p || (CUTS.p = (async () => {
      let c = store.get('wt:cuts', null);
      if (!(c && c.d && Date.now() - c.t < 6 * 3600e3)) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch('https://raw.githubusercontent.com/' + ghCfg().repo + '/main/cuts.json', { signal: ctl.signal }); clearTimeout(to);
          if (r.ok) { const j = await r.json(); if (j && j.v === 1 && j.b) { c = { t: Date.now(), d: { v: 1, b: j.b } }; store.set('wt:cuts', c); } }
        } catch (e) { /* missing or offline: use the saved copy, or behave as before */ }
      }
      CUTS.d = c && c.d ? c.d : null;
      if (CUTS.d && S.book && S.model) replan(false);
    })());
  }
  /* ---------- extras: skip list per book, made by wt_extras.py from the timing pack (extras/extras-<id>.json on Hugging Face).
     Every book looks for the file. A book with no file (404) is remembered for a day. ---------- */
  const EX = S.EX = { id: null, d: null, p: null };
  function loadExtras(b) {
    const id = String(b && b.id || '');
    if (!id) { EX.id = id; EX.d = null; EX.p = null; return Promise.resolve(); }
    if (EX.id === id && EX.p) return EX.p;
    EX.id = id; EX.d = null;
    return EX.p = (async () => {
      let c = store.get('wt:ex:' + id, null);
      if (!(c && Date.now() - c.t < (c.d ? 600e3 : c.m ? 86400e3 : 0))) {
        try {
          const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch('https://huggingface.co/datasets/rabiul43/wordtrail-packs/resolve/main/extras/extras-' + encodeURIComponent(id) + '.json', { signal: ctl.signal }); clearTimeout(to);
          if (r.status === 404) { c = { t: Date.now(), m: 1, d: null }; store.set('wt:ex:' + id, c); }
          else if (r.ok) { const j = await r.json(); if (j && j.v === 1 && j.tracks) { c = { t: Date.now(), d: j.tracks }; store.set('wt:ex:' + id, c); } }
        } catch (e) { /* missing or offline: use the saved copy, or behave as before */ }
      }
      if (EX.id === id) EX.d = c && c.d ? c.d : null;
      if (EX.d && S.book && String(S.book.id) === id && S.model) replan(false);
    })();
  }
  function exTrack(i) {
    const x = EX.d && S.book && EX.id === String(S.book.id) ? EX.d[i] : null;
    return Array.isArray(x) ? x : null;
  }
  /* [introEnd, outroStart|null] from the extras file, or null when the file has nothing for this track. */
  function exCut(i) {
    if (P.skipExtras === false) return null;   // developer override
    const x = exTrack(i); if (!x) return null;
    let a = 0, o = null, hasHead = false;
    for (const c of x) {
      if (c[2] === 'head') { a = +c[1] || 0; hasHead = true; }   // c[1] is the end of the notice — always skip to here
      else if (c[2] === 'tail' && c[0] != null) o = +c[0];
    }
    if (!hasHead && o == null) return null;   // nothing useful
    return [a, o];
  }
  document.addEventListener('wt-exskip', () => { if (S.model) replan(false); });
  /* Where to jump when playback is inside a middle cut (or a head cut that keeps a spoken title), else null. */
  function exSkipTo(i, t) {
    if (P.skipCuts === false || P.skipExtras === false) return null;
    const x = exTrack(i); if (!x) return null;
    for (const c of x) {
      const mid = c[2] === 'mid' || (c[2] === 'head' && c[0] > 0);
      if (mid && c[1] != null && t >= c[0] - 0.05 && t < c[1] - 0.05) return +c[1];
    }
    return null;
  }
  /* [introEnd, outroStart|null] for a track, or null (then the fixed lead/outro apply). */
  function cutFor(i) {
    if (P.skipCuts === false || !S.book) return null;
    const b = CUTS.d && CUTS.d.b[S.book.id], e0 = b && b[i], e = exCut(i) || (Array.isArray(e0) ? e0 : neCut(i));   // cuts.json first, then what the notice engine heard (265-notice-engine.js)
    if (!Array.isArray(e)) return null;
    const d = S.durs[i] || 0;
    const fromExtras = e === exCut(i);   // extras values are already validated — trust them as-is
    let a = +e[0] || 0, o = e[1] == null ? null : +e[1];
    if (!fromExtras && !(a >= 0 && a < 90)) a = 0;   // clamp only non-extras estimates
    if (o != null && !(d > 0 && o > d * 0.75 && o < d)) o = null;
    return [a, o];
  }
  function rebuild() {
    if (!S.model) { S.plan = []; return; }
    /* Sentences the narrator did not read take no time in the plan, so the highlight never waits in them. */
    {
      const sents = S.model.sents, nn = new Set();
      for (const k of Object.keys(S.skip || {})) for (const r of S.skip[k] || []) for (let id = r[0]; id < r[1] && id < sents.length; id++) nn.add(id);
      const ed = S.edge || {};
      for (let i = 0; i + 1 < S.secs.length; i++) {
        const e = ed[i] && ed[i][1], l = ed[i + 1] && ed[i + 1][0];
        if (!e || !l) continue;
        const lo = Math.max(e[0], l[0]), hi = Math.min(e[1], l[1], sents.length);
        let words = 0; const ids = [];
        for (let id = lo; id < hi; id++) if (!sents[id].h) { ids.push(id); words += (sents[id].t.match(/\S+/g) || []).length; }
        if (words >= 10) for (const id of ids) nn.add(id);
      }
      for (const id of S.nn || []) if (!nn.has(id) && sents[id] && sents[id].cost0 != null) sents[id].cost = sents[id].cost0;
      for (const id of nn) { const x = sents[id]; if (x.cost0 == null) x.cost0 = x.cost; x.cost = 0; }
      S.nn = nn;
    }
    const intros = S.secs.map(sec => Core.introCost(S.book.title, S.book.authors, sec.title));
    S.plan = Core.buildPlan(S.model, S.durs, S.mode, S.map, S.anchors, S.lead, S.outro, S.span, intros, S.ranges, S.secs.map((_, i) => cutFor(i)));
    const n = S.model.sents.length;
    S.sentSec = new Int32Array(n).fill(-1); S.sentPos = new Int32Array(n).fill(-1);
    S.plan.forEach((p, i) => p.ids.forEach((id, k) => { S.sentSec[id] = i; S.sentPos[id] = k; }));
  }
  const sig = p => p ? p.ids.length + ':' + p.ids[0] + ':' + p.ids[p.ids.length - 1] : '';
  function afterPaint(fn) {
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 400); // a hidden tab does not run animation frames
  }
  function replan(forceRender) {
    const before = sig(S.plan[S.sec]);
    rebuild();
    if (forceRender || before !== sig(S.plan[S.sec])) renderSection(S.sec); else tick(true);
  }
  guideDoc('reading', 'Chapter summaries', "Long chapters start with a short Summary you can open. It is made on your phone from the chapter's own sentences.");
  /* ---------- free chapter summaries: picks the most representative sentences (no AI, runs on the phone) ---------- */
  const SUM_N = 3; // sentences per summary
  const SUM_STOP = new Set('the and but for with from that this these those they them their there then than have has had was were are been being will would could should said not you your his her its our who whom what when where which while into over under also very just upon about after before again some such only more most other any all can may might shall'.split(' '));
  function summarize(list, n) { return sumPick(list, n).join(' '); }
  function sumPick(list, n) {
    const keep = w => w.length > 2 && !SUM_STOP.has(w);
    const toks = s => (s.toLowerCase().match(/[a-z']+/g) || []).filter(keep);
    const freq = new Map(), rows = list.map(s => toks(s));
    rows.forEach(ws => ws.forEach(w => freq.set(w, (freq.get(w) || 0) + 1)));
    const scored = list.map((s, i) => {
      const ws = rows[i];
      if (ws.length < 7 || ws.length > 45) return { i, sc: -1 };
      let sc = 0; for (const w of ws) sc += freq.get(w);
      sc = sc / Math.pow(ws.length, .85);
      if (/^["\u201c\u2018]/.test(s) || /\b(said|asked|cried|replied)\b/i.test(s)) sc *= .6; // dialogue says little
      if (i === 0) sc *= 1.15;
      return { i, sc };
    }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i);
    return scored.map(x => list[x.i]);
  }
  function chapSummary(ci) {
    const m = S.model, c = m && m.chapters[ci];
    if (!c || c.front) return null;
    const cache = m.sum || (m.sum = {});
    if (!(ci in cache)) {
      const list = m.sents.slice(c.start, c.end).filter(s => !s.h).map(s => s.t);
      cache[ci] = list.length >= SUM_N + 3 && list.join(' ').split(/\s+/).length >= 200 ? summarize(list, SUM_N) : '';
    }
    return cache[ci] ? h('details', { class: 'sum' }, h('summary', { text: 'Summary' }), h('p', { text: cache[ci] })) : null;
  }

  guideDoc('words', 'Quick quiz', "Controls > Quick quiz tests you on the chapter you are in with fill-in-the-blank, who-said-it and sentence-order questions.");
  /* ================= Quick quiz (no AI: built from the chapter text by rules, on the device) =================
     Three kinds of question: a vocabulary word blanked out of its sentence, who said a quoted line, and
     putting consecutive sentences back in order. Best score per chapter is kept in localStorage. */
  const QZ = { qs: [], i: 0, score: 0, wrong: [], ci: -1, picks: [], done: false };
  const qzShuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const qzWords = s => s.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  const QZ_V = 'said|asked|cried|replied|answered|exclaimed|whispered|shouted|called|added|continued|observed|remarked|muttered|declared|returned|inquired|demanded|answered';
  const QZ_COMMON = /^(nothing|something|everything|anything|another|because|through|without|between|together|himself|herself|myself|itself|themselves|however|whether|always|perhaps|thought|getting|looking|nobody|everybody|started|whatever|certain)$/;
  const QZ_NOT_NAME = new Set('He She They It We You I The A An And But Then Now So Yes No Oh Well'.split(' '));
  const qzKey = ci => (S.book ? S.book.id : 'x') + ':' + ci;
  const qzBest = ci => { const o = store.get('wt:quiz', {}); return o[qzKey(ci)] || null; };
  function qzSaveBest(ci, sc, n) {
    const o = store.get('wt:quiz', {}), k = qzKey(ci), b = o[k];
    if (P.calm !== true && (!b || sc / n > b[0] / b[1])) { o[k] = [sc, n]; store.set('wt:quiz', o); }
  }
  function qzChapterSents(ci) {
    const m = S.model, c = m && m.chapters[ci];
    if (!c || c.front) return [];
    const out = [];
    for (let k = c.start; k < c.end; k++) if (!m.sents[k].h) out.push({ id: k, t: m.sents[k].t });
    return out;
  }
  function qzFill(sents, n) {
    const freq = new Map();
    sents.forEach(s => qzWords(s.t).forEach(w => { w = w.toLowerCase(); freq.set(w, (freq.get(w) || 0) + 1); }));
    const pool = [...freq.keys()].filter(w => /^[a-z]{5,12}$/.test(w) && !SUM_STOP.has(w));
    const cls = w => /ly$/.test(w) ? 'ly' : /ing$/.test(w) ? 'ing' : /ed$/.test(w) ? 'ed' : /(tion|sion)$/.test(w) ? 'tion' : /s$/.test(w) ? 's' : 'x';
    const cands = [], usedAns = new Set();
    for (const s of qzShuffle(sents)) {
      const ws = qzWords(s.t);
      if (ws.length < 8 || ws.length > 34) continue;
      const opts = ws.filter(w => /^[a-z]{7,}$/.test(w) && !SUM_STOP.has(w) && !QZ_COMMON.test(w) && freq.get(w) <= 2 && !usedAns.has(w));
      if (!opts.length) continue;
      const ans = opts[Math.floor(Math.random() * opts.length)];
      const inS = new Set(ws.map(w => w.toLowerCase()));
      const ds = pool.filter(w => w !== ans && !inS.has(w) && Math.abs(w.length - ans.length) <= 3)
        .map(w => [w, (cls(w) === cls(ans) ? 0 : 10) + Math.abs(w.length - ans.length) + Math.random() * 3]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(x => x[0]);
      if (ds.length < 3) continue;
      usedAns.add(ans);
      cands.push({ kind: 'fill', id: s.id, text: s.t.replace(new RegExp('\\b' + ans + '\\b'), '_____'), full: s.t, ans, opts: qzShuffle([ans, ...ds]) });
      if (cands.length >= n) break;
    }
    return cands;
  }
  function qzSpeakers(sents, n) {
    const found = [];
    const quoteA = new RegExp('[“"]([^”"]+)[”"]\\s*,?\\s*(?:(?:' + QZ_V + ')\\s+(?:the\\s+)?([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)|([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s+(?:' + QZ_V + '))\\b');
    const quoteB = new RegExp('\\b([A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s+(?:' + QZ_V + ')\\b[^“"]{0,24}[“"]([^”"]+)[”"]');
    for (const s of sents) {
      let m = s.t.match(quoteA), name, quote;
      if (m) { name = m[2] || m[3]; quote = m[1]; }
      else if ((m = s.t.match(quoteB))) { name = m[1]; quote = m[2]; }
      if (!name || QZ_NOT_NAME.has(name.split(' ')[0]) || qzWords(quote).length < 4) continue;
      found.push({ id: s.id, name, quote, full: s.t });
    }
    const names = [...new Set(found.map(f => f.name))];
    if (!found.length) return [];
    // filler names: capitalised words that are not at the start of a sentence
    const caps = new Map();
    sents.forEach(s => { const re = /[a-z,;]\s([A-Z][a-z]{2,})/g; let mm; while ((mm = re.exec(s.t))) { const w = mm[1]; if (!QZ_NOT_NAME.has(w)) caps.set(w, (caps.get(w) || 0) + 1); } });
    const fillers = [...caps.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const out = [], usedN = new Set();
    for (const f of qzShuffle(found)) {
      if (usedN.has(f.name) && out.length < names.length) continue;
      const others = qzShuffle(names.filter(x => x !== f.name)).concat(fillers.filter(x => x !== f.name && !names.some(n => n.split(' ').includes(x)))).slice(0, 3);
      if (others.length < 2) continue;
      usedN.add(f.name);
      out.push({ kind: 'who', id: f.id, quote: f.quote.length > 150 ? f.quote.slice(0, 147) + '…' : f.quote, full: f.full, ans: f.name, opts: qzShuffle([f.name, ...others]) });
      if (out.length >= n) break;
    }
    return out;
  }
  function qzOrder(sents, n) {
    const ok = s => { const w = qzWords(s.t).length; return w >= 4 && w <= 30; };
    const runs = [];
    for (let i = 0; i + 3 < sents.length; i++) {
      const r = sents.slice(i, i + 4);
      if (r.every(ok) && r.every((s, k) => k === 0 || s.id === r[k - 1].id + 1) && new Set(r.map(s => s.t)).size === 4) runs.push(i);
    }
    const out = [], used = [];
    for (const i of qzShuffle(runs)) {
      if (used.some(u => Math.abs(u - i) < 6)) continue;
      const r = sents.slice(i, i + 4);
      let sh = qzShuffle(r.map(s => s.t)), tries = 0;
      while (sh.every((t, k) => t === r[k].t) && tries++ < 8) sh = qzShuffle(sh);
      out.push({ kind: 'order', id: r[0].id, correct: r.map(s => s.t), items: sh });
      used.push(i);
      if (out.length >= n) break;
    }
    return out;
  }
  function qzBuild(ci) {
    const sents = qzChapterSents(ci);
    const A = qzFill(sents, 3), B = qzSpeakers(sents, 2), C = qzOrder(sents, 2), out = [];
    while (A.length || B.length || C.length) { if (A.length) out.push(A.shift()); if (B.length) out.push(B.shift()); if (C.length) out.push(C.shift()); }
    return out.slice(0, 8);
  }
  function quizCard(ci) {
    const c = S.model.chapters[ci];
    if (!c || c.front || c.end - c.start < 14) return null;
    const best = qzBest(ci);
    const calmQ = P.calm === true, go = h('button', { class: 'btn small', type: 'button', text: best && !calmQ ? 'Try again' : 'Start' });
    go.addEventListener('click', () => qzOpen(ci));
    return h('div', { class: 'qzc' }, h('div', {}, h('b', {}, 'Quick quiz'), h('span', {}, calmQ ? 'A few questions about this chapter, no score' : best ? 'Best so far: ' + best[0] + ' of ' + best[1] : 'Test yourself on this chapter')), go);
  }
  function qzOpen(ci) {
    if (!S.model) { toast('Open a book with text first.'); return; }
    if (ci == null) {
      const p = S.plan[S.sec];
      const id = S.curId >= 0 ? S.curId : (p && p.ids.length ? p.ids[0] : -1);
      ci = id >= 0 ? S.model.sents[id].ch : -1;
    }
    QZ.ci = ci; QZ.qs = ci >= 0 ? qzBuild(ci) : []; QZ.i = 0; QZ.score = 0; QZ.wrong = []; QZ.done = false;
    openSheet('sheet-quiz');
    qzRender();
  }
  function qzHear(q) {
    const sec = S.sentSec ? S.sentSec[q.id] : -1, p = S.plan[sec];
    if (sec !== S.sec || !p) return null;
    return h('button', { class: 'btn ghost small', type: 'button', text: '▶ Hear it in the audio', onclick: () => { seekAudio(sentTime(p, S.sentPos[q.id])); audio.play().catch(onPlayFail); } });
  }
  function qzRender() {
    const body = $('#qz-body'); body.textContent = '';
    const ch = QZ.ci >= 0 ? S.model.chapters[QZ.ci] : null;
    if (QZ.qs.length < 3) {
      body.append(h('p', { class: 'help', text: 'This chapter does not have enough text to build a good quiz. Try a longer chapter.' }), h('button', { class: 'btn', type: 'button', text: 'Close', onclick: closeSheets }));
      return;
    }
    if (QZ.i >= QZ.qs.length) return qzResult(body);
    const q = QZ.qs[QZ.i];
    body.append(
      h('div', { class: 'qz-top' }, h('span', { text: ch && ch.title ? ch.title : 'This chapter' }), h('span', { text: (QZ.i + 1) + ' / ' + QZ.qs.length })),
      h('div', { class: 'qz-bar' }, h('i', { style: 'width:' + (QZ.i / QZ.qs.length * 100) + '%' })));
    const fb = h('div', { class: 'qz-fb', hidden: true, role: 'status' });
    const next = h('button', { class: 'btn', type: 'button', hidden: true, text: QZ.i + 1 < QZ.qs.length ? 'Next question' : 'See my score' });
    next.addEventListener('click', () => { QZ.i++; qzRender(); });
    const finish = ok => {
      if (ok) QZ.score++; else QZ.wrong.push(q);
      fb.hidden = false; next.hidden = false; next.focus();
    };
    if (q.kind === 'fill' || q.kind === 'who') {
      body.append(h('div', { class: 'qz-kind', text: q.kind === 'fill' ? 'Vocabulary · fill in the blank' : 'Speaker · who said it?' }),
        h('div', { class: 'qz-q', text: q.kind === 'fill' ? q.text : '“' + q.quote + '”' }));
      const box = h('div', { class: 'qz-opts' });
      q.opts.forEach(o => {
        const label = q.kind === 'fill' && /^_____/.test(q.text) ? o[0].toUpperCase() + o.slice(1) : o;
        const b = h('button', { class: 'qz-opt', type: 'button', text: label });
        b.addEventListener('click', () => {
          const ok = o === q.ans;
          $$('.qz-opt', box).forEach(x => { x.disabled = true; if (x.textContent.toLowerCase() === q.ans.toLowerCase()) x.classList.add('ok'); });
          if (!ok) b.classList.add('no');
          fb.textContent = (ok ? (P.calm === true ? 'Yes. ' : 'Correct. ') : (P.calm === true ? 'Here is what the book says. ' : 'Not quite. ')) + q.full;
          finish(ok);
        });
        box.append(b);
      });
      body.append(box, fb, qzHear(q), next);
    } else {
      body.append(h('div', { class: 'qz-kind', text: 'Sentence order' }), h('div', { class: 'qz-q', text: 'Tap the sentences in the order they appear in the book.' }));
      QZ.picks = [];
      const ans = h('div', { class: 'qz-ans' }), pool = h('div', { class: 'qz-chips grid' });
      const check = h('button', { class: 'btn', type: 'button', text: 'Check order', disabled: true });
      const chips = q.items.map((t, i) => h('button', { class: 'qz-chip', type: 'button', text: t, 'data-i': String(i) }));
      const draw = () => {
        ans.textContent = '';
        if (!QZ.picks.length) ans.append(h('span', { class: 'ph', text: 'Your order appears here' }));
        QZ.picks.forEach(i => { const c = h('button', { class: 'qz-chip', type: 'button', text: (QZ.picks.indexOf(i) + 1) + '. ' + q.items[i] }); c.addEventListener('click', () => { QZ.picks = QZ.picks.filter(x => x !== i); draw(); }); ans.append(c); });
        chips.forEach((c, i) => { c.classList.toggle('used', QZ.picks.includes(i)); c.disabled = QZ.picks.includes(i); });
        check.disabled = QZ.picks.length !== q.items.length;
      };
      chips.forEach((c, i) => { c.addEventListener('click', () => { QZ.picks.push(i); draw(); }); pool.append(c); });
      check.addEventListener('click', () => {
        const mine = QZ.picks.map(i => q.items[i]), ok = mine.every((t, k) => t === q.correct[k]);
        check.hidden = true; chips.forEach(c => { c.disabled = true; }); $$('.qz-chip', ans).forEach(c => { c.disabled = true; });
        fb.textContent = ok ? (P.calm === true ? 'Yes. That is the order in the book.' : 'Correct. That is the order in the book.') : (P.calm === true ? 'Here is the order in the book: ' : 'Not quite. In the book: ') + q.correct.map((t, k) => (k + 1) + '. ' + t).join('  ');
        finish(ok);
      });
      draw();
      body.append(ans, pool, check, fb, qzHear(q), next);
    }
  }
  function qzResult(body) {
    const n = QZ.qs.length, sc = QZ.score;
    qzSaveBest(QZ.ci, sc, n);
    if (P.calm === true) {
      body.append(h('p', { class: 'help', style: 'text-align:center;font-size:1.1rem', text: 'All done. Thank you for reading closely.' }));
      if (QZ.wrong.length) {
        body.append(h('h3', { text: 'Worth another look, whenever you like' }));
        const w = h('div', { class: 'qz-wrong' });
        QZ.wrong.forEach(q => w.append(h('div', {}, q.kind === 'order' ? 'Order: ' + q.correct.join(' ') : (q.kind === 'who' ? '\u201c' + q.quote + '\u201d \u2014 ' + q.ans : q.full))));
        body.append(w);
      }
      body.append(h('div', { class: 'qz-row' }, h('button', { class: 'btn', type: 'button', text: 'Close', onclick: closeSheets })));
      return;
    }
    body.append(h('div', { class: 'qz-score', text: sc + ' / ' + n }),
      h('p', { class: 'help', style: 'text-align:center', text: sc === n ? 'Perfect. You know this chapter well.' : sc / n >= .6 ? 'Good work. A little more review and it is yours.' : 'Keep going. Listen to the chapter again, then try once more.' }));
    if (QZ.wrong.length) {
      body.append(h('h3', { text: 'Review' }));
      const w = h('div', { class: 'qz-wrong' });
      QZ.wrong.forEach(q => w.append(h('div', {}, q.kind === 'order' ? 'Order: ' + q.correct.join(' ') : (q.kind === 'who' ? '“' + q.quote + '” — ' + q.ans : q.full))));
      body.append(w);
    }
    body.append(h('div', { class: 'qz-row' },
      h('button', { class: 'btn', type: 'button', text: 'New quiz', onclick: () => qzOpen(QZ.ci) }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Close', onclick: closeSheets })));
  }

  guideDoc('words', 'Shadow reading', "Controls > Shadow reading: hear a sentence, say it after the narrator, then compare the timing and listen to both.");
  /* ================= Shadow reading =================
     Hear one sentence from the narrator, say it yourself, then compare. The comparison shows the length of
     your sentence against the narrator's, plays them one after the other, and (where the browser has speech
     recognition) marks the words it did not hear. Recordings stay on the device, in memory, until you leave. */
  const SH = { k: 0, rec: {}, mr: null, stream: null, aud: null, watch: 0, stopT: 0, sr: null, busy: '', discard: false };
  function shPlan() { const p = S.plan[S.sec]; return p && p.ids.length ? p : null; }
  function shClip(p, k) {
    const a = sentTime(p, k), dur = S.durs[S.sec] || 0;
    const tail = Math.min(14, Math.max(1.5, S.model.sents[p.ids[k]].t.length / 14));
    let b = k + 1 < p.starts.length ? p.starts[k + 1] - P.nudge : (dur > a ? Math.min(dur, a + tail) : a + tail);
    if (!(b > a + 0.4)) b = a + tail;
    return [a, b];
  }
  function shOpen() {
    if (!S.book || !S.model || !shPlan()) { toast('Open a book that has its text lined up with the audio first.', 4000); return; }
    const p = shPlan();
    let k = Core.locate(p.starts, nowT() + P.nudge); k = Math.max(0, Math.min(k, p.ids.length - 1));
    while (k < p.ids.length - 1 && S.model.sents[p.ids[k]].h) k++;
    SH.k = k; SH.rec = {};
    openSheet('sheet-shadow'); shRender();
  }
  function shMove(d) {
    const p = shPlan(); if (!p) return;
    shHalt();
    let k = SH.k + d;
    while (k >= 0 && k < p.ids.length && S.model.sents[p.ids[k]].h) k += d;
    if (k < 0 || k >= p.ids.length) { toast(d > 0 ? 'That was the last sentence in this track.' : 'This is the first sentence.'); return; }
    SH.k = k; shRender();
  }
  function shHalt() {   // stop everything that is running: narrator clip, recording, playback
    clearInterval(SH.watch); clearTimeout(SH.stopT);
    if (!audio.paused && SH.busy === 'narrator') audio.pause();
    if (SH.aud) { try { SH.aud.pause(); } catch (e) { /* gone */ } SH.aud = null; }
    if (SH.mr && SH.mr.state !== 'inactive') { SH.discard = true; try { SH.mr.stop(); } catch (e) { /* gone */ } }
    if (SH.sr) { try { SH.sr.abort(); } catch (e) { /* gone */ } SH.sr = null; }
    if (SH.stream) { SH.stream.getTracks().forEach(t => t.stop()); SH.stream = null; }
    SH.busy = '';
  }
  function shCleanup() { shHalt(); Object.values(SH.rec).forEach(r => { try { URL.revokeObjectURL(r.url); } catch (e) { /* ignore */ } }); SH.rec = {}; }
  function shNarrator(done) {
    const p = shPlan(); if (!p) return;
    shHalt();
    const [a, b] = shClip(p, SH.k);
    SH.busy = 'narrator'; shButtons();
    seekAudio(a);
    const started = Date.now();
    audio.play().catch(e => { onPlayFail(e); SH.busy = ''; shButtons(); });
    let seen = false;
    SH.watch = setInterval(() => {
      if (!audio.paused) seen = true;
      if (audio.currentTime >= b - 0.03) { clearInterval(SH.watch); audio.pause(); SH.busy = ''; shButtons(); if (done) done(); }
      else if (seen && audio.paused && Date.now() - started > 400) { clearInterval(SH.watch); SH.busy = ''; shButtons(); }  // paused by hand
    }, 40);
  }
  async function shRecord() {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Recording is not supported in this browser.', 4000); return; }
    shHalt();
    try { SH.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { toast('The microphone is blocked. Allow it in your browser settings, then try again.', 5000); return; }
    const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
    const chunks = [], id = SH.k;
    const mr = new MediaRecorder(SH.stream, mt ? { mimeType: mt } : undefined);
    SH.mr = mr; SH.discard = false;
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      if (SH.stream) { SH.stream.getTracks().forEach(t => t.stop()); SH.stream = null; }
      clearTimeout(SH.stopT);
      if (SH.busy === 'rec') SH.busy = '';
      if (SH.discard || !chunks.length) { shButtons(); return; }
      shSave(id, new Blob(chunks, { type: mr.mimeType || mt || 'audio/webm' }));
    };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        const sr = new SR(); sr.lang = 'en-US'; sr.interimResults = false; sr.maxAlternatives = 1; SH.sr = sr;
        sr.onresult = e => { const t = Array.from(e.results).map(r => r[0].transcript).join(' '); const r = SH.rec[id]; if (r) { r.heard = t; } else (SH.pendingHeard = SH.pendingHeard || {})[id] = t; shResult(); };
        sr.start();
      } catch (e) { SH.sr = null; }
    }
    mr.start(); SH.busy = 'rec'; shButtons();
    const [a, b] = shPlan() ? shClip(shPlan(), id) : [0, 4];
    SH.stopT = setTimeout(shStopRec, Math.min(40, (b - a) * 1.7 + 2.5) * 1000);   // stops by itself, in case you forget
  }
  function shStopRec() { clearTimeout(SH.stopT); if (SH.mr && SH.mr.state !== 'inactive') { try { SH.mr.stop(); } catch (e) { /* gone */ } } if (SH.sr) { try { SH.sr.stop(); } catch (e) { /* gone */ } } }
  async function shSave(id, blob) {
    const old = SH.rec[id]; if (old) { try { URL.revokeObjectURL(old.url); } catch (e) { /* ignore */ } }
    const r = { url: URL.createObjectURL(blob), env: null, speech: 0, total: 0, heard: (SH.pendingHeard && SH.pendingHeard[id]) || null };
    if (SH.pendingHeard) delete SH.pendingHeard[id];
    try {
      const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close && ac.close();
      const d = buf.getChannelData(0), N = Math.max(20, Math.min(160, Math.round(buf.duration * 40))), step = Math.floor(d.length / N) || 1, env = [];
      for (let i = 0; i < N; i++) { let s = 0; const lo = i * step, hi = Math.min(d.length, lo + step); for (let j = lo; j < hi; j++) s += d[j] * d[j]; env.push(Math.sqrt(s / Math.max(1, hi - lo))); }
      const mx = Math.max(...env) || 1, th = mx * 0.14;
      let f = env.findIndex(v => v > th), l = env.length - 1; while (l > 0 && env[l] <= th) l--;
      if (f < 0) f = 0;
      r.env = env.slice(f, l + 1).map(v => v / mx); r.total = buf.duration; r.speech = Math.max(0.2, (l - f + 1) / N * buf.duration);
    } catch (e) { r.speech = 0; }
    SH.rec[id] = r; shButtons(); shResult();
  }
  function shPlayYou(done) {
    const r = SH.rec[SH.k]; if (!r) return;
    shHalt(); const a = new Audio(r.url); SH.aud = a; SH.busy = 'you'; shButtons();
    a.onended = () => { SH.aud = null; SH.busy = ''; shButtons(); if (done) done(); };
    a.play().catch(() => { SH.busy = ''; shButtons(); });
  }
  function shBoth() { shNarrator(() => setTimeout(() => shPlayYou(), 250)); }
  function shLCS(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    const hit = new Set(); let i = m, j = n;
    while (i > 0 && j > 0) { if (a[i - 1] === b[j - 1]) { hit.add(i - 1); i--; j--; } else if (d[i - 1][j] >= d[i][j - 1]) i--; else j--; }
    return hit;
  }
  function shRender() {
    const p = shPlan(), body = $('#sh-body'); body.textContent = '';
    if (!p) { body.append(h('p', { class: 'help', text: 'No text is lined up with this track.' })); return; }
    const id = p.ids[SH.k], s = S.model.sents[id];
    body.append(
      h('p', { class: 'help', text: 'Listen to the narrator, then say the sentence yourself. Compare your timing, and hear both one after the other.' }),
      h('div', { class: 'sh-meta' }, h('span', { text: 'Sentence ' + (SH.k + 1) + ' of ' + p.ids.length + ' in this track' }),
        h('span', {}, h('button', { class: 'btn ghost small', type: 'button', text: '‹ Prev', onclick: () => shMove(-1) }), ' ', h('button', { class: 'btn ghost small', type: 'button', text: 'Next ›', onclick: () => shMove(1) }))),
      h('div', { class: 'sh-sent', id: 'sh-sent', text: s.t }),
      h('button', { class: 'btn sh-main', id: 'sh-go', type: 'button' }),
      h('div', { class: 'qz-row' },
        h('button', { class: 'btn ghost small', id: 'sh-nar', type: 'button', text: '▶ Narrator' }),
        h('button', { class: 'btn ghost small', id: 'sh-rec', type: 'button' }),
        h('button', { class: 'btn ghost small', id: 'sh-you', type: 'button', text: '▶ You' }),
        h('button', { class: 'btn ghost small', id: 'sh-both', type: 'button', text: '⇄ Hear both' })),
      h('div', { id: 'sh-res' }));
    $('#sh-go').addEventListener('click', () => { if (SH.busy === 'rec') shStopRec(); else shNarrator(() => shRecord()); });
    $('#sh-nar').addEventListener('click', () => shNarrator());
    $('#sh-rec').addEventListener('click', () => { if (SH.busy === 'rec') shStopRec(); else shRecord(); });
    $('#sh-you').addEventListener('click', () => shPlayYou());
    $('#sh-both').addEventListener('click', shBoth);
    shButtons(); shResult();
  }
  function shButtons() {
    const go = $('#sh-go'); if (!go) return;
    const rec = SH.busy === 'rec', has = !!SH.rec[SH.k];
    go.className = 'btn sh-main' + (rec ? ' sh-rec' : '');
    go.textContent = ''; 
    if (rec) go.append(h('span', { class: 'sh-rec-dot' }), 'Recording… tap to stop');
    else go.append(SH.busy === 'narrator' ? 'Listening to the narrator…' : has ? 'Try again: listen, then repeat' : 'Listen, then repeat');
    $('#sh-rec').textContent = rec ? '■ Stop' : '● Record';
    $('#sh-you').disabled = !has || !!SH.busy && SH.busy !== 'you'; $('#sh-both').disabled = !has || rec;
    $('#sh-nar').disabled = rec;
  }
  function shResult() {
    const host = $('#sh-res'); if (!host) return;
    host.textContent = '';
    const r = SH.rec[SH.k], p = shPlan(); if (!r || !p) return;
    const [a, b] = shClip(p, SH.k), nd = b - a;
    const box = h('div', { class: 'sh-res' });
    if (r.speech > 0) {
      const ratio = r.speech / nd, pct = Math.round(Math.abs(ratio - 1) * 100);
      const verdict = ratio >= .85 && ratio <= 1.15 ? 'Great pace. You match the narrator.' : ratio < .85 ? 'You were ' + pct + '% faster than the narrator. Slow down a little.' : 'You were ' + pct + '% slower than the narrator. Try to keep it flowing.';
      const cv = h('canvas', { 'aria-label': 'Narrator length compared with yours' });
      box.append(h('div', { class: 'sh-verdict', text: verdict }), cv,
        h('div', { class: 'sh-legend' }, h('span', {}, h('i', { style: 'background:var(--accent)' }), 'Narrator ' + nd.toFixed(1) + ' s'), h('span', {}, h('i', { style: 'background:var(--muted)' }), 'You ' + r.speech.toFixed(1) + ' s')));
      setTimeout(() => shDraw(cv, r, nd), 0);
    } else box.append(h('div', { class: 'sh-verdict', text: 'Recorded. Tap “Hear both” to compare by ear.' }));
    if (r.heard != null) {
      const tw = qzWords(S.model.sents[p.ids[SH.k]].t), norm = w => w.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
      const hit = shLCS(tw.map(norm), qzWords(r.heard).map(norm));
      box.append(h('div', { text: 'Words heard: ' + hit.size + ' of ' + tw.length }));
      const sent = $('#sh-sent');
      if (sent) { sent.textContent = ''; let i = 0; S.model.sents[p.ids[SH.k]].t.split(/(\s+)/).forEach(part => { if (/^\s+$/.test(part) || !part) { sent.append(part); return; } const w = qzWords(part).length ? i++ : -1; sent.append(w >= 0 && !hit.has(w) ? h('span', { class: 'miss', text: part }) : part); }); }
    }
    host.append(box);
  }
  function shDraw(cv, r, nd) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = 70;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement), acc = cs.getPropertyValue('--accent').trim() || '#E0B15A', mu = cs.getPropertyValue('--muted').trim() || '#999';
    const T = Math.max(nd, r.speech) * 1.02, rr = (x, y, w, hh) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, 4) : g.rect(x, y, w, hh); g.fill(); };
    g.fillStyle = acc; rr(0, 4, W * nd / T, 12);
    g.fillStyle = mu;
    if (r.env && r.env.length) { const w = W * r.speech / T, n = r.env.length, bw = w / n; r.env.forEach((v, i) => { const hh = Math.max(2, v * 44); g.fillRect(i * bw, 24 + (44 - hh) / 2, Math.max(1, bw - 1), hh); }); }
    else rr(0, 30, W * r.speech / T, 12);
  }

