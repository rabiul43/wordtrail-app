  /* ---------- music-moods.js ----------
     Music: which music mood each scene mood uses, the finer moods (tension, wonder, romance, chase) and their word lists, the book's genre mood. Edit this to add or change mood words. */
  /* Maps scene-detection mood labels → music mood buckets.
     'neutral' plays when no mood has been committed yet. */
  const MUS_MOOD_MAP = {
    dread:  'dread',
    danger: 'danger',
    peace:  'peace',
    sorrow: 'sorrow',
    merry:  'merry',
  };

  /* Finer music moods. Scene detection only knows five moods; these four are read from the paragraph itself and used
     only for music. Until music.json has clips for one, it falls back to the nearest existing mood (MUS_FALLBACK), and it
     starts to sound different on its own once clips are added under that name. */
  const MUS_FALLBACK = { tension: 'dread', wonder: 'peace', romance: 'peace', chase: 'danger' };
  /* MOOD-WORDS-BEGIN  (tools/music_mood_check.js runs this block against src/dev/music-mood-tests.txt; keep it free of app names)
     Fine-mood word lists, keyed by language code (the book's language, see musBookLang). A language with no entry simply has no
     fine moods: its music follows the scene mood and the genre default. To add a language: add an entry here, a few cases in
     src/dev/music-mood-tests.txt, and run the check. Latin-script languages can use \b in a regex like English; for any other
     script use musStemRx (word stems as plain text), because \b does not work there. */
  function musStemRx(lists) {   // { mood: [stem, ...] } -> { mood: global RegExp }; stems are put in NFC form, the same form the text gets
    const out = {};
    for (const k in lists) out[k] = new RegExp(lists[k].map(w => w.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    return out;
  }
  const MUS_FINE_RX = {
    en: {
      tension: /\b(silence|silent|listened|listening|waited|waiting|footsteps?|creak(?:ed|ing)?|shadows?|hushed|hesitated|trembl\w*|nervous\w*|suspicio\w*|uneasy|dread|whisper(?:ed|s)?|suddenly|hidden|watched|watching)\b/g,
      wonder:  /\b(wonder\w*|marvel\w*|astonish\w*|amaz\w*|magnificent|splendid|glittering|glistening|dazzl\w*|enchant\w*|miracle|vast|majestic|gleaming|shimmer\w*|radiant)\b/g,
      romance: /\b(love[ds]?|loving|beloved|darling|kiss(?:ed|es)?|embrace[ds]?|sweetheart|tender\w*|devotion|passion\w*|affection|adore[ds]?|longing|heart)\b/g,
      chase:   /\b(chase[ds]?|chasing|pursu\w+|fled|flee(?:ing)?|fugitive|galloped|gallop\w*|raced|racing|dashed|sprinted|bolted|escap\w+|hurried|seized|hounds?|hunted)\b/g,
    },
    bn: musStemRx({   // Bengali: no \b in JavaScript for this script, so each entry is a word stem matched as plain text (it also finds the word with its endings)
      tension: ['নিস্তব্ধ', 'নীরব', 'নিঃশব্দ', 'ফিসফিস', 'পায়ের শব্দ', 'ছায়া', 'অপেক্ষা', 'আশঙ্কা', 'সন্দেহ', 'কাঁপ', 'গোপন', 'লুকিয়', 'হঠাৎ', 'সতর্ক', 'শিউরে', 'থমথম', 'ছমছম', 'অস্বস্তি', 'কান পেতে', 'চুপি', 'দম বন্ধ'],
      wonder:  ['বিস্ময়', 'বিস্মিত', 'অবাক', 'আশ্চর্য', 'অপূর্ব', 'চমৎকার', 'মনোমুগ্ধ', 'মুগ্ধ', 'জাদু', 'অলৌকিক', 'ঝলমল', 'ঝিকমিক', 'জ্বলজ্বল', 'দীপ্ত', 'বিশাল', 'মহিমা', 'অসাধারণ', 'মায়াবী'],
      romance: ['ভালোবাস', 'ভালবাস', 'প্রেম', 'চুম্বন', 'চুমু', 'আলিঙ্গন', 'প্রিয়তম', 'প্রিয়া', 'হৃদয়', 'প্রণয়', 'অনুরাগ', 'আদর', 'সোহাগ', 'বিরহ', 'জড়িয়ে ধর', 'কোমল'],
      chase:   ['তাড়া', 'ধাওয়া', 'পিছু নিল', 'ছুটে', 'ছুটল', 'ছুটতে', 'ছুটিয়ে', 'দৌড়', 'পালাল', 'পালিয়', 'পালাতে', 'পালাচ্ছ', 'পলায়ন', 'পলাতক', 'শিকারি', 'ঝাঁপিয়ে'],
    }),
  };
  const MUS_FINE_BASE = { tension: ['neutral', 'dread', 'danger'], chase: ['neutral', 'danger'], wonder: ['neutral', 'peace'], romance: ['neutral', 'peace'] };   // the scene moods each may refine
  function musPickLang(text, code) {   // the language of this paragraph: mostly Bengali script wins over the book's tag
    const n = (text.match(/[\u0980-\u09ff]/g) || []).length;
    if (n > 8 && n > text.length * 0.2) return 'bn';
    return code || 'en';
  }
  function musFineBest(text, code, base) {   // the fine mood the words clearly say (two or more hits), or '' for none
    if (!text) return '';
    const set = MUS_FINE_RX[musPickLang(text, code)]; if (!set) return '';
    const t = text.normalize ? text.normalize('NFC') : text;
    let best = '', bestN = 1;   // needs two or more hits
    for (const k in set) {
      if (MUS_FINE_BASE[k].indexOf(base) < 0) continue;
      const n = (t.match(set[k]) || []).length;
      if (n > bestN) { best = k; bestN = n; }
    }
    return best;
  }
  /* MOOD-WORDS-END */
  function musBookLang() {   // the book's language as a code: no language given counts as English; a language we have no code for stays as its name (and has no list)
    try { const n = String((S.book && S.book.lang) || '').trim().toLowerCase(); return n ? (LANG_CODES[n] || n) : 'en'; } catch (e) { return 'en'; }
  }
  const MUS_GENRE_MOOD = [['horror|ghost|gothic|supernatural|vampire|haunt', 'dread'], ['mystery|detective|crime|suspense|thriller', 'tension'], ['romance|love stor', 'romance'], ['fantasy|fairy|myth|legend|science fiction|sci-?fi|magic', 'wonder']];

  function musParaText() {   // the current paragraph (up to 8 sentences), lower case
    try {
      const sents = S.model && S.model.sents, id = S.curId;
      if (!sents || id == null || id < 0 || !sents[id]) return '';
      const p = sents[id].p; let a = id, b = id;
      while (a > 0 && sents[a - 1] && sents[a - 1].p === p && id - a < 7) a--;
      while (sents[b + 1] && sents[b + 1].p === p && b - id < 7) b++;
      let t = ''; for (let i = a; i <= b; i++) t += ' ' + (sents[i].t || '');
      return t.toLowerCase();
    } catch (e) { return ''; }
  }
  function musGenreMood() {   // a book's own default mood, used only when the text itself shows none
    try {
      const b = S.book; if (!b) return '';
      const row = String(b.genres || ((typeof CAT !== 'undefined' && CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '');
      if (!row.trim()) return '';
      const text = (row + ' ' + (b.title || '')).toLowerCase();
      for (const [rx, m] of MUS_GENRE_MOOD) if (new RegExp(rx).test(text)) return m;
    } catch (e) { /* no genre */ }
    return '';
  }
  function musFineMood(scMood) {   // the music mood for this paragraph: a fine one when the words clearly say so, else the scene's
    const base = MUS_MOOD_MAP[scMood] || 'neutral';
    const best = musFineBest(musParaText(), musBookLang(), base);
    if (best) return best;
    return base === 'neutral' ? (musGenreMood() || base) : base;
  }
  function musHas(k) { const c = MUS.manifest && MUS.manifest.moods && MUS.manifest.moods[k]; return !!(c && c.length); }
  function musResolve(k) {   // the mood that has clips: itself, its nearest existing mood, or neutral. Never a silent mood.
    if (musHas(k)) return k;
    const f = MUS_FALLBACK[k]; if (f && musHas(f)) return f;
    return musHas('neutral') ? 'neutral' : k;
  }

