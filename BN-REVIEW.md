# Bengali strings that need a native-speaker review

All Bengali added in `src/js/200-player-controls.js` (block "Bengali (bn): expanded coverage") was written without a native reviewer.
The list below is ordered by how unsure the wording is. Each row: English | current Bengali | the question to settle.

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
