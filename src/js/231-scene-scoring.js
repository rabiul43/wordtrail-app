  /* Negation and endings for place and weather words: "no rain", "without a breeze", "wasn't raining", "the rain stopped",
     "the storm had passed", "after the rain". Only clear patterns count; compounds ("rain-soaked") and
     "no one could ignore the rain" / "never stopped raining" stay positive. */
  const SC_NEG = /(?:^|[^a-z'])(?:no|not|never|without|nor|neither|hardly any|barely any|scarcely any|free of)(?:\s+(?:a|an|any|the|some|even|more|longer|real|really|single|further|much|great|heavy|light|least|slightest|drop|trace|hint|sign|breath|puff|yet|of)){0,3}\s+$|n['\u2019]t\s+(?:(?:a|an|any|the|even|more|longer|really|yet|much)\s+){0,2}$|\bgone (?:were|was) (?:the |all )?$/;
  const SC_AUX = '(?:had|has|have|was|were|is|are|been|finally|at last|soon|suddenly|slowly|gradually|already|now|quite|all|just|long|at length)';
  const SC_ENDED = new RegExp('^(?:\\s+' + SC_AUX + '){0,3}\\s+(?:stopped|ceased|died (?:down|away|out)|let up|passed|cleared|lifted|faded|subsided|gone|no more|ended|blown over|blew over|dried up|moved (?:on|away)|eased|abated|slackened|lessened)\\b(?!\\s+(?:(?:through|across|along|between|into|him|her|them|me|us|the|a|an|his|its|their|my|your|our)\\b|over\\s+\\w|above\\b|beyond\\b))');
  const SC_OVER = new RegExp('^(?:\\s+' + SC_AUX + '){1,3}\\s+over\\b(?!\\s+(?:the|a|an|his|her|their|its|our|my|your|them|us|it|him|me|\\w+ing)\\b)');
  const SC_AFTER = /\b(?:after|following)\s+(?:the|that|this|all the|a)\s+$/;
  const SC_BEGAN = /^\s+(?:had\s+|has\s+)?(?:started|began|begun|hit|struck|broke|set in|came|fell|arrived|returned|resumed|grew|got|became)\b/;
  const SC_FEAR = /^(?:fear\w*|dread\w*|terror|panic\w*|horror|danger\w*|afraid)$/;
  function ambPre(low, idx) {   // the few words before a hit, in the same clause
    return /[^,;:.!?\u2014\u2013()"\u201c\u201d]*$/.exec(low.slice(Math.max(0, idx - 48), idx))[0];
  }
  function ambNegated(low, idx, len, wx) {   // true when a place/weather word is negated or has ended (wx: weather, which also reads "after the rain")
    const end = idx + len;
    if (low.charAt(idx - 1) === '-' || low.charAt(end) === '-') return false;   // rain-soaked, storm-tossed: part of a compound
    const pre = ambPre(low, idx);
    if (SC_NEG.test(pre)) return true;
    const post = low.slice(end, end + 70).split(/[,;:.!?\u2014\u2013]/)[0];
    if (SC_ENDED.test(post) || SC_OVER.test(post)) return true;
    return !!wx && SC_AFTER.test(pre) && !SC_BEGAN.test(post);
  }
  function ambMetaphor(low, idx, len) {   // "a sea of faces", "a storm of grief": the word is a figure of speech, not a place or weather
    if (/\b(?:a|an)\s+$/.test(low.slice(Math.max(0, idx - 4), idx)) && /^\s+of\s+/.test(low.slice(idx + len, idx + len + 8))) return true;
    const w = low.slice(idx, idx + len), pre = low.slice(Math.max(0, idx - 24), idx), post = low.slice(idx + len, idx + len + 30);
    if (w === 'sea' && ((/\b(?:a|an)\s+(?:[a-z-]+\s+){0,2}$/.test(pre) && /^\s+of\b/.test(post)) || /(?<!well\s)\blike\s+(?:an?\s+|the\s+)?$/.test(pre))) return true;   // "a confused sea of red caps", "a pale sea of smoke", "like a sea"
    if (/^(?:sea|ocean|lake|forest)$/.test(w) && (/^[- ]?(?:blue|green|gr[ae]y|colou?red|eyed)\b|^\s+the\s+colou?r of\b/.test(post) || /\b(?:blue|green|gr[ae]y)\s+as\s+(?:the\s+|an?\s+)?$|\bcolou?r of\s+(?:an?\s+|the\s+)?(?:[a-z]+\s+)?$|\beyes?\b[^,.;!?]{0,24}\b(?:like|as|of)\s+(?:the\s+)?$/.test(pre))) return true;   // "her sea-blue eyes", "eyes the colour of the sea": a colour, not a place
    if (/^(?:rain|snow|mist|fog|haze|hail|sleet|clouds?|wind|breeze|gale|frost|dew)$/.test(w) && /(?<!well\s)\b(?:like|than)\s+(?:an?\s+|the\s+)?$|\bas\s+[a-z]+\s+as\s+(?:an?\s+|the\s+)?$/.test(pre)) return true;   // "ran like the wind", "whiter than snow", "swift as the wind": a comparison, not weather
    if (/^(?:sea|ocean|lake|river|forest|mountains?|desert)$/.test(w) && /(?<!well\s)\blike\s+(?:an?\s+|the\s+)?$|\bas\s+[a-z]+\s+as\s+(?:an?\s+|the\s+)?$/.test(pre)) return true;   // "rose like a forest", "waste as the sea": a comparison, not a place
    if (w === 'chimney' && /^[- ](?:pots?|tops?|stacks?)\b/.test(post)) return true;   // "chimney-pots" seen from a roof: not a hearth
    if (/^wards?$/.test(w) && /^\s+off\b/.test(post)) return true;   // "to ward off": a verb, not a hospital ward
    if (/^nurs/.test(w) && (/\bto\s+$/.test(pre) || /^\s+(?:him|her|them|me|you|us|my|his|their)\b/.test(post))) return true;   // "to nurse her baby": a verb, not an asylum
    if (w === 'carriage' && /\bwith\s+(?:the|a|an)\s+$/.test(pre) && /^\s+of\b/.test(post)) return true;   // "with the carriage of a king": how someone holds himself
    if (w === 'thunder') return /\bby\s+(?:the\s+)?(?:living\s+)?$|\bin\s+$|(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$|\bvoice of\s+$/.test(pre) || (/^\s*$/.test(pre) && /^[!,]/.test(post)) || /^[- ]?struck/.test(post) || /^\s+(?:of\s+(?:their|his|her|its|hoofs?|hooves|the (?:surf|waves|guns?)|surf|waves|guns?|a cannon|cannon|applause)\b|on (?:my|his|her) ear)/.test(post);   // "by thunder!", "thunder-struck", "a voice of thunder", "the thunder of hoofs": an oath or a figure, not a storm
    if (w === 'lightning') return /(?<!well\s)\b(?:like|as|than|from)\s+$|\b(?:struck|stricken|smitten|blasted|tempered|scathed|killed|destroyed|blown up|death) by\s+$|\b(?:like|as)\s+(?:an?\s+)?(?:bolt|flash|streak|thunderbolt)s?\s+of\s+$|\b(?:rapidity|speed|swiftness|quickness|velocity) of\s+$/.test(pre);   // "quick as lightning", "as if struck by lightning", "the rapidity of lightning": an injury or a figure, not a storm
    if (/^(?:tempests?|storms?)$/.test(w) && /(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$/.test(pre)) return true;   // "raged like a tempest"
    if (w === 'tempest') return /^\s+of\s+(?:passion|rage|anger|fury|worrying|yelping|grief|emotion|feeling|sobs|tears|laughter|applause|words)\b/.test(post);   // "a tempest of passion"
    if (w === 'snow') return /(?<!well\s)\b(?:as|like)\s+$/.test(pre) || /^-white/.test(post);   // "white as snow"
    if (/^haunt/.test(w)) return low.charAt(idx - 1) === '-' || /^\s+(?:me|him|her|them|us|you|my|his|their|by)\b/.test(post);   // "it haunted my dreams", "gloom-haunted": a verb, not a haunted place
    if (w === 'ghost') return /(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$/.test(pre);   // "pale as a ghost"
    if (w === 'snowy') return /^\s*white/.test(post) || /^[- ]?(?:peaks?|mountains?|summits?|ranges?|heights)\b/.test(post);   // "snowy whiteness", "the snowy peaks": a colour or a view, not snowfall
    return false;
  }
  /* How strong the weather is said to be: "heavy rain", "a light drizzle", "the wind blew hard", "distant thunder". 1 = no word about it;
     above 1 louder, below 1 softer. Looks at the word itself (drizzle, downpour, gale, breeze) and at the word right before or just after it. */
  const INT_W_UP = /^(?:downpour|deluge|torrents?|cloudburst|gales?|hurricane|typhoon|blizzard)$/, INT_W_DOWN = /^(?:drizzle|drizzling|drizzly|mizzle|breezes?|zephyrs?|flurr(?:y|ies)|showers?)$/;
  const INT_UP = /^(?:heavy|torrential|violent|fierce|furious|raging|roaring|howling|driving|pelting|pouring|lashing|battering|terrible|dreadful|tremendous|great|thick|dense|deafening|bitter|mighty|wild|savage|biting|blinding|fearful)$/;
  const INT_DOWN = /^(?:light|gentle|soft|faint|slight|thin|fine|mild|distant|far-off|dying|passing|little)$/;
  const INT_ADV_UP = /^(?:heavily|violently|furiously|fiercely|hard|harder|wildly|savagely|torrents|buckets)$/, INT_ADV_DOWN = /^(?:lightly|softly|gently|faintly|slightly)$/;
  const INT_FN = /^(?:with|of|in|on|at|the|a|an|and|but|as|to|from|for|by|than|so|not|no|it|its|was|were|is|had|has)$/;
  function ambIntensity(low, idx, word) {
    let f = INT_W_UP.test(word) ? 1.4 : INT_W_DOWN.test(word) ? 0.65 : 1, found = false;
    const toks = low.slice(Math.max(0, idx - 40), idx).replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
    for (let k = 1; k <= 2 && toks.length - k >= 0 && !found; k++) {
      const t = toks[toks.length - k]; if (INT_FN.test(t)) break;   // "heavy with rain", "the rain": no modifier
      if (INT_UP.test(t)) { f *= 1.35; found = true; } else if (INT_DOWN.test(t)) { f *= 0.65; found = true; }
    }
    if (!found) {
      const after = low.slice(idx + word.length, idx + word.length + 40).replace(/[,;.]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3);
      for (const t of after) { if (INT_ADV_UP.test(t)) { f *= 1.3; break; } if (INT_ADV_DOWN.test(t)) { f *= 0.7; break; } }
    }
    return Math.round(Math.max(0.45, Math.min(1.6, f)) * 100) / 100;
  }
  function ambMemory(low, idx) {   // the place is only thought of or remembered in this sentence
    const c = Math.max(low.lastIndexOf('.', idx), low.lastIndexOf('!', idx), low.lastIndexOf('?', idx), low.lastIndexOf(';', idx), low.lastIndexOf(':', idx));
    const pre = low.slice(c + 1, idx);
    return /\b(?:thought of|thinking of|thinks of|dream(?:ed|t|s|ing)? of|(?:remember(?:ed|ing|s)?|recall(?:ed|ing|s)?|recollect\w*)(?!\s+(?:that|how|what|to|if|when|where|why|you|me)\b)|longed for|long(?:s|ing) for|memor(?:y|ies) of)\b/.test(pre)
      || /\b(?:write|writing|wrote|written|tell|telling|told|relate|bearings|particulars|map|chart|history|story|tale|account|description)\b(?:\s+[a-z']+){0,4}?\s+(?:of|about|concerning)\s+(?:[a-z']+\s+){0,2}$/.test(pre);   // "to write down the particulars about Treasure Island", "the bearings of the island": the place is what is written about, not where the story is
  }
  function ambSummoned(low, idx) {   // "he can only summon fog and storm and snow": weather that is named as a power or a possibility, not weather that is happening
    return /\b(?:summon(?:s|ed|ing)?|conjur(?:e|es|ed|ing)|call(?:s|ed|ing)? up|command(?:s|ed|ing)? (?:the )?|control(?:s|led|ling)? (?:the )?|can only (?:send|bring|raise|cause))\b[^,;:.!?\u2014\u2013()]*$/.test(ambPre(low, idx));
  }
  function ambTimeRef(low, idx, len) {   // a time word that only refers to another time: "last night", "to-night", "night after night", "the morning before", "good-night", "dark hair"
    const pre = low.slice(Math.max(0, idx - 18), idx), post = low.slice(idx + len, idx + len + 16), w = low.slice(idx, idx + len);
    if (w === 'nights') return true;   // "stormy nights", "two nights ago": habits and counts, not the night of the scene
    if (w === 'night' || w === 'morning' || w === 'evening' || w === 'afternoon') {
      if (/\b(?:last|every|each|yesterday|previous|preceding|bad|two|three|four|five|six|seven|many|several|few|whole|entire|all|spend the|spent the|stay the|pass(?:ed)? the|good)[- ]$/.test(pre) || /\bevery \w+ $/.test(pre) || /\bto-?$/.test(pre) || /\bto[- ]?morrow $/.test(pre)) return true;
      if (/^(?:\s+(?:after|before|through|long|ago|hence|since)\b|['\u2019]s\b)/.test(post)) return true;
    }
    if (w === 'dark' && /^[- ]?(?:hair|haired|eyes|eyed|face|complexion|skin|brow|brows|coloured|colored|man|woman|figure|horse|cloak|suit|dress|clothes|oak)/.test(post)) return true;
    return false;
  }
  function ambNegMood(low, idx, word) {   // moods are only negated for "no fear", "without dread", "not afraid"
    return SC_FEAR.test(word) && SC_NEG.test(ambPre(low, idx));
  }
  /* Quoted speech counts less than narration (x0.45): a character saying "I hate this rain" is weaker evidence than the narrator saying it rained.
     ambQuoteMask marks the characters inside "...", \u201c...\u201d and \u2018...\u2019 (and 'single' speech that starts a sentence or follows a colon/comma);
     st.m carries a quote that is still open into the next sentence of the same paragraph (0 none, 1 double, 2 single).
     An apostrophe (dog's, don't, dogs') never opens a quote, and a single quote only closes after punctuation. */
  const SC_QW = 0.45, SC_TAG = /^(?:said|asked|whispered|shouted|yelled|called|cried|replied|answered|muttered|murmured|exclaimed)$/;
  function ambQuoteMask(t, st) {
    if (!st.m && !/["\u201c\u201d\u201e\u2018']/.test(t)) return null;
    const n = t.length, mk = new Uint8Array(n); let any = 0;
    for (let i = 0; i < n; i++) {
      const c = t[i];
      if (st.m === 0) {
        if (c === '"' || c === '\u201c' || c === '\u201e') { st.m = 1; mk[i] = 1; any = 1; }
        else if (c === '\u2018' || c === "'") {
          const nx = t[i + 1] || '', pv = i ? t[i - 1] : ' ';
          const where = c === '\u2018' ? (!i || /[\s(\u2014\u2013"\u201c]/.test(pv)) : (!i || /[:,]\s$/.test(t.slice(Math.max(0, i - 2), i)));   // the straight ' is also an apostrophe: only trusted where speech starts
          if (where && /[A-Za-z]/.test(nx) && !/^(?:tis|twas|em|cause|til|round|n|im|er|ere|twill|cos)\b/i.test(t.slice(i + 1, i + 7))) { st.m = 2; mk[i] = 1; any = 1; }
        }
      } else {
        mk[i] = 1; any = 1;
        if (st.m === 1) { if (c === '"' || c === '\u201d') st.m = 0; }
        else if (c === '\u2019' || c === "'") { const pv = t[i - 1] || '', nx = t[i + 1] || ''; if (!/[A-Za-z0-9]/.test(nx) && (/[.,!?\u2026;]/.test(pv) || i === n - 1)) st.m = 0; }
      }
    }
    return any ? mk : null;
  }
  /* Genre priors: a small nudge (0.5 to 1) from the book's genres and title, the same text the "Suggested for this book" card reads.
     It only breaks ties: a name gets its prior only when the text already says something about it (score above 0), so the text always wins
     and a prior alone can never start a scene. Rows are [pattern, {kind: {name: prior}}]; kinds p = place, w = weather, t = time, m = mood.
     Edit freely - names must be ones from SC_PLACES / SC_WX / SC_MOOD / night|day. */
  const SC_GENRE = [
    ['horror|supernatural|ghost|vampire|haunt|gothic|macabre|weird|thriller|suspense|mystery|mysteries|detective|crime|murder', { m: { dread: 0.8 }, t: { night: 0.8 }, w: { rain: 0.5 } }],
    ['fantasy|fantastic|fairy|myth|legend|magic|saga', { p: { castle: 0.8, forest: 0.8, hearth: 0.5 } }],   // "fire" is the hearth place
    ['romance|love stor', { p: { hearth: 0.8, tavern: 0.5, country: 0.5 } }],   // cafe = tavern (the cafe sound), garden = country
    ['science fiction|sci-?fi|martian|robot|\\bspace\\b|time machine', { p: { machine: 0.8 } }],
    ['nautical|\\bsea\\b|ocean|pirate|sailor|voyage|marine|moby', { p: { sea: 0.8 } }]
  ];
  const SC_GENRE_RX = SC_GENRE.map(r => [new RegExp(r[0]), r[1]]);
  function ambGenrePrior(b) {   // the prior for a book: {p:{}, w:{}, t:{}, m:{}}, or null with no genre data. Remembered per book once the genres are known.
    if (!b) return null;
    const c = AMB.gp; if (c && c.id === String(b.id)) return c.v;
    const row = String(b.genres || ((typeof CAT !== 'undefined' && CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '');
    if (!row.trim()) return null;   // no genre data (yet): nothing changes, and nothing is remembered, so a catalog that loads later still counts
    const text = (row + ' ' + (b.title || '')).toLowerCase(); let v = null;
    SC_GENRE_RX.forEach(([rx, pr]) => { if (!rx.test(text)) return; v = v || { p: {}, w: {}, t: {}, m: {} }; for (const d in pr) for (const k in pr[d]) v[d][k] = Math.max(v[d][k] || 0, pr[d][k]); });
    AMB.gp = { id: String(b.id), v };
    return v;
  }
  function ambGenreApply(R, b) {   // adds the prior to what the text said, only where the text said something
    const v = ambGenrePrior(b); if (!v) return R;
    for (const d in v) for (const k in v[d]) if (R[d][k] > 0) R[d][k] += v[d][k];
    return R;
  }
  /* "arrived at the inn", "entered the cave", "stepped into", "walked into", "back at the", "later, in the": the story says it moves.
     The place named right after (a clear one, weight 2+) gets a boost and is remembered as o.go for that paragraph. */
  const SC_LATER = /\b(?:hours|days|weeks|months|years|some time|a while|a little while|a few hours|a few days) later\b/;   // time has passed, which way is not said: the old time of day counts less
  const SC_CHANGE = /\b(?:arrived at|entered|stepped (?:into|inside)|walked into|back (?:at|in) the|later,? in the)\s+(?:(?:the|a|an|his|her|their|our|my)\s+)?((?:[a-z'-]+\s+){0,2}[a-z'-]+)/;
  function ambSceneScore(ix, j) {   // what one paragraph says: scores per kind and name (kept, so a paragraph is read once)
    const e = ix.pa[j]; if (e.sc) return e.sc;
    const o = { p: {}, w: {}, t: {}, m: {}, end: { p: {}, w: {}, t: {} } }, hits = {}, lex = ambLex();
    const ended = (kind, name, w, cap, q) => { const E = o.end[kind]; E[name] = (E[name] || 0) + w * 2 * (q || 1) * (cap ? 0.35 : 1); };   // a negated/ended hit: a mark that takes the scene back out
    const qs = { m: 0 };   // is a quote open? carried from sentence to sentence of this paragraph
    const add = (kind, name, w, cap, q) => {
      const hk = kind + name, n = hits[hk] = (hits[hk] || 0) + 1;
      o[kind][name] = (o[kind][name] || 0) + w * (q || 1) * (cap ? 0.35 : 1) * (n === 1 ? 1 : n === 2 ? 0.8 : n === 3 ? 0.6 : 0.35);   // the first mention counts most
    };
    for (let i = e.a; i <= e.b && i < e.a + 60; i++) {   // a very long paragraph: its first 60 sentences are enough
      const text = ix.sents[i].t || '', low = text.toLowerCase(), lead = text.search(/[A-Za-z]/), re = /[a-z]+/g; let m;
      let qm = ambQuoteMask(text, qs); if (qm && qm.length !== low.length) qm = null;   // (a rare letter that changes length when lowercased: read it as narration)
      const qf = k => (qm && qm[k] ? SC_QW : 1), near = (a, b) => { if (!qm) return false; for (let k = Math.max(0, a - 22); k < Math.min(qm.length, b + 22); k++) if (qm[k]) return true; return false; };
      while ((m = re.exec(low))) {
        const hit = lex.get(m[0]); if (!hit) continue;
        if (SC_TAG.test(m[0]) && near(m.index, m.index + m[0].length)) continue;   // '"Get out," he whispered': a speech tag says who spoke, not what the scene is
        const q = qf(m.index);
        const cap = m.index !== lead && text[m.index] !== low[m.index];   // a capital in mid-sentence is usually a name (Captain Hook)
        let negP, negW, negM, fi;   // looked at once per word, and only when the word is of that kind
        for (const [kind, name, w] of hit) {
          if (kind === 't' && ambTimeRef(low, m.index, m[0].length)) continue;   // "last night", "the night before", "dark hair": not the time of the scene
          if ((kind === 'p' || kind === 'w') && (ambMetaphor(low, m.index, m[0].length) || (kind === 'p' && ambMemory(low, m.index)) || (kind === 'w' && ambSummoned(low, m.index)))) continue;   // "a sea of faces", "a storm of grief", "he thought of the old farm": not where the story is
          if (kind === 'p' || kind === 'w') {
            const ng = kind === 'w' ? (negW == null ? (negW = ambNegated(low, m.index, m[0].length, true)) : negW) : (negP == null ? (negP = ambNegated(low, m.index, m[0].length, false)) : negP);
            if (ng) { ended(kind, name, w, cap, q); continue; }
          } else if (kind === 'm') {
            if (negM == null) negM = ambNegMood(low, m.index, m[0]);
            if (negM) continue;
          }
          if (kind === 'w' && q === 1) { if (fi == null) fi = ambIntensity(low, m.index, m[0]); if (fi !== 1) { const W = o.wi || (o.wi = {}); if (!W[name] || Math.abs(fi - 1) > Math.abs(W[name] - 1)) W[name] = fi; } }   // "heavy rain": how strong, kept beside the score
          add(kind, name, w, cap, q);
        }
      }
      for (const [kind, name, rx, w] of SC_PHRASES) {
        const pm = rx.exec(low); if (!pm) continue;
        if (kind === 'p' && ambMemory(low, pm.index)) continue;   // a place that is only remembered or written about ("the particulars about Treasure Island")
        if ((kind === 'p' || kind === 'w') && ambNegated(low, pm.index, pm[0].length, kind === 'w')) { ended(kind, name, w, false, qf(pm.index)); continue; }
        add(kind, name, w, false, qf(pm.index));
      }
      const lm = SC_LATER.exec(low); if (lm) { ended('t', 'night', 1.5, false, qf(lm.index)); ended('t', 'day', 1.5, false, qf(lm.index)); }
      const cm = SC_CHANGE.exec(low);
      if (cm && qf(cm.index) === 1 && !SC_NEG.test(ambPre(low, cm.index))) {
        let go = '', gw = 1; const lx = ambLex();
        cm[1].split(/\s+/).forEach(wd => (lx.get(wd) || []).forEach(([k, nm, w]) => { if (k === 'p' && w > gw) { go = nm; gw = w; } }));
        for (const [k, nm, rx, w] of SC_PHRASES) if (k === 'p' && w > gw && rx.test(cm[1])) { go = nm; gw = w; }   // "the great hall", "the engine room"
        if (go) { o.go = go; add('p', go, 2, false); }
      }
    }
    return (e.sc = o);
  }
  function ambSceneRead(ix, pi) {   // this paragraph in full, the ones before it with less and less weight
    const tot = { p: {}, w: {}, t: {}, m: {} }, wi = {};
    for (let j = Math.max(0, pi - 5); j <= pi; j++) {   // oldest first: everything already there fades x0.62 per paragraph (same weights as before)
      const s = ambSceneScore(ix, j);
      if (s.wi) for (const k in s.wi) wi[k] = s.wi[k];   // the newest mention of a strength wins
      for (const d in tot) {
        const T = tot[d]; for (const k in T) T[k] *= 0.62;
        for (const k in s[d]) T[k] = (T[k] || 0) + s[d][k];
      }
      for (const d in s.end) for (const k in s.end[d]) if (tot[d][k]) tot[d][k] = Math.max(0, tot[d][k] - s.end[d][k]);   // "the rain stopped": takes the rain out, never below 0
    }
    if (tot.w.storm && tot.w.rain && tot.w.storm >= tot.w.rain * 0.6) tot.w.storm += tot.w.rain * 0.5;   // thunder or a storm with rain in it is a storm, not just rain
    Object.defineProperty(tot, 'wi', { value: wi });
    return tot;
  }
  /* Choose a name from the scores. A new name must be clearly stronger than the current one, and win twice in a row
     (once is enough after a jump or when it is far stronger); a current one that is still faintly there stays. */
  function ambPick(sc, cur, enter, stay, jump, memo, x) {   // x (optional): {mul, add, fast:[mul, add]} - how much stronger a new name must be; default 1.3x+1, and 1.8x+1.5 to skip the second win
    const mul = x ? x.mul : 1.3, add = x ? x.add : 1, fm = x && x.fast ? x.fast[0] : 1.8, fa = x && x.fast ? x.fast[1] : 1.5;
    let top = '', ts = 0; for (const k in sc) if (sc[k] > ts) { ts = sc[k]; top = k; }
    const cs = cur ? (sc[cur] || 0) : 0;
    if (!top || ts < enter) { memo.c = ''; return cur && cs >= stay ? cur : ''; }
    if (!cur || cs < stay) { memo.c = ''; return top; }
    if (top === cur) { memo.c = ''; return cur; }
    if (ts >= cs * mul + add) { if (jump || ts >= cs * fm + fa || memo.c === top) { memo.c = ''; return top; } memo.c = top; }
    return cur;
  }
  /* A place is sticky: it stays while it is even faintly there, and a new one must be 1.8x stronger (and win twice, unless far stronger).
     Exception: a scene-change phrase ("entered the cave") lets the place it names win at once, for this paragraph only. */
  function ambPlacePick(ix, pi, R, cur, jump, memo) {
    const own = ambSceneScore(ix, pi), go = own.go, gs = go ? (R.p[go] || 0) : 0;
    let lead = !!go; if (go) for (const k in own.p) if (k !== go && own.p[k] > own.p[go]) lead = false;   // the named place must also lead this paragraph itself
    if (go && go !== cur && gs >= 3 && lead) { memo.c = ''; return go; }
    return ambPick(R.p, cur, 3, 0.6, jump, memo, { mul: 1.8, add: 0, fast: [2.4, 1.5] });
  }
