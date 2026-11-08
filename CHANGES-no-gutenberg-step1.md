# Step 1: clear message when a book's text is not on Project Gutenberg

- Books with no Gutenberg text now show: "This recording's text isn't on Project Gutenberg. You can still listen."
  - Button "Open the text source" opens the text link LibriVox gives for the book (the book's own link, else details/<id div 1000>.json key "s"). No link known: no button.
  - "Use my own text" stays.
  - No Retry here (retrying cannot help).
- Real network problems still show "Couldn't load the book text. You can still listen." with Retry.
- The card's words are now translated (the book area used to skip translation; only the marked card is let through).
- New words added to src/i18n/*.json (bn, de, es, fr, tr, zh, ar, ur, th).
- Code: 070 (marks "not on Gutenberg"), 140 (card + textSourceLink), 200 (translation exception). Checks: tools/unit_check.js (56 pass).
