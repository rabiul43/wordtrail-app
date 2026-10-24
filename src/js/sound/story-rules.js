  /* ---------- story-rules.js ----------
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
