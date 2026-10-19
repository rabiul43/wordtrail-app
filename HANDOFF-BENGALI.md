# Wordtrail: handoff prompt for the Bengali / languages work

Paste everything below the line into a new chat, attach the project zip (`wordtrail-project-final.zip`), then add one line: "Do task N".

---

I am continuing work on **Wordtrail**, an audiobook + reading web app (installable PWA). The attached zip is the full project.
Read `README.md`, `MODULES.md` and this file first. Key rules:

- The app is many small files joined by `python build.py` into `dist/index.html`. All of `src/js/020` to `999` are slices of ONE closure and share names; no `import`/`export`. A new file needs one line in `build.py`. CSS order matters (later rules win).
- Work style: change only the files needed, send back a zip of changed files in the same folder layout, keep answers short, no long recaps. At the start tell me in two lines which files you will touch and which you will not. At the end tell me what to test on a real phone (the sandbox has no browser and no network, so nothing here has been seen on screen).
- Run `python build.py` and a syntax check (`node --check` on the joined scripts) after every change. The sandbox cannot load Google Fonts, so a Bengali font can never be checked visually there.

## How languages work now (all done and shipped in the zip)

- **One JSON file per language** in `src/i18n/` (`ar bn de es fr th tr ur zh`). `build.py` joins them into a `<script type="application/json" id="i18n-data">` block. The engine is in `src/js/200-player-controls.js` (section "app language and right-to-left layout").
- File format: `{ name, dir, order, dict: {"English text": "translation"}, rx: [[regex, replacement]], suggest: {q, yes, no, also}, units: [[regex, replacement]], keep: regex, digits: {map, label, hint} }`. Only `name`, `dir`, `order`, `dict` are needed. Keys are the exact English text of a text node, so changing an English label silently breaks its translation.
- The engine translates text nodes, and also `placeholder`, `aria-label` and `title` attributes. It restores the English when the language is switched back. Book text, the reader and the placement-quiz questions are skipped on purpose (`I18N_SKIP`).
- `python tools/i18n_check.py xx` lists the words a language lacks compared with `bn` (the fullest, 254 words).
- **Bengali (`bn`)** has: onboarding, home sections and shelves, search, filters, book page and player buttons, gesture hints, about 45 toasts, number patterns (`rx`), durations and counts (`units`: "4h 15m", "45 min ago", "12 books"), optional Bengali digits (Settings > Reading > Language, `P.uiDigits`, off by default; player clock times, level codes like A2 and English text keep Western digits), and a first-run offer.
- **First-run offer** (task 2, done): if any browser language is Bengali and no app language is chosen, a box above the logo asks in Bengali "use the app in Bengali?" (Yes / Continue in English). In onboarding step 2, picking Bengali as native language shows a one-tap "also show the app in Bengali" button. Both save `P.uiLang` through `setUiLang()`. Only languages with a `suggest` entry are offered.
- **Font**: Noto Sans Bengali is added to a `<link>` the first time Bengali is chosen (`i18nFont()`). CSS at the end of `src/css/90-reader-sheet.css` (`:root:lang(bn)`) adds it to the font stacks and loosens tight line heights (about 25 classes) so Bengali marks are not clipped.
- `BN-REVIEW.md` lists every Bengali string that needs a native speaker.

## Done

- Task 1 (partly): `BN-REVIEW.md` written; the review itself still needs a human.
- Task 2: first-run language offer. Done.
- Task 3: durations, counts, optional Bengali digits. Done.
- Expanded Bengali coverage (36 labels to 254), lazy font, line-height audit, language files split into `src/i18n/`.

## Remaining tasks (7). I will say which one to do.

1. **Native-speaker review of the Bengali.** Needs me and a person, not code. Help me prepare what to send (`BN-REVIEW.md`), then apply the corrections they give me to `src/i18n/bn.json`. Key open decisions: "Narrator" as পাঠক, "Mood" as আবহ, loanwords (স্লিপ, সিঙ্ক, হাইলাইট), Western vs Bengali digits, spelled-out units (ঘণ্টা/মিনিট) vs short forms on small tiles, টি after every noun, হাজার/মিলিয়ন vs লাখ/কোটি.
4. **Message templates instead of regex.** Strings built in code from pieces ("Track 3 of 8", "2 tracks", "Precise timing applied to 3 of 8 tracks.", "Storage is almost full (…%)", `plural()` in `100-home-rows-filters.js`) can only be translated by guessing with `rx`/`units`. Add a small `t('key', {n: 3})` helper and move those code spots to it, keeping the English output byte-for-byte the same. Bengali needs no plural forms after a number.
5. **Keep the English keys honest.** Add a check (a script in `tools/`, and a step in the existing GitHub workflow) that fails when a key in any `src/i18n/*.json` dict no longer exists as text in `src/html` or `src/js`, and that reports missing words per language.
6. **Self-host the Bengali font.** Replace the Google Fonts link in `i18nFont()` with a subset `.woff2` of Noto Sans Bengali (Bengali + Latin digits and punctuation) served from `src/pwa/` (or `src/fonts/`, copied by `build.py`) and cached by `sw.js` (bump `SHELL`). The sandbox has no network, so I must download the font myself and add it to the zip; ask me for it. Also check for `letter-spacing` and `text-transform` on labels (they break Bengali conjuncts) and consider a slightly larger font size for `bn`.
7. **Layout check on a 360 px Android phone.** Bengali strings are often longer. I will send screenshots; fix tab-bar labels, filter chips, buttons, the onboarding level cards and tiles (the spelled-out units are longer than "4h 15m") that wrap or overflow.
8. **Translate the remaining screens.** Still English: Feature guide and How to use sheets, Settings descriptions, author pages, reviews, the sync dashboard, Account tab details, backup and storage text. Add them to `src/i18n/bn.json`, add anything with numbers to `rx`/`units`, and extend `BN-REVIEW.md`. Then do the same for other languages as I ask (the 8 others only have 36 labels each).
9. **Bengali inside the learning features.** Bengali meanings in Words/vocabulary, Bengali explanations in the quick quiz, and `lang="bn"` on translated sentences so the text is shaped correctly and TalkBack reads it in Bengali. Look at `160-learning-tools.js` (translation, vocabulary, review) first; the sentence translation already supports `bn` as a target (`TR_LANGS`).

## Known problems and caveats

- Nothing in this work has been seen in a browser. The first real-phone test is the biggest risk.
- Source bug in onboarding: the card says "6 quick questions" but the quiz counter reads "Question 1 of 5". Fix the English one way or the other, then update `bn.json`.
- Dates older than 30 days use the browser's `toLocaleDateString()`, so they are not Bengali.
- A book title that is only a number, outside the listed title classes (`I18N_NODIGIT`), would show Bengali digits when the digits switch is on.
- Every language ships inside the one page (Bengali is about 21 KB). If you reach about 10 full languages, switch to loading `i18n/<code>.json` on demand and cache it in `sw.js`.
- The ratings feature in the older `HANDOFF.md` still has its own remaining task 8 (abuse hardening). That is unrelated to this work. The Firebase rules tests (`firebase/rules.test.js`) have NEVER been run; remind me before I publish rules.

When you start: tell me in two lines which files you will touch and what you will not touch, then do it. When done, send a zip of changed files and tell me what to test.
