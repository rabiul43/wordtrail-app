  /* ---------- Class worksheet (Task 49) ----------
     Learn hub tile "Class worksheet" (and "Study this chapter"): the hard words of one chapter (or a few chapters, up to the one reached)
     as a printable A4 sheet. The words come from the book's word list (vocBook, 160) and are kept when they really occur in the chosen
     chapters; no list for the book: the rare long words of the chapter (QG.vocabWords, 167c). Meaning and pronunciation: DICT (149, saved
     on the device, so a book with its learning pack (283) works offline). Translation: TP (160b), in the app's translation language.
     Options (chips): Meanings (the English meaning is printed on the row; off = a line to write it on), Bengali (the translation is printed;
     "Bengali" is the app's translation language), Sentences (a word bank and the sentence of each word with a blank), Answer key (a last
     page). The same drawing (`WSH.paper`) is the preview and the printed page. Print route: the browser's own print (window.print), with a
     print style (A4, 14 mm margins) that hides everything but the sheet; "Save as PDF" in the print dialog makes the PDF. No library, no
     network call except DICT / TP for the words on the sheet. No storage key. Nothing runs at start-up. */
  const WSC = (() => {   /*WSC-START*/
    const MAXW = 24, BLANK = '_______';
    const WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
    function formsOf(w) {
      w = String(w).toLowerCase();
      const s = new Set([w, w + 's', w + 'es', w + 'd', w + 'ed', w + 'ing', w + 'ly', w + 'er', w + 'y']), l = w[w.length - 1];
      if (w.endsWith('e')) s.add(w.slice(0, -1) + 'ing');
      if (w.endsWith('y')) { s.add(w.slice(0, -1) + 'ies'); s.add(w.slice(0, -1) + 'ied'); }
      if (l) { s.add(w + l + 'ed'); s.add(w + l + 'ing'); }
      return s;
    }
    /* the first token of text that is the word or a simple form of it: { s, e, form } or null */
    function find(text, word) {
      const f = formsOf(word); text = String(text == null ? '' : text); WORD.lastIndex = 0; let m;
      while ((m = WORD.exec(text))) if (f.has(m[0].toLowerCase()) || f.has(m[0].toLowerCase().replace(/'s$/, ''))) return { s: m.index, e: m.index + m[0].length, form: m[0].replace(/'s$/i, '') };
      return null;
    }
    function blank(text, word) {
      const x = find(text, word); if (!x) return { text: String(text || ''), ok: false, form: '' };
      return { text: text.slice(0, x.s) + BLANK + text.slice(x.e), ok: true, form: x.form };
    }
    const nWords = t => (String(t).match(WORD) || []).length;
    /* sents: [{ t, ch, h }], list: rows [word, level, count, example] (or plain words), chapters a..b (0-based, inclusive).
       -> [{ word, level, sent, ch }] in reading order, one per word, at most max; the sentence is the first usable one (5-30 words) in the range */
    function pick(list, sents, a, b, max) {
      const rows = (Array.isArray(list) ? list : []).map(r => (Array.isArray(r) ? { w: r[0], l: r[1] } : { w: r, l: '' })).filter(r => typeof r.w === 'string' && r.w.trim());
      const seen = new Set(), out = [], inR = [];
      (sents || []).forEach((s, i) => { if (s && !s.h && typeof s.t === 'string' && s.ch >= a && s.ch <= b) inR.push({ i, t: s.t.trim(), ch: s.ch }); });
      for (const r of rows) {
        const w = r.w.trim().toLowerCase(); if (seen.has(w)) continue;
        let first = null, good = null;
        for (const s of inR) {
          if (!find(s.t, w)) continue;
          if (!first) first = s;
          const n = nWords(s.t); if (n >= 5 && n <= 30) { good = s; break; }
        }
        const s = good || first; if (!s) continue;
        seen.add(w); out.push({ word: w, level: r.l || '', sent: s.t, ch: s.ch, at: s.i });
      }
      out.sort((x, y) => x.at - y.at);
      return out.slice(0, max || MAXW).map(({ at, ...p }) => p);
    }
    const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
    /* the rows of the sheet. info: { word: { ipa, meaning, bn } }; opt: { mean, bn, sent, key } */
    function rows(picks, info, opt) {
      info = info || {}; opt = opt || {};
      return picks.map((p, i) => {
        const d = info[p.word] || {}, bl = blank(p.sent, p.word);
        return { n: i + 1, word: p.word, ipa: d.ipa || '', meaning: opt.mean ? clip(d.meaning, 110) : '', bn: opt.bn ? clip(d.bn, 60) : '',
          line: !(opt.mean && d.meaning) && !(opt.bn && d.bn),   // a line to write on, when nothing is printed to answer with
          sentence: opt.sent && bl.ok ? bl.text : '', form: bl.ok ? bl.form : p.word, keyMeaning: clip(d.meaning, 110), keyBn: clip(d.bn, 60) };
      });
    }
    const bank = rs => rs.filter(r => r.sentence).map(r => r.form.toLowerCase()).sort((a, b) => a.localeCompare(b));
    const range = (a, b) => 'Ch. ' + (a + 1) + (b > a ? '–' + (b + 1) : '');
    /* ----- Anki and class link (Task 50) ----- */
    const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'book';
    const fname = (title, a, b) => 'wordtrail-class-' + slug(title) + '-ch' + (a + 1) + (b > a ? '-' + (b + 1) : '') + '.txt';
    const cleanW = w => { w = String(w == null ? '' : w).trim().toLowerCase(); return /^[a-z]+(?:'[a-z]+)?$/.test(w) && w.length <= 30 ? w : ''; };
    const cleanList = ws => { const seen = new Set(), out = []; (ws || []).forEach(x => { const w = cleanW(x); if (w && !seen.has(w)) { seen.add(w); out.push(w); } }); return out.slice(0, MAXW); };
    /* the class link: <base>?book=ID&cc=1-3&cw=word,word (chapters are counted from 1 in the link, from 0 in the app). '' when the book id is not a plain number */
    function linkOf(base, bid, a, b, words) {
      const ws = cleanList(words); bid = String(bid == null ? '' : bid);
      if (!/^\d{1,9}$/.test(bid) || !ws.length || !(a >= 0) || !(b >= a)) return '';
      return String(base) + '?book=' + bid + '&cc=' + (a + 1) + (b > a ? '-' + (b + 1) : '') + '&cw=' + encodeURIComponent(ws.join(','));
    }
    /* the other way: { bid, a, b, words } from a page's location.search, or null when it is not a class link (an old ?book= link has no words) */
    function parseLink(search) {
      let q; try { q = new URLSearchParams(search); } catch (e) { return null; }
      const bid = q.get('book') || '', m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(q.get('cc') || '');
      if (!/^\d{1,9}$/.test(bid) || !m) return null;
      const a = +m[1] - 1, b = (m[2] ? +m[2] : +m[1]) - 1, words = cleanList((q.get('cw') || '').split(','));
      return a >= 0 && b >= a && b - a <= 9 && words.length ? { bid, a, b, words } : null;
    }
    /* Anki import file (Anki 2.1.54 or newer), the same layout as the My Words export in 167-word-notes-export.js (that file is not in build.py, so it is not
       used from here): tab separated, header lines for separator, HTML, note type Basic, deck WordTrail and the tags column. */
    const ANKI_HEAD = ['#separator:tab', '#html:true', '#notetype:Basic', '#deck:WordTrail', '#tags column:3'];
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const piece = s => esc(String(s == null ? '' : s).replace(/\t/g, ' ')).replace(/\r?\n/g, '<br>');   // never a raw tab or line break inside a field
    const field = s => piece(String(s == null ? '' : s).trim());
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function boldWord(sentence, w) {   // the sentence with the first whole-word match of w in bold; whitespace tidied
      const t = String(sentence || '').replace(/\s+/g, ' ').trim(); if (!t) return '';
      const m = w ? new RegExp("(^|[^A-Za-z\\u00C0-\\u024F'])(" + reEsc(w) + ")(?![A-Za-z\\u00C0-\\u024F])", 'i').exec(t) : null;
      if (!m) return field(t);
      const a = m.index + m[1].length, b = a + m[2].length;
      return piece(t.slice(0, a)) + '<b>' + piece(m[2]) + '</b>' + piece(t.slice(b));
    }
    const tag = s => String(s).trim().replace(/\s+/g, '_').replace(/["\t]/g, '');
    /* notes for the file, in reading order. Front = the word alone (so Anki sees the same word as the same note). Back = pronunciation, meaning,
       translation (when it was fetched), the book's sentence with the word in bold, and where it is from. */
    function ankiNotes(picks, info, meta) {
      info = info || {}; meta = meta || {};
      return (picks || []).map(p => {
        const d = info[p.word] || {}, bl = blank(p.sent, p.word), back = [];
        const ipa = String(d.ipa || '').replace(/^\/|\/$/g, '');
        if (ipa) back.push('<div>/' + field(ipa) + '/</div>');
        if (d.meaning) back.push('<div>' + field(clip(d.meaning, 300)) + '</div>');
        if (d.bn) back.push('<div>' + field(clip(d.bn, 120)) + '</div>');
        if (p.sent) back.push('<div>' + boldWord(p.sent, bl.ok ? bl.form : p.word) + '</div>');
        back.push('<div><small>' + field((meta.title ? meta.title + ' \u00b7 ' : '') + 'Ch. ' + (p.ch + 1)) + '</small></div>');
        return { front: field(p.word), back: back.join(''), tags: ['wordtrail', 'class', meta.title ? tag(meta.title) : '', 'ch' + (p.ch + 1)] };
      });
    }
    function ankiFile(notes) {   // the text of the file
      const out = ANKI_HEAD.slice();
      (notes || []).forEach(n => { if (n && n.front) out.push([n.front, n.back || '', (n.tags || []).filter(Boolean).join(' ')].join('\t')); });
      return out.join('\n') + '\n';
    }
    return { MAXW, BLANK, formsOf, find, blank, pick, rows, bank, range, clip, slug, fname, linkOf, parseLink, ankiNotes, ankiFile };
  })();   /*WSC-END*/

  const WSH = (() => {
    const q = id => document.getElementById(id);
    let link = null; try { link = WSC.parseLink(location.search); } catch (e) { link = null; }   // a class link this page was opened with (read before 301 clears the address bar)
    const st = { on: false, a: 0, b: 0, far: 0, bid: '', title: '', opt: { mean: true, bn: true, sent: true, key: false }, picks: [], info: new Map(), tok: 0, busy: false, note: '', opener: null };
    const trName = () => { try { const c = trLang(); return (TR_LANGS.find(x => x[0] === c) || [c, c])[1]; } catch (e) { return 'Bengali'; } };
    const infoObj = () => { const o = {}; st.info.forEach((v, k) => { o[k] = v; }); return o; };

    /* the paper: preview and print are the same drawing */
    function paper() {
      const rs = WSC.rows(st.picks, infoObj(), st.opt), o = st.opt;
      const sheet = h('div', { class: 'wsx-paper', lang: 'en' });
      sheet.append(h('h2', { class: 'wsx-title' }, 'Word worksheet · ' + st.title + ', ' + WSC.range(st.a, st.b)),
        h('p', { class: 'wsx-meta' }, h('span', {}, 'Name: ', h('i', { class: 'wsx-ln wsx-ln--m' })), h('span', {}, 'Date: ', h('i', { class: 'wsx-ln wsx-ln--s' }))));
      if (!rs.length) { sheet.append(h('p', { class: 'wsx-empty' }, 'No words found in these chapters.')); return sheet; }
      const ol = h('ol', { class: 'wsx-words' });
      rs.forEach(r => ol.append(h('li', { class: 'wsx-w' },
        h('span', { class: 'wsx-h' }, h('b', {}, r.word), r.ipa ? h('span', { class: 'wsx-ipa' }, '/' + r.ipa.replace(/^\/|\/$/g, '') + '/') : ''),
        r.meaning ? h('span', { class: 'wsx-m' }, r.meaning) : '', r.bn ? h('span', { class: 'wsx-bn', lang: trLangCode() }, r.bn) : '',
        r.line ? h('i', { class: 'wsx-ln wsx-ln--l' }) : '')));
      sheet.append(h('p', { class: 'wsx-sub' }, o.mean || o.bn ? 'Learn these words.' : 'Write what each word means.'), ol);
      const bk = WSC.bank(rs);
      if (o.sent && bk.length) {
        const sl = h('ol', { class: 'wsx-sents' });
        rs.forEach(r => { if (r.sentence) sl.append(h('li', { class: 'wsx-s' }, r.sentence)); });
        sheet.append(h('h3', { class: 'wsx-h3' }, 'Fill the blanks'), h('p', { class: 'wsx-bank' }, bk.join('   ·   ')), sl);
      }
      if (o.key) {
        const kl = h('ol', { class: 'wsx-keyl' });
        rs.forEach(r => kl.append(h('li', { class: 'wsx-k' }, h('b', {}, r.word), r.keyMeaning ? ' – ' + r.keyMeaning : '', r.keyBn ? h('span', { class: 'wsx-bn', lang: trLangCode() }, ' · ' + r.keyBn) : '', r.sentence ? h('small', {}, 'Blank: ' + r.form) : '')));
        sheet.append(h('div', { class: 'wsx-key' }, h('h3', { class: 'wsx-h3' }, 'Answer key'), kl));
      }
      return sheet;
    }
    const trLangCode = () => { try { return trLang(); } catch (e) { return 'bn'; } };

    /* ----- the words ----- */
    async function gather() {
      const m = S.model; let list = null;
      try { list = await vocBook(st.bid); } catch (e) { list = null; }
      let picks = WSC.pick(list && list.w, m.sents, st.a, st.b, WSC.MAXW);
      if (picks.length < 6) {   // no list (or a short one): the rare long words of the chapters
        const extra = []; for (let c = st.a; c <= st.b; c++) { try { QG.vocabWords(st.bid, m, c, st.far, 12).forEach(w => extra.push(w)); } catch (e) { /* none */ } }
        const more = WSC.pick(extra, m.sents, st.a, st.b, WSC.MAXW), have = new Set(picks.map(p => p.word));
        picks = picks.concat(more.filter(p => !have.has(p.word))).slice(0, WSC.MAXW);
      }
      return picks;
    }
    async function fill(tok) {   // meaning + pronunciation (DICT), translation (TP) for the words on the sheet; 4 at a time
      const need = st.picks.filter(p => { const d = st.info.get(p.word); return !d || !d.dict || (st.opt.bn && d.bnLang !== trLangCode()); });
      if (!need.length) { st.busy = false; paintAll(); return; }
      st.busy = true; let n = 0, miss = 0; const lg = trLangCode(); paintStatus('Getting the words…');
      const one = async p => {
        const d = Object.assign({}, st.info.get(p.word) || {});
        if (!d.dict) {
          const r = await DICT.get(p.word).catch(() => null);
          if (r && r.ok) { const mm = r.data.meanings[0]; d.ipa = r.data.ipa || ''; d.meaning = mm && mm.defs[0] ? mm.defs[0].d : ''; d.dict = 1; } else if (r && r.reason === 'none') d.dict = 1; else miss++;
        }
        if (st.opt.bn && d.bnLang !== lg) { try { d.bn = await TP.get(p.word, lg, { prio: 1, owner: 'ws' }); d.bnLang = lg; } catch (e) { miss++; } }
        if (tok === st.tok) st.info.set(p.word, d);
      };
      const queue = need.slice();
      await Promise.all([0, 1, 2, 3].map(async () => { for (let p; (p = queue.shift()) && tok === st.tok;) { await one(p); if (++n % 6 === 0) paintAll(); } }));
      if (tok !== st.tok) return;
      st.busy = false; st.note = miss ? 'Some meanings could not be found. You can still print.' : ''; paintAll();
    }
    async function refresh() {
      const tok = ++st.tok; st.busy = true; paintStatus('Finding the words…'); lock(true);
      let picks = []; try { picks = await gather(); } catch (e) { picks = []; }
      if (tok !== st.tok) return;
      st.picks = picks; paintAll();
      if (picks.length) await fill(tok); else { st.busy = false; paintAll(); }
    }

    /* ----- screen ----- */
    function lock(on) { ['ws-dl', 'ws-anki', 'ws-link'].forEach(id => { q(id).disabled = !!on; }); }
    function paintStatus(t) { q('ws-status').textContent = t || ''; }
    function paintAll() {
      const n = st.picks.length;
      q('ws-sub').textContent = st.title + ' · ' + WSC.range(st.a, st.b).replace('Ch.', 'Chapters').replace(/^Chapters (\d+)$/, 'Chapter $1') + ' · ' + n + (n === 1 ? ' word' : ' words');
      const box = q('ws-paper'); box.textContent = ''; box.append(paper());
      lock(st.busy || !n);
      paintStatus(st.busy ? 'Getting the words…' : !n ? 'No words found in these chapters. Try more chapters.' : st.note);
      $$('#ws-opts .lt-chip').forEach(b => b.setAttribute('aria-pressed', String(!!st.opt[b.dataset.k])));
    }
    function chips() {
      const row = q('ws-opts'); row.textContent = '';
      [['mean', 'Meanings'], ['bn', trName()], ['sent', 'Sentences'], ['key', 'Answer key']].forEach(([k, t]) => {
        const b = h('button', { type: 'button', class: 'lt-chip', 'data-k': k, 'aria-pressed': String(!!st.opt[k]) }, t);
        b.addEventListener('click', () => { st.opt[k] = !st.opt[k]; if (k === 'bn' && st.opt.bn) { st.tok++; st.busy = true; fill(st.tok); } paintAll(); });
        row.append(b);
      });
    }
    function range() {
      const fa = q('ws-from'), fb = q('ws-to'); fa.textContent = ''; fb.textContent = '';
      for (let c = 0; c <= st.far; c++) { fa.append(h('option', { value: c }, String(c + 1))); fb.append(h('option', { value: c }, String(c + 1))); }
      fa.value = String(st.a); fb.value = String(st.b);
    }
    function onRange(e) {
      let a = +q('ws-from').value, b = +q('ws-to').value;
      if (a > b) { if (e.target.id === 'ws-from') b = a; else a = b; }
      if (b - a > 9) { if (e.target.id === 'ws-from') b = a + 9; else a = b - 9; }   // ten chapters at most
      st.a = a; st.b = b; range(); refresh();
    }
    function start(ctx) {
      if (st.on) return true;
      let c = ctx; try { if (!c || c.bookId == null) c = LB.ctx(); } catch (e) { c = null; }
      if (!c || !S.book || !S.model || String(S.book.id) !== String(c.bookId)) { toast('Open a book to make its worksheet.', 2200); return false; }
      let far = -1; try { far = QG.furthest(S.lp, S.map, S.span); } catch (e) { far = -1; }
      try { const k = S.model.sents[S.curId]; if (k && !k.h && Number.isInteger(k.ch)) far = Math.max(far, k.ch); } catch (e) { /* no position yet */ }
      if (far < 0) { toast('Listen a little first. Worksheets use chapters you have reached.', 2600); return false; }
      const ch = Math.min(far, typeof c.chapter === 'number' && c.chapter >= 0 ? c.chapter : far);
      Object.assign(st, { on: true, a: ch, b: ch, far, bid: String(S.book.id), title: S.book.title || '', picks: [], note: '', opener: document.activeElement });
      st.info.clear(); chips(); range(); paintAll(); openSheet('sheet-ws'); refresh();
      try { q('ws-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }
    function finish() { if (!st.on) return; st.on = false; st.tok++; cleanPrint(); try { if (st.opener && st.opener.isConnected) st.opener.focus(); } catch (e) { /* ignore */ } }
    function close() { if (st.on) closeSheets(); finish(); }

    /* ----- print: the sheet alone goes to the printer (print style in 94u) ----- */
    let pr = null, prT = 0;
    function cleanPrint() { clearTimeout(prT); document.body.classList.remove('ws-printing'); if (pr) { pr.remove(); pr = null; } }
    function print() {
      if (!st.on || st.busy || !st.picks.length) return;
      if (typeof window.print !== 'function') { toast('This browser cannot print from here. Open the app in your browser.', 4000); return; }
      cleanPrint();
      pr = h('div', { id: 'ws-print', 'aria-hidden': 'true' }, paper()); document.body.append(pr);
      document.body.classList.add('ws-printing');
      const done = () => { window.removeEventListener('afterprint', done); cleanPrint(); };
      window.addEventListener('afterprint', done); prT = setTimeout(done, 120000);
      setTimeout(() => { try { window.print(); } catch (e) { done(); } }, 60);   // after the print style has applied
    }

    /* ----- Anki file and class link (Task 50) ----- */
    function anki() {
      if (!st.on || st.busy || !st.picks.length) return;
      download(WSC.fname(st.title, st.a, st.b), WSC.ankiFile(WSC.ankiNotes(st.picks, infoObj(), { title: st.title })), 'text/plain;charset=utf-8');
      toast('Words saved for Anki. In Anki, choose File > Import.', 3200);
    }
    async function copyLink() {
      if (!st.on || st.busy || !st.picks.length) return;
      const url = WSC.linkOf(location.origin + location.pathname, st.bid, st.a, st.b, st.picks.map(p => p.word));
      if (!url) { toast('This book cannot be shared by link.', 3000); return; }
      try { await navigator.clipboard.writeText(url); toast('Link copied.', 2000); return; } catch (e) { /* try the share sheet */ }
      try { if (navigator.share) { await navigator.share({ title: st.title, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      toast('Could not copy.', 3000);
    }
    /* a student opens the link: 301 opens the book page, then this shows the chapters and the word list of the class */
    function shared(b) {
      const l = link; link = null;
      if (!l || !b || String(l.bid) !== String(b.id)) return false;
      q('cw-sub').textContent = (b.title || '') + ' \u00b7 ' + WSC.range(l.a, l.b).replace('Ch.', 'Chapters').replace(/^Chapters (\d+)$/, 'Chapter $1') + ' \u00b7 ' + l.words.length + (l.words.length === 1 ? ' word' : ' words');
      const ol = q('cw-list'); ol.textContent = ''; l.words.forEach(w => ol.append(h('li', { class: 'cw-w' }, w)));
      openSheet('sheet-cw');
      try { q('cw-title').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      return true;
    }

    q('ws-x').addEventListener('click', close);
    q('cw-x').addEventListener('click', () => closeSheets());
    q('ws-anki').addEventListener('click', anki);
    q('ws-link').addEventListener('click', copyLink);
    q('ws-dl').addEventListener('click', print);
    q('ws-from').addEventListener('change', onRange); q('ws-to').addEventListener('change', onRange);
    new MutationObserver(() => { if (q('sheet-ws').hidden) finish(); }).observe(q('sheet-ws'), { attributes: true, attributeFilter: ['hidden'] });
    guideDoc('reading', 'Class worksheet', 'Study this chapter > Class worksheet: the hard words of a chapter on a printable A4 sheet. Choose Meanings, the translation, Sentences (fill the blanks) and an Answer key, then tap Download worksheet. The print window opens: choose a printer, or "Save as PDF". Only chapters you have reached are used.');
    return { start, close, paper, print, anki, copyLink, shared, state: () => ({ on: st.on, a: st.a, b: st.b, n: st.picks.length, opt: Object.assign({}, st.opt) }), get on() { return st.on; } };
  })();

  LearnHub.register({
    id: 'worksheet', order: 60, icon: '\u{1F4C4}', title: 'Class worksheet', subtitle: 'Print the words of a chapter',
    open: c => { WSH.start(c); }
  });
