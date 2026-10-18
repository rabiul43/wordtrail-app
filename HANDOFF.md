# Wordtrail: handoff prompt for a new chat

Paste everything below the line into a new chat, attach the project zip (it contains this file), then add one line: "Do task N".

---

I am continuing work on **Wordtrail**, an audiobook + reading web app (installable PWA). The attached zip is the full project.
Read `README.md` and `MODULES.md` first. Key rules:

- The app is many small files joined by `python build.py` into `dist/index.html`. All of `src/js/020` to `999` are slices of ONE closure and share names; no `import`/`export`. A new file needs one line in `build.py`. CSS order matters (later rules win).
- Backend is Firebase (Google sign-in + Firestore). Rules live in `firebase/firestore.rules` and tests in `firebase/rules.test.js`. I paste rules into the Firebase console by hand. The sandbox cannot reach npm, so the rules tests have NEVER been run; remind me to run them (`npx firebase emulators:exec --only firestore "node rules.test.js"`).
- Guests never download Firebase code. Reading public data uses Firestore REST (`firestore.googleapis.com`) with the API key; only writing loads the SDK through `acLoad()` in `295-account-sync.js`.
- Calm mode (`:root[data-calm]`) hides scores and popularity numbers; every new rating UI must respect it.
- Match the existing style: dark "Midnight Library" tokens in `src/css/10-base-layout.css` (`--accent` gold, `--surface`, `--ink`, `--muted`), Fraunces for titles, Inter for UI, touch targets of at least 44px.
- Work style: change only the files needed, send back changed files (a zip of changed files in the same folder layout), keep answers short, no long recaps. Do not verify beyond a build and a syntax check unless I ask.

## What is already done (the "Ratings and one-line reviews" feature, tasks 1 to 7)

Spec: one rating per user per book (1 to 5 stars), optional 140-character review, the detail page shows the average.

Data model (Firestore):
- `ratings/{bookId}` = `{ n, s, c1, c2, c3, c4, c5 }` (count, star sum, how many of each star). Public read.
- `ratings/{bookId}/votes/{uid}` = `{ r, c, n, t, x? }` (stars, review, first name, server time, x = number of reports). Public read; only the owner writes it; document id is the uid, so one rating per user. Editing the vote rewrites it and clears `x`.
- `ratings/{bookId}/votes/{uid}/reports/{reporterUid}` = `{ k: spam|offensive|spoiler|other, t }`. Create only (one per person per review), nobody can read, change or delete it from the app. A report is written in the same batch that adds +1 to the vote's `x`; the rules accept someone else's change to a vote only if it is exactly that +1.
- Security rules make the totals document change ONLY in the same batch as the user's own vote, by exactly what the vote changed (including per-star counters).

Code (all in the zip):
- `src/js/135-ratings.js`: `rtLoad`, `rtMine` (also keeps `wt:myrt` in step), `rtSave` (batch, retry once, 15 s timeout, removing = `r = 0`), `ratingsSection(b)` (book page: average, star bars, latest 5 reviews, "See all reviews", your own box), `ratePrompt(b, show)` (Finish card), the review "..." menu (`rtMenuBtn`; Report for others, Edit and Delete review for your own), `reportSheet` / `rtReport` (sheet `#sheet-report` in `src/html/20-sheets-player.html`), the All reviews page (`openReviews`, `drawReviews`, `rtPage` with REST `runQuery` cursors, `rtReviewCount` with `runAggregationQuery`), the per-session ratings summary (`rtSumLoad`, `rtInfo`, `rtChipText`, `rtLineText`, `rtCmp`; one query for books with 5+ ratings, cached 6 hours), and the Account-tab lists (`renderMyRatings`, `myRtBackfill`).
- `src/js/130-book-detail.js`: `drawDetail` adds `ratingsSection`; `detDraw()` redraws the page DET says is open. `DET.rv = true` means the All reviews page is open on top of the book (it is one layer in the back stack; set in `080`, `130`, `140`).
- `src/js/100-home-rows-filters.js`: Filters panel gets "Sort by" (Newest default, Top rated, Shortest) and "Minimum rating" (Any, 3+, 4+, 4.5+); Done shows "Show N books". Tiles show a rating chip. `110` (shelf sort), `120` (search sort, result lines) and `130` (author page sort) have "Top rated" too.
- `src/js/090-synced-stats-book-search.js` calls `renderMyRatings()` from `renderAccount`; `src/html/10-body-views.html` has `#acct-rt`, `#flt-sort`, `#flt-rate`, and the `rsort` option.
- `wt:myrt` = `{ bookId: { r, c, t, title, authors, cover, ia } }` (a removed rating stays as `{ r: 0, t }`), in the synced Favourites category (`295`, merged per book by newest `t`) and in backups (`290`). `wt:rtchk` (this device only) = books already looked up. `wt:rtskip` = "Not now" on the Finish card. `wt:rtrep` = reviews you reported (hidden for you at once).
- `src/css/70-collections-detail-motion.css`: `.det-rate`, `.rt-*`, `.rv-*`, `.rp-*`, `.rtl-*`, `.acct-rt` at the end of the file, before the Calm rules. `.rt-only` marks rating-only controls hidden in Calm.
- `build.py`, `MODULES.md`, `README.md` ("Checking reports"), `firebase/firestore.rules`, `firebase/rules.test.js` updated.

Shipped: task 1 (section, average, bars, latest reviews), 2 (Finish card prompt), 3 (rating chips on tiles, rating line in lists), 4 (report and delete reviews; reviews with 3 or more reports are hidden for everyone but the writer), 5 (All reviews page with Newest/Highest/Lowest and Load more), 6 (Top rated sort and minimum-rating filter), 7 (Account tab: Your ratings and Finished, not rated yet).

Moderation (see README "Checking reports"): in the Firebase console, filter votes by `x >= 3`; to remove a review set its `c` to an empty string (the stars still count); never delete a vote by hand (totals would be wrong); to restore, set `x` to 0 and delete its `reports`.

Known caveats:
- The rules tests have NEVER been run (about 35 cases now, including reports). Remind me to run them before publishing the rules.
- The real sign-in and save flow, the report flow, the All reviews queries and the count query are untested against real Firebase. No composite index is needed (Highest and Lowest order by stars only, so ties are in no particular order).
- Totals documents created by an earlier version of the rules (without `c1` to `c5`) are rejected; delete the `ratings` collection before publishing the new rules if any exist.
- Reviews are public free text; moderation is manual through reports and the console.
- The rating summary only holds the 400 most-rated books with 5+ ratings, so the rating filter and Top rated leave other books out.
- The Filters "Sort by" has no "Popular" (the app has no popularity data to sort by).
- "Your ratings" depends on `wt:myrt`; ratings made before it existed are found once by `myRtBackfill` (max 30 books per visit).
- The design mockups were pasted as screenshots in earlier chats; the canvas link (https://claude.ai/artifact/SreSsP5NPQNGqo7AuN9JWL) was not readable from the sandbox.
- Existing local "Favourites" (heart) are separate and private; likes were discussed and deliberately NOT built.

## Remaining task (I will say which one to do)

8. **Abuse hardening.** For example require the book to have been opened or listened to for some time before rating; rate limiting (for example a limit on how many ratings or reports one account can make per day). Not visual. Rules changes go in `firebase/firestore.rules` with tests in `firebase/rules.test.js`; remind me to run them.

When you start: tell me in two lines which files you will touch and what you will not touch, then do it. When done, send a zip of changed files and tell me what to test.
