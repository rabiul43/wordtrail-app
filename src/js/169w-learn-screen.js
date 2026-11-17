  /* ---------- Learn screen (LS) ----------
     The look of the Learn tab, drawn from the mock-up: a big "Learn" title with the account button, a gold Today card (ring, minutes, Start practice),
     a Review row with the number of words waiting, then the tiles of the hub (LearnHub, 169b) as rows, in four groups:
       YOUR WORDS (words, worksheet)   READING (questions, paraphrase, timedreading, tfng)   SPEAKING AND WRITING (speaking2, writing)   LISTENING (echo, listentype, fillgaps, speedladder)
     A tile that is registered later and is in no group goes into a last group, MORE, so nothing is ever lost. A tile hidden by its own `show` stays hidden.
     It replaces only how the hub is drawn (LSW.render); every tile, its subtitle, its badge and its open() still come from LearnHub. The IELTS head
     (169o, LearnHub.headNodes) is drawn between the Review row and the groups. Today = TD.today() (169c): minutes so far and the daily goal; a tap opens the Today plan.
     LS.draw(host)   LS.GROUPS   LS.ICON (inline line icons by tile id)
     No storage key. Styles 94zd-learn-screen.css (all .lsc-* classes; the phone bar pill is scoped to the Learn screen). */
  const LS = (() => {
    const I = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>';
    const ICON = {
      review: I('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
      words: I('<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>'),
      worksheet: I('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>'),
      questions: I('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9"/><path d="M12 16.6v.1"/>'),
      paraphrase: I('<path d="M3 9c2.5-2.4 4.5-2.4 7 0s4.5 2.4 7 0l4 0"/><path d="M3 15c2.5-2.4 4.5-2.4 7 0s4.5 2.4 7 0l4 0"/>'),
      timedreading: I('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5"/><path d="M9.5 3h5"/>'),
      tfng: I('<circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.7L16.3 9.5"/>'),
      speaking2: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>'),
      writing: I('<path d="M4 20l1-4.2L16.6 4.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z"/><path d="M14.5 6.3l3.2 3.2"/>'),
      echo: I('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13" width="4" height="7" rx="1.6"/><rect x="16.5" y="13" width="4" height="7" rx="1.6"/>'),
      listentype: I('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.1M10 10h.1M13.5 10h.1M17 10h.1M7 14h10"/>'),
      fillgaps: I('<path d="M3 8h4M17 8h4M3 17h18"/><rect x="9" y="4.5" width="6" height="7" rx="1.5" stroke-dasharray="2.2 2"/>'),
      speedladder: I('<path d="M3 20h4.5v-4.5H12V11h4.5V6.5H21"/>'),
      more: I('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
      go: I('<path d="M9 5l7 7-7 7"/>')
    };
    const GROUPS = [
      { id: 'words', label: 'Your words', tone: 'gold', ids: ['words', 'worksheet'] },
      { id: 'reading', label: 'Reading', tone: 'blue', ids: ['questions', 'paraphrase', 'timedreading', 'tfng'] },
      { id: 'sw', label: 'Speaking and writing', tone: 'red', ids: ['speaking2', 'writing'] },
      { id: 'listening', label: 'Listening', tone: 'green', ids: ['echo', 'listentype', 'fillgaps', 'speedladder'] }
    ];
    const SPECIAL = ['today', 'review'];   // drawn as the two cards at the top, never as rows
    const svg = (k, cls) => { const s = h('span', { class: cls, 'aria-hidden': 'true' }); s.innerHTML = ICON[k] || ICON.more; return s; };
    const txt = (v) => { try { return String(typeof v === 'function' ? v() : v || ''); } catch (e) { return ''; } };
    const calm = () => { try { return P.calm === true; } catch (e) { return false; } };
    const go = (t) => { try { t.open(); } catch (e) { toast('Could not open that.', 1800); } };

    function header() {
      const av = h('button', { type: 'button', class: 'lsc-avatar', 'aria-label': 'Account' });
      av.addEventListener('click', () => { const a = document.querySelector('#tabbar .tab[data-tab="account"]'); if (a) a.click(); });
      return h('header', { class: 'lsc-head' },
        h('div', { class: 'lsc-head__t' }, h('h1', { class: 'lsc-title' }, 'Learn'), h('p', { class: 'lsc-sub' }, 'Pick up where you left off.')), av);
    }
    function hero() {
      let min = 0, goal = 10;
      try { const pl = TD.today(); min = pl.min; goal = pl.goal; } catch (e) { /* plan not ready: 0 of 10 */ }
      const pct = Math.max(0, Math.min(1, goal ? min / goal : 0)), C = 2 * Math.PI * 44;
      const b = h('button', { type: 'button', class: 'lsc-hero', 'aria-label': 'Today: ' + min + ' of ' + goal + ' minutes. Start practice' });
      const ring = h('span', { class: 'lsc-ring', 'aria-hidden': 'true' });
      ring.innerHTML = '<svg viewBox="0 0 100 100"><circle class="lsc-ring__track" cx="50" cy="50" r="44"/><circle class="lsc-ring__fill" cx="50" cy="50" r="44" stroke-dasharray="' + (pct * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 50 50)"/><circle class="lsc-ring__dot" cx="50" cy="6" r="4.5"/><path class="lsc-ring__play" d="M42 34v32l26-16z"/></svg>';
      b.append(ring, h('span', { class: 'lsc-hero__txt' }, h('span', { class: 'lsc-hero__k' }, 'TODAY'), h('span', { class: 'lsc-hero__n' }, min + ' of ' + goal + ' min'), h('span', { class: 'lsc-hero__go' }, 'Start practice')));
      b.addEventListener('click', () => { try { TD.open(); } catch (e) { toast('Could not open that.', 1800); } });
      return b;
    }
    function review(t) {
      const n = Number(typeof t.badge === 'function' ? t.badge() : t.badge) || 0;
      const b = h('button', { type: 'button', class: 'lsc-review', 'data-tile': 'review' });
      b.append(svg('review', 'lsc-ic lsc-ic--gold'), h('span', { class: 'lsc-row__txt' }, h('span', { class: 'lsc-row__t' }, 'Review'), h('span', { class: 'lsc-row__s' }, n > 0 ? 'Words waiting for you' : 'Nothing due right now')),
        n > 0 ? h('span', { class: 'lsc-count', 'aria-label': n + (n === 1 ? ' word due' : ' words due') }, n > 99 ? '99+' : String(n)) : '');
      b.addEventListener('click', () => go(t));
      return b;
    }
    function row(t, tone) {
      const b = h('button', { type: 'button', class: 'lsc-row', 'data-tile': t.id });
      b.append(svg(t.id, 'lsc-ic lsc-ic--' + tone), h('span', { class: 'lsc-row__txt' }, h('span', { class: 'lsc-row__t' }, txt(t.title)), h('span', { class: 'lsc-row__s' }, txt(t.subtitle))), svg('go', 'lsc-go'));
      b.addEventListener('click', () => go(t));
      return b;
    }
    function group(label, tone, tiles) {
      const sec = h('section', { class: 'lsc-group', 'aria-label': label });
      sec.append(h('h2', { class: 'lsc-label' }, label));
      const list = h('div', { class: 'lsc-list' }); tiles.forEach(t => list.append(row(t, tone))); sec.append(list);
      return sec;
    }
    function draw(host) {
      const tiles = LearnHub.shown(), by = {}; tiles.forEach(t => { by[t.id] = t; });
      host.textContent = ''; host.classList.add('lsc');
      host.append(header());
      if (!calm()) host.append(hero());
      if (by.review) host.append(review(by.review));
      try { LearnHub.headNodes().forEach(n => host.append(n)); } catch (e) { /* no head */ }
      const used = {}; SPECIAL.forEach(id => { used[id] = 1; });
      GROUPS.forEach(g => {
        const ts = g.ids.map(id => by[id]).filter(Boolean); ts.forEach(t => { used[t.id] = 1; });
        if (ts.length) host.append(group(g.label, g.tone, ts));
      });
      const rest = tiles.filter(t => !used[t.id]);
      if (rest.length) host.append(group('More', 'gold', rest));
    }
    return { draw, GROUPS, ICON };
  })();
  LSW.render = LS.draw;
