  /* ---------- story sounds ----------
     The book's own words trigger short sounds, timed to the exact word the narrator is saying: a thunder roll for
     "thunder", knocks for "knocked", a distant bell for "bells". Made on the device like the rest, so they work offline.
     They only play while the book plays, never after a seek, and are rate-limited so they stay a touch of colour. */
  /* group E: counts, phrase rules, categories, custom words */
  const CUE_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, once: 1, twice: 2, thrice: 3 };
  const CUE_NUMRE = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|once|twice|thrice|\\d{1,2})';
  const cueNum = s => { s = String(s).toLowerCase(); return CUE_NUM[s] != null ? CUE_NUM[s] : parseInt(s, 10); };
  const CUE_STRIKE_A = /\b(?:clocks?|hour|midnight|noon|steeple|belfry|tower|church|bells?)\b(?:\W+\w+){0,3}?\W+(?:struck|strikes|striking)\b/i;
  const CUE_STRIKE_B = new RegExp('\\b(?:struck|strikes|striking)\\s+(?:the\\s+(?:hour|half)|midnight|noon|' + CUE_NUMRE + ')\\b', 'i');
  const cueStrike = t => /\b(tolled|tolling|chimed|chiming)\b/i.test(t) || ((CUE_STRIKE_A.test(t) || CUE_STRIKE_B.test(t)) && !/\b(?:lightning|thunderbolt|bolt|arrow|sword|fist|blow|axe|hammer)\b/i.test(t) && !/\b(?:struck|strikes|striking)\s+(?:him|her|me|them|us|you|it|my|his|their|your|with|by|down|dumb|as|that)\b/i.test(t));   // a clock or bell striking the hour, not a blow
  const CUE_COUNT = {   // sound -> (sentence) => { i: character index of the word to time at, n: how many strokes } or null
    bell: t => { const m = new RegExp('\\b(?:struck|strikes|striking|tolled|tolling|chimed|chiming)\\b[\\s,]*(?:the hour of\\s+)?(' + CUE_NUMRE + ')\\b(?!\\s+(?:of|and|or|to)\\b)(?!\\s*[:.]\\d)', 'i').exec(t); const n = m ? cueNum(m[1]) : 0; return n > 0 ? { i: m.index, n: Math.min(12, n) } : null; },
    knock: t => {
      let m = new RegExp('\\b(?:knock(?:s|ed|ing)?|knocker)\\b[\\s,]*(?:\\w+ly[\\s,]+)?(?:(once|twice|thrice)\\b|(' + CUE_NUMRE + ')\\s+times?\\b)', 'i').exec(t);   // "knocked three times", "knocked twice"
      if (m) { const n = cueNum(m[1] || m[2]); return n > 0 ? { i: m.index, n: Math.min(5, n) } : null; }
      m = new RegExp('\\b(' + CUE_NUMRE + '|a single)\\s+(?:\\w+\\s+)?(knocks?)\\b', 'i').exec(t);   // "three knocks", "two sharp knocks"
      if (m) { const n = /single/i.test(m[1]) ? 1 : cueNum(m[1]); return n > 0 ? { i: m.index + m[0].length - m[2].length, n: Math.min(5, n) } : null; }
      return null;
    }
  };
  const CUE_RULES = [   // [sound, word test, cooldown ms, optional context test(word, previous word, sentence)]
    ['thunder', /^(thunder\w*|lightning)$/, 40000],
    ['knock', /^(knock(s|ed|ing)?|knocker)$/, 20000, (w, p, t) => !/\bknock(?:s|ed|ing)?\s+(?:(?:him|her|me|them|us|it|you|the \w+|a \w+|his \w+|her \w+)\s+)?(?:over|down|out|off|aside|away|about|back)\b/i.test(t) && !/\bknock(?:s|ed|ing)?\s+(?:him|her|me|them|us|it|you)\b/i.test(t)],   // not "knocked the vase over" or "knocked him down\"
    ['creak', /^(creak\w*|squeak\w*)$/, 25000],
    // phrase rules (5th item true): the pattern is tested on the whole sentence and the sound is timed at the first word of the phrase
    ['slam', /\b(?:doors?|gates?|shutters?|windows?|lid)\s+(?:\w+\s+)?(?:slammed|slams|slamming)\b/i, 20000, null, true],
    ['slam', /\b(?:slammed|slams|slamming)\s+(?:the|a|his|her|their|my|your)?\s*(?:\w+\s+)?(?:doors?|gates?|shutters?|lid|trapdoor|windows?)\b/i, 20000, null, true],
    ['steps', /^(footsteps?|footfalls?|tiptoe\w*)$/, 25000],
    ['bell', /^(bells?|tolled|tolling|chimed|chiming|peal(ed|ing)?|struck|strikes|striking)$/, 30000, (w, p, t) => !/^(struck|strikes|striking)$/.test(w) || cueStrike(t)],   // "struck" only for a clock or bell, and the strokes are counted
    ['clock', /^(clock|clocks|ticking|ticked)$/, 40000, (w, p, t) => !cueStrike(t) && !/\b(?:around|against|beat|beating|racing|watching)\s+the\s+clock\b|\bbody\s+clock\b/i.test(t) && (!/^tick/.test(w) || /\b(clocks?|watch|grandfather|mantel|pendulum|seconds?|minutes?|time|hours?)\b/i.test(t))],   // not "ticked the box", and a striking clock is left to the bell
    ['wind', /^(gust|gusts|gusty|gale|howl(ed|ing|s)?|wind)$/, 30000, (w, p, t) => (w !== 'wind' || /^(the|a|cold|icy|wild|north|east|west|south|strong|bitter|sharp|howling|high)$/.test(p)) && !(/^howl/.test(w) && /\b(wolf|wolves|dogs?|jackals?|hounds?)\b/i.test(t))],
    ['waves', /^(waves|surf|breakers)$/, 20000],
    ['splash', /^splash(ed|es|ing)?$/, 15000],
    ['fire', /^(crackl\w*|bonfire|fireplace|hearth|flames?|blazing)$/, 30000],
    ['birds', /^(birds?|birdsong|nightingales?|larks?|thrush|thrushes|sparrows?|chirp\w*|twitter\w*|warbl\w*|cuckoo)$/, 25000],
    ['owl', /^(owls?|hooted|hooting)$/, 40000],
    ['horse', /^(gallop\w*|hooves|hoofs|hoofbeats)$/, 40000],
    ['rain', /^(rain|raining|rained|raindrops?|drizzle|downpour)$/, 40000],
    // group A: nature and weather
    ['storm', /^(storms?|tempests?|tempestuous)$/, 45000],
    ['sea', /^(sea|seas|ocean|oceans|shore|shores|seashore|seaside)$/, 40000],
    ['water', /^(rivers?|brooks?|waterfalls?|rapids|streams?)$/, 35000, (w, p, t) => !/^streams?$/.test(w) || /\b(water|river|brook|bank|banks|bubbl\w*|flow\w*|ripple\w*|mountain\w*|forest|meadow|meadows|stones?)\b/i.test(t)],
    ['crickets', /^(crickets|cicadas?|grasshoppers?|katydids?)$/, 40000],
    ['frogs', /^(frogs?|bullfrogs?|croak(ed|ing|s)?)$/, 35000, (w, p, t) => !/^croak/.test(w) || /\b(frogs?|pond|marsh|swamp|toads?|bog)\b/i.test(t)],
    ['wolf', /^(wolf|wolves|jackals?)$/, 45000],
    ['bee', /^(bees?|hornets?|wasps?|buzz(ed|es|ing)?)$/, 30000, (w, p, t) => !/^buzz/.test(w) || !/\b(voices?|conversation|talk\w*|crowd|rumou?rs?|whisper\w*|excitement|gossip)\b/i.test(t)],
    // group B: home and objects
    ['dooropen', /\b(?:opened|opens|opening|unbolted|unlatched)\s+(?:the|a|his|her|their|my|your)?\s*(?:\w+\s+)?(?:doors?|gates?|shutters?|lid|trapdoor|windows?)\b/i, 15000, (w, p, t) => !/slam/i.test(t), true],
    ['dooropen', /\b(?:doors?|gates?|shutters?|lid|trapdoor|windows?)\s+(?:\w+\s+)?(?:opened|opens|unbolted|unlatched)\b/i, 15000, (w, p, t) => !/slam/i.test(t), true],
    ['doorshut', /\b(?:closed|shut|closing|bolted|latched)\s+(?:the|a|his|her|their|my|your)?\s*(?:\w+\s+)?(?:doors?|gates?|shutters?|lid|trapdoor|windows?)\b/i, 15000, (w, p, t) => !/slam/i.test(t), true],
    ['doorshut', /\b(?:doors?|gates?|shutters?|lid|trapdoor|windows?)\s+(?:\w+\s+)?(?:closed|shut|bolted|latched)\b/i, 15000, (w, p, t) => !/slam/i.test(t), true],
    ['glass', /\b(?:broke|shattered|shattering|smashed)\s+(?:the|a|his|her|their|my|your)?\s*(?:\w+\s+)?(?:glass|glasses|windowpane|pane|panes|bottles?|mirror|vase|plate|cup|jar|lamp|chandelier|china|crystal)\b/i, 25000, null, true],
    ['glass', /\b(?:glass|glasses|windowpane|pane|panes|bottles?|mirror|vase|plate|cup|jar|lamp|chandelier|china|crystal)\s+(?:\w+\s+)?(?:broke|shattered|smashed)\b/i, 25000, null, true],
    ['match', /\b(?:struck|strikes|striking|strike)\s+(?:a|the|his|her|another|one)\s+(?:\w+\s+)?(?:match|matches|light|flint|spark|sparks)\b/i, 30000, null, true],
    ['match', /\b(?:lit|lighted|lighting|kindled|kindling)\s+(?:a|the|his|her|their|another|an|my|your)\s+(?:\w+\s+)?(?:match|matches|candles?|lamps?|lanterns?|taper|torch|pipe|cigar|cigarette|fire)\b/i, 30000, null, true],
    ['paper', /^(letters?|papers?|parchments?|manuscripts?|envelopes?|unfolded|unsealed|crumpled|rustl\w+)$/, 30000],
    ['coins', /^(coins?|guineas?|sovereigns?|shillings?|ducats?|doubloons?|purse|jingl\w+)$/, 30000],
    ['lock', /^(keys?|locked|unlocked|unlocking)$/, 25000, (w, p, t) => /\b(door|doors|lock|locks|drawer|chest|gate|cell|trunk|cupboard|iron|rusty|pocket|turned|keyhole)\b/i.test(t)],
    ['tea', /^(teacups?|saucers?|teapot|kettle|clink(ed|ing|s)?|chink(ed|ing)?)$/, 30000, (w, p, t) => !/^(clink|chink)/.test(w) || /\b(glass|glasses|cup|cups|toast|tea|wine|bottle|spoon|plate|china)\b/i.test(t)],
    ['rooster', /^(roosters?|cockerels?|cock|crowed|crowing)$/, 45000, (w, p, t) => !/^(cock|crowed|crowing)$/.test(w) || /\b(cock|rooster|cockerel|crow|dawn|morning)\b/i.test(t)],
    // group C: travel and crowds
    ['wheels', /^(carriages?|coaches|coach|wheels?|cartwheels?|wagons?|stagecoach)$/, 40000, (w, p, t) => !/^(coach|wheels?)$/.test(w) || /\b(horses?|driver|coachman|carriage|road|roads|inn|passengers?|mail|cobbles?|cobblestones?|rattl\w*|rolled|rolling|lane|street|wagon|cart|gravel|stage)\b/i.test(t) && !/\b(football|team|trainer|training|steering|wheelchair|bicycle|bike|ferris|spinning wheel|potter)\b/i.test(t)],
    ['train', /^(trains?|locomotives?|whistle|whistled|whistling|railway|railroad)$/, 45000, (w, p, t) => !/^(whistle|whistled|whistling)$/.test(w) || /\b(train|engine|locomotive|station|steam|railway|railroad|platform|guard|carriages?|rails?|tracks?)\b/i.test(t)],
    ['ship', /^(ships?|sailors?|seamen|fog|foghorn|steamers?|schooner|mariners?)$/, 45000, (w, p, t) => !/^fog$/.test(w) || /\b(ship|ships|sea|harbou?r|port|coast|boat|boats|river|thames|dock|docks|sailors?|quay|mist|steamer|shore)\b/i.test(t)],
    ['crowd', /^(crowds?|crowded|market|marketplace|taverns?|bazaar|throng|multitude)$/, 45000, (w, p, t) => !/^(market|crowded)$/.test(w) || /\b(square|stalls?|stallholders?|vendors?|hawkers?|bustl\w*|people|crowds?|noise|busy|fair|bazaar|voices|day|town|streets?|inn|tavern)\b/i.test(t) && !/\b(stock|shares?|prices?|economy|trade|demand|value|research|housing)\b/i.test(t)],
    ['run', /^(ran|running|run|runs|raced|dashed|hurried|rushed)$/, 20000, (w, p, t) => /\b(road|roads|street|streets|stairs|staircase|hall|halls|field|fields|lane|path|corridor|passage|yard|courtyard|cobbles|pavement|steps|hill|forest|woods|meadow|platform|deck)\b/i.test(t) && !/\b(business|cheeks?|tears|river|stream|brook|water|blood|shop|company|fever|chill|shiver|nose|eyes|thought|mind|errands?|risk|deep|tap|bath|candidate|election|office|hands?|fingers?|hearts?)\b/i.test(t) && !/^(road|roads|path|street|lane|hall|field|stairs|wall|river|line|which|that|it|fence|track|corridor|hill|valley|passage|railway|years?|time|him|her|them|me|us|you|to|will|would|could|can|might|must|should|not|never|well|dry|wild|short|long|in|out|down|up)$/.test(p) && (w !== 'run' && w !== 'runs' || /^(to|would|will|could|can|must|should|might)$/.test(p) === false && /^(he|she|they|i|we|you|boys?|girls?|children|and|then|began|started|kept|to)$/.test(p))],
    // group D: people and feelings (gentle)
    ['clap', /^(clapped|clapping|applause|applauded)$/, 30000, (w, p, t) => !/^clap/.test(w) || /\b(hands?|applau\w*|audience|crowd|cheer\w*|delight|joy)\b/i.test(t) && !/\b(clapped (a|his|her|my|their) hands? (over|to|on|against)|clapped (him|me|them|us|her) (on|upon|round|around)\b|clapped eyes|irons|shut)/i.test(t)],
    ['laugh', /^(laughed|laughing|laughter|giggled|giggling|chuckled)$/, 35000],
    ['sigh', /^(sighed|sighing|sigh|sighs)$/, 35000],
    ['gasp', /^(gasped|gasping|gasp|gasps)$/, 35000],
    ['heart', /^(heartbeats?|pounded|pounding|throbbed|throbbing|thumped|thumping|hammered|hammering)$/, 40000, (w, p, t) => /^heartbeats?$/.test(w) || /\bhearts?\b/i.test(t) && /\b(heart|hearts)\b\W+(\w+\W+){0,2}(pounded|pounding|throbbed|throbbing|thumped|thumping|hammered|hammering)/i.test(t)]
  ];
  function cueNz(dest, t, buf, type, f, q, vol, atk, dec) {   // a burst of filtered noise; returns the filter so a sweep can be added
    const ctx = AMB.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = AMB[buf]; s.loop = true; fl.type = type; fl.frequency.value = f * (AMB.pj || 1); fl.Q.value = q || 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 3); s.stop(t + atk + dec + 0.1);
    return fl;
  }
  function cueClick(d, t, f, v) { ambTone(d, t, f, f * 0.6, 0.03, v, 'sine', 0.002); cueNz(d, t, 'white', 'bandpass', 3500, 1.2, v * 0.6, 0.002, 0.03); }   // a small metal click
  const CUE_SOUND = {
    thunder: (d, t) => ambRoll(d, t, 0.9, true, true),
    knock: (d, t, n) => { n = n ? Math.min(5, Math.max(1, n | 0)) : 3; for (let i = 0; i < n; i++) { const tt = t + i * 0.235 + Math.random() * 0.03; ambTone(d, tt, 190 * (0.96 + Math.random() * 0.08), 85, 0.1, (0.8 - i * 0.08) * (0.9 + Math.random() * 0.2), 'sine', 0.003); cueNz(d, tt, 'white', 'bandpass', 900, 1.2, 0.25, 0.002, 0.05); } },   // n knocks (default 3, at most 5)
    creak: (d, t) => {
      const ctx = AMB.ctx, dur = 0.9 + Math.random() * 0.8, o = ctx.createOscillator(), j = ctx.createOscillator(), jg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), f = 70 + Math.random() * 50;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (Math.random() < 0.5 ? 1.4 : 0.7), t + dur);
      j.frequency.value = 18 + Math.random() * 10; jg.gain.value = 9; j.connect(jg); jg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 300 + Math.random() * 300; bp.Q.value = 6;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.08); g.gain.setValueAtTime(0.4, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(t); j.start(t); o.stop(t + dur + 0.05); j.stop(t + dur + 0.05);
    },
    slam: (d, t) => { cueNz(d, t, 'brown', 'lowpass', 420, 0.7, 1, 0.003, 0.35); ambTone(d, t, 95, 45, 0.3, 0.9, 'sine', 0.003); cueNz(d, t, 'white', 'bandpass', 1400, 0.9, 0.3, 0.002, 0.06); },
    steps: (d, t) => { for (let i = 0; i < 6; i++) { const tt = t + i * 0.56 + Math.random() * 0.03, v = 0.55 * Math.sin(Math.PI * (i + 0.6) / 6.6) + 0.12; ambTone(d, tt, 120 - (i & 1) * 15, 60, 0.09, v, 'sine', 0.004); cueNz(d, tt, 'brown', 'lowpass', 320, 0.7, v * 0.8, 0.004, 0.09); } },
    bell: (d, t, n) => { n = n ? Math.min(12, Math.max(1, n | 0)) : 1; const f0 = 190 + Math.random() * 60, many = n > 1; for (let i = 0; i < n; i++) [[1, 0.4, 6], [2, 0.2, 4], [2.4, 0.16, 3.5], [3, 0.1, 2.5], [4.2, 0.06, 1.8]].forEach(([m, v, du]) => ambTone(d, t + i * 1.1, f0 * m, 0, many ? du * 0.55 : du, (many ? v * 0.75 : v) * (i ? 0.92 + Math.random() * 0.16 : 1), 'sine', 0.005)); },   // n strokes about 1.1 s apart (at most 12); shorter, softer rings when there are several so they do not pile up
    clock: (d, t) => { for (let i = 0; i < 5; i++) { const tt = t + i, hi = i & 1; cueNz(d, tt, 'white', 'bandpass', hi ? 2300 : 1700, 3, 0.4, 0.002, 0.045); ambTone(d, tt, hi ? 900 : 700, 400, 0.04, 0.2, 'sine', 0.002); } },
    wind: (d, t) => { const bp = cueNz(d, t, 'pink', 'bandpass', 320, 1.1, 0.55, 2.2, 3.8); bp.frequency.setValueAtTime(320, t); bp.frequency.linearRampToValueAtTime(760, t + 2.4); bp.frequency.linearRampToValueAtTime(340, t + 6); },
    waves: (d, t) => { cueNz(d, t, 'brown', 'lowpass', 900, 0.7, 0.8, 0.5, 3.8); cueNz(d, t + 1.6, 'pink', 'highpass', 2500, 0.7, 0.18, 0.8, 3); },
    splash: (d, t) => { cueNz(d, t, 'white', 'bandpass', 1800, 0.8, 0.45, 0.01, 0.4); cueNz(d, t, 'brown', 'lowpass', 500, 0.7, 0.7, 0.01, 0.5); },
    fire: (d, t) => {
      cueNz(d, t, 'brown', 'lowpass', 450, 0.7, 0.3, 1, 3);
      for (let i = 0; i < 14; i++) cueNz(d, t + Math.random() * 3.2, 'white', 'bandpass', 1200 + Math.random() * 3500, 1.2, 0.2 + Math.random() * 0.3, 0.003, 0.02 + Math.random() * 0.05);
    },
    birds: (d, t) => { for (let ph = 0; ph < 3; ph++) { const n = 2 + Math.floor(Math.random() * 4), f = 2200 + Math.random() * 2200, up = Math.random() < 0.6; for (let i = 0; i < n; i++) ambTone(d, t + ph * 1.1 + i * (0.09 + Math.random() * 0.05), f * (1 + i * 0.03), f * (up ? 1.35 : 0.8), 0.08, 0.14, 'sine', 0.008); } },
    owl: (d, t) => { ambTone(d, t, 430, 370, 0.45, 0.35, 'sine', 0.09); ambTone(d, t + 0.65, 400, 330, 0.6, 0.3, 'sine', 0.09); },
    horse: (d, t) => { for (let c = 0; c < 6; c++) [0, 0.12, 0.25].forEach((o, i) => { const tt = t + c * 0.48 + o, v = 0.5 * (1 - c / 7); ambTone(d, tt, 150 - i * 10, 70, 0.07, v, 'sine', 0.003); cueNz(d, tt, 'brown', 'lowpass', 650, 0.7, v * 0.7, 0.003, 0.06); }); },
    rain: (d, t) => { cueNz(d, t, 'pink', 'bandpass', 3000, 0.5, 0.3, 0.6, 5); cueNz(d, t, 'white', 'highpass', 4500, 0.7, 0.05, 0.6, 5); }
  ,
    storm: (d, t) => { const bp = cueNz(d, t, 'pink', 'bandpass', 300, 1.1, 0.6, 0.5, 5); bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(800, t + 3); bp.frequency.linearRampToValueAtTime(350, t + 7); ambRoll(d, t + 0.4, 0.55, false, true); },
    sea: (d, t) => { for (let i = 0; i < 2; i++) { const at = t + i * 3.8; cueNz(d, at, 'brown', 'lowpass', 900, 0.7, 0.7, 0.4, 2.6); cueNz(d, at + 1.2, 'pink', 'highpass', 2200, 0.7, 0.15, 0.3, 2.2); } },
    water: (d, t) => {   // a brook: bright noise with a changing colour, a few plinks on top
      const ctx = AMB.ctx, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = AMB.pink; s.loop = true; bp.type = 'bandpass'; bp.Q.value = 0.8;
      for (let i = 0; i < 40; i++) bp.frequency.setValueAtTime(1000 + Math.random() * 2200, t + i * 0.15);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 1); g.gain.setValueAtTime(0.32, t + 4.5); g.gain.linearRampToValueAtTime(0, t + 6);
      s.connect(bp); bp.connect(g); g.connect(d); s.start(t, Math.random() * 3); s.stop(t + 6.1);
      for (let i = 0; i < 6; i++) ambTone(d, t + 0.5 + Math.random() * 4.5, 1800 + Math.random() * 1200, 900, 0.07, 0.12, 'sine', 0.004);
    },
    crickets: (d, t) => { const pn = ambPanTo(d, Math.random() * 1.2 - 0.6); [4200, 4700].forEach((f, c) => { for (let g = 0; g < 8; g++) for (let p = 0; p < 3; p++) ambTone(pn, t + c * 0.23 + g * 0.5 + p * 0.07, f, 0, 0.035, 0.07, 'sine', 0.004); }); },
    frogs: (d, t) => {
      const lp = AMB.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.95 + Math.random() * 0.1, f = 230 + Math.random() * 60; ambTone(lp, tt, f * 1.1, f * 0.7, 0.13, 0.2, 'sawtooth', 0.01); ambTone(lp, tt + 0.17, f * 1.3, f * 0.8, 0.15, 0.2, 'sawtooth', 0.01); }
    },
    wolf: (d, t) => {   // one long howl: up, held with a waver, then down
      const ctx = AMB.ctx, bp = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.7); g.gain.setValueAtTime(0.3, t + 2.4); g.gain.linearRampToValueAtTime(0, t + 4);
      bp.connect(g); g.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      vib.frequency.value = 5.5; vg.gain.value = 7; vib.connect(vg);
      [[1, 1], [2, 0.4], [3, 0.2]].forEach(([m, v]) => {
        const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(300 * m, t); o.frequency.linearRampToValueAtTime(480 * m, t + 1.1); o.frequency.setValueAtTime(480 * m, t + 2.2); o.frequency.linearRampToValueAtTime(330 * m, t + 3.9);
        vg.connect(o.frequency); og.gain.value = v; o.connect(og); og.connect(bp); o.start(t); o.stop(t + 4.1);
      });
      vib.start(t); vib.stop(t + 4.1);
    },
    bee: (d, t) => {   // a buzz that passes from one side to the other
      const ctx = AMB.ctx, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null, dir = Math.random() < 0.5 ? -1 : 1;
      o.type = 'sawtooth'; o.frequency.value = 220; lfo.frequency.value = 14; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 1.4;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 2.6);
      o.connect(bp); bp.connect(g);
      if (pn) { pn.pan.setValueAtTime(-0.9 * dir, t); pn.pan.linearRampToValueAtTime(0.9 * dir, t + 2.6); g.connect(pn); pn.connect(d); } else g.connect(d);
      o.start(t); lfo.start(t); o.stop(t + 2.7); lfo.stop(t + 2.7);
    },
    rooster: (d, t) => {   // cock-a-doodle-doo: three rising notes and a long falling one
      const ctx = AMB.ctx, bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2; bp.connect(ambPanTo(d, Math.random() * 1.2 - 0.6));
      [[0, 0.22, 560, 760], [0.27, 0.2, 640, 830], [0.54, 0.3, 720, 980], [0.95, 1.0, 980, 520]].forEach(([o, du, f0, f1]) => {
        const os = ctx.createOscillator(), g = ctx.createGain(), at = t + o; os.type = 'sawtooth';
        os.frequency.setValueAtTime(f0, at); os.frequency.linearRampToValueAtTime(f1, at + du);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.03); g.gain.setValueAtTime(0.22, at + du * 0.8); g.gain.linearRampToValueAtTime(0, at + du);
        os.connect(g); g.connect(bp); os.start(at); os.stop(at + du + 0.05);
      });
    }
,
    dooropen: (d, t) => { cueClick(d, t, 2200, 0.35); CUE_SOUND.creak(d, t + 0.06); },
    doorshut: (d, t) => { ambTone(d, t, 115, 55, 0.22, 0.7, 'sine', 0.004); cueNz(d, t, 'brown', 'lowpass', 520, 0.7, 0.55, 0.004, 0.14); cueClick(d, t + 0.12, 2600, 0.3); },
    glass: (d, t) => {
      const pn = ambPanTo(d, Math.random() * 0.8 - 0.4);
      cueNz(pn, t, 'white', 'highpass', 2500, 0.7, 0.5, 0.002, 0.35);
      for (let i = 0; i < 14; i++) ambTone(pn, t + 0.05 + Math.random() * 0.7, 2500 + Math.random() * 4500, 0, 0.12 + Math.random() * 0.15, 0.1 + Math.random() * 0.1, 'sine', 0.002);
    },
    match: (d, t) => {
      const sc = cueNz(d, t, 'white', 'bandpass', 2600, 1, 0.28, 0.01, 0.18); sc.frequency.setValueAtTime(2600, t); sc.frequency.linearRampToValueAtTime(4200, t + 0.18);
      cueNz(d, t + 0.17, 'pink', 'lowpass', 1300, 0.7, 0.32, 0.05, 0.55);
      for (let i = 0; i < 4; i++) cueNz(d, t + 0.3 + Math.random() * 0.5, 'white', 'bandpass', 3000 + Math.random() * 2000, 1.2, 0.12, 0.003, 0.03);
    },
    paper: (d, t) => {
      const pn = ambPanTo(d, Math.random() * 0.8 - 0.4);
      cueNz(pn, t, 'white', 'bandpass', 3500, 0.7, 0.22, 0.03, 0.22); cueNz(pn, t + 0.18, 'white', 'bandpass', 2800, 0.7, 0.18, 0.02, 0.3);
      for (let i = 0; i < 4; i++) cueNz(pn, t + 0.1 + Math.random() * 0.5, 'white', 'bandpass', 4000, 1.5, 0.1, 0.002, 0.025);
    },
    coins: (d, t) => { const pn = ambPanTo(d, Math.random() * 0.8 - 0.4); for (let i = 0; i < 9; i++) { const tt = t + i * 0.045 + Math.random() * 0.02, f = 2800 + Math.random() * 2600; ambTone(pn, tt, f, 0, 0.18, 0.12, 'sine', 0.002); ambTone(pn, tt, f * 2.7, 0, 0.09, 0.05, 'sine', 0.002); } cueNz(pn, t, 'white', 'bandpass', 5000, 1, 0.1, 0.002, 0.08); },
    lock: (d, t) => { cueClick(d, t, 3000, 0.35); cueClick(d, t + 0.14, 2400, 0.5); for (let i = 0; i < 3; i++) ambTone(d, t + 0.3 + i * 0.05, 2500 + Math.random() * 1500, 0, 0.12, 0.09, 'sine', 0.002); },
    wheels: (d, t) => {   // rolling wheels on a road: a grainy rumble that pulses, with a hint of hooves
      const pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      for (let i = 0; i < 18; i++) { const tt = t + i * 0.12 + Math.random() * 0.02, v = (0.2 + Math.sin(Math.PI * i / 17) * 0.35) * (i % 3 ? 0.8 : 1); cueNz(pn, tt, 'pink', 'bandpass', 600 + Math.random() * 300, 0.9, v, 0.02, 0.12); cueNz(pn, tt, 'white', 'highpass', 2500, 0.7, v * 0.12, 0.004, 0.04); }
      for (let c = 0; c < 5; c++) [0, 0.14].forEach((o, i) => { const tt = t + 0.1 + c * 0.42 + o, v = 0.16 * Math.sin(Math.PI * (c + 0.7) / 5.7); ambTone(pn, tt, 330 - i * 40, 220, 0.06, v, 'sine', 0.003); cueNz(pn, tt, 'white', 'bandpass', 1300, 1.2, v * 0.8, 0.002, 0.04); });
    },
    train: (d, t) => {   // chuffing, then a steam whistle
      const pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      for (let i = 0; i < 9; i++) { const tt = t + i * (0.3 - i * 0.012), v = 0.5 * (1 - i / 14); cueNz(pn, tt, 'white', 'bandpass', 900, 0.8, v, 0.015, 0.14); cueNz(pn, tt, 'pink', 'bandpass', 450, 0.8, v * 0.6, 0.01, 0.1); }
      const w = t + 2.3, o1 = AMB.ctx.createOscillator(), o2 = AMB.ctx.createOscillator(), g = AMB.ctx.createGain();
      o1.type = 'triangle'; o2.type = 'triangle'; o1.frequency.setValueAtTime(840, w); o2.frequency.setValueAtTime(1050, w);
      g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.22, w + 0.08); g.gain.setValueAtTime(0.22, w + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, w + 1.3);
      o1.connect(g); o2.connect(g); g.connect(pn); o1.start(w); o2.start(w); o1.stop(w + 1.4); o2.stop(w + 1.4);
      cueNz(pn, w, 'white', 'bandpass', 3000, 1, 0.05, 0.08, 1.1);
    },
    ship: (d, t) => {   // a wooden creak and a distant foghorn
      const ctx = AMB.ctx, pn = ambPanTo(d, Math.random() * 0.6 - 0.3);
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(300, t + 0.5); o.frequency.linearRampToValueAtTime(220, t + 1);
      bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.3); g.gain.linearRampToValueAtTime(0.09, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(bp); bp.connect(g); g.connect(pn); o.start(t); o.stop(t + 1.2);
      const h = t + 1.4, h1 = ctx.createOscillator(), h2 = ctx.createOscillator(), hg = ctx.createGain(), lp = ctx.createBiquadFilter();
      h1.type = 'sawtooth'; h2.type = 'sawtooth'; h1.frequency.value = 220; h2.frequency.value = 277; lp.type = 'lowpass'; lp.frequency.value = 900;
      hg.gain.setValueAtTime(0, h); hg.gain.linearRampToValueAtTime(0.16, h + 0.25); hg.gain.setValueAtTime(0.16, h + 1.3); hg.gain.exponentialRampToValueAtTime(0.0001, h + 2.1);
      h1.connect(lp); h2.connect(lp); lp.connect(hg); hg.connect(pn); h1.start(h); h2.start(h); h1.stop(h + 2.2); h2.stop(h + 2.2);
    },
    crowd: (d, t) => {   // a murmur of many people: slow-moving bands of noise, no words
      const pn = ambPanTo(d, 0), dur = 3.2;
      [[420, 1.2, 0.3], [800, 1.5, 0.28], [1300, 1.8, 0.2], [2200, 1.5, 0.1]].forEach(([f, q, v], i) => {
        const fl = cueNz(pn, t + i * 0.05, 'pink', 'bandpass', f, q, v, 0.9, dur);
        for (let k = 1; k < 8; k++) fl.frequency.setValueAtTime(f * (0.85 + Math.random() * 0.35), t + k * 0.4);
      });
    },
    run: (d, t) => {   // quick light footsteps
      const pn = ambPanTo(d, Math.random() * 0.4 - 0.2);
      for (let i = 0; i < 8; i++) { const tt = t + i * 0.2 + (i & 1 ? 0.02 : 0) + Math.random() * 0.015, v = 0.3 * Math.sin(Math.PI * (i + 0.6) / 8.6) + 0.06; ambTone(pn, tt, 260 - (i & 1) * 30, 160, 0.06, v, 'sine', 0.003); cueNz(pn, tt, 'white', 'bandpass', 1100 + (i & 1) * 200, 1, v * 0.9, 0.002, 0.05); }
    },
    clap: (d, t) => {   // warm, soft applause: many small claps, swelling then fading
      const pn = ambPanTo(d, 0), n = 34;
      for (let i = 0; i < n; i++) { const x = i / n, tt = t + x * 2.4 + Math.random() * 0.06, v = 0.22 * Math.sin(Math.PI * Math.pow(x, 0.7)) + 0.03; cueNz(pn, tt, 'white', 'bandpass', 1700 + Math.random() * 1500, 0.9, v, 0.002, 0.03 + Math.random() * 0.02); cueNz(pn, tt, 'pink', 'bandpass', 700, 0.8, v * 0.5, 0.002, 0.05); }
    },
    laugh: (d, t) => {   // a soft, short, warm laugh: a few gentle breathy "ha"s, not loud, not words
      const ctx = AMB.ctx, pn = ambPanTo(d, Math.random() * 0.4 - 0.2);
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.2, v = 0.1 * (1 - i * 0.18), f = 300 - i * 15;
        const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.15, tt); o.frequency.exponentialRampToValueAtTime(f, tt + 0.14);
        bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 1.6;
        g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(v, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.16);
        o.connect(bp); bp.connect(g); g.connect(pn); o.start(tt); o.stop(tt + 0.2);
        cueNz(pn, tt, 'pink', 'bandpass', 1500, 0.8, v * 0.7, 0.02, 0.12);
      }
    },
    sigh: (d, t) => {   // a soft breath out that falls away
      const pn = ambPanTo(d, 0), fl = cueNz(pn, t, 'pink', 'bandpass', 1500, 0.9, 0.2, 0.25, 1.1);
      fl.frequency.setValueAtTime(1500, t); fl.frequency.exponentialRampToValueAtTime(550, t + 1.3);
      const f2 = cueNz(pn, t + 0.05, 'white', 'highpass', 2200, 0.7, 0.025, 0.2, 0.9);
    },
    gasp: (d, t) => {   // a short breath in
      const pn = ambPanTo(d, 0), fl = cueNz(pn, t, 'pink', 'bandpass', 800, 1, 0.22, 0.12, 0.2);
      fl.frequency.setValueAtTime(800, t); fl.frequency.exponentialRampToValueAtTime(2200, t + 0.28);
      cueNz(pn, t, 'white', 'highpass', 2500, 0.7, 0.03, 0.1, 0.18);
    },
    heart: (d, t) => {   // a gentle lub-dub, four times, a little quicker each time
      let o = 0;
      for (let i = 0; i < 4; i++) {
        const tt = t + o, v = 0.5 - i * 0.04;
        ambTone(d, tt, 240, 180, 0.13, v, 'sine', 0.006); cueNz(d, tt, 'brown', 'lowpass', 550, 0.7, v * 0.5, 0.005, 0.1);
        ambTone(d, tt + 0.2, 280, 200, 0.1, v * 0.75, 'sine', 0.006); cueNz(d, tt + 0.2, 'brown', 'lowpass', 600, 0.7, v * 0.35, 0.005, 0.08);
        o += 0.82 - i * 0.04;
      }
    },
    tea: (d, t) => { const pn = ambPanTo(d, Math.random() * 0.8 - 0.4); [[0, 3200, 4800], [0.28, 2900, 4300]].forEach(([o, f, f2]) => { ambTone(pn, t + o, f, 0, 0.35, 0.2, 'sine', 0.002); ambTone(pn, t + o, f2, 0, 0.2, 0.1, 'sine', 0.002); }); }
  };
  const CUE_CATS = { nature: 'Nature', home: 'Home', travel: 'Travel', people: 'People' };
  const CUE_CAT = {};   // every sound key belongs to exactly one category switch
  [['nature', 'thunder wind waves splash rain storm sea water crickets frogs wolf bee birds owl rooster fire'], ['home', 'knock creak slam bell clock dooropen doorshut glass match paper coins lock tea'], ['travel', 'steps horse wheels train ship crowd run'], ['people', 'clap laugh sigh gasp heart']].forEach(([c, ks]) => ks.split(' ').forEach(k => { CUE_CAT[k] = c; }));
  const cueCatOff = k => (P.ambCats || {})[CUE_CAT[k]] === false;
  const CUE_NAMES = { thunder: 'Thunder', knock: 'Knocking', creak: 'Creaking', slam: 'Door slam', steps: 'Footsteps', bell: 'Bell', clock: 'Ticking clock', wind: 'Gust of wind', waves: 'Waves', splash: 'Splash', fire: 'Crackling fire', birds: 'Birdsong', owl: 'Owl', horse: 'Galloping horse', rain: 'Rain', storm: 'Storm', sea: 'Sea', water: 'Brook or river', crickets: 'Crickets', frogs: 'Frogs', wolf: 'Wolf howl', bee: 'Buzzing bee', dooropen: 'Door opening', doorshut: 'Door closing', glass: 'Breaking glass', match: 'Striking a match', paper: 'Rustling paper', coins: 'Coins', lock: 'Key and lock', tea: 'Teacups', rooster: 'Rooster', wheels: 'Carriage wheels', train: 'Train', ship: 'Ship and foghorn', crowd: 'Crowd murmur', run: 'Running', clap: 'Applause', laugh: 'Laugh', sigh: 'Sigh', gasp: 'Gasp', heart: 'Heartbeat' };
  function ambStory(id) {   // called when the reader moves to a sentence: find trigger words, play each one as its word is spoken
    try {
      if (!AMB.on || !AMB.cue || P.ambCues === false || P.calm === true || audio.paused || audio.seeking || !S.model || id == null || id < 0) return;
      const s = S.model.sents[id]; if (!s || s.h) return;
      const text = s.t, re = /[a-z0-9]+(?:['\u2019][a-z]+)?/gi, hits = [], seen = new Set();   // hits: [sound, word index, count]
      const cust = Array.isArray(P.ambCueCustom) ? P.ambCueCustom : [];
      const wIdx = idx => (text.slice(0, idx).match(/[a-z0-9]+(?:['\u2019][a-z]+)?/gi) || []).length;
      for (const r of CUE_RULES) if (r[4] && !seen.has(r[0]) && !cueCatOff(r[0])) {   // phrase rules, timed at the phrase's first word
        const pm = r[1].exec(text); if (!pm) continue;
        const fc = text[pm.index], first = !/[a-z0-9]/i.test(text.slice(0, pm.index));
        if (fc !== fc.toLowerCase() && !first) continue;
        if (r[3] && !r[3](pm[0], '', text)) continue;
        seen.add(r[0]); hits.push([r[0], wIdx(pm.index), 0]);
      }
      let m, wi = 0, prev = '';
      while ((m = re.exec(text))) {
        const lw = m[0].toLowerCase(), cap = m[0][0] !== lw[0], first = !/[a-z0-9]/i.test(text.slice(0, m.index));
        const cu = cust.find(c => c && c.w === lw.replace(/\u2019/g, "'"));   // the reader's own words: whole word, any case, names included
        if (cu) { if (CUE_SOUND[cu.k] && !seen.has(cu.k) && !cueCatOff(cu.k)) { seen.add(cu.k); hits.push([cu.k, wi, 0]); } }
        else if (!(cap && !first)) for (const r of CUE_RULES) if (!r[4] && !cueCatOff(r[0]) && r[1].test(lw) && (!r[3] || r[3](lw, prev, text))) { if (!seen.has(r[0])) { seen.add(r[0]); hits.push([r[0], wi, 0]); } break; }
        prev = lw; wi++;
      }
      hits.sort((x, y) => x[1] - y[1]);
      hits.forEach(h => { const f = CUE_COUNT[h[0]], c = f && f(text); if (c) { h[1] = wIdx(c.i); h[2] = c.n; } });   // "struck twelve", "knocked twice": count it and time it at the verb
      hits.sort((x, y) => x[1] - y[1]);
      if (!hits.length) return;
      const times = wordTimesAny(id), rate = audio.playbackRate || 1, now = nowT() + P.nudge + (P.wordShift || 0);
      const pend = AMB.cueT || (AMB.cueT = []);
      for (let j = pend.length - 1; j >= 0; j--) if (pend[j].id === id) { clearTimeout(pend[j].h); pend.splice(j, 1); }   // asked again for this sentence (play pressed): start over
      const exact = !!wordTimesFor(id);   // exact word times: land on the word; estimated ones: a little earlier, as they can be off
      hits.slice(0, 2).forEach(([k, i, n]) => {
        const e = { id, k, n, i, h: 0, T: null, lead: exact ? 0.15 : 0.3 };
        if (times && times[i] != null) { const media = times[i] - now; if (media < -0.4 || media > 15) return; e.T = times[i]; pend.push(e); ambCueWait(e); }
        else { e.h = setTimeout(() => { const x = pend.indexOf(e); if (x >= 0) pend.splice(x, 1); ambCueFire(k, id, n); }, (0.25 + i * 0.3) * 1000); pend.push(e); }
      });
    } catch (e) { console.warn('story sound', e); }   // story sounds are a bonus: never let them break reading
  }
  function ambCueWait(e) {   // wait on the audio's own clock, not on a timer: a stall, a speed change or a re-sync cannot make the sound early or late
    try {
      const pend = AMB.cueT || [], ts = wordTimesAny(e.id);
      if (ts && ts[e.i] != null) e.T = ts[e.i];   // follow the word if its time moved
      const left = e.T - (nowT() + P.nudge + (P.wordShift || 0) + e.lead - (P.ambCueShift || 0));   // seconds of audio still to wait
      if (left <= 0.02) { const x = pend.indexOf(e); if (x >= 0) pend.splice(x, 1); ambCueFire(e.k, e.id, e.n); return; }
      e.h = setTimeout(() => ambCueWait(e), Math.max(15, Math.min(250, left / (audio.playbackRate || 1) * 1000)));
    } catch (x) { console.warn('story sound', x); }
  }
  function ambCueClear() {
    (AMB.cueT || []).forEach(e => clearTimeout(e.h)); AMB.cueT = []; clearTimeout(AMB.transH); AMB.transH = 0;
    (AMB.cueG || []).forEach(g => { try { g.gain.setTargetAtTime(0, AMB.ctx.currentTime, 0.05); } catch (e) {} }); AMB.cueG = [];   // a counted run of strokes stops when the book pauses or jumps
  }
  function ambCueFire(k, id, n) {
    if (!AMB.on || !AMB.cue || P.ambCues === false || cueCatOff(k) || audio.paused || audio.seeking || Math.abs((S.curId == null ? -9 : S.curId) - id) > 1) return;   // paused, jumped away or moved on: skip
    const ms = Date.now(), nx = AMB.cueNx || (AMB.cueNx = {}), log = AMB.cueLog || (AMB.cueLog = []);
    while (log.length && ms - log[0] > 60000) log.shift();
    if (ms < (nx[k] || 0) || ms < (AMB.cueGap || 0) || log.length >= 6) return;
    const rule = CUE_RULES.find(r => r[0] === k); nx[k] = ms + (rule ? rule[2] : 30000); AMB.cueGap = ms + 3500; log.push(ms);
    try { AMB.ctx.resume().catch(() => {}); AMB.pj = 0.95 + Math.random() * 0.1; let dst = AMB.cue; if (n > 1) { dst = AMB.ctx.createGain(); dst.connect(AMB.cue); (AMB.cueG = (AMB.cueG || []).slice(-3)).push(dst); } CUE_SOUND[k](dst, AMB.ctx.currentTime + 0.03, n || undefined); } catch (e) { console.warn('story sound', k, e); }
    AMB.pj = 1;
  }
  /* Transition sounds: when the story moves to a new place, a short door, gate or footsteps sound plays as the scene
     crossfades. Indoors gets a door, a farm, garden or village a gate, anywhere else a few footsteps. Moves by
     vehicle or sea get none, a seek or a new book gets none, and there is at most one every 15 seconds. */
  const TRANS_SKIP = new Set(['train', 'carriage', 'sea', 'seastorm', 'reef', 'battle', 'trench', 'machine', 'waterfall']);
  const TRANS_GATE = new Set(['farm', 'garden', 'orchard', 'graveyard', 'country', 'village', 'manor', 'castle', 'palace', 'prairie', 'harbour', 'fair', 'school']);
  function ambTransKind(from, to) {
    const a = SC_PLACES[from], b = SC_PLACES[to];
    if (!a || !b || TRANS_SKIP.has(from) || TRANS_SKIP.has(to)) return null;
    if (!b.out) return 'door';   // arriving indoors
    if (TRANS_GATE.has(to)) return 'gate';
    if (!a.out) return 'door';   // leaving a building
    return 'steps';
  }
  function transSteps(d, t, n, v, out) {   // n footsteps about 0.42 s apart: gravel crunch outdoors, wood tap indoors
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.42 + Math.random() * 0.025, vv = v * (0.9 + Math.random() * 0.2);
      ambTone(d, tt, 130 - (i & 1) * 14, 65, 0.08, vv, 'sine', 0.004); cueNz(d, tt, 'brown', 'lowpass', 380, 0.7, vv * 0.8, 0.004, 0.08);
      if (out) cueNz(d, tt, 'white', 'bandpass', 1800 + (i & 1) * 250, 0.9, vv * 0.18, 0.003, 0.07); else cueNz(d, tt, 'white', 'bandpass', 700, 1.2, vv * 0.22, 0.002, 0.04);
    }
  }
  const TRANS_SOUND = {
    door: (d, t, out) => { CUE_SOUND.dooropen(d, t); transSteps(d, t + 0.9, 3, 0.45, out); CUE_SOUND.doorshut(d, t + 2.3); },   // open it, walk through, close it
    gate: (d, t, out) => {   // latch, a long iron squeal, a clank, then steps through
      const ctx = AMB.ctx, dur = 0.8 + Math.random() * 0.3, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), s0 = t + 0.1;
      cueClick(d, t, 1800, 0.3);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(480, s0); o.frequency.linearRampToValueAtTime(700 + Math.random() * 120, s0 + dur);
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 9;
      g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(0.2, s0 + 0.15); g.gain.setValueAtTime(0.2, s0 + dur * 0.7); g.gain.linearRampToValueAtTime(0, s0 + dur);
      o.connect(bp); bp.connect(g); g.connect(d); o.start(s0); o.stop(s0 + dur + 0.05);
      cueNz(d, s0 + dur, 'brown', 'lowpass', 420, 0.7, 0.5, 0.004, 0.16); cueClick(d, s0 + dur + 0.04, 2400, 0.3);
      transSteps(d, s0 + dur + 0.6, 3, 0.45, true);
    },
    steps: (d, t, out) => { transSteps(d, t, 5, 0.5, out); }
  };
  function ambTrans(from, to, id, look, skipped) {   // called by the scene detector the moment the place changes
    try {
      if (skipped || !from || !to || from === to || !AMB.on || !AMB.cue || P.ambTrans === false || P.calm === true || !ambPlaying()) return;
      const kind = ambTransKind(from, to); if (!kind) return;
      const ms = Date.now(); if (ms < (AMB.transNx || 0)) return;
      AMB.transNx = ms + 15000; clearTimeout(AMB.transH);
      const e = { id, kind, to, T: null }, ts = look ? wordTimesAny(id) : null;   // looking ahead: wait for the new paragraph's first word
      if (ts && ts[0] != null) { e.T = ts[0]; ambTransWait(e); } else ambTransFire(e);
    } catch (e) { console.warn('transition sound', e); }   // a bonus: never let it break reading
  }
  function ambTransWait(e) {   // on the audio's own clock, like the story sounds
    try {
      const ts = wordTimesAny(e.id); if (ts && ts[0] != null) e.T = ts[0];
      const left = e.T - (nowT() + P.nudge + (P.wordShift || 0) - (P.ambCueShift || 0));
      if (left <= 0.02 || left > 20) { AMB.transH = 0; if (left <= 0.02) ambTransFire(e); return; }
      AMB.transH = setTimeout(() => ambTransWait(e), Math.max(15, Math.min(250, left / (audio.playbackRate || 1) * 1000)));
    } catch (x) { console.warn('transition sound', x); }
  }
  function ambTransFire(e) {
    try {
      if (!AMB.on || !AMB.cue || P.ambTrans === false || P.calm === true || audio.paused || audio.seeking || Math.abs((S.curId == null ? -9 : S.curId) - e.id) > 1) return;
      const ctx = AMB.ctx, dst = ctx.createGain(), pl = SC_PLACES[e.to];
      dst.gain.value = 0.8; dst.connect(AMB.cue); (AMB.cueG = (AMB.cueG || []).slice(-3)).push(dst);   // fades out if the book pauses
      ctx.resume().catch(() => {}); AMB.pj = 0.95 + Math.random() * 0.1;
      TRANS_SOUND[e.kind](dst, ctx.currentTime + 0.03, !!(pl && pl.out));
      AMB.cueGap = Date.now() + 3500;   // keep a story sound from landing on top of it
    } catch (x) { console.warn('transition sound', x); }
    AMB.pj = 1;
  }
  /* Intensity and time of day. One slider turns the whole mix down to a hush or up to the full scene: the steady
     sounds (rain, wind, waves) simply get louder, while the extra details (thunder, creaks, a bell) only come in
     as it goes up. At night the mix gets a little quieter and warmer (the high end is softened), if switched on.
     The sliders and saved mixes stay as set; this only changes what is played. */
  const AMB_ONSET = { cannon: 0.55, clang: 0.5, hooves: 0.4, steps: 0.4, crowd: 0.1, train: 0.1, thunder: 0.55, bell: 0.5, heartbeat: 0.5, creaks: 0.45, drips: 0.35, clock: 0.3, birds: 0.25, night: 0.2, fire: 0.1, cafe: 0.1 };
  function ambNight() {   // 0 by day, 1 in the middle of the night, easing in and out over two hours
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 22 || h < 5) return 1;
    if (h >= 20) return (h - 20) / 2;
    if (h < 7) return (7 - h) / 2;
    return 0;
  }
  function ambLive() {   // the levels that are actually played: the mix, scaled by intensity and by the night setting
    const L = ambBase(), i = Math.max(0, Math.min(1, (P.ambInt == null ? 100 : P.ambInt) / 100 * ambMoodShape().i)) * (1 - 0.25 * (P.ambTod !== false ? (AMB.nf || 0) : 0)), o = {};
    AMB_SOUNDS.forEach(([k]) => { const on = AMB_ONSET[k] || 0; o[k] = i <= on ? 0 : (L[k] || 0) * Math.pow((i - on) / (1 - on), 0.8); });
    const a = AMB.aud; if (a && Date.now() < a.until) { if (a.solo) for (const k in o) o[k] = 0; o[a.k] = Math.max(o[a.k], a.lv); }   // a sound being tried: alone when the book is paused, on top of the mix when it plays
    return o;
  }
  function ambStoryNight() {   // 1 when the story itself is at night (and scenes are on, and the reader's own mix is not held), else 0
    const A = AMB.auto;
    return P.ambTod !== false && P.ambAuto !== false && A && !A.hold && !A.fix && A.time === 'night' ? 1 : 0;
  }
  function ambTod(quiet, slow) {   // follow the clock and the story; called when the sound starts and every few seconds while it plays. slow: the story changed time of day, so ramp over several seconds
    const nf = P.ambTod === false ? 0 : Math.max(ambNight(), ambStoryNight());
    if (AMB.nf != null && Math.abs(nf - AMB.nf) < 0.02) return;
    AMB.nf = nf;
    if (AMB.warm) AMB.warm.gain.setTargetAtTime(-6 * nf, AMB.ctx.currentTime, slow ? 4 : 2);
    if (!quiet) ambApply(slow ? 4 : 3);
  }
  function ambTonight() { return (P.ambTod !== false && ambNight() > 0.5) ? (AMB_SCENES.find(s => s.k === 'sleep') || null) : null; }
