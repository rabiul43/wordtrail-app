# Sound packs: minimal pairs and connected speech

A **sound pack** holds practice items for ONE passage of ONE book: word pairs that sound alike (ship / sheep) and phrases that are said fast (written "going to", heard "gonna").
The items are found **in the book's own sentences**, by rules and a small word table (no model, no key, no network), then **a person reads every item**, then the app reads only approved items.
The learner hears the real narrator of the book: no text-to-speech anywhere.

## What the learner sees
- **Which word did you hear?** One sentence plays with a word missing. Two buttons: the word that was said and its pair. After the answer: the sentence, the sound pair ("i / ee") and the pair of words.
- **Write it in full.** One sentence plays; a short phrase is one box. The learner types the words in full ("going to"); after the answer the phrase and how it is said fast ("gonna").
- The weakest sound / phrase (5+ answers, under 75% right of the last 12) is the Learn row line: "Your weakest sound: th / s", "Hardest to catch: gonna". Calm mode: the usual line. Notes: `wt:snd`, this device only.
- No pack for the book, or offline with no saved copy: "No sound practice found for this book. It may not exist yet, or you may be offline." Nothing opens.

## File format (version 1)
Candidates file `<book id>.<passage id>.sound.json` (plain JSON, edited by a person). Pack `<book id>.<passage id>.sound.json.gz` (gzip of one JSON object, only approved items).
```json
{ "format": "wordtrail-sound-pack", "v": 1, "book": "1342", "title": "Pride and Prejudice", "passage": "ch3", "src": "en", "key": "fnv1a-utf16-base36",
  "engine": "table", "source": "tools/sound-tables.json v1", "license": "CC0-1.0 (...)", "textLicense": "Project Gutenberg text, public domain in the US; check ...",
  "made": "2026-11-16T09:00:00Z", "from": 120, "reviewed": { "by": "Your Name", "on": "2026-11-17" },
  "lines": [ ["5rkw95.15", "We watched the ship leave the harbour at dawn."] ], "n": 2,
  "items": [ { "id": "1x2y3z.2k", "k": "p", "line": 1, "w": "ship", "o": "sheep", "snd": "i-ee", "r": 1 },
             { "id": "9a8b7c.3d", "k": "c", "line": 4, "c": "going to", "said": "gonna", "r": 1 } ] }
```
| Field | Meaning |
|---|---|
| `lines` | 3 to 60 sentences `[key, text]` in book order; key = the same hash as translation and TFNG packs. The app finds the sentence in the open track by this key. |
| `license` | Licence of the word table that made the candidates. `textLicense`: the book. Both are kept in the file. |
| `reviewed` | `{ by, on }`. Only in a published pack. The app refuses a pack without it (and `by: "none"`). |
| `sample` | Only on demo packs: `true`. **The app never uses a pack with `sample: true`** (no developer switch). |
| `items[].k` | `p` pair, `c` connected speech. `line` = line number counted from 1 inside `lines`. |
| pair | `w` the word in the sentence (the answer), `o` its pair (must NOT be in the sentence), `snd` the sound id from the table (`i-ee`, `th-s`, `l-r` ...). |
| connected speech | `c` the written phrase (in the sentence), `said` how it is said fast. Both from the table. |
| `items[].r` | `0` candidate, `1` approved. The app shows only `r: 1`. `chk` (candidates only) = hints for the reviewer; removed on publish. |
| `items[].id` | Key of line key + word or phrase. Unique. |

Index file `packs/<book id>.sound-index.json`: `{ "format": "wordtrail-sound-index", "v": 1, "book": "1342", "passages": [ { "id": "ch3", "n": 12 } ] }`. No index = no practice for that book.

## Steps
```
node tools/pack_sentences.js book.txt > sentences.json
python tools/make_sound_pack.py --sentences sentences.json --book 1342 --passage ch3 --from-line 120 --to-line 180 --title "Pride and Prejudice"
```
Make a passage of up to 60 consecutive sentences. Then **read every item** in `packs/1342.ch3.sound.json`, with its sentence in front of you:
1. Pair: the sentence really contains the word `w` (not a name, not a different word with the same spelling), and `o` would be a real mistake for a learner.
2. Phrase: the phrase is really the reduced form. Not "going to the market" (a trip), not "be used to", not a sentence that ends in the phrase. `chk` marks the doubtful ones.
3. Set `"r": 1` on the right items, delete the others.
```
python tools/make_sound_pack.py --publish packs/1342.ch3.sound.json --reviewer "Your Name"
python tools/make_sound_pack.py --verify packs/1342.ch3.sound.json.gz
python tools/make_sound_pack.py --index packs --book 1342
```
Upload the `.json.gz` files and the index to the same data host as the translation and TFNG packs (`packs/`). A learner needs the narrator's audio of the book to be lined up with its text (the same as Listen and type).
Passages may sit in different tracks: the practice uses the items whose sentence is in the track that is open.

## The word table
`tools/sound-tables.json`: 16 sound contrasts with word pairs, 24 phrases. It is the single source: the app has a copy of the ids, labels and phrases (`SDC.SOUNDS`, `SDC.CHUNKS`) and `node tools/sound_drill_check.js` fails when they differ. To add a pair, add it to the table, then run both checks.
Pairs were chosen from common contrasts for learners (long and short vowels, th, v / w, s / sh, l / r, p / b, f / p ...). Some are more useful for Bengali-speaking learners than others; a teacher should read and extend the table. The licence line in the table says it was written for Wordtrail and copied from no dictionary: **a person must confirm that before shipping**.

## What is NOT tested
- No real audio: the Chromium tests use a stand-in audio element, so whether the narrator's clip is clear enough to hear the difference in a given book is for a person to judge while reviewing (listen to the clip of an item before approving it).
- The sample pack (`packs/sample.p1.sound.json.gz`, `sample: true`) was approved by its author only to show the format. It is not used by the app, on purpose: its sentences are not from a real book. To try the screens, make a pack from a book you have with `--reviewer` your own name.
- Phone behaviour (keyboard, touch, TalkBack, Bengali layout) is not tested here.

## Files
| File | Purpose |
|---|---|
| `tools/make_sound_pack.py` | Candidates, `--publish`, `--verify`, `--index`. |
| `tools/sound-tables.json` | Word pairs and phrases (the only list). |
| `tools/sound_pack_check.py` | Checks of the script (no network). |
| `tools/sound_drill_check.js` | Checks of the app side (pure logic, structure, the real sheet in Chromium). |
| `src/js/169zc-sound-drill.js`, `src/html/28i-sheet-sound-drill.html`, `src/css/94zf-sound-drill.css` | The app side. Remove them and their build.py lines to go back. |
