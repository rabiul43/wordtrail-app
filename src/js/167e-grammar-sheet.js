  /* ---------- Grammar sheet (GRS, Task 38) ----------
     The bottom sheet from the mock-up "Grammar spotlight". It opens on one sentence of the book and shows, in plain words:
       the tense or pattern (pill + its group), the sentence with the pattern words marked (gold = the pattern shown, blue = other patterns),
       THE PATTERN (formula + one plain line), the same in Bengali with one short example, chips to switch between the patterns found,
       the note "Detected automatically, so it may sometimes be wrong.", and two buttons: TRY ONE and GOT IT.
     TRY ONE: one quick fill-the-blank from the same pattern (three choices, one right). The question is a fresh short sentence from a small
       built-in list (BANK below), not a sentence of the book, so there is exactly one right answer and no spoiler. Tapping a choice shows the
       feedback panel at the bottom (calm, nothing is scored or stored). "Another one" gives the next sentence of that pattern.
     Lazy and light: nothing runs until the sheet is opened. The sheet shows at once, the detection (GD, 167d, under 1 ms) runs one frame later,
       and the answer is kept in memory per sentence (up to 200 sentences). Nothing is saved to the device or synced, so there are no new wt:* keys.
       Playback is never touched: no timers, no listeners on the audio, nothing while the sheet is closed.
     Where it opens from: the "Grammar" button of the sentence popup (long-press a sentence, 160-learning-tools.js).
       GRS.open(sentence, sid)   open the sheet for one sentence (sid = its number in the book, optional)
       GRS.detect(sentence)      the cached GD answer (later tasks can reuse it)
     Pure parts between the GRC-START / GRC-END markers: GRC.kind, GRC.about, GRC.segments, GRC.bank, GRC.pick, GRC.fill.
     Markup `#sheet-grammar` in src/html/28b-sheet-grammar.html, styles src/css/94n-grammar-sheet.css, test: node tools/grammar_sheet_check.js
     Remove this file, those two files, their build.py lines and the Grammar button in trBuild (160) to go back. */
  const GRC = (() => {
    /*GRC-START*/
    /* the formula, for the groups whose catalogue line (GD) has none */
    const FORM = {
      'present-simple': { en: 'verb (add s after he, she, it)', bn: 'verb (he, she, it-এর সাথে s যোগ হয়)' },
      'past-simple': { en: 'verb + ed (or the past form)', bn: 'verb + ed (বা অতীতের রূপ)' },
      'conditional-mixed': { en: 'if + one time, result at another time', bn: 'if + এক সময়ের শর্ত, অন্য সময়ের ফল' }
    };
    const kind = id => /^passive/.test(id) ? 'Passive voice' : /^modal/.test(id) ? 'Modal verb' : /^conditional/.test(id) ? 'Conditional' : 'Verb tense';
    /* "had + past participle: an action ..." -> formula + the plain line. Only a part before the colon that holds a "+" is a formula. */
    function about(p, lang) {
      const t = String((p.explain && p.explain[lang]) || ''), m = /^([^:]+?)\s*:\s*(.+)$/.exec(t);
      if (m && m[1].indexOf('+') >= 0) return { form: m[1], desc: m[2] };
      return { form: FORM[p.id] ? FORM[p.id][lang] : '', desc: t };
    }
    /* the sentence cut into runs: m 1 = the chosen pattern (gold), 2 = another pattern (blue), 0 = plain */
    function segments(text, pats, sel) {
      const n = text.length, mk = new Array(n).fill(0);
      const put = (p, v) => { for (let k = Math.max(0, p.s | 0); k < Math.min(n, p.e | 0); k++) mk[k] = v; };
      (pats || []).forEach((p, i) => { if (i !== sel) put(p, 2); });
      if (pats && pats[sel]) put(pats[sel], 1);
      const out = [];
      for (let k = 0; k < n; k++) { const l = out[out.length - 1]; if (l && l.m === mk[k]) l.t += text[k]; else out.push({ t: text[k], m: mk[k] }); }
      return out;
    }
    /* Try one: id | sentence with ___ | right | wrong | wrong. Wrong choices break the grammar or the time word in the sentence, so only one fits. */
    const BANK = [
      'present-simple|The sun ___ in the east.|rises|rise|rising',
      'present-simple|My sister ___ to school every day.|walks|walk|walking',
      'past-simple|We ___ football yesterday.|played|play|will play',
      'past-simple|Last night, she ___ a long letter.|wrote|write|writes',
      'future-simple|I think it ___ rain tomorrow.|will|is|has',
      'future-simple|Don’t worry, I ___ help you.|will|am|have',
      'present-continuous|Look! The baby ___ sleeping.|is|does|has',
      'present-continuous|They ___ playing in the garden now.|are|is|were',
      'past-continuous|I ___ sleeping when you called.|was|is|am',
      'past-continuous|They ___ watching TV when the lights went out.|were|are|was',
      'future-continuous|At noon tomorrow I ___ be travelling.|will|am|was',
      'future-continuous|This time next week, we ___ be flying to Dhaka.|will|have|are',
      'present-perfect|She ___ finished her homework.|has|have|am',
      'present-perfect|They ___ visited Dhaka three times.|have|has|is',
      'past-perfect|The train ___ left before we reached the station.|had|has|have',
      'past-perfect|When I arrived, the film ___ already started.|had|has|is',
      'future-perfect|By next year, I ___ have finished school.|will|had|am',
      'future-perfect|She ___ have left by the time we arrive.|will|has|did',
      'present-perfect-continuous|He ___ been studying since morning.|has|have|is',
      'present-perfect-continuous|We ___ been playing since three o’clock.|have|has|are',
      'past-perfect-continuous|He was tired because he ___ been working all night.|had|was|were',
      'past-perfect-continuous|The grass was wet because it ___ been raining.|had|was|were',
      'future-perfect-continuous|By June, I ___ have been working here for ten years.|will|am|had',
      'future-perfect-continuous|Next month, she ___ have been living here for a year.|will|has|is',
      'future-going-to|Look at those clouds! It is ___ to rain.|going|go|goes',
      'future-going-to|We ___ going to visit Dhaka next week.|are|is|am',
      'passive-present-simple|Rice ___ grown in Bangladesh.|is|are|be',
      'passive-present-simple|Many letters ___ written every day.|are|is|be',
      'passive-past-simple|The window ___ broken yesterday.|was|is|were',
      'passive-past-simple|The cakes ___ eaten last night.|were|was|are',
      'passive-future|The result ___ be announced soon.|will|is|has',
      'passive-future|The new bridge ___ be opened next year.|will|was|has',
      'passive-present-continuous|The room ___ being cleaned right now.|is|was|has',
      'passive-present-continuous|The cars ___ being washed at the moment.|are|is|were',
      'passive-past-continuous|The house ___ being painted when we arrived.|was|is|has',
      'passive-past-continuous|The roads ___ being repaired last week.|were|are|was',
      'passive-present-perfect|The work ___ been done.|has|is|was',
      'passive-present-perfect|The letters ___ been sent already.|have|has|are',
      'passive-past-perfect|The cake ___ been eaten before we arrived.|had|has|was',
      'passive-past-perfect|The doors ___ been locked before he came.|had|have|are',
      'passive-future-perfect|By Friday, the book ___ have been finished.|will|has|is',
      'passive-future-perfect|The work ___ have been done by then.|will|has|was',
      'passive-modal|The test must ___ finished today.|be|is|been',
      'passive-modal|This door can ___ opened with a key.|be|is|been',
      'modal-can|She ___ swim very well.|can|cans|is can',
      'modal-can|Birds ___ fly.|can|cans|are can',
      'modal-could|When I was young, I ___ run very fast.|could|can|will',
      'modal-could|___ you open the window, please?|Could|Does|Is',
      'modal-may|It ___ rain today, so take an umbrella.|may|mays|is',
      'modal-may|___ I come in?|May|Does|Is',
      'modal-might|He ___ be late because of the traffic.|might|mights|is',
      'modal-might|We ___ go to the beach tomorrow.|might|mights|are',
      'modal-must|You ___ wear a helmet on a bike.|must|musts|are',
      'modal-must|Students ___ arrive on time.|must|musts|is',
      'modal-should|You ___ sleep early tonight.|should|shoulds|are',
      'modal-should|We ___ drink more water.|should|shoulds|is',
      'modal-would|I ___ like some tea, please.|would|am|are',
      'modal-would|She said she ___ come tomorrow.|would|is|are',
      'modal-ought|We ought ___ leave now.|to|for|by',
      'modal-ought|You ought ___ see a doctor.|to|for|of',
      'modal-have-to|I ___ to go now.|have|has|can',
      'modal-have-to|She ___ to wake up early every day.|has|have|can',
      'conditional-0|If you heat ice, it ___.|melts|melt|melting',
      'conditional-0|If it rains, the ground ___ wet.|gets|get|getting',
      'conditional-1|If it rains, we ___ stay at home.|will|would|did',
      'conditional-1|If you study hard, you ___ pass.|will|would|had',
      'conditional-2|If I had a car, I ___ drive to school.|would|will|did',
      'conditional-2|If she knew the answer, she ___ tell us.|would|will|is',
      'conditional-3|If I had studied, I would ___ passed.|have|had|has',
      'conditional-3|If he had run faster, he would ___ won.|have|has|had',
      'conditional-mixed|If I had slept, I ___ feel fine now.|would|will|had',
      'conditional-mixed|If we had left earlier, we ___ be at home now.|would|will|are'
    ];
    let bankMap = null;
    function bank() {
      if (bankMap) return bankMap;
      bankMap = new Map();
      BANK.forEach(l => { const a = l.split('|'); if (!bankMap.has(a[0])) bankMap.set(a[0], []); bankMap.get(a[0]).push({ s: a[1], a: a[2], w: [a[3], a[4]] }); });
      return bankMap;
    }
    function shuffle(a, rnd) { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor((rnd || Math.random)() * (i + 1)), t = o[i]; o[i] = o[j]; o[j] = t; } return o; }
    /* the k-th question of a pattern (k counts up, the list is used round and round); null when the pattern has none */
    function pick(id, k, rnd) {
      const L = bank().get(id); if (!L || !L.length) return null;
      const q = L[(k | 0) % L.length];
      return { id, s: q.s, a: q.a, o: shuffle([q.a].concat(q.w), rnd) };
    }
    const fill = (s, w) => String(s).replace('___', w);
    /*GRC-END*/
    return { FORM, BANK, kind, about, segments, bank, pick, fill, shuffle };
  })();

  const GRS = (() => {
    const MAXC = 200, cache = new Map();
    let ui = null, st = null, seq = 0;
    const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
    const idle = f => requestAnimationFrame(() => setTimeout(f, 0));   // let the sheet paint first, then work

    /* one sentence in, the GD answer out; kept per sentence, never throws */
    function detect(sentence) {
      const t = norm(sentence);
      if (cache.has(t)) { const v = cache.get(t); cache.delete(t); cache.set(t, v); return v; }
      let r;
      try { r = GD.detect(t); } catch (e) { r = { ok: false, text: t, main: null, patterns: [] }; }
      cache.set(t, r);
      if (cache.size > MAXC) cache.delete(cache.keys().next().value);
      return r;
    }
    function grab() {
      if (ui) return ui;
      const q = id => document.getElementById(id);
      return (ui = { sheet: q('sheet-grammar'), tag: q('gs-tag'), kind: q('gs-kind'), sent: q('gs-sent'), view: q('gs-view'), pat: q('gs-pat'), form: q('gs-form'), desc: q('gs-desc'),
        bn: q('gs-bn'), bnName: q('gs-bn-name'), bnTr: q('gs-bn-tr'), bnDesc: q('gs-bn-desc'), exEn: q('gs-ex-en'), exBn: q('gs-ex-bn'), none: q('gs-none'),
        chips: q('gs-chips'), note: q('gs-note'), quiz: q('gs-quiz'), q: q('gs-q'), opts: q('gs-opts'), fb: q('gs-fb'), tryB: q('gs-try'), gotB: q('gs-got') });
    }
    const pats = () => (st && st.res && st.res.patterns) || [];
    const cur = () => pats()[st.sel] || null;

    function paintSentence() {
      const u = ui, p = st.res ? st.res.patterns : [], text = (st.res && st.res.text) || st.t;
      u.sent.textContent = '';
      GRC.segments(text, p, st.sel).forEach(s => u.sent.append(s.m ? h('mark', { class: 'gs-m' + s.m }, s.t) : document.createTextNode(s.t)));
    }
    function paint() {
      const u = ui, p = cur(), found = !!p;
      u.view.hidden = false; u.quiz.hidden = true; u.sent.hidden = false; st.mode = 'view';
      u.tag.textContent = found ? p.name.en : 'No clear pattern'; u.kind.textContent = found ? GRC.kind(p.id) : '';
      paintSentence();
      u.pat.hidden = u.bn.hidden = !found; u.none.hidden = found;
      u.chips.hidden = true; u.chips.textContent = '';
      if (found) {
        const en = GRC.about(p, 'en'), bn = GRC.about(p, 'bn');
        u.form.textContent = en.form || p.name.en; u.form.hidden = false; u.desc.textContent = en.desc;
        u.bnName.textContent = p.name.bn;
        let tr = ''; try { tr = TP.peek(st.t, 'bn') || ''; } catch (e) { /* no saved translation */ }   // only a translation already on this device; no new request
        u.bnTr.textContent = tr; u.bnTr.hidden = !tr;
        u.bnDesc.textContent = ''; u.bnDesc.append(bn.desc, bn.form ? h('strong', { class: 'gs-bn-form' }, ' (' + bn.form + ')') : null);
        u.exEn.textContent = p.example.en; u.exBn.textContent = p.example.bn;
        const list = pats();
        if (list.length > 1) {
          u.chips.hidden = false;
          list.forEach((x, i) => u.chips.append(h('button', { class: 'wl-pill wl-pill--tap', type: 'button', 'aria-pressed': String(i === st.sel), onclick: () => { st.sel = i; paint(); } }, x.name.en)));
        }
      }
      u.note.hidden = !found && !st.res;
      u.tryB.hidden = !found || !GRC.bank().has(p.id); u.tryB.textContent = 'Try one'; u.gotB.hidden = false;
    }
    function skeleton() {
      const u = ui, t = st.t;
      u.tag.textContent = 'Looking…'; u.kind.textContent = ''; u.sent.textContent = t; u.sent.hidden = false;
      u.view.hidden = false; u.quiz.hidden = true; u.pat.hidden = u.bn.hidden = u.none.hidden = u.chips.hidden = true;
      u.tryB.hidden = true; u.gotB.hidden = false;
    }

    /* ---------- Try one ---------- */
    function ask() {
      const u = ui, p = cur(); if (!p) return;
      const k = st.k[p.id] || 0, q = GRC.pick(p.id, k); if (!q) return;
      st.k[p.id] = k + 1; st.q = q; st.mode = 'quiz';
      u.view.hidden = true; u.sent.hidden = true; u.quiz.hidden = false; u.fb.textContent = '';
      const parts = q.s.split('___');
      u.q.textContent = ''; u.q.append(parts[0], h('span', { class: 'gs-blank', 'aria-label': 'blank' }), parts[1] || '');
      u.opts.textContent = '';
      q.o.forEach(o => u.opts.append(h('button', { class: 'wl-card wl-card--tap gs-opt', type: 'button', 'data-o': o, onclick: e => answer(o, e.currentTarget) }, o)));
      u.tryB.hidden = false; u.tryB.textContent = 'Back'; u.gotB.hidden = true;
      const f = u.opts.firstChild; if (f) f.focus({ preventScroll: true });
    }
    function answer(o, btn) {
      const u = ui, q = st.q; if (!q || q.done) return; q.done = true;
      const ok = o === q.a, p = cur(), en = p ? GRC.about(p, 'en') : { form: '' };
      $$('.gs-opt', u.opts).forEach(b => { b.setAttribute('aria-disabled', 'true'); b.tabIndex = -1; if (b.dataset.o === q.a) b.classList.add('is-correct'); });
      if (!ok) btn.classList.add('is-wrong');
      u.q.textContent = GRC.fill(q.s, q.a);
      u.fb.textContent = '';
      u.fb.append(h('div', { class: 'wl-panel' + (ok ? '' : ' wl-panel--bad'), role: 'status' },
        h('div', { class: 'wl-panel__head' }, h('span', { class: 'wl-panel__icon', 'aria-hidden': 'true' }, ok ? '\u{1F389}' : '\u{1F4A1}'), h('h2', { class: 'wl-panel__title' }, ok ? 'Correct!' : 'Not quite.')),
        h('p', { class: 'wl-panel__text' }, ok ? '' : h('span', {}, 'The right choice is'), ' ', h('strong', {}, '“' + q.a + '”'), en.form ? h('span', {}, ' · ' + en.form) : null),
        ok ? null : h('p', { class: 'wl-panel__text' }, 'No problem. Try another one.')));
      u.tryB.textContent = 'Another one'; u.gotB.hidden = false; u.tryB.hidden = false;
      u.fb.scrollIntoView({ block: 'nearest' });
    }

    function wire() {
      const u = grab(); if (u.sheet.dataset.ready) return; u.sheet.dataset.ready = '1';
      u.tryB.addEventListener('click', () => { if (!st) return; if (st.mode === 'quiz' && !(st.q && st.q.done)) paint(); else ask(); });
    }
    function open(sentence, sid) {
      const t = norm(sentence); if (!t || typeof GD === 'undefined') return;
      const u = grab(); if (!u.sheet) return; wire();
      const my = ++seq;
      st = { t, sid, res: null, sel: 0, mode: 'view', k: {}, q: null };
      const run = () => {
        if (my !== seq || !st) return;
        st.res = detect(t);
        const i = st.res.patterns.indexOf(st.res.main); st.sel = i < 0 ? 0 : i;
        paint(); u.tag.focus({ preventScroll: true });
      };
      if (cache.has(t)) { run(); openSheet('sheet-grammar'); u.tag.focus({ preventScroll: true }); }
      else { skeleton(); openSheet('sheet-grammar'); idle(run); }
    }
    return { open, detect };
  })();
