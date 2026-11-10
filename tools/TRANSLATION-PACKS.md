# Translation packs

A **translation pack** holds the translation of every sentence of ONE book into ONE language, in one small compressed file.
Packs are made once, on a free GPU (Kaggle or Colab), with an open model. They cost nothing to make, need no account with a paid
service, and contain no keys. A later task makes the app read them, so the reveal bubble and the reading modes work offline for
the whole book (today only sentences you have already seen work offline).

This task only **makes** packs. The app does not read them yet.

## File format (version 1)

File name: `<book id>.<language code>.json.gz` (for example `1342.bn.json.gz`). gzip of one UTF-8 JSON object, no spaces:

```json
{
  "format": "wordtrail-translation-pack", "v": 1,
  "book": "1342", "title": "Pride and Prejudice",
  "src": "en", "lang": "bn",
  "key": "fnv1a-utf16-base36",
  "engine": "hf", "model": "facebook/m2m100_418M", "license": "MIT",
  "made": "2026-11-10T03:25:37Z",
  "n": 5120, "of": 5130,
  "s": [ ["5rkw95.15", "দুর্গটি উপত্যকার ওপরে নীরবে দাঁড়িয়ে ছিল।"], ["qoi2jt.1j", "..."] ]
}
```

| Field | Meaning |
|---|---|
| `format`, `v` | Always `wordtrail-translation-pack`, `1`. A reader must refuse another `v`. |
| `book`, `title` | The book id used in the file name, and its title (information only). |
| `src`, `lang` | Source language (always `en`) and the app's language code (`bn`, `hi`, `ur`, `ar`, `es`, `fr`, `de`, `it`, `pt`, `ru`, `tr`, `id`, `zh-CN`, `ja`, `ko`: the list in `160-learning-tools.js`). |
| `key` | How a sentence is named: `fnv1a-utf16-base36`. This is exactly the hash in `fnv()` of `160b-translate-provider.js`, so a pack row can be written straight into the app's translation cache under `<lang>\|<key>`. |
| `engine`, `model`, `license` | How it was made, and the licence of that model. Keep them: the licence decides whether the pack may ship. |
| `made` | UTC time. |
| `n`, `of` | Sentences translated, and sentences in the book. `n < of` means some were left out (the app translates those live, as today). |
| `s` | Rows `[key, translation]`, in book order, each sentence once. A sentence is the trimmed text the app shows (headings are not included). |
| `test` | Only on `--engine dummy` files: `true`. A reader must never use a pack with `test: true`. |
| `truncated` | Only if some sentences were longer than `--max-tokens` and were cut. |

To find the row of a sentence in JavaScript, use the same function as the app:
`const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length.toString(36); };` then `fnv(sentence.trim())`.
`tools/translation_pack_check.py` proves the Python script gives the same keys as this JavaScript.

Size: the sample pack (12 sentences) is under 1 KB. A full novel has thousands of sentences; gzip works well on text, but measure your own pack before planning storage.

## Steps

You need the book as a Project Gutenberg `.txt` file and this repository (at least `src/js/010-core.js` and `tools/`).

### 1. Try it on your computer, no model needed (30 seconds)

```
python tools/make_translation_pack.py --text tools/samples/sample-book.txt --book sample --lang bn --engine dummy --out /tmp/packs
python tools/make_translation_pack.py --verify /tmp/packs/sample.bn.json.gz --text tools/samples/sample-book.txt
```
`dummy` writes placeholder text marked `test: true`. It only proves the format works. Needs Python 3.8+ and Node.js.

### 2. Make a real pack on Kaggle (free GPU)

1. kaggle.com > Create > New Notebook. Right side: Session options > Accelerator **GPU T4 x2** (or P100), **Internet on** (it downloads the model once).
2. Put the repository in the notebook: upload the project zip as a Dataset and add it, or `!git clone <your repository URL> wt` (a public repo needs no token; do not paste a token into a notebook).
3. Cells:
```
!pip -q install transformers sentencepiece
!wget -q -O book.txt https://www.gutenberg.org/cache/epub/1342/pg1342.txt
!python wt/tools/make_translation_pack.py --text book.txt --book 1342 --title "Pride and Prejudice" --lang bn --model facebook/m2m100_418M --out /kaggle/working/packs --limit 50
```
4. Look at the 50 translations first (see "Checking quality"). Then run again **without `--limit`** for the whole book.
5. Download `packs/1342.bn.json.gz` from the notebook's Output tab.

### 2b. The same on Colab

Runtime > Change runtime type > **T4 GPU**. Cells as above. Use `--out /content/packs`, then:
```
from google.colab import files; files.download('/content/packs/1342.bn.json.gz')
```

If the notebook has no Node.js (`!node -v` fails), make `sentences.json` on your own computer with `node tools/pack_sentences.js book.txt > sentences.json`, upload it, and use `--sentences sentences.json` instead of `--text book.txt`.

### 3. If the session stops

Free sessions end after some hours. Work is saved after every batch in `<out>/<book>.<lang>.json.gz.partial`. Start the same command again with `--resume` (keep the output folder, or copy the `.partial` file back first). A finished run deletes the `.partial` file.

### 4. Check the pack

```
python tools/make_translation_pack.py --verify packs/1342.bn.json.gz --text book.txt
```
It prints how many sentences are covered, and fails if the file is damaged or has keys that match no sentence (a different edition of the text).

### One pack for each language

Run the command again with another `--lang`. Each language is its own file.

## Options you may need

| Option | Use |
|---|---|
| `--model` | Default `facebook/nllb-200-distilled-600M`. Other Hugging Face translation models work (`m2m100`, `nllb`, one-pair `opus-mt-en-xx`). |
| `--batch 8` | If the GPU says out of memory. |
| `--beams 1` | Faster, a little worse. |
| `--engine table --table my.json` | Take translations from your own `{"English sentence": "translation"}` file (hand-made or corrected). The sample pack is made this way. |
| `--license "..."` | Overrides the licence written in the file. |

## Licences: decide before you ship a pack

The licence of the **model** is what matters, and it is yours to check on the model's page. As of writing, the NLLB-200 weights (the default) are **non-commercial** (CC-BY-NC-4.0). `facebook/m2m100_418M` is MIT. The script writes the licence it knows into the pack, or "check the model card" when it does not know the model. The book text is Project Gutenberg public domain; check the book's own status in your country.

## Checking quality (do this every time)

Machine translation makes mistakes: names, idioms, old English, dialogue. Before a pack goes into the app, read 30 to 50 sentences with a Bengali (or target-language) speaker, especially dialogue and old words. A pack is labelled machine translation wherever the app shows it. Corrections can go back in through `--engine table`.

## What is NOT tested

The real-model path (`--engine hf`) was written to the models' documented interface but was **not run** when this task was made, because the build machine has no GPU, no `torch` and no internet for model downloads. Run step 2 with `--limit 50` first on Kaggle or Colab and read the output before the full book. Everything else (sentence splitting, keys, file format, resume, verify) is tested by `python tools/translation_pack_check.py`.

## Files

| File | Purpose |
|---|---|
| `tools/make_translation_pack.py` | The script. |
| `tools/pack_sentences.js` | Splits a book into the app's sentences with the app's own `Core`. |
| `tools/translation_pack_check.py` | Automatic checks. |
| `tools/samples/sample-book.txt`, `sample-bn-table.json`, `packs/sample.bn.json.gz` | The small sample: 12 sentences, Bengali written by hand for the demo (not machine output). |
