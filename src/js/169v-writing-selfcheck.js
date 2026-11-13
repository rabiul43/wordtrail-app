  /* ---------- Writing Task 2 self-check: a plain-language checklist (SCC, SCW; Task 64) ----------
     Shown under the finished essay in Writing Task 2 (169s). Four areas, three tick boxes each: task response, organisation, vocabulary, grammar.
     The wording is our own, inspired by the ideas in the publicly published IELTS band descriptors; no official text is copied.
     NO SCORE, NO BAND, NO COUNT OF TICKS, NO AI: only the learner ticks the boxes. For every area that still has an empty box, one calm tip is shown
     ("Next time, look at"); with every box ticked the card says so kindly. Nothing here reads or judges the essay.
     Storage: none of its own. The ticks live in the draft of 169s as d.sc = [ box ids ] (wt:writing; device only; missing = nothing ticked).
     Nothing runs at start-up. Playback is never touched.
     API:  SCC.AREAS, SCC.ids(), SCC.clean(list), SCC.tips(ticked)   (pure, between SCC-START/END)
           SCW.card()                        the small preview card on the writing screen ("Self-check · 4 questions · Not a score")
           SCW.draw(host, d, onChange)       adds the checklist to host; d.sc is read and updated; onChange() is called after each tick (169s saves the draft)
     Test: node tools/writing_selfcheck_check.js
     Styles 94zc-writing-selfcheck.css. To go back: remove this file, that CSS, their build.py lines, and the SCW lines and the "sc" field in 169s,
     and the strings marked "writing self-check" in src/i18n/bn.json. */
  /* SCC-START */
  const SCC = (() => {
    const AREAS = [
      { id: 'tr', name: 'Task response', q: 'Did I answer the question?', items: [
        { id: 'tr1', t: 'I answered every part of the question.', tip: 'Read the question again and underline each part. Check that every part has an answer.' },
        { id: 'tr2', t: 'My opinion is clear and does not change.', tip: 'Write your opinion in one sentence in the introduction, and say it again in the conclusion.' },
        { id: 'tr3', t: 'Each main idea has a reason or an example.', tip: 'After a main idea, add because or for example, then explain it.' }] },
      { id: 'or', name: 'Organisation', q: 'Is it easy to follow?', items: [
        { id: 'or1', t: 'I have an introduction, body paragraphs and a conclusion.', tip: 'Leave a blank line between paragraphs so the shape is easy to see.' },
        { id: 'or2', t: 'Each paragraph is about one main idea.', tip: 'Start each paragraph with a sentence that says its one idea.' },
        { id: 'or3', t: 'My linking words help the reader, and I did not use too many.', tip: 'Use a linking word where the idea changes, such as however or in addition, not at the start of every sentence.' }] },
      { id: 'vo', name: 'Vocabulary', q: 'Are my words varied and clear?', items: [
        { id: 'vo1', t: 'I used a range of words and did not repeat the same ones.', tip: 'Find a word you used three times and try another word that fits.' },
        { id: 'vo2', t: 'I used some topic words and phrases naturally.', tip: 'Think of two or three words that belong to this topic and try to use them.' },
        { id: 'vo3', t: 'I checked the spelling of the words I was unsure of.', tip: 'Read slowly, one line at a time, and check the words that look wrong.' }] },
      { id: 'gr', name: 'Grammar', q: 'Are my sentences varied and correct?', items: [
        { id: 'gr1', t: 'I used some longer sentences as well as short ones.', tip: 'Join two short sentences with because, although or which.' },
        { id: 'gr2', t: 'Verbs agree with their subjects and the tenses fit.', tip: 'Underline each verb and ask: does it match its subject, and is the time right?' },
        { id: 'gr3', t: 'I read it again for small mistakes, like a, the and plurals.', tip: 'Check every noun: does it need a, the or an s?' }] }
    ];
    const ids = () => AREAS.flatMap(a => a.items.map(i => i.id));
    /* a stored list -> only known box ids, each once, in checklist order */
    const clean = list => { const s = new Set(Array.isArray(list) ? list.filter(x => typeof x === 'string') : []); return ids().filter(i => s.has(i)); };
    /* ticked ids -> one tip per area that still has an empty box: [ { area, tip } ] */
    function tips(ticked) {
      const s = new Set(clean(ticked)), out = [];
      for (const a of AREAS) { const m = a.items.find(i => !s.has(i.id)); if (m) out.push({ area: a.name, tip: m.tip }); }
      return out;
    }
    return { AREAS, ids, clean, tips };
  })();
  /* SCC-END */

  const SCW = (() => {
    const card = () => h('div', { class: 'wl-card sc-card' }, h('span', { class: 'sc-card__icon', 'aria-hidden': 'true' }, '☑'),
      h('span', { class: 'sc-card__txt' }, 'Self-check · ' + SCC.AREAS.length + ' questions'), h('span', { class: 'sc-card__tag' }, 'Not a score'));
    function draw(host, d, onChange) {
      if (!host || !d) return;
      const old = host.querySelector('.sc-wrap'); if (old) old.remove();
      const ticked = new Set(SCC.clean(d.sc)), wrap = h('section', { class: 'sc-wrap', 'aria-labelledby': 'sc-h' });
      const tipBox = h('div', { class: 'wl-card sc-tips', 'aria-live': 'polite' });
      const paintTips = () => {
        const t = SCC.tips(Array.from(ticked)); tipBox.textContent = '';
        if (!t.length) { tipBox.append(h('p', { class: 'sc-tips__title' }, 'Every box is ticked. Nice and thorough.')); return; }
        tipBox.append(h('p', { class: 'sc-tips__title' }, 'Next time, look at'), ...t.map(x => h('p', { class: 'sc-tip' }, h('strong', {}, x.area + ': '), x.tip)));
      };
      wrap.append(h('h2', { class: 'sc-h', id: 'sc-h' }, 'Self-check'),
        h('p', { class: 'tr-note' }, 'Tick what is true for your essay. This is a checklist for you, not a score or a band. Only you can judge it.'));
      for (const a of SCC.AREAS) {
        wrap.append(h('fieldset', { class: 'wl-card sc-area' }, h('legend', { class: 'sc-area__name' }, a.name), h('p', { class: 'sc-area__q' }, a.q),
          ...a.items.map(i => {
            const box = h('input', { type: 'checkbox', class: 'sc-box', id: 'sc-' + i.id }); box.checked = ticked.has(i.id);
            box.addEventListener('change', () => {
              if (box.checked) ticked.add(i.id); else ticked.delete(i.id);
              d.sc = SCC.ids().filter(x => ticked.has(x)); paintTips(); try { onChange && onChange(); } catch (e) { /* the tick stays on screen */ }
            });
            return h('label', { class: 'sc-item', for: 'sc-' + i.id }, box, h('span', { class: 'sc-item__t' }, i.t));
          })));
      }
      paintTips(); wrap.append(tipBox, h('p', { class: 'tr-lab' }, 'Based on the ideas in the public IELTS band descriptors, in our own words.'));
      host.append(wrap);
    }
    return { card, draw };
  })();
