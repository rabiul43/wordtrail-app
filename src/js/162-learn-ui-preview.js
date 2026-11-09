  /* ---------- Learn UI preview: Settings > Developer > "Learn UI preview" ----------
     Shows every component of src/css/94-learn-ui.css. Nothing is built until the card is opened for the first time, and
     nothing here touches playback or saved data. The theme buttons only change the page's data-theme for a look;
     "My theme" puts back the one that was showing before (picking a theme in Settings forgets it). Developer use only. */
  (function wlPreview() {
    const det = document.getElementById('wl-prev'), body = document.getElementById('wl-prev-body');
    if (!det || !body) return;
    let mine = null;   // the real theme, remembered when the first preview theme is tried
    const THEMES = [['dark', 'Dark'], ['black', 'Black'], ['white', 'White'], ['sepia', 'Sepia'], ['contrast', 'High contrast']];
    const sec = (title, inner) => '<section><h4 class="wl-prev-h">' + title + '</h4>' + inner + '</section>';
    const HTML =
      sec('Theme (look only, not saved)', '<div class="wl-prev-row" id="wl-prev-themes">' +
        THEMES.map(t => '<button type="button" class="wl-pill wl-pill--tap" data-wl-theme="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>').join('') +
        '<button type="button" class="wl-pill wl-pill--tap" data-wl-theme="">My theme</button></div>') +
      sec('Buttons', '<div class="wl-prev-row">' +
        '<button type="button" class="wl-btn wl-btn--primary">Check</button>' +
        '<button type="button" class="wl-btn wl-btn--secondary">Skip</button>' +
        '<button type="button" class="wl-btn wl-btn--ok">Continue</button>' +
        '<button type="button" class="wl-btn wl-btn--bad">Got it</button>' +
        '<button type="button" class="wl-btn wl-btn--primary" disabled>Check</button>' +
        '<button type="button" class="wl-btn wl-btn--secondary wl-btn--small">Small</button></div>' +
        '<div class="wl-prev-stack" style="margin-top:.75rem"><button type="button" class="wl-btn wl-btn--primary wl-btn--block">Block button</button></div>') +
      sec('Cards (tap the first one)', '<div class="wl-prev-stack">' +
        '<button type="button" class="wl-card wl-card--tap" data-wl-pick>Normal card</button>' +
        '<button type="button" class="wl-card wl-card--tap is-selected">Selected card</button>' +
        '<div class="wl-card is-correct">Correct card</div><div class="wl-card is-wrong">Wrong card</div></div>') +
      sec('Pills', '<div class="wl-prev-row"><span class="wl-pill">Pill</span><span class="wl-pill is-selected">Selected</span>' +
        '<span class="wl-pill is-ok">Done</span><button type="button" class="wl-pill wl-pill--tap">Tap pill</button></div>') +
      sec('Progress bar and ring', '<div class="wl-prev-stack"><div class="wl-prev-row">' +
        '<input type="range" id="wl-prev-range" min="0" max="100" value="40" aria-label="Progress amount">' +
        '<span class="wl-ring" id="wl-prev-ring" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-label="Progress">' +
        '<span class="wl-ring__label">40%</span></span></div>' +
        '<div class="wl-progress" id="wl-prev-bar" style="--wl-p:40%"><span class="wl-progress__fill"></span></div>' +
        '<div class="wl-progress wl-progress--ok" style="--wl-p:75%"><span class="wl-progress__fill"></span></div></div>') +
      sec('Feedback panels', '<div class="wl-prev-stack">' +
        '<div class="wl-panel" role="status"><div class="wl-panel__head"><span class="wl-panel__icon" aria-hidden="true">🎉</span><h5 class="wl-panel__title">Correct!</h5></div>' +
        '<p class="wl-panel__text">The book says a short sentence here. That is why the answer fits.</p>' +
        '<button type="button" class="wl-panel__link">📖 Show in book</button>' +
        '<button type="button" class="wl-btn wl-btn--ok wl-btn--block">Continue</button></div>' +
        '<div class="wl-panel wl-panel--bad" role="status"><div class="wl-panel__head"><span class="wl-panel__icon" aria-hidden="true">💡</span><h5 class="wl-panel__title">Not quite</h5></div>' +
        '<p class="wl-panel__text">Have another look at the sentence. The right answer is in the text.</p>' +
        '<button type="button" class="wl-btn wl-btn--bad wl-btn--block">Continue</button></div></div>') +
      sec('Stat tiles', '<div class="wl-stats">' +
        '<div class="wl-stat wl-stat--accent"><span class="wl-stat__value">🔥 5</span><span class="wl-stat__label">Day streak</span></div>' +
        '<div class="wl-stat wl-stat--ok"><span class="wl-stat__value">★ 184</span><span class="wl-stat__label">Words</span></div>' +
        '<div class="wl-stat wl-stat--info"><span class="wl-stat__value">↻ 12</span><span class="wl-stat__label">To review</span></div></div>') +
      sec('Tool tiles', '<div class="wl-tools">' +
        '<button type="button" class="wl-tool"><span class="wl-tool__icon" aria-hidden="true">📚</span>My words<span class="wl-tool__sub">184 saved</span></button>' +
        '<button type="button" class="wl-tool is-selected"><span class="wl-tool__icon" aria-hidden="true">🎤</span>Speaking<span class="wl-tool__sub">Selected</span></button>' +
        '<button type="button" class="wl-tool"><span class="wl-tool__icon" aria-hidden="true">❓</span>Questions<span class="wl-tool__sub">5 ready</span></button>' +
        '<button type="button" class="wl-tool" disabled><span class="wl-tool__icon" aria-hidden="true">🔒</span>Later<span class="wl-tool__sub">Locked</span></button></div>') +
      sec('Segmented switch with badge', '<div class="wl-seg" role="tablist" aria-label="Preview switch" id="wl-prev-seg">' +
        '<button type="button" role="tab" class="wl-seg__btn" aria-selected="true">Learn</button>' +
        '<button type="button" role="tab" class="wl-seg__btn" aria-selected="false">Words <span class="wl-badge">12</span></button>' +
        '<button type="button" role="tab" class="wl-seg__btn" aria-selected="false">Review</button></div>') +
      sec('Streak chip', '<div class="wl-prev-row"><span class="wl-streak"><span class="wl-streak__icon" aria-hidden="true">🔥</span>5</span>' +
        '<span class="wl-streak is-off"><span class="wl-streak__icon" aria-hidden="true">🔥</span>0</span></div>');

    function themeNow() { return document.documentElement.getAttribute('data-theme') || ''; }
    function markThemes(v) { body.querySelectorAll('[data-wl-theme]').forEach(b => { if (b.dataset.wlTheme) b.setAttribute('aria-pressed', String(b.dataset.wlTheme === v)); }); }
    function build() {
      body.innerHTML = HTML;
      markThemes(themeNow());
      document.addEventListener('click', e => { if (e.target.closest('#seg-theme button, #aa-themes button')) mine = null; }, true);
      body.addEventListener('click', e => {
        const t = e.target.closest('[data-wl-theme]');
        if (t) {
          if (mine === null) mine = themeNow();
          const v = t.dataset.wlTheme || mine;
          document.documentElement.setAttribute('data-theme', v);
          if (!t.dataset.wlTheme) mine = null;
          markThemes(v); return;
        }
        const c = e.target.closest('[data-wl-pick]'); if (c) { c.classList.toggle('is-selected'); return; }
        const s = e.target.closest('#wl-prev-seg .wl-seg__btn');
        if (s) s.parentNode.querySelectorAll('.wl-seg__btn').forEach(b => b.setAttribute('aria-selected', String(b === s)));
      });
      body.addEventListener('input', e => {
        if (e.target.id !== 'wl-prev-range') return;
        const v = e.target.value, ring = body.querySelector('#wl-prev-ring');
        ring.style.setProperty('--wl-p', v + '%'); ring.setAttribute('aria-valuenow', v); ring.firstChild.textContent = v + '%';
        body.querySelector('#wl-prev-bar').style.setProperty('--wl-p', v + '%');
      });
      body.querySelector('#wl-prev-ring').style.setProperty('--wl-p', '40%');
    }
    det.addEventListener('toggle', function once() { if (!det.open) return; det.removeEventListener('toggle', once); build(); });
  })();
