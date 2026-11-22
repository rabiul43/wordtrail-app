# Bengali strings that need a native-speaker review

All Bengali added in `src/js/200-player-controls.js` (block "Bengali (bn): expanded coverage") was written without a native reviewer.
The list below is ordered by how unsure the wording is. Each row: English | current Bengali | the question to settle.

## Added in Phase 1, Item 2 (story effects without ambient)

| English | Current Bengali | Question |
|---------|----------------|----------|
| A short sound at a word like thunder, a knock or a bell. Works with or without Ambient sound. | বজ্রপাত, টোকা বা ঘণ্টার মতো শব্দে একটি সংক্ষিপ্ত শব্দ। পরিবেশের শব্দ ছাড়াও কাজ করে। | Is "পরিবেশের শব্দ ছাড়াও কাজ করে" natural for "Works with or without Ambient sound"? |
| A door or footsteps when the story moves somewhere new. Works with or without Ambient sound. Needs "Follow the story". Off in Calm mode. | গল্প নতুন কোথাও গেলে দরজা বা পায়ের শব্দ। পরিবেশের শব্দ ছাড়াও কাজ করে। "গল্প অনুসরণ" দরকার। শান্ত মোডে বন্ধ। | Confirm "গল্প অনুসরণ" matches the Bengali label for "Follow the story" elsewhere in the app. |

## Added in Phase 1 (focus mode / Study preset)

| English | Current Bengali | Question |
|---------|----------------|----------|
| Music, story sounds, opening sound and ambient scenes are all off. Good for learning exercises. | সংগীত, গল্পের শব্দ, শুরুর শব্দ ও পরিবেশের দৃশ্য সব বন্ধ। শেখার অনুশীলনের জন্য ভালো। | Is "শেখার অনুশীলন" the natural phrase for "learning exercises"? "পড়াশোনার অনুশীলন" may be more idiomatic. |

## 1. Word choice is a real decision (check these first)

| English | Current | Question |
|---|---|---|
| Narrator / Reader | পাঠক | Does "পাঠক" read as the person who reads the audiobook aloud, or as "a reader of books"? Alternatives: কণ্ঠশিল্পী, বক্তা |
| Mood (filter) | আবহ | Could be মেজাজ (too much like "temper") or ভাব. Which fits "cozy, spooky, funny"? |
| Sleep (timer button) | স্লিপ টাইমার | Keep the loanword, or use ঘুমের টাইমার? |
| Calm mode | ক্যালম মোড | Loanword used. Is শান্ত মোড clearer? |
| Read-along ready | সঙ্গে পড়ার উপযোগী | Is "read along with the audio" understood from this? |
| Read and listen | পড়ুন ও শুনুন | Main button on the book page. Natural as a command? |
| Sync / Synced | সিঙ্ক | Loanword already used in the older labels. Confirm it is what users say |
| Highlight | হাইলাইট | Same, loanword |
| Placement test | স্তর-নির্ণয় পরীক্ষা | Is "স্তর-নির্ণয়" too formal for a first-run screen? |
| Level (A2 to B1 etc.) | স্তর | Fine for "level"? |
| Spooky | গা ছমছমে | Right strength for a mood chip, or ভুতুড়ে? |
| Cozy | আরামদায়ক | Does it say "warm, comfortable story" or just "comfortable"? |
| Non-fiction | নন-ফিকশন | Or বাস্তবভিত্তিক / তথ্যমূলক? |
| Romance (genre) | প্রেমের গল্প | Fine for a genre shelf? |
| Children (shelf) | শিশুদের বই | Or শিশুতোষ? |

## 1b. First-run language offer (new)

| English meaning | Current | Question |
|---|---|---|
| Use this app in Bengali? | এই অ্যাপ বাংলায় ব্যবহার করবেন? | Natural for a first screen? |
| Yes, in Bengali | হ্যাঁ, বাংলায় | |
| Also show the app in Bengali (step 2 button) | অ্যাপও বাংলায় দেখান | Clear that it changes the whole app, not only translations? |
| Other language… | অন্য ভাষা… | |

The "no" button deliberately stays in English ("Continue in English") so a person who wants English can find it.

## 1c. Durations, counts and digits (new)

| English | Current | Question |
|---|---|---|
| h / min / s | ঘণ্টা / মিনিট / সেকেন্ড | Fine to spell out in full on small tiles ("4 ঘণ্টা 15 মিনিট" is longer than "4h 15m")? Short forms (ঘ., মি.) possible |
| ago / left | আগে / বাকি | "45 মিনিট আগে", "2 ঘণ্টা 5 মিনিট বাকি" |
| under 1 min left | 1 মিনিটেরও কম বাকি | |
| N books / tracks / sentences … | Nটি বই, Nটি ট্র্যাক, Nটি বাক্য | "টি" for every noun, "জন" for authors. Correct for all of them? |
| 1.2K / 1.2M | 1.2 হাজার / 1.2 মিলিয়ন | Or লাখ / কোটি for Bangladesh? |
| Speed 1.25x | 1.25× | |
| Settings: native digits | বাংলা অঙ্ক (০১২৩) — "সংখ্যা বাংলা অঙ্কে দেখান। প্লেয়ারের সময় (0:00) আগের মতোই থাকে।" | Wording of the switch |

## 2. Tone and register (formal আপনি is used everywhere; check it feels right)

| English | Current |
|---|---|
| Skip for now | এখন থাক |
| Got it | বুঝেছি |
| Don't show again | আর দেখাবেন না |
| Tap the heart on any book and it will wait for you here. | যেকোনো বইয়ের হার্টে ট্যাপ করুন, বইটি এখানে আপনার জন্য অপেক্ষা করবে। |
| 6 quick questions, easy to hard — we'll set the level for you | 6টি দ্রুত প্রশ্ন, সহজ থেকে কঠিন — আমরাই আপনার স্তর ঠিক করে দেব |
| Hide the player controls. Swipe down or tap the bar to bring them back. | প্লেয়ারের বোতামগুলো লুকান। নিচে সোয়াইপ করুন বা বারে ট্যাপ করলে ফিরে আসবে। |
| Tip: tap any sentence to jump there. Double-tap it if the highlight is off. | টিপ: যেকোনো বাক্যে ট্যাপ করলে অডিও সেখানে যাবে। হাইলাইট সরে গেলে ডাবল-ট্যাপ করুন। |
| Thanks. We will check this review. | ধন্যবাদ। আমরা এই রিভিউটি দেখব। |
| Three handy gestures | তিনটি কাজের ইশারা |

## 3. Grammar around names and numbers (patterns)

| English pattern | Current | Question |
|---|---|---|
| Following {name}. Their new books will appear in Picked for you. | {name}-কে অনুসরণ করছেন। তাঁর নতুন বই “আপনার জন্য বাছাই”-এ দেখা যাবে। | "তাঁর" assumes one author; gender-neutral wording? Hyphen suffix after a Latin-script name is OK? |
| Unfollowed {name} | {name}-কে আর অনুসরণ করছেন না | Same suffix question |
| Because you listened to {title} | আপনি {title} শুনেছেন বলে | Natural for a row heading? |
| Show {n} books | {n}টি বই দেখুন | "টি" after Western digits is OK? |
| Question {n} of {m} | প্রশ্ন {n} / {m} | |
| Sleep in {time} | {time} পরে স্লিপ টাইমার | Time text ("15 min") stays English because it is built in code |
| Welcome back. You were at {place} | আবার স্বাগতম। আপনি {place}-এ ছিলেন | {place} is English ("Track 2 · 3:10") |

## 4. Numbers

Western digits are kept everywhere (the app prints them that way: 2 ঘণ্টার কম, 5টির কম). Native speakers may prefer ০১২৩…. Decide once, then it can be changed in one place.

## 5. Source-text problems found on the way (English, not Bengali)

- The onboarding card says "6 quick questions" but the quiz counter reads "Question 1 of 5". One of them is wrong.
- The Bengali "Book stats" / "Listening stats" are used for both the section title and an aria-label.

## Not translated yet (still English when language is bn)

- Any toast or label with a number or name built in code that has no pattern above (for example "Track 3 …", "Precise timing applied to 3 of 8 tracks.", "Storage is almost full (…%)", plural forms like "2 tracks").
- The Feature guide and How to use sheets (long explanations), Settings descriptions, author pages, reviews and the sync dashboard.
- Book titles, authors, genres from the catalogue and the reader text are never translated (by design, see `I18N_SKIP`).
- The first-run onboarding appears before a language can be chosen, so a new user sees English. Bengali there only shows for someone who set Language to বাংলা first (for example after a reset or on a second device with synced prefs). Choosing "Bengali" as native language in step 2 does not switch the app language.

## Added with the slim app bar and the clickable logo

| English | Current | Question |
|---|---|---|
| Wordtrail home (logo link label, read by screen readers) | Wordtrail হোম | The app calls the Home tab "ঘর" elsewhere. Keep "হোম" here, or use "Wordtrail-এর ঘর"? |
| Downloads (tab and page title) | ডাউনলোড | Next to "Downloaded" (ডাউনলোড করা). Fine as a page title? |

## Account tidy (new, unreviewed)
| English | Current Bengali | Question |
|---|---|---|
| Data and privacy | ডেটা ও গোপনীয়তা | Fine as a heading? |
| Export my data | আমার ডেটা এক্সপোর্ট করুন | Keep the loanword "এক্সপোর্ট"? |
| Delete account | অ্যাকাউন্ট মুছুন | OK |
| Delete your account? ... This cannot be undone. | আপনার অ্যাকাউন্ট মুছবেন? ... এটি ফেরানো যাবে না। | Is the warning clear enough? |
| Settings opens one page with ... three sections | সেটিংস একটি সার্চ বক্স ও তিনটি অংশসহ ... | Guide text: Help section added |

## Old words and idioms (Task 36, new, unreviewed)

| English | Current | Question |
|---|---|---|
| Highlight old words and idioms | পুরনো শব্দ ও বাগধারা চিহ্নিত করুন | Is "বাগধারা" the word a Class 4 child knows for "idiom"? |
| Idiom | বাগধারা | Same question |
| It means | এর অর্থ | Fine for a card heading? |
| Other old words in this chapter | এই অধ্যায়ের অন্যান্য পুরনো শব্দ | "পুরনো শব্দ" or "সেকেলে শব্দ"? |
## Listening level word (Task 6, new, unreviewed)

Shown beside the chapter name on the Listen and type screen: how the 10 sentences sit against the learner's level. One word, never a score.

| English | Current | Question |
|---|---|---|
| Comfortable | স্বচ্ছন্দ | Mostly easier than the learner's level. Does a child read this as "easy for me", or is সহজ clearer? |
| Stretching | একটু কঠিন | A little harder than the level (where learning happens). Is "একটু কঠিন" (a bit hard) encouraging enough, or is there a kinder word? |
| Challenging | বেশ কঠিন | Clearly harder than the level. Is it too discouraging for a 9 to 10 year old? |
| Difficulty: | কঠিনতা: | Read aloud by screen readers before the word only |

## Listening rows on Learn (Task 5, new, unreviewed)

Lines under "Listen and type" and "Echo" on the Learn screen. N is a number. Never shown in Calm mode.

| English | Current | Question |
|---|---|---|
| N sets today | আজ Nটি সেট | "সেট" for a set of 10 sentences: clear for a Class 4 child? |
| Last set: N of M right | শেষ সেট: Mটির মধ্যে Nটি ঠিক | Natural? |
| N practices today | আজ Nবার অনুশীলন | Fine? |
| N on your practice list | অনুশীলন তালিকায় Nটি | Fine? |
| N takes this week | এই সপ্তাহে Nটি রেকর্ডিং | "take" = one recording of the learner's voice |
| N of 12 this month | এই মাসে ১২টির মধ্যে Nটি | Read aloud by screen readers for the small ring |

## Fill the gaps (Task 7, new, unreviewed)

The new Listening mode: a sentence with a few words missing; the learner types only those. Other lines of the screen are the same as in Listen and type.

| English | Current | Question |
|---|---|---|
| Fill the gaps | শূন্যস্থান পূরণ করুন | Do Class 4 children know "শূন্যস্থান" from their school books? |
| Fill in the missing words | হারানো শব্দগুলো লিখুন | The line under the tile. "হারানো" or "বাদ পড়া"? |
| Hint: letters | ইঙ্গিত: অক্ষর | Shows how many letters each missing word has |
| Perfect. Every blank is right. | চমৎকার! প্রতিটি শূন্যস্থান ঠিক। | Fine for a child? |

## Speed ladder (Task 8, new, unreviewed)

A Listening mode: the same sentence at four speeds; it gets faster after a right answer and slower after a wrong one. The other lines of the screen are the same as in Listen and type.

| English | Current | Question |
|---|---|---|
| Speed ladder | গতির সিঁড়ি | Is "গতির সিঁড়ি" clear, or is there a simpler word for "ladder"? |
| Hear it faster, step by step | ধাপে ধাপে দ্রুত শুনুন | The line under the tile. |
| Very slow | খুব ধীর | The four speed names: খুব ধীর / ধীর / সাধারণ / দ্রুত. Right for a learner? |
| Very slow (0.7x) | খুব ধীর (0.7x) |  |
| Slow (0.85x) | ধীর (0.85x) |  |
| Normal (1x) | সাধারণ (1x) |  |
| Fast (1.2x) | দ্রুত (1.2x) |  |
| Fastest today: Very slow | আজকের সবচেয়ে দ্রুত: খুব ধীর |  |
| Fastest today: Slow | আজকের সবচেয়ে দ্রুত: ধীর |  |
| Fastest today: Normal | আজকের সবচেয়ে দ্রুত: সাধারণ |  |
| Fastest today: Fast | আজকের সবচেয়ে দ্রুত: দ্রুত |  |
| Play one step slower | এক ধাপ ধীরে শুনুন |  |
| Play one step faster | এক ধাপ দ্রুত শুনুন |  |
| Next sentence: one step faster. | পরের বাক্য: এক ধাপ দ্রুত। |  |
| Next sentence: one step slower. | পরের বাক্য: এক ধাপ ধীর। |  |
| Next sentence: the same speed. | পরের বাক্য: একই গতি। |  |
| The fastest speed you followed. | আপনি সবচেয়ে দ্রুত যে গতিতে বুঝতে পেরেছেন। |  |
| You followed the fastest step. Great listening! | আপনি সবচেয়ে দ্রুত ধাপও বুঝতে পেরেছেন। দারুণ শোনা! |  |
| No sentence was fully right this time. Slow speeds are a good place to practise. | এবার কোনো বাক্য পুরোপুরি ঠিক হয়নি। ধীর গতিতে অনুশীলন করা ভালো। |  |
| Keep practising | অনুশীলন চালিয়ে যান |  |
| Perfect | নিখুঁত |  |
| Almost | প্রায় |  |

## Task 9: Which word did you hear? and Write it in full (no native review yet)

| English | Current | Question |
|---|---|---|
| Which word did you hear? | আপনি কোন শব্দটি শুনলেন? | |
| Write it in full | পুরো করে লিখুন | |
| Choose the word you heard. | যে শব্দটি শুনেছেন সেটি বেছে নিন। | |
| Type the words in full. | শব্দগুলো পুরো করে লিখুন। | |
| Right. You heard it. | ঠিক। আপনি শব্দটি ধরতে পেরেছেন। | |
| Not quite. Listen again. | ঠিক হয়নি। আবার শুনুন। | |
| Perfect. Written in full. | চমৎকার! পুরো করে লেখা হয়েছে। | |
| Almost. Check the spelling. | প্রায় হয়ে গেছে। বানান দেখুন। | |
| The word was: | শব্দটি ছিল: | |
| You chose: | আপনি বেছেছেন: | |
| Sound pair: | ধ্বনির জোড়া: | |
| In full: | পুরো রূপ: | |
| Said fast it can sound like: | দ্রুত বললে শোনাতে পারে: | |
| You wrote: | আপনি লিখেছেন: | |
| Every answer was right. | প্রতিটি উত্তর ঠিক ছিল। | |
| Some answers were different. Here they are. | কিছু উত্তর আলাদা ছিল। সেগুলো এখানে। | |
| Your weakest sound so far: | এ পর্যন্ত আপনার সবচেয়ে কঠিন ধ্বনি: | |
| Hardest to catch so far: | এ পর্যন্ত ধরা সবচেয়ে কঠিন: | |
| Looking for practice for this book… | এই বইয়ের জন্য অনুশীলন খোঁজা হচ্ছে… | |
| No sound practice found for this book. It may not exist yet, or you may be offline. | এই বইয়ের জন্য ধ্বনি-অনুশীলন পাওয়া যায়নি। হয়তো এখনও তৈরি হয়নি, অথবা আপনি অফলাইনে আছেন। | |
| This track has too little practice. Try another track. | এই ট্র্যাকে অনুশীলনের উপাদান খুব কম। অন্য ট্র্যাক চেষ্টা করুন। | |
| Hear it fast, write it in full | দ্রুত শুনুন, পুরো করে লিখুন | |
| Tell similar words apart | কাছাকাছি শব্দগুলো আলাদা করুন | |
| Your weakest sound: X (pattern) | আপনার সবচেয়ে কঠিন ধ্বনি: X | X is a letter pair such as "th / s", kept in English letters. Is "ধ্বনি" clear to a learner, or is "উচ্চারণ" better? |
| Hardest to catch: X (pattern) | ধরা সবচেয়ে কঠিন: X | X is a word such as "gonna". Natural wording? |
| Played N time(s) (pattern) | বাজানো হয়েছে N বার | Same wording as the older "Played" line. |
