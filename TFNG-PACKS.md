# True / False / Not Given packs

A **TFNG pack** holds IELTS-style statements for ONE passage: the passage as numbered lines, and for each statement the answer, a one-sentence reason and the supporting line.
Rules cannot make a reliable *Not Given* statement, so statements are **made offline by an open model, then read and approved by a person**. Packs cost nothing to make
(free Kaggle or Colab GPU), need no paid service and contain no keys. A later task makes the app read them; this task only makes them.

## File format (version 1)

Two files, same shape. The **candidates file** `<book id>.<passage id>.tfng.json` is plain JSON, written by the script and edited by a person.
The **pack** `<book id>.<passage id>.tfng.json.gz` is gzip of one UTF-8 JSON object, no spaces, only approved items.

```json
{
  "format": "wordtrail-tfng-pack", "v": 1,
  "book": "1342", "title": "Pride and Prejudice", "passage": "ch3", "src": "en",
  "key": "fnv1a-utf16-base36",
  "engine": "hf", "model": "Qwen/Qwen2.5-7B-Instruct", "license": "Apache-2.0",
  "made": "2026-11-13T09:00:00Z", "from": 120,
  "reviewed": { "by": "Your Name", "on": "2026-11-14" },
  "lines": [ ["5rkw95.15", "Honey bees keep the centre of their hive ..."], ["qoi2jt.1j", "..."] ],
  "n": 9,
  "items": [
    { "id": "1x2y3z.2k", "st": "Some bees cool the hive by moving air with their wings.", "a": "T",
      "why": "Lines 3 and 4 say workers fan their wings to push warm air out and pull cooler air in.", "sup": [3, 4], "r": 1 }
  ]
}
```

| Field | Meaning |
|---|---|
| `format`, `v` | Always `wordtrail-tfng-pack`, `1`. A reader must refuse another `v`. |
| `book`, `title`, `passage` | Book id, title (information only), passage id (letters and digits; for example a chapter or a section). |
| `key` | `fnv1a-utf16-base36`: the same hash as `fnv()` in `160b-translate-provider.js` and the translation packs. |
| `lines` | The passage, one row `[key, text]` per sentence, in book order. The key is the hash of the text, so a reader can find the same sentence in the open book. `from` = number of the first line in the book's sentence list (counted from 1). |
| `engine`, `model`, `license`, `made` | How the candidates were made. `engine` is `hf` (a model) or `table` (hand-written). Keep the licence: it decides whether the pack may ship. |
| `reviewed` | `{ by, on }`: who read the items and when. Only in a published pack. |
| `n` | Number of items. |
| `items[].id` | The key of the statement text (same hash). Unique in the pack. |
| `items[].st` | The statement: 6 to 35 words. |
| `items[].a` | `T` true, `F` false, `NG` not given. |
| `items[].why` | The reason: ONE sentence. For `NG` it says what the passage does not tell. |
| `items[].sup` | Supporting lines as **line numbers counted from 1 inside `lines`** (not the book's numbers). `T` and `F`: 1 to 3 lines. `NG`: always `[]`. |
| `items[].r` | `0` = candidate, not read. `1` = approved by a person. **A reader shows only `r: 1` items.** |
| `items[].chk` | Only in a candidates file: hints for the reviewer (`copies line N` = nearly word for word, so too easy; `same as item ...`). Removed on publish. |
| `sample` | Only on demo packs: `true`. A reader must never use a pack with `sample: true`. |

## Steps

You need the book as a Project Gutenberg `.txt` file and this repository (`tools/` and `src/js/010-core.js`).

### 1. Try the whole flow on your computer, no model (1 minute)
```
python tools/make_tfng_pack.py --sentences tools/samples/sample-tfng-passage.json --book sample --passage p1 --engine table --table tools/samples/sample-tfng-table.json --out /tmp/cand
python tools/make_tfng_pack.py --publish /tmp/cand/sample.p1.tfng.json --sample --out packs
python tools/make_tfng_pack.py --verify packs/sample.p1.tfng.json.gz
```

### 2. Make candidates on Kaggle or Colab (free GPU)
Choose a passage first: 10 to 20 consecutive sentences of one non-fiction chapter that read as one topic. Find its sentence numbers with
`node tools/pack_sentences.js book.txt > sentences.json` (the position in the list, counted from 1).
Kaggle: New Notebook, Accelerator **GPU T4 x2**, Internet on. Colab: runtime **T4 GPU** and add `--4bit` (one T4 is too small for the 7B model in 16-bit).
```
!pip -q install transformers accelerate
!wget -q -O book.txt https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt
!python wt/tools/make_tfng_pack.py --text book.txt --book <id> --title "<title>" --passage ch3 --from-line 120 --to-line 133 --out /kaggle/working/packs
```
It asks the model three times (true, false, not given), keeps only candidates that pass the format checks, and writes `<book>.<passage>.tfng.json` with every item at `r: 0`.
`--per-type 4` (default) gives about 12 candidates; ask for more than you need, because a person will remove many.

### 3. A person reads every item (this step is not optional)
Open the `.json` file. For each item check, with the passage in front of you:
1. **T**: the passage clearly says it, in other words. **F**: a line clearly says the opposite. **NG**: nothing in the passage decides it, and no general knowledge in the passage's own words settles it. This last one is where models fail most: they write NG statements that the passage actually answers, or T statements that need a guess.
2. The `sup` line numbers point at the right lines and the `why` sentence is true and simple.
3. The statement is not a copy of a line (see `chk`) and has no trick (names, spelling, double negatives).
Fix the wording by hand, set `"r": 1` on every item that is right, delete the others. Aim for about the same number of T, F and NG.

### 4. Publish and check
```
python tools/make_tfng_pack.py --publish packs/1342.ch3.tfng.json --reviewer "Your Name"
python tools/make_tfng_pack.py --verify packs/1342.ch3.tfng.json.gz
```
`--publish` keeps only `r: 1` items, removes the hints, writes who reviewed, runs all the checks and writes the `.json.gz`. It refuses without `--reviewer`, and when no item is approved.

## Licences
The model's licence is yours to check on its model card. `Qwen/Qwen2.5-7B-Instruct` and `mistralai/Mistral-7B-Instruct-v0.3` were Apache-2.0 when this was written; other Qwen sizes and many other models have different terms. The script writes the licence it knows, else "check the model card" (override with `--license`). The book text is Project Gutenberg public domain; check the book's status in your country.

## What is NOT tested
The model path (`--engine hf`) was written to the documented `transformers` chat interface but **not run**: this machine has no GPU, no `torch` and no internet for model downloads. Run step 2 once on Kaggle or Colab and read the first output before relying on it (prompt wording and the JSON parsing are the likely things to adjust). The sample pack is hand-written, `r: 1` was set by its author only to show the format, and no person has reviewed it. Everything else is tested by `python tools/tfng_pack_check.py`.

## Files
| File | Purpose |
|---|---|
| `tools/make_tfng_pack.py` | The script: make candidates, `--publish`, `--verify`. Uses the sentence splitter and key hash of `tools/make_translation_pack.py`. |
| `tools/tfng_pack_check.py` | Automatic checks (no model). |
| `tools/samples/sample-tfng-passage.json`, `sample-tfng-table.json`, `packs/sample.p1.tfng.json.gz` | The sample: a 10-line passage about honey bees written for the demo, 9 hand-written statements (3 T, 3 F, 3 NG). |
