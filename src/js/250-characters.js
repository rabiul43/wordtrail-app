  /* ---------- characters ----------
     No AI needed: names are picked out of the book's own text and the evidence is scored instead of using fixed cut-offs.
     For a person: "said X" / "X said", a title before the name, "X's", "Oh, X!", the name followed by an action verb, and
     appearing across several chapters. Against: "in X", "at X", "to X" (places). The net score puts a name in the list,
     in a collapsed "Maybe" group, or drops it. For each character: where it first appears, how often, who it is seen with. */
  const CH_TITLES = 'Mr|Mrs|Miss|Ms|Dr|Sir|Lord|Lady|Captain|Colonel|Professor|Madame|Monsieur|Mademoiselle|Uncle|Aunt|Father|Mother|Brother|Sister|Count|Countess|King|Queen|Prince|Princess';
  const CH_STOP = new Set(('Chapter Project Gutenberg LibriVox Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December God Heaven Christmas English French German Latin Greek Italian Spanish American British England France Germany London Paris Rome New This That There Here What When Where Which While Who How Why Some Such Every Each Many Most Other Only Even Still Just Also Very Good Great Great Little Old Young Dear Poor Mister Missus').split(' '));
  const CH_SURE = 5, CH_MAYBE = 2;   // net score: from CH_SURE a character, from CH_MAYBE a "Maybe", below that dropped
  const CH_ACT = 'looked|smiled|laughed|frowned|grinned|nodded|sighed|wept|shrugged|turned|walked|ran|hurried|stood|sat|rose|climbed|jumped|followed|listened|wondered|thought|felt|knew|remembered|decided|wanted|hoped|feared|loved|hated|took|gave|told|picked|pulled|pushed|opened|closed|shook|put|met|saw|heard|began|stopped|waited|left|came|stepped|knelt|bowed|blushed|trembled|hesitated|nodded|stared|glanced|hesitated|tried|laid|fell';
  const chEv = () => ({ said: 0, title: 0, poss: 0, voc: 0, act: 0, inat: 0, to: 0 });
  /* Each kind of clue adds points, but is capped so one repeated phrase cannot decide it on its own. Place clues are judged
     against how often the name is used at all, so a hero who is often "to Alice"'d is not mistaken for a town. */
  function chScore(r, nReal) {
    const e = r.ev, up = (v, k) => Math.min(v, k), f = nReal > 1 ? r.chs.size / nReal : 0;
    const spread = r.chs.size < 2 ? 0 : f >= 0.5 ? 3 : f >= 0.25 ? 2 : 1;
    const person = 3 * up(e.said, 5) + 3 * up(e.title, 2) + up(e.poss, 4) + 2 * up(e.voc, 3) + up(e.act, 5) + spread;
    const place = Math.min(10, Math.round(12 * (2 * e.inat + e.to) / Math.max(1, r.n)));
    return { person, place, net: person - place };
  }
  /* one line saying why a name is only a "Maybe" */
  function chWhy(r) {
    const e = r.ev, p = [], q = [], x = (n, w) => n + '\u00d7 ' + w;
    if (e.said) p.push(x(e.said, 'speaking')); if (e.title) p.push(x(e.title, 'title')); if (e.poss) p.push(x(e.poss, 'possessive'));
    if (e.voc) p.push(x(e.voc, 'called out')); if (e.act) p.push(x(e.act, 'doing something')); if (r.chs.size > 1) p.push(r.chs.size + ' chapters');
    if (e.inat) q.push(x(e.inat, '\u201cin/at\u201d')); if (e.to) q.push(x(e.to, '\u201cto\u201d'));
    return 'Why unsure: ' + (p.length ? 'person clues \u2013 ' + p.join(', ') : 'no clear person clues') + (q.length ? '; place clues \u2013 ' + q.join(', ') : '') + '.';
  }
  const CHS = { sort: 'n', last: null };   // the sort chosen on the Characters screen (kept while the app is open)
  /* A line that reads like a contents entry or a chapter synopsis ("Tom's Feelings Investigated—Wonderful Dream—Becky
     Thatcher Overshadowed") is not story text: it has no sentence ending and is mostly Capitalised Words.
     Gutenberg tables of contents wrap onto such lines, and they used to count as the first mention of a character. */
  function chTitleLike(t) {
    const s = String(t || '').trim();
    if (!s || /[.!?\u2026][\u201d"\u2019')\]]*$/.test(s)) return false;
    const w = s.split(/\s+/).filter(x => /[A-Za-z]/.test(x));
    if (w.length < 2) return false;
    const cap = w.filter(x => /^[\u201c"\u2018'(]?[A-Z]/.test(x)).length;
    return cap / w.length >= 0.6;
  }
  /* "CHAPTER XVII. Memories of the Lost Heroes—The Point in Tom's Secret" -> "Chapter XVII" */
  function chShort(title) {
    const t = String(title || '').trim(), m = t.match(/^(chapter|book|part|letter|canto|stave|section)\s+([0-9]+|[IVXLCDM]+)\b/i);
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2].toUpperCase();
    return t.length > 36 ? t.slice(0, 35).trimEnd() + '\u2026' : t;
  }
  /* The sentence shown as the introduction. A very short first mention ("Tom!") gets the sentence after it
     (same paragraph) so the card says something; "Go to first mention" still goes to the real first mention. */
  function chIntro(m, id) {
    const s = m.sents[id], nx = m.sents[id + 1];
    let t = s.t;
    if (t.length < 45 && nx && !nx.h && nx.p === s.p && !chTitleLike(nx.t)) t += ' ' + nx.t;
    return t;
  }
  /* "Mr. Darcy", "Aunt Polly" (only Mr, Mrs, Ms and Dr are abbreviations that take a full stop) */
  function chDisp(r) {
    if (!r.title || r.name.includes(' ')) return r.name;
    return r.title + (/^(?:Mr|Mrs|Ms|Dr)$/.test(r.title) ? '. ' : ' ') + r.name;
  }
  function chBuild() {
    const m = S.model;
    if (!m) return [];
    if (m._chars) return m._chars;
    if (m._chRaw) return chFix(m);
    const re = new RegExp('\\b((?:' + CH_TITLES + ')\\.?\\s+)?([A-Z][a-z]{2,}(?:\\s[A-Z][a-z]{2,})?)\\b', 'g');
    const spkA = new RegExp('^[,.]?\\s*(?:' + QZ_V + ')\\b'), spkB = new RegExp('(?:' + QZ_V + ')\\s+(?:the\\s+)?$');
    const prepIn = /\b(?:in|at)\s+$/i, prepTo = /\bto\s+$/i, spkTo = new RegExp('(?:' + QZ_V + ')\\s+to\\s+$');
    const actA = new RegExp('^\\s+(?:[a-z]+ly\\s+)?(?:' + CH_ACT + ')\\b'), vocB = /\b(?:oh|ah|hush|hello|hallo|hey|why|well|dear|nay|alas|goodbye|farewell)[,!]?\s+$/i;
    /* Ordinary words, found from the book itself: a word that is often written in lower case and rarely capitalised
       in the middle of a sentence ("for", "without", "were", "death") is not a name. No word list needed. */
    const low = new Map(), capMid = new Map();
    m.chapters.forEach(c => {
      if (c.front) return;
      for (let k = c.start; k < c.end; k++) {
        const s = m.sents[k]; if (s.h) continue;
        const tk = s.t.match(/[A-Za-z][A-Za-z\u2019']*/g) || [];
        for (let i = 0; i < tk.length; i++) {
          const w = tk[i].replace(/[\u2019']s$/, '');
          if (/^[a-z]/.test(w)) low.set(w, (low.get(w) || 0) + 1);
          else if (i > 0 && /^[A-Z][a-z]+$/.test(w)) { const q = w.toLowerCase(); capMid.set(q, (capMid.get(q) || 0) + 1); }
        }
      }
    });
    const chPlain = w => { const q = w.toLowerCase(), l = low.get(q) || 0; return l >= 4 && l > 2 * (capMid.get(q) || 0); };
    const map = new Map(), valid = new Set();
    m.chapters.forEach((c, ci) => {
      if (c.front) return;
      for (let k = c.start; k < c.end; k++) {
        const sent = m.sents[k]; if (sent.h || chTitleLike(sent.t)) continue;
        valid.add(ci);
        const t = sent.t; re.lastIndex = 0; let x;
        while ((x = re.exec(t))) {
          const title = x[1] ? x[1].trim().replace(/\.$/, '') : '';
          let name = x[2], words = name.split(' ');
          if (!title && words.length > 1 && (QZ_NOT_NAME.has(words[0]) || CH_STOP.has(words[0]) || (/^[\s\u201c"\u2018'(\[\u2014-]*$/.test(t.slice(0, x.index)) && chPlain(words[0])))) { name = words[1]; words = [name]; }   // "Without Ligeia" -> "Ligeia"
          if (CH_STOP.has(words[0]) || QZ_NOT_NAME.has(words[0]) || words.some(w => CH_STOP.has(w))) continue;
          if (!title && words.length === 1 && chPlain(name)) continue;   // an ordinary word, not a name
          const pos = x.index + (x[1] ? x[1].length : 0), tail = t.slice(x.index + x[0].length), before = t.slice(0, x.index);
          const atStart = /^[\s“"‘'(\[—-]*$/.test(t.slice(0, pos));
          const spoken = spkA.test(tail) || spkB.test(before), poss = /^['’]s\b/.test(tail);
          const act = actA.test(tail), voc = vocB.test(before) && /^\s*[!,?]/.test(tail);   // "X looked up", "Oh, X!"
          const inAt = prepIn.test(before), toPl = prepTo.test(before) && !spkTo.test(before);   // "in X", "at X", "to X" (but not "said to X")
          if (atStart && !title && !spoken && !poss && !act && !voc && words.length === 1) continue;   // just a capitalised first word (two capitalised words are kept: likely a full name)
          const key = /^(?:Mr|Mrs|Miss|Ms)$/.test(title) ? title + ' ' + name : name;   // "Mr. Bennet" and "Mrs. Bennet" are different people
          let r = map.get(key);
          if (!r) { r = { name, key, n: 0, ev: chEv(), first: k, ids: new Set(), chs: new Set(), cn: new Map(), cf: new Map(), all: [], aka: [], title: '' }; map.set(key, r); }
          r.n++; const ev = r.ev; if (spoken) ev.said++; if (title) ev.title++; if (poss) ev.poss++; if (voc) ev.voc++; if (act) ev.act++; if (inAt) ev.inat++; if (toPl) ev.to++;
          if (r.ids.size < 60) r.ids.add(k); r.chs.add(ci); if (title && !r.title) r.title = title;
          r.cn.set(ci, (r.cn.get(ci) || 0) + 1); if (!r.cf.has(ci)) r.cf.set(ci, k);   // mentions and first sentence per chapter
          if (r.all[r.all.length - 1] !== k) r.all.push(k);   // every sentence that mentions them, in book order
        }
      }
    });
    chAlias(map, m);   // Tom + Tom Sawyer, Darcy + Mr. Darcy, Lizzy + Elizabeth ...
    m._chRaw = [...map.values()].filter(r => r.n >= 2 && chScore(r, valid.size).net >= CH_MAYBE).sort((a, b) => b.n - a.n).slice(0, 80);   // scored again after the reader's corrections
    m._chReal = [...valid].sort((x, y) => x - y);   // chapters that have real story text (not contents lines)
    return chFix(m);
  }
  /* Nicknames: each row is one given name. Only common, fairly safe pairs; an alias is still refused when the two names
     turn up in the same sentence (people who are named together are not the same person) or when more than one person fits. */
  const CH_CANON = new Map();
  ['elizabeth lizzy lizzie liz eliza betsy betsey betty beth bessie bess libby', 'margaret maggie meg peggy margie', 'catherine katherine kate katie kitty cathy',
   'william bill billy will willie willy', 'thomas tom tommy', 'james jim jimmy jem jamie', 'john jack johnny', 'robert bob bobby rob robbie', 'richard dick dicky rick richie',
   'edward ned ted teddy eddie', 'henry harry hal', 'charles charlie charley', 'joseph joe joey', 'samuel sam sammy', 'benjamin ben benny', 'daniel dan danny', 'david dave davy',
   'francis frank frankie', 'frances fanny', 'alexander alex sandy', 'anthony tony', 'nicholas nick nicky', 'frederick fred freddy', 'arthur art', 'albert bert', 'andrew andy drew',
   'timothy tim timmy', 'ann anne annie nan nancy', 'sarah sally sadie', 'susan susie suzy sue', 'caroline carrie', 'louisa louise lou', 'josephine jo josie', 'rebecca becky beck',
   'sophia sophie sophy', 'eleanor nell nelly nellie', 'isabella isabel bella', 'gertrude gertie trudy', 'huckleberry huck', 'theodore theo', 'abraham abe', 'jacob jake', 'matthew matt']
    .forEach(g => { const w = g.split(' '); w.forEach(x => CH_CANON.set(x, w[0])); });
  const chCanon = w => CH_CANON.get(w.toLowerCase()) || w.toLowerCase();
  /* Joins records that are one person under different names. Two people who only share a first name or a surname stay apart:
     "Tom Sawyer" and "Tom Canty" are never joined; a bare "Tom" joins one of them only if it is the only fit or clearly the main one. */
  function chAlias(map, m) {
    const words = r => r.name.split(' '), isFull = r => r.name.includes(' ') || r.key !== r.name;   // full = two-word name or titled ("Mr. Darcy")
    /* sentences where both names stand side by side as separate words (read from the text, so a name that opens a sentence counts too) */
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const overlap = (a, o) => {
      const ra = new RegExp('\\b' + esc(a.name) + '\\b'), ro = new RegExp('\\b' + esc(o.name) + '\\b', 'g'); let c = 0;
      for (const id of new Set(a.all.concat(o.all))) { const t = m.sents[id].t; if (ro.test(t)) { ro.lastIndex = 0; if (ra.test(t.replace(ro, ' '))) c++; } ro.lastIndex = 0; }
      return c;
    };
    const drop = r => map.delete(r.key);
    // "Miss Elizabeth Bennet" and "Elizabeth Bennet" are the same name with and without a title
    for (const r of [...map.values()]) {
      if (r.key === r.name || !r.name.includes(' ')) continue;
      const t = map.get(r.name); if (t && t !== r) { chFold(t, r); drop(r); if (!t.title) t.title = r.title; }
    }
    // "Lizzy Bennet" and "Elizabeth Bennet": same surname, same given name under a nickname (never two different given names)
    const duo = [...map.values()].filter(r => r.key === r.name && words(r).length === 2).sort((a, b) => a.n - b.n);
    for (const a of duo) {
      if (map.get(a.key) !== a) continue;
      const [f, s] = words(a), pool = duo.filter(o => o !== a && map.get(o.key) === o && words(o)[1] === s && words(o)[0] !== f && chCanon(words(o)[0]) === chCanon(f) && overlap(a, o) === 0 && o.n >= a.n);
      if (pool.length === 1) { chFold(pool[0], a); drop(a); }
    }
    // a bare single name: "Tom", "Sawyer", "Polly", "Lizzy"
    const bare = [...map.values()].filter(r => r.key === r.name && !r.name.includes(' ')).sort((a, b) => a.n - b.n);
    for (const a of bare) {
      if (map.get(a.key) !== a) continue;
      const exact = [], nick = [], peer = [];
      for (const o of map.values()) {
        if (o === a) continue;
        const w = words(o);
        if (isFull(o)) {
          if (w.includes(a.name)) { const c = overlap(a, o); if (c < 2 || c < 0.2 * a.all.length) exact.push(o); }
          else if (w.length === 2 && o.key === o.name && a.name !== w[0] && chCanon(a.name) === chCanon(w[0]) && overlap(a, o) === 0) nick.push(o);
        } else if (a.name !== o.name && chCanon(a.name) === chCanon(o.name) && o.n >= a.n && overlap(a, o) === 0) peer.push(o);
      }
      const pool = (exact.length ? exact : nick.length ? nick : peer).sort((x, y) => y.n - x.n);
      if (!pool.length) continue;
      if (pool.length > 1 && pool[0].n < 3 * pool[1].n) continue;   // more than one person fits: keep it apart
      chFold(pool[0], a); drop(a);
    }
  }
  /* The reader's corrections for this book (saved on this device): names marked "not a character", and names merged into another */
  function chFixes() {
    const k = S.book ? store.get('wt:chfix:' + S.book.id, null) : null;
    return { hide: k && Array.isArray(k.hide) ? k.hide : [], keep: k && Array.isArray(k.keep) ? k.keep : [], merge: k && k.merge && typeof k.merge === 'object' ? k.merge : {} };
  }
  const chFixCount = () => { const f = chFixes(); return f.hide.length + f.keep.length + Object.keys(f.merge).length; };
  function chFixSave(fx) { if (S.book) store.set('wt:chfix:' + S.book.id, fx); if (S.model) S.model._chars = null; }
  function chClone(r) { return Object.assign({}, r, { ev: Object.assign({}, r.ev), ids: new Set(r.ids), chs: new Set(r.chs), cn: new Map(r.cn), cf: new Map(r.cf), all: r.all.slice(), aka: (r.aka || []).slice() }); }
  function chFold(o, a) {   // a is the same person as o
    o.n += a.n; Object.keys(o.ev).forEach(k => { o.ev[k] += a.ev[k]; }); a.ids.forEach(id => { if (o.ids.size < 60) o.ids.add(id); }); a.chs.forEach(c => o.chs.add(c));
    a.cn.forEach((v, c) => { o.cn.set(c, (o.cn.get(c) || 0) + v); const f = a.cf.get(c); if (!o.cf.has(c) || f < o.cf.get(c)) o.cf.set(c, f); });
    o.all = [...new Set(o.all.concat(a.all))].sort((x, y) => x - y); o.first = Math.min(o.first, a.first); if (!o.title && a.title) o.title = a.title;
    o.aka = [...new Set((o.aka || []).concat(a.aka || [], [chDisp(a)]))];   // other names it was seen under
  }
  /* The scan result with those corrections applied. The slow part (reading the book) is done once; this is cheap and runs again after every correction. */
  function chFix(m) {
    const fx = chFixes();
    let recs = m._chRaw.map(chClone);
    const find = nm => recs.find(r => chDisp(r) === nm);
    for (const from of Object.keys(fx.merge)) {
      let to = fx.merge[from], g = 0; while (fx.merge[to] && g++ < 5) to = fx.merge[to];
      const a = find(from), o = find(to);
      if (a && o && a !== o) { chFold(o, a); recs = recs.filter(r => r !== a); }
    }
    const hide = new Set(fx.hide), keep = new Set(fx.keep), nReal = (m._chReal || []).length;
    recs.forEach(r => { const s = chScore(r, nReal); r.net = s.net; });   // scored after merges, so a merged name adds its clues up
    const live = recs.filter(r => !hide.has(chDisp(r)));
    const people = live.filter(r => keep.has(chDisp(r)) || r.net >= CH_SURE).sort((a, b) => b.n - a.n).slice(0, 30);
    const maybes = live.filter(r => !people.includes(r) && r.net >= CH_MAYBE).sort((a, b) => b.net - a.net || b.n - a.n).slice(0, 20);
    const list = people.concat(maybes);
    list.forEach(r => {
      r.co = new Map();   // seen together with: real characters only
      r.ids.forEach(id => people.forEach(o => { if (o !== r && o.ids.has(id)) r.co.set(o, (r.co.get(o) || 0) + 1); }));
    });
    m._chars = list.map((r, ix) => {
      const co = [...r.co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return {
        ix, name: chDisp(r), n: r.n, chapters: r.chs.size, first: r.first, cn: r.cn, cf: r.cf, all: r.all,
        aka: (r.aka || []).filter(x => x !== chDisp(r)), maybe: !people.includes(r), net: r.net, why: people.includes(r) ? '' : chWhy(r),
        intro: chIntro(m, r.first),
        with: co.map(e => chDisp(e[0])), withIx: co.map(e => list.indexOf(e[0]))
      };
    });
    return m._chars;
  }
  function chGo(id) {
    closeSheets();
    const sec = S.sentSec ? S.sentSec[id] : null;
    if (sec == null || !S.plan[sec]) { toast('That part is not matched to the audio yet.'); return false; }
    const t = sentTime(S.plan[sec], S.sentPos[id]);
    if (sec === S.sec) { seekAudio(t); const sp = S.spans.get(id); if (sp) sp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else goTrack(sec, t, false);
    return true;
  }
  function chJump(c, id) { CHS.last = { nm: c.name, id, at: Date.now() }; return chGo(id); }
  /* Next mention after the current position (or after the last jump, which may not have reached the page yet); after the last one it starts over */
  function chNext(c) {
    const ok = id => { const sec = S.sentSec ? S.sentSec[id] : null; return sec != null && !!S.plan[sec]; };
    const recent = CHS.last && CHS.last.nm === c.name && Date.now() - CHS.last.at < 20000;
    const base = Math.max(S.curId, recent ? CHS.last.id : -1);
    let at = c.all.findIndex(id => id > base && ok(id)), wrapped = false;
    if (at < 0) { at = c.all.findIndex(ok); wrapped = true; }
    if (at < 0) { closeSheets(); toast('No mention of ' + c.name + ' is matched to the audio yet.'); return; }
    if (chJump(c, c.all[at])) toast((wrapped ? 'Back to the start · ' : '') + 'Mention ' + (at + 1) + ' of ' + c.all.length, 2200);
  }
  /* Underlines every sentence that mentions one character (sentence level, so the synced highlight is not touched). c = null turns it off. */
  function chMarkPaint() {
    $$('.s.chm', el.page).forEach(n => n.classList.remove('chm'));
    const k = S.chMark;
    if (k && k.m === S.model) k.ids.forEach(id => { const sp = S.spans.get(id); if (sp) sp.classList.add('chm'); });
  }
  function chMarkSet(c, hue) {
    S.chMark = c ? { m: S.model, nm: c.name, ids: new Set(c.all), hue } : null;
    document.documentElement.style.setProperty('--chm-h', c ? String(hue) : '');
    chMarkPaint();
  }
  function charsOpen() {
    const list = $('#ch-list'), empty = $('#ch-empty'), tools = $('#ch-tools'); list.textContent = ''; tools.textContent = ''; tools.hidden = true;
    if (!S.model) { empty.textContent = 'This book has no text loaded, so characters cannot be found.'; empty.hidden = false; openSheet('sheet-chars'); return; }
    let a = chBuild();
    const syncEmpty = () => {
      const np = a.filter(x => !x.maybe).length;
      empty.textContent = np ? '' : a.length ? 'No clear characters were found. Names we are unsure about are under Maybe.'
        : chFixCount() ? 'No characters are shown. Open Corrections to bring names back.' : 'No clear characters were found in this book (poems and essays often have none).';
      empty.hidden = np > 0;
    };
    syncEmpty();
    const rows = [], real = S.model._chReal || [];
    const hue = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x * 33) ^ s.charCodeAt(i)) >>> 0; return x % 360; };
    const toggle = item => {
      const open = !item.classList.contains('open');
      rows.forEach(r => { r.item.classList.remove('open'); r.btn.setAttribute('aria-expanded', 'false'); r.more.hidden = true; });
      if (open) { const r = rows.find(x => x.item === item); item.classList.add('open'); r.btn.setAttribute('aria-expanded', 'true'); r.more.hidden = false; setTimeout(() => item.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); }
    };
    /* one tick per chapter of the book: filled where the character appears, stronger where they appear more */
    const strip = (c, cls) => {
      const mx = Math.max(1, ...c.cn.values()), el = h('span', { class: cls });
      real.forEach(ci => { const v = c.cn.get(ci) || 0; el.append(h('i', v ? { class: 'on', style: 'opacity:' + (0.4 + 0.6 * v / mx).toFixed(2) } : {})); });
      return el;
    };
    const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const bare = n => n.replace(new RegExp('^(?:' + CH_TITLES + ')\\.?\\s+'), '');
    const curCh = S.curId >= 0 && S.model.sents[S.curId] ? S.model.sents[S.curId].ch : -1, hasHere = real.includes(curCh);
    const view = { q: '', here: false, fixes: false, maybeOpen: false };
    const SORTS = [['n', 'Most mentioned'], ['first', 'First appearance'], ['az', 'A–Z']];
    const qIn = h('input', { type: 'search', placeholder: 'Search characters', 'aria-label': 'Search characters', autocomplete: 'off', enterkeyhint: 'search' });
    const cnt = h('div', { class: 'ch-count', 'aria-live': 'polite' });
    const sortBtns = SORTS.map(([k, label]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(CHS.sort === k), onclick: () => { CHS.sort = k; sortBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(SORTS[i][0] === k))); render(); } }, label));
    const hereBtn = hasHere ? h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => { view.here = !view.here; hereBtn.setAttribute('aria-pressed', String(view.here)); render(); } }, 'In this chapter') : null;
    qIn.addEventListener('input', () => { view.q = qIn.value.trim(); render(); });
    const fixBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', hidden: true, onclick: () => { view.fixes = !view.fixes; syncFixes(); } });
    const fixPanel = h('div', { class: 'ch-fixes', hidden: true });
    tools.append(qIn, h('div', { class: 'ch-chips', role: 'group', 'aria-label': 'Sort and filter' }, sortBtns, hereBtn, fixBtn), cnt);
    const markNote = h('div', { class: 'ch-count' });
    tools.append(markNote, fixPanel);
    const syncNote = () => {
      markNote.textContent = ''; const k = S.chMark && S.chMark.m === S.model ? S.chMark : null, mc = k ? a.find(x => x.name === k.nm) : null;
      markNote.hidden = !mc;
      if (mc) markNote.append('Underlining sentences with ' + mc.name + ' · ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => { chMarkSet(null); syncNote(); render(); } }, 'Turn off'));
    };
    const openIx = ix => {   // a tapped "Often with" name: show that character's card
      if (view.q || view.here) { view.q = ''; view.here = false; qIn.value = ''; if (hereBtn) hereBtn.setAttribute('aria-pressed', 'false'); render(); }
      const r = rows.find(x => x.ix === ix); if (r && !r.item.classList.contains('open')) toggle(r.item);
    };
    const bid = S.book ? S.book.id : null;
    const edit = fn => { if ((S.book ? S.book.id : null) !== bid) return; const fx = chFixes(); fn(fx); chFixSave(fx); reload(); };   // only for the book this screen was opened for
    const reload = () => {
      a = chBuild();
      if (S.chMark && S.chMark.m === S.model && !a.some(x => x.name === S.chMark.nm)) chMarkSet(null);
      syncEmpty(); syncNote(); syncFixes(); render();
    };
    const syncFixes = () => {
      const fx = chFixes(), N = fx.hide.length + fx.keep.length + Object.keys(fx.merge).length;
      if (!N) view.fixes = false;
      fixBtn.hidden = N === 0; fixBtn.textContent = 'Corrections (' + N + ')'; fixBtn.setAttribute('aria-pressed', String(view.fixes));
      fixPanel.hidden = !view.fixes; fixPanel.textContent = '';
      if (view.fixes) {
        fx.hide.forEach(nm => fixPanel.append(h('div', { class: 'ch-fixrow' }, h('span', {}, 'Hidden: ' + nm), h('button', { class: 'ch-wlink', type: 'button', onclick: () => edit(f => { f.hide = f.hide.filter(x => x !== nm); }) }, 'Restore'))));
        fx.keep.forEach(nm => fixPanel.append(h('div', { class: 'ch-fixrow' }, h('span', {}, 'Kept as a character: ' + nm), h('button', { class: 'ch-wlink', type: 'button', onclick: () => edit(f => { f.keep = f.keep.filter(x => x !== nm); }) }, 'Undo'))));
        Object.keys(fx.merge).forEach(from => fixPanel.append(h('div', { class: 'ch-fixrow' }, h('span', {}, 'Merged: ' + from + ' → ' + fx.merge[from]), h('button', { class: 'ch-wlink', type: 'button', onclick: () => edit(f => { delete f.merge[from]; }) }, 'Undo'))));
      }
      tools.hidden = a.length === 0 && N === 0;
    };
    const hideChar = c => {
      edit(f => { if (!f.hide.includes(c.name)) f.hide.push(c.name); f.keep = f.keep.filter(x => x !== c.name); });
      toast('Hid “' + c.name + '”.', 5000, ['Undo', () => edit(f => { f.hide = f.hide.filter(x => x !== c.name); })]);
    };
    const keepChar = c => {   // "Yes, it is a character" on a Maybe
      edit(f => { if (!f.keep.includes(c.name)) f.keep.push(c.name); });
      toast('Added \u201c' + c.name + '\u201d to the characters.', 5000, ['Undo', () => edit(f => { f.keep = f.keep.filter(x => x !== c.name); })]);
    };
    const mergeChar = (c, to) => {
      edit(f => { f.merge[c.name] = to; });
      toast('Merged “' + c.name + '” into “' + to + '”.', 5000, ['Undo', () => edit(f => { delete f.merge[c.name]; })]);
      const t = a.find(x => x.name === to); if (t) openIx(t.ix);
    };
    const render = () => {
      const q = norm(view.q);
      const v = a.filter(c => (!q || norm(c.name).includes(q) || c.aka.some(x => norm(x).includes(q))) && (!view.here || c.cn.has(curCh)));
      if (CHS.sort === 'first') v.sort((x, y) => x.first - y.first || y.n - x.n);
      else if (CHS.sort === 'az') v.sort((x, y) => bare(x.name).localeCompare(bare(y.name)) || y.n - x.n);
      else v.sort((x, y) => y.n - x.n);
      const ppl = v.filter(c => !c.maybe), may = v.filter(c => c.maybe), tp = a.filter(c => !c.maybe).length;
      const where = view.here ? 'In ' + chShort(S.model.chapters[curCh].title) + ' \u00b7 ' : '';
      cnt.textContent = ppl.length ? where + (ppl.length === tp ? ppl.length + (ppl.length === 1 ? ' character' : ' characters') : ppl.length + ' of ' + tp + ' characters')
        : view.q ? 'No character matches \u201c' + view.q + '\u201d' + (may.length ? ' \u2013 see Maybe below.' : '.')
        : view.here ? 'No listed character appears in this chapter.' : '';
      cnt.hidden = !cnt.textContent;
      list.textContent = ''; rows.length = 0;
    const build = c => {
      const chap = S.model.chapters[S.model.sents[c.first].ch];
      const intro = c.intro.length > 260 ? c.intro.slice(0, 257).trimEnd() + '…' : c.intro;
      const letter = (bare(c.name).charAt(0) || '?').toUpperCase(), hu = hue(c.name);
      const av = h('span', { class: 'ch-av', 'aria-hidden': 'true', style: 'background:color-mix(in srgb, hsl(' + hu + ' 55% 50%) 30%, var(--surface));border-color:color-mix(in srgb, hsl(' + hu + ' 55% 50%) 55%, transparent)' }, letter);
      const small = real.length > 1 ? strip(c, 'ch-strip') : null;
      if (small) small.setAttribute('aria-hidden', 'true');
      const btn = h('button', { class: 'ch-row', type: 'button', 'aria-expanded': 'false' },
        av,
        h('span', { class: 'ch-main' },
          h('span', { class: 'ch-name' }, c.name),
          h('span', { class: 'ch-meta' }, c.n + ' mentions · ' + (c.chapters === 1 ? '1 chapter' : c.chapters + ' chapters')),
          small),
        h('span', { class: 'ch-chev', 'aria-hidden': 'true' }));
      /* in the opened card the strip is bigger and can be tapped: it snaps to the nearest chapter the character is in */
      let big = null, cap = null, goCh = null;
      if (real.length > 1) {
        big = strip(c, 'ch-strip big');
        cap = h('div', { class: 'ch-cap' }, 'Appears in ' + c.chapters + ' of ' + real.length + ' chapters · tap the strip to pick one');
        goCh = h('button', { class: 'btn small ghost', type: 'button', hidden: true }, 'Go to this chapter');
        const present = real.map((ci, i) => c.cn.has(ci) ? i : -1).filter(i => i >= 0);
        let sel = -1;
        const pick = i => {
          if (!present.length) return;
          let best = present[0]; for (const p of present) if (Math.abs(p - i) < Math.abs(best - i)) best = p;
          sel = best;
          const ci = real[best], n = c.cn.get(ci);
          [...big.children].forEach((e, j) => e.classList.toggle('sel', j === best));
          cap.textContent = chShort(S.model.chapters[ci].title) + ' · ' + n + (n === 1 ? ' mention' : ' mentions');
          big.setAttribute('aria-valuenow', String(best + 1)); big.setAttribute('aria-valuetext', cap.textContent);
          goCh.hidden = false;
        };
        big.setAttribute('role', 'slider'); big.setAttribute('tabindex', '0'); big.setAttribute('aria-label', 'Chapters where ' + c.name + ' appears');
        big.setAttribute('aria-valuemin', '1'); big.setAttribute('aria-valuemax', String(real.length));
        big.addEventListener('click', e => {
          const r = big.getBoundingClientRect(); let f = (e.clientX - r.left) / Math.max(1, r.width);
          if (getComputedStyle(big).direction === 'rtl') f = 1 - f;
          pick(Math.max(0, Math.min(real.length - 1, Math.floor(f * real.length))));
        });
        big.addEventListener('keydown', e => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const dir = (e.key === 'ArrowRight' ? 1 : -1) * (getComputedStyle(big).direction === 'rtl' ? -1 : 1), pi = present.indexOf(sel);
          pick(present[Math.max(0, Math.min(present.length - 1, pi < 0 ? (dir > 0 ? 0 : present.length - 1) : pi + dir))]);
        });
        goCh.addEventListener('click', () => { if (sel >= 0) chGo(c.cf.get(real[sel])); });
      }
      const marked = () => S.chMark && S.chMark.m === S.model && S.chMark.nm === c.name;
      const mark = h('button', { class: 'btn small ghost ch-mark', type: 'button', 'aria-pressed': String(!!marked()) }, marked() ? 'Underlining in text · turn off' : 'Underline in text');
      mark.addEventListener('click', () => {
        if (marked()) { chMarkSet(null); mark.setAttribute('aria-pressed', 'false'); mark.textContent = 'Underline in text'; syncNote(); return; }
        chMarkSet(c, hu); closeSheets(); toast('Sentences with ' + c.name + ' are underlined. Open Characters to turn it off.', 3600);
      });
      const fixRow = h('div', { class: 'ch-fix' });
      const showFix = () => {
        fixRow.textContent = '';
        if (c.maybe) fixRow.append('Is this a character? ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => keepChar(c) }, 'Yes, keep it'), ' \u00b7 ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => hideChar(c) }, 'No, hide it'), ' \u00b7 ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => showMerge() }, 'Same person as\u2026'));
        else fixRow.append('Wrong name? ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => hideChar(c) }, 'Not a character'), ' \u00b7 ', h('button', { class: 'ch-wlink', type: 'button', onclick: () => showMerge() }, 'Same person as\u2026'));
      };
      const showMerge = () => {
        const others = a.filter(x => x !== c && !x.maybe); if (!others.length) return;
        const words = bare(c.name).toLowerCase().split(' '), guess = others.find(x => bare(x.name).toLowerCase().split(' ').some(w => words.includes(w)));
        const sel = h('select', { class: 'num', 'aria-label': c.name + ' is the same person as' },
          h('option', { value: '', disabled: true, selected: !guess }, 'Choose a character'),
          others.map(x => h('option', { value: x.name, selected: x === guess }, x.name)));
        fixRow.textContent = '';
        fixRow.append(h('div', {}, '“' + c.name + '” is the same person as:'), sel,
          h('div', { class: 'hl-act' }, h('button', { class: 'btn small', type: 'button', onclick: () => { if (sel.value) mergeChar(c, sel.value); } }, 'Merge'), h('button', { class: 'btn small ghost', type: 'button', onclick: showFix }, 'Cancel')));
      };
      showFix();
      const more = h('div', { class: 'ch-more', hidden: true },
        chap && chap.title && !chap.front ? h('div', { class: 'ch-first' }, 'First in ' + chShort(chap.title)) : null,
        c.aka.length ? h('div', { class: 'ch-first' }, 'Also called ' + c.aka.join(', ')) : null,
        h('p', { class: 'ch-intro' }, '“' + intro + '”'),
        c.maybe ? h('p', { class: 'ch-why' }, c.why) : null,
        c.with.length ? h('div', { class: 'ch-with' }, 'Often with: ', c.with.flatMap((nm, i) => [i ? ', ' : null, h('button', { class: 'ch-wlink', type: 'button', onclick: () => openIx(c.withIx[i]) }, nm)])) : null,
        big, cap,
        h('div', { class: 'hl-act' },
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => chJump(c, c.first) }, 'Go to first mention'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => chNext(c) }, 'Next mention'),
          goCh,
          mark),
        fixRow);
      const item = h('div', { class: 'ch-item' + (c.maybe ? ' maybe' : '') }, btn, more);
      btn.addEventListener('click', () => toggle(item));
      rows.push({ item, btn, more, ix: c.ix });
      return item;
    };
    ppl.forEach(c => list.append(build(c)));
    if (may.length) {   // uncertain names wait in a collapsed group instead of mixing in with real characters
      const body = h('div', { class: 'ch-maybe-body' }, h('p', { class: 'ch-count' }, 'Some signs of a person, but not enough to be sure. Open one to say yes or no.'));
      const box = h('details', { class: 'ch-maybe', open: !!(view.maybeOpen || view.q) }, h('summary', {}, h('span', {}, 'Maybe'), h('small', {}, may.length + (may.length === 1 ? ' name' : ' names') + ' \u00b7 not sure')), body);
      may.forEach(c => body.append(build(c)));
      box.addEventListener('toggle', () => { if (!view.q) view.maybeOpen = box.open; });
      list.append(box);
    }
    };
    syncNote();
    syncFixes();
    render();
    openSheet('sheet-chars');
  }
  function hlOpen(focusId) {
    const list = $('#hl-list'), a = hlAll();
    list.textContent = ''; $('#hl-empty').hidden = a.length > 0;
    for (const x of a) {
      const ta = h('textarea', { 'aria-label': 'Note', placeholder: 'Add a note', maxlength: '500' }); ta.value = x.note || '';
      ta.addEventListener('change', () => { const b = hlAll(), y = b.find(z => z.id === x.id); if (y) { y.note = ta.value.trim(); hlSave(b); } });
      const go = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { closeSheets(); const q = S.plan[S.sec]; if (q && S.sentSec[x.id] === S.sec) seekAudio(sentTime(q, S.sentPos[x.id])); const sp = S.spans.get(x.id); if (sp) sp.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 'Go to');
      const card = h('button', { class: 'btn small ghost', type: 'button', onclick: () => cardOpen(x.t, x) }, 'Quote card');
      const del = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { hlSave(hlAll().filter(z => z.id !== x.id)); hlOpen(); } }, 'Remove');
      const item = h('div', { class: 'hl-item' }, h('q', {}, x.t), ta, h('div', { class: 'hl-act' }, go, card, del));
      list.append(item); if (x.id === focusId) setTimeout(() => ta.focus(), 120);
    }
    openSheet('sheet-hl');
  }
  const CARD = { text: '', style: 'night' };
  const CARD_STYLES = { night: ['#0F1220', '#232A4D', '#F2EBDD', '#E0B15A'], paper: ['#FAF7F2', '#E7E0D2', '#1B1A22', '#865D0E'], gold: ['#E8BC6A', '#B98A2E', '#1A1405', '#1A1405'] };
  function cardDraw() {
    const cv = $('#card-cv'), c = cv.getContext('2d'), W = 1080, H = 1350, T = CARD_STYLES[CARD.style];
    const g = c.createLinearGradient(0, 0, W * .6, H); g.addColorStop(0, T[0]); g.addColorStop(1, T[1]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const serif = '"Newsreader", Georgia, "Times New Roman", serif';
    const txt = CARD.text.replace(/\s+/g, ' ').trim(), n = txt.length;
    const fs = n < 90 ? 70 : n < 180 ? 58 : n < 320 ? 46 : 38, lh = Math.round(fs * 1.38), maxW = W - 220;
    c.font = '500 ' + fs + 'px ' + serif; c.textBaseline = 'alphabetic';
    const lines = []; let cur = '';
    for (const w of txt.split(' ')) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    const max = Math.floor(720 / lh); if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/[ ,.;:]*\S*$/, '') + '\u2026'; }
    const bh = lines.length * lh, y0 = Math.max(330, (H - bh) / 2 + 40);
    c.fillStyle = T[3]; c.font = '700 220px ' + serif; c.fillText('\u201C', 100, y0 - 70);
    c.fillStyle = T[2]; c.font = '500 ' + fs + 'px ' + serif;
    lines.forEach((l, i) => c.fillText(l, 110, y0 + i * lh));
    c.fillStyle = T[3]; c.fillRect(110, H - 270, 90, 5);
    c.fillStyle = T[2]; c.font = 'italic 600 40px ' + serif;
    const b = S.book || {}; let title = b.title || ''; while (title.length > 3 && c.measureText(title).width > maxW) title = title.slice(0, -2);
    if (title !== (b.title || '')) title += '\u2026';
    c.fillText(title, 110, H - 200);
    c.globalAlpha = .75; c.font = '500 34px ' + serif; c.fillText(b.authors || '', 110, H - 148);
    c.globalAlpha = .6; c.font = '600 28px "Inter", system-ui, sans-serif'; c.fillText('Wordtrail', 110, H - 90); c.globalAlpha = 1;
  }
  function cardOpen(text) {
    CARD.text = text || ''; openSheet('sheet-card');
    $$('#card-styles .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === CARD.style)));
    cardDraw();
  }
  function cardBlob() { return new Promise(r => $('#card-cv').toBlob(r, 'image/png')); }
  async function cardShare() {
    const blob = await cardBlob(); if (!blob) return;
    const f = new File([blob], 'wordtrail-quote.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: S.book ? S.book.title : 'Quote' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    cardSave();
  }
  async function cardSave() {
    const blob = await cardBlob(); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wordtrail-quote.png';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Image saved.', 2000);
  }

  guideDoc('audio', 'Skip silence and voice boost', "Skip silence speeds through pauses. Voice boost keeps the narrator clear and evenly loud.");
