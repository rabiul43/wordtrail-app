  /* ---------- Grammar detector (GD) ----------
     Rule-based, pure, no screen. Nothing runs at start-up (only small word lists are built when this file loads), nothing listens to playback,
     nothing is stored. A later task (grammar cards, questions) calls it with one sentence and gets the patterns it finds.

     Finds: simple tenses (present, past, future), continuous, perfect, perfect continuous (present, past, future), going-to future,
     passive (8 tense forms + modal passive), modals (can could may might must should would ought, have to) and conditionals
     (zero, first, second, third, mixed). Old-style English is understood: thou art, hath, doth, wilt, shalt, hadst, -eth, -est, 'twas.
     No dictionary: a verb is a verb when it follows a subject (pronoun or noun) and looks like one (small list of common verbs, -ed, irregular
     past forms, -s after he/she/it). Unknown base verbs after a noun subject can be missed; an imperative ("Close the door.") gives nothing.

     API (later tasks call these):
       GD.detect(sentence) -> { ok, text, main, patterns }   never throws; sentences longer than 1000 characters are cut
            pattern = { id, name:{en,bn}, explain:{en,bn}, example:{en,bn}, s, e, text, sub, variant?, old?, parts? }
              id       'present-simple' ... 'passive-modal', 'modal-can', 'future-going-to', 'modal-have-to', 'conditional-0..3', 'conditional-mixed'
              s, e     character range in the sentence; text = the words found (e.g. "had been waiting")
              sub      true when it sits in a clause that starts with when/if/because/who ... (the main clause comes first in `main`)
              variant  'perfect' | 'continuous' | 'perfect-continuous' (modals), 'past' (have to, going to)
              old      [{ from, to? }] old-style forms inside it (hath -> has)
              parts    conditionals only: the two tense patterns it joins, e.g. ['past-perfect','modal-would']
            main = the first pattern that is not in a sub clause (else the first one), or null
       GD.detectText(text) -> [ { s, e, text, ok, main, patterns } ]   one entry per sentence (s, e are positions in `text`)
       GD.info(id) -> { id, name, explain, example } or null;  GD.ids = every id
     Remove this file, its build.py line and tools/grammar_detector_check.js to go back. */
  const GD = (() => {
    const GD_VER = 1, MAXLEN = 1000;
    const set = s => new Set(s.split(' '));

    /* ---------- the catalogue: name, short explanation, short example, English and Bengali ---------- */
    const CAT = {};
    const P = (id, ne, nb, xe, xb, ee, eb) => { CAT[id] = { name: { en: ne, bn: nb }, explain: { en: xe, bn: xb }, example: { en: ee, bn: eb } }; };
    P('present-simple', 'Present simple', 'সাধারণ বর্তমান', 'Habits, facts and things that are always true.', 'অভ্যাস, সাধারণ সত্য বা সবসময় সত্য এমন কথা।', 'She walks to school.', 'সে হেঁটে স্কুলে যায়।');
    P('past-simple', 'Past simple', 'সাধারণ অতীত', 'A finished action at a time in the past.', 'অতীতে শেষ হয়ে গেছে এমন কাজ।', 'We played football yesterday.', 'আমরা গতকাল ফুটবল খেলেছিলাম।');
    P('future-simple', 'Future simple', 'সাধারণ ভবিষ্যৎ', 'will or shall + base verb: a decision, promise or guess about the future.', 'will বা shall + verb: ভবিষ্যতের সিদ্ধান্ত, প্রতিশ্রুতি বা অনুমান।', 'I will call you tomorrow.', 'আমি কাল তোমাকে ফোন করব।');
    P('present-continuous', 'Present continuous', 'ঘটমান বর্তমান', 'am/is/are + verb-ing: an action happening now or around now.', 'am/is/are + verb-ing: এখন বা এই সময়ে চলছে এমন কাজ।', 'He is reading a book.', 'সে একটি বই পড়ছে।');
    P('past-continuous', 'Past continuous', 'ঘটমান অতীত', 'was/were + verb-ing: an action that was in progress at a time in the past.', 'was/were + verb-ing: অতীতের কোনো সময়ে চলছিল এমন কাজ।', 'I was sleeping when you called.', 'তুমি যখন ফোন করলে তখন আমি ঘুমাচ্ছিলাম।');
    P('future-continuous', 'Future continuous', 'ঘটমান ভবিষ্যৎ', 'will be + verb-ing: an action that will be in progress at a future time.', 'will be + verb-ing: ভবিষ্যতের কোনো সময়ে চলতে থাকবে এমন কাজ।', 'At noon I will be travelling.', 'দুপুরে আমি ভ্রমণ করতে থাকব।');
    P('present-perfect', 'Present perfect', 'পুরাঘটিত বর্তমান', 'have/has + past participle: a past action that still matters now.', 'have/has + past participle: অতীতের কাজ যার ফল এখনও আছে।', 'I have finished my homework.', 'আমি আমার বাড়ির কাজ শেষ করেছি।');
    P('past-perfect', 'Past perfect', 'পুরাঘটিত অতীত', 'had + past participle: an action finished before another time in the past.', 'had + past participle: অতীতের আরেকটি সময়ের আগেই শেষ হয়েছিল এমন কাজ।', 'The train had left before we arrived.', 'আমরা পৌঁছানোর আগেই ট্রেন ছেড়ে গিয়েছিল।');
    P('future-perfect', 'Future perfect', 'পুরাঘটিত ভবিষ্যৎ', 'will have + past participle: an action that will be finished by a future time.', 'will have + past participle: ভবিষ্যতের কোনো সময়ের মধ্যে শেষ হয়ে যাবে এমন কাজ।', 'By June I will have graduated.', 'জুনের মধ্যে আমি পড়াশোনা শেষ করে ফেলব।');
    P('present-perfect-continuous', 'Present perfect continuous', 'পুরাঘটিত ঘটমান বর্তমান', 'have/has been + verb-ing: an action that started in the past and is still going on.', 'have/has been + verb-ing: অতীতে শুরু হয়ে এখনও চলছে এমন কাজ।', 'She has been studying for two hours.', 'সে দুই ঘণ্টা ধরে পড়ছে।');
    P('past-perfect-continuous', 'Past perfect continuous', 'পুরাঘটিত ঘটমান অতীত', 'had been + verb-ing: an action that was going on until a time in the past.', 'had been + verb-ing: অতীতের কোনো সময় পর্যন্ত চলছিল এমন কাজ।', 'They had been waiting for an hour.', 'তারা এক ঘণ্টা ধরে অপেক্ষা করছিল।');
    P('future-perfect-continuous', 'Future perfect continuous', 'পুরাঘটিত ঘটমান ভবিষ্যৎ', 'will have been + verb-ing: how long something will have been going on by a future time.', 'will have been + verb-ing: ভবিষ্যতের কোনো সময় পর্যন্ত কতদিন ধরে চলবে তা বোঝায়।', 'Next year I will have been teaching for ten years.', 'আগামী বছর আমার শেখানোর দশ বছর পূর্ণ হবে।');
    P('future-going-to', 'Going to future', 'going to ভবিষ্যৎ', 'am/is/are going to + base verb: a plan, or something about to happen.', 'am/is/are going to + verb: পরিকল্পনা বা এখনই ঘটতে যাচ্ছে এমন কিছু।', 'We are going to visit Dhaka.', 'আমরা ঢাকা ঘুরতে যাচ্ছি।');
    P('passive-present-simple', 'Passive: present simple', 'কর্মবাচ্য: সাধারণ বর্তমান', 'am/is/are + past participle: the action matters more than who does it.', 'am/is/are + past participle: কে করে তার চেয়ে কাজটাই বেশি গুরুত্বপূর্ণ।', 'Rice is grown in Bangladesh.', 'বাংলাদেশে ধান চাষ করা হয়।');
    P('passive-past-simple', 'Passive: past simple', 'কর্মবাচ্য: সাধারণ অতীত', 'was/were + past participle: something was done (by someone) in the past.', 'was/were + past participle: অতীতে কোনো কাজ (কারও দ্বারা) করা হয়েছিল।', 'The bridge was built in 1990.', 'সেতুটি ১৯৯০ সালে তৈরি করা হয়েছিল।');
    P('passive-future', 'Passive: future', 'কর্মবাচ্য: ভবিষ্যৎ', 'will be + past participle: something will be done.', 'will be + past participle: কোনো কাজ করা হবে।', 'The result will be announced soon.', 'ফলাফল শীঘ্রই ঘোষণা করা হবে।');
    P('passive-present-continuous', 'Passive: present continuous', 'কর্মবাচ্য: ঘটমান বর্তমান', 'am/is/are being + past participle: it is being done right now.', 'am/is/are being + past participle: কাজটি এখন করা হচ্ছে।', 'The room is being cleaned.', 'ঘরটি এখন পরিষ্কার করা হচ্ছে।');
    P('passive-past-continuous', 'Passive: past continuous', 'কর্মবাচ্য: ঘটমান অতীত', 'was/were being + past participle: it was being done at that time.', 'was/were being + past participle: তখন কাজটি করা হচ্ছিল।', 'The house was being painted.', 'বাড়িটি রং করা হচ্ছিল।');
    P('passive-present-perfect', 'Passive: present perfect', 'কর্মবাচ্য: পুরাঘটিত বর্তমান', 'have/has been + past participle: it has been done and the result matters now.', 'have/has been + past participle: কাজটি করা হয়েছে এবং ফল এখনও আছে।', 'The letter has been sent.', 'চিঠিটি পাঠানো হয়েছে।');
    P('passive-past-perfect', 'Passive: past perfect', 'কর্মবাচ্য: পুরাঘটিত অতীত', 'had been + past participle: it had been done before another time in the past.', 'had been + past participle: অতীতের আরেক সময়ের আগেই কাজটি করা হয়েছিল।', 'The door had been locked.', 'দরজাটি তালা দেওয়া হয়েছিল।');
    P('passive-future-perfect', 'Passive: future perfect', 'কর্মবাচ্য: পুরাঘটিত ভবিষ্যৎ', 'will have been + past participle: it will have been done by a future time.', 'will have been + past participle: ভবিষ্যতের কোনো সময়ের মধ্যে কাজটি করা হয়ে যাবে।', 'The work will have been finished by Friday.', 'শুক্রবারের মধ্যে কাজটি শেষ করা হয়ে যাবে।');
    P('passive-modal', 'Passive with a modal', 'কর্মবাচ্য: modal সহ', 'modal + be + past participle: possibility, duty or permission in the passive.', 'modal + be + past participle: কর্মবাচ্যে সম্ভাবনা, কর্তব্য বা অনুমতি।', 'The test must be finished today.', 'পরীক্ষাটি আজই শেষ করতে হবে।');
    P('modal-can', 'Modal: can', 'Modal: can', 'can + base verb: ability, possibility or permission.', 'can + verb: ক্ষমতা, সম্ভাবনা বা অনুমতি।', 'She can swim.', 'সে সাঁতার কাটতে পারে।');
    P('modal-could', 'Modal: could', 'Modal: could', 'could + base verb: past ability, a polite request or a weaker possibility.', 'could + verb: অতীতের ক্ষমতা, ভদ্র অনুরোধ বা কম সম্ভাবনা।', 'Could you help me?', 'তুমি কি আমাকে সাহায্য করতে পারবে?');
    P('modal-may', 'Modal: may', 'Modal: may', 'may + base verb: possibility or formal permission.', 'may + verb: সম্ভাবনা বা আনুষ্ঠানিক অনুমতি।', 'It may rain today.', 'আজ বৃষ্টি হতে পারে।');
    P('modal-might', 'Modal: might', 'Modal: might', 'might + base verb: a smaller possibility.', 'might + verb: ক্ষীণ সম্ভাবনা।', 'He might be late.', 'তার দেরি হতে পারে।');
    P('modal-must', 'Modal: must', 'Modal: must', 'must + base verb: strong duty or a strong guess.', 'must + verb: দৃঢ় কর্তব্য বা জোরালো অনুমান।', 'You must wear a helmet.', 'তোমাকে হেলমেট পরতেই হবে।');
    P('modal-should', 'Modal: should', 'Modal: should', 'should + base verb: advice, or what is a good idea.', 'should + verb: পরামর্শ বা কোনটা ভালো সেই কথা।', 'You should sleep early.', 'তোমার তাড়াতাড়ি ঘুমানো উচিত।');
    P('modal-would', 'Modal: would', 'Modal: would', 'would + base verb: a polite wish, a past habit or an imagined result.', 'would + verb: ভদ্র ইচ্ছা, অতীতের অভ্যাস বা কল্পনার ফল।', 'I would like some tea.', 'আমি একটু চা খেতে চাই।');
    P('modal-ought', 'Modal: ought to', 'Modal: ought to', 'ought to + base verb: advice, like should.', 'ought to + verb: পরামর্শ, should-এর মতো।', 'We ought to leave now.', 'আমাদের এখন যাওয়া উচিত।');
    P('modal-have-to', 'Have to', 'have to', 'have/has/had to + base verb: something you are obliged to do.', 'have/has/had to + verb: যা করতেই হয় এমন কাজ।', 'I have to go now.', 'আমাকে এখন যেতে হবে।');
    P('conditional-0', 'Zero conditional', 'শূন্য কন্ডিশনাল', 'if + present simple, present simple: facts that are always true.', 'if + present simple, present simple: সবসময় সত্য এমন ঘটনা।', 'If you heat ice, it melts.', 'বরফ গরম করলে তা গলে যায়।');
    P('conditional-1', 'First conditional', 'প্রথম কন্ডিশনাল', 'if + present simple, will + base verb: a real, possible future.', 'if + present simple, will + verb: ভবিষ্যতে ঘটতে পারে এমন বাস্তব শর্ত।', 'If it rains, we will stay home.', 'বৃষ্টি হলে আমরা বাড়িতে থাকব।');
    P('conditional-2', 'Second conditional', 'দ্বিতীয় কন্ডিশনাল', 'if + past simple, would + base verb: an unreal or unlikely situation now.', 'if + past simple, would + verb: এখনকার কাল্পনিক বা অসম্ভবপ্রায় অবস্থা।', 'If I had a car, I would drive to work.', 'আমার গাড়ি থাকলে আমি গাড়ি চালিয়ে কাজে যেতাম।');
    P('conditional-3', 'Third conditional', 'তৃতীয় কন্ডিশনাল', 'if + past perfect, would have + past participle: an imagined change in the past.', 'if + past perfect, would have + past participle: অতীতে অন্যরকম হলে কী হতো তার কল্পনা।', 'If I had studied, I would have passed.', 'আমি পড়াশোনা করলে পাস করতাম।');
    P('conditional-mixed', 'Mixed conditional', 'মিশ্র কন্ডিশনাল', 'A past condition with a result now, or the other way round.', 'অতীতের শর্তের ফল এখন, বা এর উল্টো।', 'If I had slept, I would feel fine now.', 'আমি ঘুমালে এখন ভালো লাগত।');
    const VAR = {
      perfect: { en: ' With have + past participle it looks back at the past.', bn: ' have + past participle দিয়ে অতীত সম্পর্কে বলা হয়।' },
      continuous: { en: ' With be + verb-ing it is about something in progress.', bn: ' be + verb-ing দিয়ে চলমান কিছু বোঝায়।' },
      'perfect-continuous': { en: ' With have been + verb-ing it looks back at something that was in progress.', bn: ' have been + verb-ing দিয়ে অতীতে চলমান কিছু বোঝায়।' },
      past: { en: ' Here the form is in the past (was/were going to, had to).', bn: ' এখানে রূপটি অতীতের (was/were going to, had to)।' }
    };

    /* ---------- word lists ---------- */
    const BE = set('am is are was were'), HAVE = set('have has had'), DO = set('do does did');
    const MODAL = set('can could may might must shall should will would ought');
    const PAST_AUX = set('was were had did');
    const ADV = set('not never always often also just already still ever even hardly scarcely quite only really almost probably certainly soon now usually sometimes yet all both truly surely nearly finally seldom rarely perhaps indeed likewise merely');
    const SPLIT = set('and but or nor for because when while that if unless although though since before after until as who which whom where whereas whether once whenever so then what how why whose');
    const SUB = set('when while if unless because although though since before after until as whenever once whereas that who which whom where whether what how why');
    const WHW = set('what why where when how who whom which whose whither whence');
    const INVT = set('never seldom rarely hardly scarcely nor neither only so not nowhere');
    const PRON = set('i you he she it we they thou thee ye him me us them my your his her its our their thy thine who whom which what whose there here this that these those one');
    const DETPREP = set('a an the some any no every each all both many much more most few several of in on at by for with from into onto upon over under about against between through during to than very too as like if when while although though because since before after until and but or nor so then not never');
    const FREE_NOUN_PREV = set('a an the my your his her its our their of in with by for on at from free good ill thy');
    const PARTICLE = set('up out off down away back ago');
    const ASKV = set('ask asked asks asking wonder wondered wonders wondering know knew knows see saw check checked tell told doubt doubted unsure');
    const NOT_S = set('across always perhaps besides towards afterwards indoors outdoors sometimes thus nowadays upstairs downstairs yes this his us plus its is was has as less unless');
    const PLURAL_IRR = set('children people men women feet teeth mice geese police cattle');
    const ADJP = set('tired excited interested bored surprised worried married scared pleased satisfied disappointed frightened confused amazed delighted ashamed determined crowded shocked annoyed embarrassed exhausted relaxed thrilled terrified');
    const ADJ_ING = set('interesting boring amazing exciting charming surprising willing missing tiring shocking annoying pleasing frightening confusing disappointing');
    const ING_NOT = set('bring spring string thing nothing something anything everything morning evening ceiling during sting swing wedding ending feeling darling');
    const ED_NOT = set('shed need feed seed weed speed breed bleed deed heed indeed hundred sacred naked wicked kindred hatred proceed succeed exceed creed greed steed sled beloved rugged ragged crooked');
    const NOETH = set('teeth elizabeth macbeth beth seth kenneth nazareth');
    const IRR_PP = set('been done gone seen taken given written spoken broken chosen driven eaten fallen forgotten frozen hidden known ridden risen shown stolen thrown worn woken grown drawn flown torn sworn borne beaten bitten begun sung rung sunk swum drunk run come become overcome made had said paid laid told sold held kept left lost met sent spent built bent lent felt dealt meant heard found bound ground wound led fed read put set cut hit hurt let shut cost burst spread shed thought brought bought caught taught fought sought got gotten stood understood sat won hung struck stuck swung spun dug shone lit slept swept wept crept dreamt learnt burnt spelt spilt lain shaken forgiven mistaken withdrawn undertaken overtaken forbidden proven sown sewn woven born wrought bred fled shot slain');
    const IRR_PAST = set('went saw took gave wrote spoke broke chose drove ate fell forgot froze hid knew rode rose stole threw wore woke grew drew flew tore swore bore bit began sang rang sank swam drank ran came became made had said paid laid told sold held kept left lost met sent spent built bent lent felt dealt meant heard found bound led fed thought brought bought caught taught fought sought got stood understood sat won hung struck stuck swung spun dug shone slept swept wept crept lay shot fled');
    const BASEV = set('accept add agree allow answer appear arrive ask attack become begin believe belong bite blow boil bring build burn buy call carry catch change chase check choose clean climb close come cook copy cost count cover cross cry cut dance decide die dig discover draw dream dress drink drive drop eat enjoy enter escape explain fall feel fight fill find finish fish fix fly follow forget forgive get give go grow guess hang happen hate hear help hide hit hold hope hunt hurt imagine join jump keep kick kill kiss know laugh learn leave lend let lie like listen live look lose love make marry matter mean meet miss move notice obey offer open order pass pay play pour pray praise prefer prepare protect pull push put reach read remember repeat reply rest return ride ring rise rule run rush sail save say see seek seem sell send serve set shake share shine shoot shout show shut sing sink sit sleep smell smile sound speak spend stand start stay steal stop study suffer swim take talk taste teach tell think throw touch travel try turn understand use visit wait wake walk want wash watch wear win wish wonder work worry write rain snow shop paint sweep bark yield fetch bear bless fear lead rob reign inherit protest steal apologise apologize bake boil bloom blossom chatter cheer clap grin hop kneel knock lack lift lock mix nod own pack plan plant pick press ripen rob sip skip spin splash stir stretch tap tell tie tremble trust twist wander wave weigh whisper wipe');

    /* ---------- word tests ---------- */
    const isEd = w => w.length >= 4 && /ed$/.test(w) && !ED_NOT.has(w) && (!/eed$/.test(w) || /^(agreed|freed|guaranteed)$/.test(w));
    const isPP = w => IRR_PP.has(w) || isEd(w);
    const isING = w => w.length >= 5 && /^[a-z]+ing$/.test(w) && w !== 'being' && !ING_NOT.has(w) && !ADJ_ING.has(w);
    const isAdv = w => ADV.has(w) || (w.length > 4 && /ly$/.test(w) && !BASEV.has(w));
    const endsS = w => /[^s]s$/.test(w) && !/(us|is)$/.test(w) && !NOT_S.has(w);
    const isPlural = w => PLURAL_IRR.has(w) || (/[^s]s$/.test(w) && !/(us|is)$/.test(w));
    const sBases = w => { const o = []; if (/ies$/.test(w)) o.push(w.slice(0, -3) + 'y'); if (/es$/.test(w)) o.push(w.slice(0, -2)); if (/s$/.test(w)) o.push(w.slice(0, -1)); return o; };
    const isVerbS = w => sBases(w).some(b => BASEV.has(b));
    const pastish = w => IRR_PAST.has(w) || isEd(w);
    const isAuxStart = w => BE.has(w) || HAVE.has(w) || DO.has(w) || MODAL.has(w);

    /* ---------- tokens ---------- */
    const TOKEN_RE = "['\u2019]t(?:is|was|were|will|would)\\b|[A-Za-z]+(?:['\u2019][A-Za-z]+)*|[,;:\u2014\u2013]";
    const BRK = set(', ; : \u2014 \u2013');
    function expandOne(raw, i, out) {
      const t = raw[i], w = t.w, mk = x => ({ w: x, r: t.r, s: t.s, e: t.e, brk: false });
      if (/^'t(is|was|were|will|would)$/.test(w)) { out.push(mk('it')); out.push(mk(w.slice(2))); return; }
      let m;
      if (w === "can't") { out.push(mk('can')); out.push(mk('not')); return; }
      if (w === "won't") { out.push(mk('will')); out.push(mk('not')); return; }
      if (w === "shan't") { out.push(mk('shall')); out.push(mk('not')); return; }
      if (w === "ain't") { out.push(mk('is')); out.push(mk('not')); return; }
      if (/n't$/.test(w) && w.length > 4) { out.push(mk(w.slice(0, -3))); out.push(mk('not')); return; }
      if ((m = /^([a-z]+)'(m|re|ve|ll)$/.exec(w))) { out.push(mk(m[1])); out.push(mk({ m: 'am', re: 'are', ve: 'have', ll: 'will' }[m[2]])); return; }
      const nextW = () => { for (let k = i + 1; k < raw.length; k++) { const x = raw[k].w; if (!ADV.has(x) && x !== "n't") return x; } return ''; };
      if ((m = /^(he|she|it|that|there|here|who|what|where|how|when|why)'s$/.exec(w))) {
        const n = nextW();
        out.push(mk(m[1])); out.push(mk(((isPP(n) && !ADJP.has(n)) || n === 'got') ? 'has' : 'is')); return;
      }
      if ((m = /^(i|you|he|she|it|we|they|who|that|there)'d$/.exec(w))) {
        const n = nextW();
        out.push(mk(m[1])); out.push(mk((isPP(n) && !ADJP.has(n)) ? 'had' : 'would')); return;
      }
      out.push(mk(w));
    }
    const OLD1 = { hath: 'has', hast: 'have', hadst: 'had', doth: 'does', dost: 'do', didst: 'did', wilt: 'will', shalt: 'shall', canst: 'can', couldst: 'could', wouldst: 'would', shouldst: 'should', mayest: 'may', mayst: 'may', mightest: 'might', wert: 'were', wast: 'was' };
    function modern3(base) { return /(o|s|sh|ch|x|z)$/.test(base) ? base + 'es' : /[^aeiou]y$/.test(base) ? base.slice(0, -1) + 'ies' : base + 's'; }
    function oldBase(w, cuts) {   // loveth -> love, goeth -> go, knowest -> know (checked against the verb list; '' when unsure)
      for (let c = 0; c < cuts.length; c++) { let b = w.slice(0, -cuts[c]); if (BASEV.has(b)) return b; if (/([nptgbm])\1$/.test(b) && BASEV.has(b.slice(0, -1))) return b.slice(0, -1); }
      return '';
    }
    function tokenize(text) {
      const re = new RegExp(TOKEN_RE, 'gi'), raw = []; let m;
      while ((m = re.exec(text))) raw.push({ r: m[0], w: m[0].toLowerCase().replace(/\u2019/g, "'"), s: m.index, e: m.index + m[0].length });
      const out = [];
      for (let i = 0; i < raw.length; i++) expandOne(raw, i, out);
      for (let i = 0; i < out.length; i++) {
        const t = out[i], w = t.w;
        if (BRK.has(w)) { t.brk = true; continue; }
        const thou = (i > 0 && out[i - 1].w === 'thou') || (i + 1 < out.length && out[i + 1].w === 'thou');
        if (OLD1[w]) { t.old = { from: w, to: OLD1[w] }; t.w = OLD1[w]; continue; }
        if (w === 'art' && thou) { t.old = { from: w, to: 'are' }; t.w = 'are'; continue; }
        if (w === 'saith') { t.vp = 'present'; t.old = { from: w, to: 'says' }; continue; }
        if (/^[a-z]{3,}eth$/.test(w) && !NOETH.has(w)) { const b = oldBase(w, [3, 2]); t.vp = 'present'; t.old = { from: w, to: b ? modern3(b) : '' }; continue; }
        if (thou && /^[a-z]{2,}est$/.test(w) && !/^(best|west|rest|test|east|last|fast|most|least|honest|modest|forest|interest|harvest|request|guest|quest|arrest|protest|contest|suggest)$/.test(w) && !/(?:^|[^a-z])thou$/.test(w)) {
          const b = oldBase(w, [3, 2]);
          t.vp = (/edst$/.test(w) || IRR_PAST.has(w.slice(0, -3))) ? 'past' : 'present'; t.old = { from: w, to: b };
        } else if (thou && /^[a-z]{3,}edst$/.test(w)) { t.vp = 'past'; t.old = { from: w, to: w.slice(0, -2) }; }
      }
      return out;
    }

    /* ---------- verb groups (auxiliary chains) ---------- */
    function nxt(toks, k, inv) {
      let gaps = 0;
      for (; k < toks.length; k++) {
        const t = toks[k];
        if (t.brk) return -1;
        if (isAdv(t.w)) continue;
        const w = t.w;
        if (w === 'be' || w === 'been' || w === 'being' || w === 'have' || w === 'to' || w === 'going' || isPP(w) || isING(w)) return k;
        if (inv && gaps < 3 && !isAuxStart(w)) { gaps++; continue; }
        return k;
      }
      return -1;
    }
    const isInv = (toks, i) => {
      if (i === 0 || toks[i - 1].brk) return true;
      for (let k = i - 1; k >= 0 && k >= i - 3; k--) { if (toks[k].brk) break; if (WHW.has(toks[k].w) || INVT.has(toks[k].w)) return true; }
      return false;
    };
    function group(toks, i) {
      const w = toks[i].w, inv = isInv(toks, i);
      const g = { s: i, e: i, kind: 'tense', tense: PAST_AUX.has(w) ? 'past' : 'present', aspect: 'simple', voice: 'active', m: null, perf: false, cont: false };
      const at = k => (k >= 0 && k < toks.length ? toks[k] : null);
      if (DO.has(w)) return g;
      if (MODAL.has(w)) {
        let k = nxt(toks, i + 1, inv), f = at(k);
        if (w === 'ought' && f && f.w === 'to') { k = nxt(toks, k + 1, inv); f = at(k); }
        if (f && f.w === 'be') {
          const k2 = nxt(toks, k + 1, inv), t2 = at(k2);
          if (t2 && isING(t2.w)) { g.cont = true; g.e = k2; } else if (t2 && isPP(t2.w) && !ADJP.has(t2.w)) { g.voice = 'passive'; g.e = k2; }
        } else if (f && f.w === 'have') {
          const k2 = nxt(toks, k + 1, inv), t2 = at(k2);
          if (t2 && t2.w === 'been') {
            const k3 = nxt(toks, k2 + 1, inv), t3 = at(k3);
            g.perf = true; g.e = k2;
            if (t3 && isING(t3.w)) { g.cont = true; g.e = k3; } else if (t3 && isPP(t3.w) && !ADJP.has(t3.w)) { g.voice = 'passive'; g.e = k3; }
          } else if (t2 && isPP(t2.w)) { g.perf = true; g.e = k2; }
        }
        if (g.e === i && f && (f.w === 'do' || f.w === 'have')) g.e = k;                                      // will do, must have (main verb)
        if (w === 'will' || w === 'shall') { g.tense = 'future'; g.aspect = g.perf ? (g.cont ? 'perfect-continuous' : 'perfect') : (g.cont ? 'continuous' : 'simple'); } else { g.kind = 'modal'; g.m = w; g.tense = null; }
        return g;
      }
      if (BE.has(w)) {
        const k = nxt(toks, i + 1, inv), t = at(k);
        if (!t) return g;
        if (t.w === 'going') {
          const k2 = nxt(toks, k + 1, inv), t2 = at(k2), k3 = t2 && t2.w === 'to' ? nxt(toks, k2 + 1, inv) : -1, t3 = at(k3);
          if (t3 && (BASEV.has(t3.w) || t3.w === 'be' || t3.w === 'have')) { g.kind = 'goingto'; g.e = k2; return g; }
        }
        if (isING(t.w)) { g.aspect = 'continuous'; g.e = k; } else if (t.w === 'being') {
          const k2 = nxt(toks, k + 1, inv), t2 = at(k2);
          if (t2 && isPP(t2.w)) { g.aspect = 'continuous'; g.voice = 'passive'; g.e = k2; }
        } else if (isPP(t.w) && t.w !== 'been' && !ADJP.has(t.w)) { g.voice = 'passive'; g.e = k; }
        return g;
      }
      /* have, has, had */
      const k = nxt(toks, i + 1, inv), t = at(k);
      if (!t) return g;
      if (t.w === 'to') {
        const k2 = nxt(toks, k + 1, inv), t2 = at(k2);
        if (t2 && (BASEV.has(t2.w) || t2.w === 'be' || t2.w === 'have')) { g.kind = 'haveto'; g.e = k; return g; }
        return g;
      }
      if (t.w === 'been') {
        const k2 = nxt(toks, k + 1, inv), t2 = at(k2);
        g.aspect = 'perfect'; g.e = k;
        if (t2 && isING(t2.w)) { g.aspect = 'perfect-continuous'; g.e = k2; } else if (t2 && isPP(t2.w) && !ADJP.has(t2.w)) { g.voice = 'passive'; g.e = k2; }
        return g;
      }
      if (isPP(t.w)) { g.aspect = 'perfect'; g.e = k; }
      return g;
    }

    /* ---------- a simple tense without an auxiliary (walks, played, went) ---------- */
    function simpleVerb(toks, a, b, used) {
      for (let i = a; i <= b; i++) {
        const t = toks[i], w = t.w;
        if (used[i] || t.brk) continue;
        if (t.vp) return { i, tense: t.vp };
        if (isAdv(w) || DETPREP.has(w) || PRON.has(w) || isAuxStart(w) || w === 'be' || w === 'been' || w === 'being' || w === 'to' || isING(w) || PARTICLE.has(w) || (w.length < 3 && w !== 'go')) continue;
        let p = i - 1;
        while (p >= a && (isAdv(toks[p].w) || toks[p].brk)) p--;
        if (p < a) continue;
        const pw = toks[p].w;
        if (pw === 'he' || pw === 'she' || pw === 'it') {
          if (pastish(w)) return { i, tense: 'past' };
          if (endsS(w)) return { i, tense: 'present' };
        } else if (pw === 'i' || pw === 'you' || pw === 'we' || pw === 'they' || pw === 'ye' || pw === 'thou') {
          if (pastish(w)) return { i, tense: 'past' };
          if (!endsS(w) && /^[a-z]+$/.test(w)) return { i, tense: 'present' };
        } else if (pw === 'who' || pw === 'which' || pw === 'that') {
          if (pastish(w)) return { i, tense: 'past' };
          if (BASEV.has(w) || isVerbS(w)) return { i, tense: 'present' };
        } else if (!DETPREP.has(pw) && !PRON.has(pw) && !isAuxStart(pw) && !toks[p].w.match(/ing$/) && !isEd(pw)) {
          if (pastish(w) && !(i + 1 <= b && toks[i + 1].w === 'by')) return { i, tense: 'past' };
          if (isVerbS(w) && w !== pw && !BASEV.has(w)) return { i, tense: 'present' };
          if (BASEV.has(w) && isPlural(pw)) return { i, tense: 'present' };
        }
      }
      return null;
    }

    /* ---------- pattern ids ---------- */
    function idOf(g) {
      if (g.kind === 'goingto') return 'future-going-to';
      if (g.kind === 'haveto') return 'modal-have-to';
      if (g.kind === 'modal') return g.voice === 'passive' ? 'passive-modal' : 'modal-' + g.m;
      if (g.voice === 'passive') return 'passive-' + (g.tense === 'future' ? (g.aspect === 'simple' ? 'future' : 'future-' + g.aspect) : g.tense + '-' + g.aspect);
      return g.tense + '-' + g.aspect;
    }
    const wcms = m => m === 'would' || m === 'could' || m === 'might' || m === 'should';
    function condKind(ifG, mG) {
      const past = g => g.kind === 'tense' && g.tense === 'past', pres = g => g.kind === 'tense' && g.tense === 'present';
      const ifPerf = past(ifG) && ifG.aspect === 'perfect', ifPast = past(ifG) && (ifG.aspect === 'simple' || ifG.aspect === 'continuous');
      if (!mG) return null;
      if (mG.imp) return pres(ifG) ? 'conditional-1' : null;
      const mod = mG.kind === 'modal' && wcms(mG.m);
      if (ifPerf && mod && mG.perf) return 'conditional-3';
      if (ifPerf && mod) return 'conditional-mixed';
      if (ifPast && mod && mG.perf) return 'conditional-mixed';
      if (ifPast && mod) return 'conditional-2';
      const fut = (mG.kind === 'tense' && mG.tense === 'future') || mG.kind === 'goingto' || (mG.kind === 'modal' && /^(can|may|must|should|might)$/.test(mG.m));
      if (pres(ifG) && fut) return 'conditional-1';
      if (pres(ifG) && ifG.aspect === 'simple' && mG.kind === 'tense' && mG.tense === 'present') return 'conditional-0';
      return null;
    }
    function joinConditional(toks, items) {
      let c = -1;
      for (let i = 0; i < toks.length; i++) { const w = toks[i].w; if ((w === 'if' || w === 'unless') && !(i > 0 && ASKV.has(toks[i - 1].w))) { c = i; break; } }
      let ifG = null, mG = null;
      if (c >= 0) {
        ifG = items.find(g => g.s > c) || null;
        if (ifG) {
          const before = items.filter(g => g.e < c);
          mG = before.length ? before[before.length - 1] : (items.find(g => g.s > ifG.e) || null);
          if (!mG) {   // "If you see him, tell him."
            let k = ifG.e + 1; while (k < toks.length && !toks[k].brk) k++;
            const n = toks[k + 1];
            if (k < toks.length && n && (BASEV.has(n.w) || n.w === 'please')) mG = { imp: true, s: k + 1, e: k + 1 };
          }
        }
      } else if (items.length > 1 && items[0].s === 0 && (toks[0].w === 'had' || toks[0].w === 'were')) { ifG = items[0]; mG = items[1]; }
      const id = ifG && condKind(ifG, mG);
      if (!id) return items;
      if (c < 0 && id !== 'conditional-3' && id !== 'conditional-2') return items;
      const rest = items.filter(g => g !== ifG && g !== mG);
      rest.push({ s: Math.min(ifG.s, mG.s), e: Math.max(ifG.e, mG.e), kind: 'cond', id, parts: [idOf(ifG), mG.imp ? 'imperative' : idOf(mG)], sub: false });
      return rest;
    }

    /* ---------- detect ---------- */
    function detect(input) {
      const src = String(input == null ? '' : input).slice(0, MAXLEN);
      let toks, items = [];
      try { toks = tokenize(src); } catch (e) { return { ok: false, text: src, main: null, patterns: [] }; }
      const n = toks.length, used = new Array(n).fill(false);
      /* clauses */
      const segs = []; let a = 0;
      for (let i = 0; i < n; i++) {
        if (toks[i].brk) { if (a <= i - 1) segs.push([a, i - 1]); a = i + 1; } else if (SPLIT.has(toks[i].w) && i > a) { segs.push([a, i - 1]); a = i; }
      }
      if (a <= n - 1) segs.push([a, n - 1]);
      const segOf = new Array(n).fill(0);
      segs.forEach((sg, k) => { for (let i = sg[0]; i <= sg[1]; i++) segOf[i] = k; });
      /* auxiliary groups */
      for (let i = 0; i < n; i++) {
        const t = toks[i], w = t.w;
        if (used[i] || t.brk || !isAuxStart(w)) continue;
        let pv = i - 1; while (pv >= 0 && isAdv(toks[pv].w)) pv--;
        const prev = pv >= 0 ? toks[pv] : null;
        if (prev && !prev.brk && prev.w === 'to' && (HAVE.has(w) || DO.has(w))) continue;                     // "to have", "to do"
        if (MODAL.has(w)) {
          if (prev && !prev.brk && FREE_NOUN_PREV.has(prev.w)) continue;                                        // "a can", "free will", "with all his might"
          if (t.r.toLowerCase() === w && /^[A-Z]/.test(t.r) && ((i > 0 && !toks[i - 1].brk) || (i === 0 && toks[1] && /^(is|was|has|does|did|said|went)$/.test(toks[1].w)))) continue;   // names and months: Will, May
        }
        const g = group(toks, i);
        for (let k = g.s; k <= g.e; k++) used[k] = true;
        g.seg = segOf[i];
        items.push(g);
      }
      /* simple tenses: the first one in each clause, before that clause's auxiliary group */
      segs.forEach((sg, k) => {
        const own = items.filter(g => g.seg === k);
        const end = own.length ? Math.min.apply(null, own.map(g => g.s)) - 1 : sg[1];
        const hit = end >= sg[0] ? simpleVerb(toks, sg[0], end, used) : null;
        if (hit) { used[hit.i] = true; items.push({ s: hit.i, e: hit.i, kind: 'tense', tense: hit.tense, aspect: 'simple', voice: 'active', m: null, perf: false, cont: false, seg: k }); }
      });
      items.sort((x, y) => x.s - y.s);
      items.forEach(g => { g.sub = g.seg != null && SUB.has(toks[segs[g.seg][0]].w); });
      items = joinConditional(toks, items);
      items.sort((x, y) => x.s - y.s);
      /* result */
      const patterns = items.map(g => {
        const id = g.id || idOf(g), c = CAT[id];
        if (!c) return null;
        const s = toks[g.s].s, e = toks[g.e].e;
        const p = { id, name: c.name, explain: { en: c.explain.en, bn: c.explain.bn }, example: c.example, s, e, text: src.slice(s, e), sub: !!g.sub };
        let v = null;
        if (g.kind === 'modal') v = g.perf ? (g.cont ? 'perfect-continuous' : 'perfect') : g.cont ? 'continuous' : null;
        else if ((g.kind === 'haveto' || g.kind === 'goingto') && PAST_AUX.has(toks[g.s].w)) v = 'past';
        if (v && VAR[v]) { p.variant = v; p.explain.en += VAR[v].en; p.explain.bn += VAR[v].bn; }
        if (g.parts) p.parts = g.parts;
        const olds = [];
        for (let k = g.s; k <= g.e; k++) if (toks[k].old && !olds.some(o => o.from === toks[k].old.from)) olds.push({ from: toks[k].old.from, to: toks[k].old.to });
        if (olds.length) p.old = olds;
        return p;
      }).filter(Boolean);
      const main = patterns.find(p => !p.sub) || patterns[0] || null;
      return { ok: patterns.length > 0, text: src, main, patterns };
    }

    /* ---------- sentences ---------- */
    const ABBR = /(?:^|\s)(?:mr|mrs|ms|dr|st|prof|vs|etc|no|vol|ch)\.$/i;
    function detectText(input) {
      const text = String(input == null ? '' : input), out = [], re = /[.!?]+["\u201d\u2019')\]]*(?:\s+|$)/g;
      let start = 0, m;
      const push = end => { const raw = text.slice(start, end), lead = raw.length - raw.replace(/^\s+/, '').length, s = start + lead, body = raw.trim(); if (body) out.push(Object.assign({ s, e: s + body.length }, detect(body))); };
      while ((m = re.exec(text))) {
        const end = m.index + m[0].length;
        if (ABBR.test(text.slice(0, m.index + 1)) && m[0].charAt(0) === '.') continue;
        push(end); start = end;
      }
      push(text.length);
      return out;
    }
    const info = id => { const c = CAT[id]; return c ? { id, name: c.name, explain: c.explain, example: c.example } : null; };
    return { VER: GD_VER, detect, detectText, info, ids: Object.keys(CAT) };
  })();
