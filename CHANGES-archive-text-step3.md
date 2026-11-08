# Step 3: "Try the text from archive.org" (only on a tap)

- On the "not on Project Gutenberg" card, a book whose LibriVox text link is on archive.org gets a button "Try the text from archive.org". Nothing from archive.org ever loads by itself.
- Card order: message + "Open the text source", "Try the text from archive.org", "Use my own text". (Step 2's timing-file text will go between the first and second.)
- On tap: downloads archive.org/download/<id>/<id>_djvu.txt through the app's usual routes (direct, then the free proxies), then checks it:
  readable (mostly real words), long enough, title or author near the start, a dated issue (magazine) must show its month and year,
  and its length must be close to the recording's (more than 2.5x = probably several books or plays; under 0.25x = too short).
- A failed check refuses, says why in plain words, and keeps the other buttons. A missing file (404) or no connection also say so ("Try again" only for no connection).
- A passing text loads like an own text. The page shows "Text from archive.org, may have errors" with "Switch text" (opens the text sheet: another Gutenberg text, or your own file). The note comes back each time the book is opened.
- Not yet: the rule "show this button only if a timing-file text exists" (that belongs to Step 2).
- Code: 140 (archiveIdOf, noTextActions, archiveCheck, tryArchiveText, srcNoteNode), 150 (the note on the page), i18n files, tools/unit_check.js (64 checks pass).
- tangle_check shows one new link: 140 uses useRaw from 290 (the existing own-text loader, reused on purpose).
