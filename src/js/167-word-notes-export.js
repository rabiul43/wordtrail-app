  /* ---------- My Words: notes, hard flag and exports (Words sheet > "My words") ----------
     Adds two things to the cards of My Words and two files to the export. It never keeps data of its own: a note is `note` and the
     hard flag is `hard` on the word entry in wt:words, changed only through WS (147), so sync, backup and old data keep working.
     Nothing runs at start-up and playback is never touched. Pure functions first (no screen, no clock), screen code after them.
       WN.csv(words)        text of a spreadsheet file. UTF-8 with a byte order mark (so Excel reads Bengali and accents), CRLF line ends,
                            every cell quoted. Columns: word, level, example, book (the old four, same order), status, hard, note,
                            collections, saved, due. A cell that starts with = + - @ gets a ' in front so a spreadsheet never runs it.
       WN.anki(words)       text of an Anki import file (Anki 2.1.54 or newer): tab separated, header lines for separator, HTML, note type
                            Basic, deck WordTrail and the tags column. Front = the word. Back = the example with the word in bold, the
                            level and book, and your note. Tags = wordtrail, hard, and your collection names (spaces become _).
       WN.exportCsv()       WN.exportAnki()   save the file through download (160); toast when there is nothing to export
       WN.card(card, e)     166's deco calls it: adds the Note and Hard buttons (and the note box) to one My Words card */
  const WN = (() => {
    const MAX_NOTE = 1000;
    const str = x => (typeof x === 'string' ? x : '');
    const stageOf = e => (WM.STAGES.indexOf(e.st) >= 0 ? e.st : WM.stage(e));
    const STATUS = { new: 'New', learning: 'Learning', familiar: 'Familiar', mastered: 'Mastered' };
    const day = ms => {
      if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return '';
      const d = new Date(ms), p = n => (n < 10 ? '0' : '') + n;
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    };
    /* The one place a saved word is read for export: old entries work (WC.places falls back to the old example and book). */
    function row(e) {
      const ps = WC.places(e), p0 = ps[0] || {};
      return {
        w: str(e.w), lv: str(e.lv), ex: str(e.ex) || str(p0.s), bt: str(e.bt) || str(p0.bt),
        st: STATUS[stageOf(e)], hard: e.hard === true, note: str(e.note).trim(),
        cols: Array.isArray(e.cols) ? e.cols.filter(c => typeof c === 'string' && c.trim()) : [], ts: e.ts, due: e.due
      };
    }

    /* ----- spreadsheet ----- */
    const cell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    function csvText(words) {
      const head = ['word', 'level', 'example', 'book', 'status', 'hard', 'note', 'collections', 'saved', 'due'];
      const lines = [head.map(cell).join(',')];
      (words || []).forEach(e => {
        if (!e || typeof e.w !== 'string') return;
        const r = row(e);
        lines.push([r.w, r.lv, r.ex, r.bt, r.st, r.hard ? 'yes' : 'no', r.note, r.cols.join('; '), day(r.ts), day(r.due)].map(cell).join(','));
      });
      return '﻿' + lines.join('\r\n') + '\r\n';
    }

    /* ----- Anki ----- */
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const piece = s => esc(String(s == null ? '' : s).replace(/\t/g, ' ')).replace(/\r?\n/g, '<br>');   // never a raw tab or line break inside a field
    const field = s => piece(String(s == null ? '' : s).trim());
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    function boldWord(sentence, w) {
      const s = String(sentence || '').replace(/\s+/g, ' ').trim(); if (!s) return '';
      const m = w ? new RegExp("(^|[^A-Za-z\\u00C0-\\u024F'])(" + reEsc(w) + ")(?![A-Za-z\\u00C0-\\u024F])", 'i').exec(s) : null;
      if (!m) return field(s);
      const a = m.index + m[1].length, b = a + m[2].length;
      return piece(s.slice(0, a)) + '<b>' + piece(m[2]) + '</b>' + piece(s.slice(b));   // the sentence is already trimmed; keep the spaces around the bold word
    }
    const tag = s => String(s).trim().replace(/\s+/g, '_').replace(/["\t]/g, '');
    function anki(words) {
      const out = ['#separator:tab', '#html:true', '#notetype:Basic', '#deck:WordTrail', '#tags column:3'];
      (words || []).forEach(e => {
        if (!e || typeof e.w !== 'string' || !e.w.trim()) return;
        const r = row(e), back = [];
        if (r.ex) back.push('<div>' + boldWord(r.ex, r.w) + '</div>');
        const src = [r.lv, r.bt].filter(Boolean).join(' · '); if (src) back.push('<div><small>' + field(src) + '</small></div>');
        if (r.note) back.push('<div>' + field(r.note) + '</div>');
        const tags = ['wordtrail'].concat(r.hard ? ['hard'] : [], r.cols.map(tag)).filter(Boolean);
        out.push([field(r.w), back.join(''), tags.join(' ')].join('\t'));
      });
      return out.join('\n') + '\n';
    }

    function exportCsv() {
      const w = WS.all(); if (!w.length) { toast('No saved words to export yet.'); return; }
      download('wordtrail-words.csv', csvText(w), 'text/csv;charset=utf-8');
    }
    function exportAnki() {
      const w = WS.all(); if (!w.length) { toast('No saved words to export yet.'); return; }
      download('wordtrail-anki.txt', anki(w), 'text/plain;charset=utf-8');
      toast('Words saved for Anki. In Anki, choose File > Import.', 3200);
    }

    /* ----- screen: the Note and Hard buttons on a card ----- */
    function card(card, e) {
      const fresh = () => WS.get(e.w) || e;
      const wrap = h('div', { class: 'wn' }), row1 = h('div', { class: 'wn__row' });
      wrap.addEventListener('click', ev => ev.stopPropagation());   // the card opens and closes on a tap; these buttons must not
      const hardBtn = h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small wn__hard', type: 'button', 'aria-pressed': String(fresh().hard === true) },
        h('span', { 'aria-hidden': 'true' }, '⚑ '), h('span', {}, 'Hard'));
      hardBtn.addEventListener('click', () => {
        const on = WS.toggleHard(e.w); if (on === null) { toast('This word is no longer saved.', 2000); return; }
        hardBtn.setAttribute('aria-pressed', String(on));
        let flag = card.querySelector('.wc__flag'); const w = card.querySelector('.wc__w');
        if (on && !flag && w) w.after(h('span', { class: 'wc__flag', role: 'img', 'aria-label': 'Hard', title: 'Hard' }, '⚑'));
        else if (!on && flag) flag.remove();
        toast(on ? 'Marked as hard.' : 'No longer marked hard.', 1400);
      });
      const noteBtn = h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', 'aria-expanded': 'false' }, fresh().note.trim() ? 'Edit note' : 'Add note');
      let box = null;
      const close = () => { if (box) box.hidden = true; noteBtn.setAttribute('aria-expanded', 'false'); };
      noteBtn.addEventListener('click', () => {
        const open = noteBtn.getAttribute('aria-expanded') !== 'true'; noteBtn.setAttribute('aria-expanded', String(open));
        if (!open) { close(); return; }
        if (!box) {
          const ta = h('textarea', { class: 'wf__in wn__ta', rows: '3', maxlength: String(MAX_NOTE), 'aria-label': 'Your note', placeholder: 'Your note' });
          const save = () => {
            const n = WS.setNote(e.w, ta.value);
            if (!n) { toast('This word is no longer saved.', 2000); return; }
            toast(n.note ? 'Note saved.' : 'Note removed.', 1400);
            const sc = card.closest('.body'); WC.keep = sc ? sc.scrollTop : 0; vocRender();   // draw the list again with the new note; scroll stays (165)
          };
          ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); noteBtn.focus(); } });
          box = h('div', { class: 'wn__box' }, ta, h('div', { class: 'wn__btns' },
            h('button', { class: 'wl-btn wl-btn--primary wl-btn--small', type: 'button', onclick: save }, 'Save'),
            h('button', { class: 'wl-btn wl-btn--secondary wl-btn--small', type: 'button', onclick: () => { close(); noteBtn.focus(); } }, 'Cancel')));
          box._ta = ta; wrap.append(box);
        }
        box._ta.value = fresh().note; box.hidden = false; box._ta.focus();
      });
      row1.append(noteBtn, hardBtn); wrap.prepend(row1); card.append(wrap); return card;
    }

    return { csv: csvText, anki, exportCsv, exportAnki, card };
  })();
