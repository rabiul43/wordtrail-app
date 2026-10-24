  /* ---------- sentence translation: long-press a sentence ----------
     Uses the free MyMemory translation service. It accepts about 500 characters per request, so a
     long sentence is cut at its commas and the parts are joined again. */
  const TR_LANGS = [['bn', 'Bengali'], ['hi', 'Hindi'], ['ur', 'Urdu'], ['ar', 'Arabic'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['tr', 'Turkish'], ['id', 'Indonesian'], ['zh-CN', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean']];
  const trCache = new Map();
  let trPressAt = 0, trCtl = null, trPop = null;
  function trLang() {
    if (P.tlang && TR_LANGS.some(l => l[0] === P.tlang)) return P.tlang;
    const d = (navigator.language || 'en').toLowerCase(), hit = TR_LANGS.find(l => d === l[0].toLowerCase() || d.slice(0, 2) === l[0].slice(0, 2).toLowerCase() && l[0].indexOf('-') < 0);
    return hit ? hit[0] : 'bn';
  }
  function trChunks(text) {
    const parts = text.match(/[^,;:.!?]+[,;:.!?]*\s*/g) || [text], out = [];
    let cur = '';
    for (const part of parts) {
      if (cur && (cur + part).length > 450) { out.push(cur.trim()); cur = ''; }
      cur += part;
      while (cur.length > 450) { let k = cur.lastIndexOf(' ', 450); if (k < 100) k = 450; out.push(cur.slice(0, k).trim()); cur = cur.slice(k); }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  const trDecode = t => { const d = document.createElement('textarea'); d.innerHTML = t; return d.value; };
  async function trFetch(text, lang, signal) {
    const key = lang + '|' + text;
    if (trCache.has(key)) return trCache.get(key);
    const outParts = [];
    for (const chunk of trChunks(text)) {
      const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=en|' + encodeURIComponent(lang), { signal });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json(), t = j && j.responseData && j.responseData.translatedText;
      if (!t || (j.responseStatus && +j.responseStatus !== 200)) throw new Error('no result');
      outParts.push(trDecode(t));
    }
    const res = outParts.join(' ');
    trCache.set(key, res);
    if (trCache.size > 80) trCache.delete(trCache.keys().next().value);
    return res;
  }
  function trClose() { if (trCtl) trCtl.abort(); trCtl = null; if (trPop) trPop.root.hidden = true; prStop(); }
  function trBuild() {
    const src = h('p', { class: 'tr-src' }), out = h('p', { class: 'tr-out dim', 'aria-live': 'polite' });
    const sel = h('select', { 'aria-label': 'Translate into' }, ...TR_LANGS.map(l => h('option', { value: l[0] }, l[1])));
    const copy = h('button', { class: 'btn small ghost', type: 'button' }, 'Copy');
    const close = h('button', { class: 'btn small', type: 'button' }, 'Close');
    const word = h('div', { class: 'tr-word', hidden: true });
    const hlB = h('button', { class: 'btn small ghost', type: 'button' }, 'Highlight');
    const noteB = h('button', { class: 'btn small ghost', type: 'button' }, 'Note');
    const cardB = h('button', { class: 'btn small ghost', type: 'button' }, 'Quote card');
    const root = h('div', { class: 'trpop', role: 'dialog', 'aria-label': 'Sentence translation', hidden: true },
      h('div', { class: 'tr-top' }, h('strong', {}, 'Translation'), sel), src, out, word, h('div', { class: 'tr-acts tr-hl' }, hlB, noteB, cardB), h('div', { class: 'tr-acts' }, copy, close));
    document.body.append(root);
    hlB.addEventListener('click', () => { hlToggle(trSid); trClose(); });
    noteB.addEventListener('click', () => { const id = trSid; if (!hlFind(id)) hlToggle(id, true); trClose(); hlOpen(id); });
    cardB.addEventListener('click', () => { const t = (S.model && S.model.sents[trSid]) ? S.model.sents[trSid].t : trPop.text; trClose(); cardOpen(t); });
    close.addEventListener('click', trClose);
    copy.addEventListener('click', () => { const t = out.textContent; if (t && !out.classList.contains('dim') && navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Copied.', 1200), () => {}); });
    sel.addEventListener('change', () => { P.tlang = sel.value; savePrefs(); trShow(trPop.text, trPop.wordText); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !root.hidden) trClose(); });
    return (trPop = { root, src, out, sel, word, hl: hlB, text: '', wordText: '' });
  }
  async function trShow(text, word) {
    const pop = trPop || trBuild(), lang = trLang();
    pop.wordText = word || ''; if (word) vocCard(pop.word, word, text); else pop.word.hidden = true;
    pop.hl.textContent = hlFind(trSid) ? 'Remove highlight' : 'Highlight';
    pop.text = text; pop.sel.value = lang; pop.src.textContent = text; pop.root.hidden = false;
    if (trCtl) trCtl.abort();
    const ctl = trCtl = new AbortController();
    pop.out.className = 'tr-out dim'; pop.out.textContent = 'Translating\u2026';
    try {
      const t = await trFetch(text, lang, ctl.signal);
      if (ctl.signal.aborted) return;
      pop.out.className = 'tr-out'; pop.out.textContent = t;
    } catch (e) {
      if (ctl.signal.aborted) return;
      pop.out.className = 'tr-out dim'; pop.out.textContent = 'Could not translate this sentence. Check your connection and try again.';
    }
  }
  guideDoc('words', 'Words in this book', "Controls > Words lists the hard words of the book with a level and an example. Tap a word for its meaning, and Save to keep it.");
  /* ---------- book vocabulary: vocab/<book id>.json (built by build_vocab.py) and a saved-words list ----------
     Each book has a list of its most useful hard words with a CEFR level and an example from the book.
     A meaning comes from the free dictionaryapi.dev service when a word is opened, together with a
     translation from the same service the sentence translation uses. Saved words stay on this device. */
  const VOC = { tab: 'book', defs: new Map(), books: new Map(), seq: 0 };
  const myWords = () => store.get('wt:words', []) || [];
  async function vocBook(id) {
    if (VOC.books.has(id)) return VOC.books.get(id);
    let d = null;
    try { d = await idb.get('vocab:' + id); } catch (e) { /* no saved copy */ }
    if (!(d && Array.isArray(d.w) && Date.now() - (d.fetched || 0) < 14 * 24 * 3600e3)) {
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
        const r = await fetchText('vocab/' + encodeURIComponent(id) + '.json', ctl.signal); clearTimeout(to);
        if (r && r.ok) { const j = await r.json(); if (j && j.v === 1 && Array.isArray(j.w)) { j.fetched = Date.now(); idb.set('vocab:' + id, j); d = j; } }
      } catch (e) { /* use the saved copy if any */ }
    }
    if (d && Array.isArray(d.w)) VOC.books.set(id, d);
    return d && Array.isArray(d.w) ? d : null;
  }
  async function vocDefine(w) {
    if (VOC.defs.has(w)) return VOC.defs.get(w);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), { signal: ctl.signal });
      if (r.status === 404) { VOC.defs.set(w, ''); return ''; }
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json(), m = j && j[0] && j[0].meanings && j[0].meanings[0], d = m && m.definitions && m.definitions[0] && m.definitions[0].definition;
      const t = d ? (m.partOfSpeech ? m.partOfSpeech + ': ' : '') + (d.length > 140 ? d.slice(0, 137).trimEnd() + '\u2026' : d) : '';
      VOC.defs.set(w, t); return t;
    } finally { clearTimeout(to); }
  }
  async function vocFill(box, w) {
    box.className = 'vmean dim'; box.textContent = 'Looking up\u2026'; box.hidden = false;
    const lang = trLang(), [a, b] = await Promise.allSettled([vocDefine(w), trFetch(w, lang)]);
    const en = a.status === 'fulfilled' ? a.value : null, tr = b.status === 'fulfilled' ? b.value : '';
    box.textContent = '';
    if (en === null && !tr) { box.textContent = 'Could not look this word up. Check your connection and try again.'; return; }
    box.className = 'vmean';
    const name = (TR_LANGS.find(l => l[0] === lang) || [0, lang])[1];
    if (en) box.append(h('div', {}, en));
    else if (en === '') box.append(h('div', { class: 'dim' }, 'No dictionary entry for this form of the word.'));
    if (tr) box.append(h('div', {}, h('strong', {}, name + ': '), tr));
  }
  function vocToggle(e) {
    const list = myWords(), i = list.findIndex(x => x.w === e.w);
    if (i >= 0) { list.splice(i, 1); store.set('wt:words', list); return false; }
    list.unshift(Object.assign({ ts: Date.now() }, e)); store.set('wt:words', list.slice(0, 2000)); return true;
  }
  function vocEntry(w, lv, ex) {
    const d = S.book ? VOC.books.get(String(S.book.id)) : null, hit = d && d.w.find(x => x[0] === w);
    return { w, lv: lv || (hit ? hit[1] : ''), ex: ex || (hit ? hit[3] : ''), bid: S.book ? String(S.book.id) : '', bt: S.book ? S.book.title : '' };
  }
  function vocSaveBtn(e, mine) {
    const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' });
    const paint = () => { const on = myWords().some(x => x.w === e.w); b.setAttribute('aria-pressed', String(on)); b.textContent = mine ? 'Remove' : on ? 'Saved' : 'Save'; if (mine) b.setAttribute('aria-pressed', 'false'); };
    b.addEventListener('click', ev => { ev.stopPropagation(); const on = vocToggle(e); paint(); if (!on && !mine) toast('Removed from My words.', 1400); else if (on) toast('Saved to My words.', 1400); if (mine) vocRender(); else vocCount(); });
    paint(); return b;
  }
  function vocCount() { const n = myWords().length; $('#vw-n').textContent = n ? '(' + n + ')' : ''; }
  function vocRow(it, mine) {
    const e = mine ? it : vocEntry(it[0], it[1], it[3]), meaning = h('div', { class: 'vmean', hidden: true });
    const head = h('button', { class: 'vhead', type: 'button', 'aria-expanded': 'false' }, h('strong', {}, e.w), e.lv ? h('span', { class: 'vlv' }, e.lv) : null, !mine && it[2] ? h('small', {}, '\u00d7' + it[2]) : null);
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') === 'true';
      head.setAttribute('aria-expanded', String(!open));
      if (open) { meaning.hidden = true; return; }
      vocFill(meaning, e.w);
    });
    return h('div', { class: 'vrow' }, h('div', { class: 'vtop' }, head, vocSaveBtn(e, mine)),
      prSpeech ? prButtons(e.w, null) : null,
      e.ex ? h('p', { class: 'vex' }, e.ex) : null, mine && e.bt ? h('p', { class: 'vex' }, 'From ' + e.bt) : null, meaning);
  }

  guideDoc('words', 'Review and export', "Review quizzes you on saved words just before you would forget them. Export words (CSV) saves your list to a file.");
  /* ---------- Review (spaced repetition, SM-2 style) and exports ---------- */
  const srsDue = e => !e.due || e.due <= Date.now();
  function srsGrade(e, g) { // g: 0 again, 1 good, 2 easy
    const ease = Math.max(1.3, (e.ease || 2.5) + (g === 0 ? -0.2 : g === 2 ? 0.15 : 0));
    const iv = g === 0 ? 0 : !e.iv ? (g === 2 ? 4 : 1) : Math.round(e.iv * ease * (g === 2 ? 1.3 : 1));
    Object.assign(e, { ease, iv, reps: g === 0 ? 0 : (e.reps || 0) + 1, due: Date.now() + (g === 0 ? 10 * 60e3 : iv * 864e5) });
    if (iv >= 14 && !e.acq) e.acq = Date.now();   // acquired: you now remember it for two weeks or more
  }
  function vocDue() { const n = myWords().filter(srsDue).length; $('#vw-due').textContent = n ? '(' + n + ')' : ''; return n; }
  function download(name, text, type) {
    const a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type }));
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  const csv = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  function exportWords() {
    const w = myWords(); if (!w.length) { toast('No saved words to export yet.'); return; }
    download('wordtrail-words.csv', 'word,level,example,book\n' + w.map(e => [e.w, e.lv, e.ex, e.bt].map(csv).join(',')).join('\n'), 'text/csv');
  }
  function exportBookmarks() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); if (!k || k.indexOf('wt:bm:') !== 0) continue;
      const r = store.get(k, null); if (!r) continue;
      const bk = store.get('wt:book:' + k.slice(6), null);
      out.push([bk && bk.title || k.slice(6), 'Track ' + (r.sec + 1), hms(r.time), r.note || '']);
    }
    if (!out.length) { toast('No bookmarks to export yet.'); return; }
    download('wordtrail-bookmarks.csv', 'book,track,time,note\n' + out.map(r => r.map(csv).join(',')).join('\n'), 'text/csv');
  }
  function vocReview(list, help) {
    const all = myWords(), due = all.filter(srsDue);
    if (!all.length) { help.textContent = 'Save some words first, then they come back here for review.'; return; }
    if (!due.length) { help.textContent = 'All done for now. Next review is due soon.'; return; }
    help.textContent = due.length + ' to review today.';
    const e = due[0], mean = h('div', { class: 'vmean', hidden: true });
    const grade = g => { const cur = myWords(), t = cur.find(x => x.w === e.w); if (t) { srsGrade(t, g); store.set('wt:words', cur); } vocRender(); };
    const btns = h('div', { class: 'row', style: 'gap:.5rem;margin-top:.6rem', hidden: true },
      h('button', { class: 'btn', type: 'button', onclick: () => grade(0) }, 'Again'),
      h('button', { class: 'btn', type: 'button', onclick: () => grade(1) }, 'Good'),
      h('button', { class: 'btn', type: 'button', onclick: () => grade(2) }, 'Easy'));
    const show = h('button', { class: 'btn', type: 'button', onclick: ev => { ev.currentTarget.hidden = true; vocFill(mean, e.w); btns.hidden = false; } }, 'Show meaning');
    list.append(h('div', { class: 'vrow' }, h('strong', { style: 'font-size:1.4rem' }, e.w), ...(e.ex ? [h('p', { class: 'vex' }, e.ex)] : []), show, mean, btns));
  }
  async function vocRender() {
    const list = $('#vw-list'), help = $('#vw-help'), my = ++VOC.seq;
    $$('#seg-words button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === VOC.tab)));
    vocCount(); vocDue(); list.textContent = '';
    $('#vw-tools').hidden = VOC.tab !== 'mine';
    if (VOC.tab === 'review') { vocReview(list, help); return; }
    if (VOC.tab === 'mine') {
      const mine = myWords();
      help.textContent = mine.length ? 'Words you saved, newest first. Tap a word for its meaning.' : 'Nothing saved yet. Open a book, tap Save on a word, or press and hold a word in the text and tap Save.';
      mine.forEach(e => list.append(vocRow(e, true)));
      return;
    }
    if (!S.book) { help.textContent = 'Open a book to see its words.'; return; }
    help.textContent = 'Loading\u2026';
    const d = await vocBook(String(S.book.id));
    if (my !== VOC.seq || VOC.tab !== 'book') return;
    if (!d) { help.textContent = 'No word list for this book yet. It appears after the next vocabulary update, or check your connection.'; return; }
    if (!d.w.length) { help.textContent = 'This book has too little text to pick words from.'; return; }
    help.textContent = d.w.length + ' words worth knowing in this book. Tap a word for its meaning and Save to keep it.';
    d.w.forEach(it => list.append(vocRow(it, false)));
  }
  function vocOpen(tab) { if (tab) VOC.tab = tab; openSheet('sheet-words'); vocRender(); }
  /* the word under a screen point, in lower case ('' if none) */
  function wordAt(x, y) {
    let node, off;
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    if (!node || node.nodeType !== 3) return '';
    const t = node.textContent, isW = c => /[A-Za-z\u2019']/.test(c);
    let a = Math.min(off, t.length), b = a;
    while (a > 0 && isW(t[a - 1])) a--;
    while (b < t.length && isW(t[b])) b++;
    const w = t.slice(a, b).replace(/^['\u2019]+|['\u2019]+$/g, '').toLowerCase();
    PR.ref = null;
    const sp = node.parentElement && node.parentElement.closest('.s');
    if (sp && S.model && S.model.sents[+sp.dataset.i]) {
      try {
        const id = +sp.dataset.i, rg = document.createRange(); rg.setStart(sp, 0); rg.setEnd(node, a);
        const off = rg.toString().length, re = new RegExp(WORD_RE.source, 'gi'), txt = S.model.sents[id].t; let m, k = 0;
        while ((m = re.exec(txt))) { if (off < m.index + m[0].length) { PR.ref = { id, k }; break; } k++; }
      } catch (e) { PR.ref = null; }
    }
    return w.length >= 3 ? w : '';
  }
  guideDoc('words', 'Hear a word', "When you open a word, tap Voice to hear it in your device's voice, or Narrator to hear the narrator say it, slowed down.", '2026-10-03');
  /* ---------- Pronunciation: the device voice (speech synthesis) or the narrator's own clip, slowed ---------- */
  const PR = { ref: null, utter: null, clip: null, timer: 0, resume: false };
  const prSpeech = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  function prStop() {
    clearTimeout(PR.timer); PR.timer = 0;
    if (prSpeech) { try { speechSynthesis.cancel(); } catch (e) { /* nothing speaking */ } }
    if (PR.clip) { PR.clip.pause(); PR.clip.removeAttribute('src'); PR.clip.load(); PR.clip = null; }
    if (PR.resume) { PR.resume = false; audio.play().catch(() => {}); }
  }
  function prHold() { prStop(); if (!audio.paused) { audio.pause(); PR.resume = true; } }
  function prVoice(word) {
    if (!prSpeech) { toast('This device has no speech voice.', 2500); return; }
    prHold();
    const u = new SpeechSynthesisUtterance(word), lang = (S.book && S.book.lang) || 'en';
    u.lang = lang.length === 2 ? (lang === 'en' ? 'en-US' : lang) : lang; u.rate = 0.85;
    const vs = speechSynthesis.getVoices(), base = u.lang.slice(0, 2);
    const v = vs.find(x => x.lang === u.lang) || vs.find(x => x.lang.slice(0, 2) === base);
    if (v) u.voice = v;
    const done = () => { if (PR.resume) { PR.resume = false; audio.play().catch(() => {}); } };
    u.onend = done; u.onerror = done; PR.utter = u;
    speechSynthesis.speak(u);
  }
  function prNarrator(ref) {
    const times = ref && wordTimesAny(ref.id);
    if (!times || ref.k >= times.length || S.sentSec[ref.id] !== S.sec || !audio.currentSrc) { toast('The narrator clip is not available for this word. Try the voice.', 3000); return; }
    const exact = !!wordTimesFor(ref.id), p = S.plan[S.sec], rate = 0.6;
    let a = times[ref.k] - (exact ? 0.06 : 0.2);
    let b = ref.k + 1 < times.length ? times[ref.k + 1] : (p && p.starts[S.sentPos[ref.id] + 1]) || times[ref.k] + 0.9;
    b = Math.min(b + (exact ? 0.05 : 0.25), a + 2.2); a = Math.max(0, a);
    prHold();
    const c = PR.clip = new Audio(); c.preload = 'auto'; c.src = audio.currentSrc;
    c.addEventListener('loadedmetadata', () => {
      if (PR.clip !== c) return;
      c.currentTime = a; c.playbackRate = rate;
      c.play().then(() => { PR.timer = setTimeout(prStop, ((b - a) / rate) * 1000 + 120); }).catch(() => { prStop(); toast('Could not play the narrator clip.', 2500); });
    }, { once: true });
    c.addEventListener('error', () => { if (PR.clip === c) { prStop(); toast('Could not play the narrator clip.', 2500); } }, { once: true });
  }
  function prButtons(w, ref) {
    const row = h('div', { class: 'vpron' });
    if (prSpeech) row.append(h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Hear ' + w + ' in the device voice', onclick: () => prVoice(w) }, '\u{1F50A} Voice'));
    const nOk = ref && wordTimesAny(ref.id) && S.sentSec[ref.id] === S.sec;
    if (nOk) row.append(h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Hear ' + w + ' from the narrator, slowed', onclick: () => prNarrator(ref) }, '\u{1F422} Narrator' + (wordTimesFor(ref.id) ? '' : ' (approx.)')));
    return row;
  }
  function vocCard(box, w, sentence) {
    box.textContent = ''; box.hidden = false;
    const e = vocEntry(w, '', sentence), meaning = h('div', { class: 'vmean', hidden: true });
    box.append(h('div', { class: 'vtop' }, h('strong', {}, w), vocSaveBtn(e, false)), prButtons(w, PR.ref), meaning);
    vocFill(meaning, w);
  }
  guideDoc('player', 'Hide player', "Controls has a Hide player option for reading without the player controls.");
  guideDoc('player', 'Swipe to hide controls', "Swipe up on the text to leave a slim bar. Swipe down, or tap the bar or its handle, to bring the controls back.");
  /* ---------- reading-only mode: just the text, which keeps scrolling after the narrator ---------- */
  /* Focus mode: reading forward (finger drags up, or wheel down) shrinks the dock to a slim bar with a
     progress line, -15, play and +15. Reading back, tapping the bar or its handle brings it back. */
  function setMini(on) {
    on = !!on; if (!!S.mini === on) return;
    S.mini = on;
    el.dock.classList.toggle('slim', on);
    const g = $('#dock-grip');
    if (g) { g.setAttribute('aria-label', on ? 'Show full player controls' : 'Hide player controls'); g.setAttribute('aria-expanded', String(!on)); }
  }
  function setReadOnly(on) {
    on = !!on && !el.player.hidden;
    el.player.classList.toggle('ro', on);
    $('#b-read').setAttribute('aria-pressed', String(on));
    if (typeof qkPaint === 'function') qkPaint();
    if (on) {
      S.follow = true; el.follow.hidden = true;
      const sp = S.spans.get(S.curId); if (sp) ensureVisible(sp, true);
      roPlayLabel();
    }
    document.documentElement.style.setProperty('--dock-h', (on ? 0 : el.dock.offsetHeight) + 'px');
  }
  function roPlayLabel() { const b = $('#ro-play'); if (b) b.textContent = audio.paused ? 'Play' : 'Pause'; }
  function togglePlay() { if (!S.book) return; if (audio.paused) audio.play().catch(onPlayFail); else audio.pause(); }
  /* ---------- gesture hint: a small card the first times a book plays, until "Got it" ---------- */
  const GH = { t: 0 };
  function ghHide() { const c = $('#gesture-hint'); if (c) c.hidden = true; }
  function ghDone() { store.set('wt:hint:gestures', 9); ghHide(); }
  function ghMaybe() {
    const c = $('#gesture-hint'); if (!c || !c.hidden) return;
    const n = store.get('wt:hint:gestures', 0); if (n >= 3) return;
    clearTimeout(GH.t);
    GH.t = setTimeout(() => {
      if (el.player.hidden || audio.paused || !S.spans || !S.spans.size) return;
      if (!el.toast.hidden) { ghMaybe(); return; }
      store.set('wt:hint:gestures', n + 1); c.hidden = false;
      GH.t = setTimeout(ghHide, 14000);
    }, 6000);
  }
  audio.addEventListener('playing', ghMaybe);
  audio.addEventListener('pause', () => { clearTimeout(GH.t); });
  document.addEventListener('click', e => {
    if (e.target.closest('#gh-ok')) ghDone();
    else if (e.target.closest('#gh-more')) { ghDone(); openSheet('sheet-howto'); }
    else if (e.target.closest('#ht-reset')) { store.set('wt:hint:gestures', 0); toast('The hint will show again while you listen.'); }
  });


  guideDoc('timing', 'Choose the text', "Controls > Fix highlight sync lets you pick which Gutenberg text goes with the book, or use your own.");
  guideDoc('timing', 'Adjust timing', "If the highlight is early or late, tap Adjust timing, then tap the sentence you hear. The sentences around it move too, and Undo is offered.");
  guideDoc('timing', 'Skip at start and end', "Settings > Timing lets you set how many seconds of the LibriVox intro and outro to skip. Automatic skipping is on by default.");
