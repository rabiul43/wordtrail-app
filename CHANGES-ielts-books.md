# IELTS books (Task 54): what is done and what is left for later

## Done (in the code)
- `tools/academic_share.py` builds `academic.json` from the `vocab/<id>.json` files.
- `src/js/103b-ielts-books.js`: IELTS-friendly filter, Accent filter, academic-words bar on filtered cards, "Books for IELTS" shelf (button in the IELTS hub), "Essay phrases" collection in My Words.
- Level filter: already existed, unchanged.
- Checks that ran: `academic_share.py --self-test`, `ielts_books_check.js` (14), `wordfind_check.js` (17), `startup_check.js`, `ielts_check.js`, a temporary browser check (9), `build.py`, `deps.py --check`, `i18n_check.py bn`.

## Until the steps below are done
- The app cannot find `academic.json`, so IELTS-friendly shows "IELTS data has not loaded yet" and nothing is filtered.
- The Accent control stays hidden (no accent data).
- Essay phrases already works, because it needs no data file.

## Steps for later

### 1. Get the real vocab files
Download the `vocab/` folder from the data host (Hugging Face dataset `rabiul43/wordtrail-text`, folder `data/vocab/`) to a local folder, for example `vocab/`.

### 2. Replace the word list with the official one (recommended)
`tools/awl_words.txt` was written from memory. It has 570 unique headwords, but it is not checked against Coxhead's official list. Put the official headwords, one per line, in a file and pass it with `--words`. Otherwise keep the current file and accept small errors.

### 3. Decide where accent comes from
No existing data has a narrator's accent. Options:
- A hand-made CSV, one line per book: `84,british` or `345,american` (only `british` / `american` are read). Start with the books IELTS learners will use.
- Skip accent for now. The control stays hidden and nothing breaks.

### 4. Build the file
```
python tools/academic_share.py --vocab-dir vocab --out academic.json
python tools/academic_share.py --vocab-dir vocab --out academic.json --accents accents.csv   # with accents
```
It prints the number of books and the size in bytes. Check the size is small (expect well under 150 KB for about 9,000 books).

### 5. Look at the numbers before trusting them
- The percent is the academic share of each book's LISTED hard words, not of the whole text.
- Check a few known books (a science essay should be clearly higher than a novel). If almost every book lands under 5 or over 5, change `IELTS_MIN` in the script and rebuild. The app reads `min` from the file, so no code change is needed.

### 6. Upload
Put `academic.json` in the same data folder as `levels.json` (`data/academic.json` on the dataset). The app fetches it with the same function as `levels.json` and keeps a copy for 3 days.

### 7. Test by hand on a phone
- Filters: tap IELTS-friendly, then Show N books. Cards show a bar and a percent. Remove the chip: results go back to normal.
- Accent (only if you built accents): British and American give different lists.
- Hub: turn on Prepare for IELTS, tap Books for IELTS. Home opens with only IELTS-friendly books.
- Offline: with the file already saved, the filter still works.
- Essay phrases: save "however" and "make a decision", open My Words, tap the Essay phrases button. Both appear in the collection.
- Dark, light, sepia and contrast themes: bar and chips are readable.

## Known limits
- Shelf is a filtered list on Home, not the separate screen in the mock-up. A dedicated screen can be a later task.
- A word you remove from Essay phrases is offered again next time My Words opens.
- If you rename the Essay phrases collection, an empty "Essay phrases" is created again.
- `wordfind_check.js` sits in `src/js/` in the ZIP; the docs say `tools/`. Move it when convenient.

## Rollback
Remove `103b-ielts-books.js`, `99q-ielts-books.css`, their `build.py` lines, the `AC` / `EP` lines in `103`, `166`, `169o`, and the IELTS and Accent groups in `30-sheets-settings.html`.
