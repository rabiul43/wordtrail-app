  /* ---------- music-credits.js ----------
     Music: the credits list (title, artist, licence) for the About page. */
  /* ---------- Music credits ----------
     CC BY needs attribution, so About lists every track in music.json.
     Title: the clip's "t" field if present, else MUS_TITLES, else made from the file name.
     Tracks that appear under two moods (placeholders) are listed once. */
  const MUS_TITLES = { 'scp-x1x': 'SCP-x1x', 'ibn-al-noor': 'Ibn Al-Noor' };
  const MUS_SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'it', 'of', 'on', 'the', 'to']);
  function musPrettyTitle(slug) {
    return String(slug).replace(/_/g, '-').split('-').filter(Boolean).map((w, i) =>
      (i && MUS_SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function musLicense(lic) {
    const l = String(lic || '').toUpperCase().replace(/[\s_]+/g, '-');
    if (l === 'CC-BY' || l === 'CC-BY-4.0') return { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    if (l === 'CC0') return { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    return { name: String(lic || ''), url: '' };
  }
  function musCreditList() {
    const moods = (MUS.manifest && MUS.manifest.moods) || {}, seen = new Set(), out = [];
    for (const mood of Object.keys(moods)) for (const c of (moods[mood] || [])) {
      if (!c || !c.f) continue;
      const slug = String(c.f).split('/').pop().replace(/\.mp3$/i, '');
      const title = c.t || MUS_TITLES[slug] || musPrettyTitle(slug);
      const by = c.by || 'Unknown artist', key = (title + '|' + by).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); out.push({ title, by, lic: c.lic || '' });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }
  const musLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
  /* Fills #music-credits-list (About, Account tab). Works with music switched off. */
  async function musRenderCredits() {
    const box = $('#music-credits-list'); if (!box) return;
    if (!MUS.manifest) { box.textContent = 'Loading…'; await musFetchManifest(); }
    const list = musCreditList();
    box.textContent = '';
    if (!list.length) { box.append(h('p', { class: 'help', text: 'The music list could not be loaded. Check your connection and open this again.' })); return; }
    box.append(h('ul', { class: 'credits-list' }, list.map(c => {
      const lic = musLicense(c.lic), kevin = /^kevin macleod$/i.test(c.by);
      return h('li', {},
        '“' + c.title + '” ',
        kevin ? musLink('https://incompetech.com/', c.by) : c.by,
        kevin ? ' (incompetech.com)' : '',
        lic.name ? [' · ', lic.url ? musLink(lic.url, lic.name) : lic.name] : '');
    })));
  }
