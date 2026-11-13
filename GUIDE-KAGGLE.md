# Guide: make and review a True / False / Not Given pack

You do this once per passage. Time: about 15 minutes of setup the first time, then 10-20 minutes of reading per passage.
Cost: free. You need a Kaggle account (free, phone-verified for GPU and internet).

## Part A. Put the files in your project (2 minutes)
1. Unzip `wordtrail-task60.zip`.
2. Copy its contents into your WordTrail project folder, keeping the same folders:
   - `TFNG-PACKS.md` -> project root
   - `tools/make_tfng_pack.py`, `tools/tfng_pack_check.py` -> `tools/`
   - `tools/samples/sample-tfng-*.json` -> `tools/samples/`
   - `packs/sample.p1.tfng.json.gz` -> `packs/`
3. Zip your whole project again (`wordtrail-app.zip`).

## Part B. Quick test on your own computer (1 minute, no model)
```
python tools/tfng_pack_check.py
```
Last line must say `0 failed`. If not, stop and tell me the message.

## Part C. Choose the passage (5 minutes)
Pick 10 to 20 sentences in a row from ONE non-fiction chapter, all about one topic (not dialogue, not a story).
On your computer, with the book as `book.txt` (Project Gutenberg text file):
```
node tools/pack_sentences.js book.txt > sentences.json
python -c "import sys,argparse; sys.path.insert(0,'tools'); from make_tfng_pack import load_sentences as L; [print(n,t[:90]) for n,(k,t) in enumerate(L(argparse.Namespace(sentences='sentences.json',text=None)),1)]" > numbered.txt
```
Open `numbered.txt`, find where your passage starts and ends. Write down the two numbers (example: 120 and 133).

## Part D. Run on Kaggle (10 minutes)
1. kaggle.com > Create > New Notebook.
2. Right side, Session options: Accelerator = **GPU T4 x2**, Internet = **On**.
3. Add Data > Upload > your `wordtrail-app.zip` (Kaggle unpacks it under `/kaggle/input/...`; use the folder name shown in the right panel).
4. Cell 1:
```
!pip -q install transformers accelerate
!wget -q -O book.txt https://www.gutenberg.org/cache/epub/BOOKID/pgBOOKID.txt
```
   (replace BOOKID, for example 1342)
5. Cell 2 (replace the path, the book id, the title, the two numbers):
```
!python /kaggle/input/YOURDATASET/tools/make_tfng_pack.py --text book.txt --book BOOKID --title "TITLE" --passage ch3 --from-line 120 --to-line 133 --out /kaggle/working/packs
```
   The first run downloads the model (about 15 GB, 5-10 minutes). Colab instead: choose T4 GPU and add `--4bit` (and `!pip install bitsandbytes`).
6. When it finishes it prints `wrote .../BOOKID.ch3.tfng.json: N candidates`. Open the Output tab on the right and download that `.json` file.

If it fails: copy the last 15 lines of the error to me. The model part has not been run before, so a small fix may be needed once.

## Part E. Review by a person (the important part)
Open the downloaded `.json` in any text editor (VS Code is best). Keep the `lines` list open next to `items`.
For each item:
- **T (true)**: the lines in `sup` clearly say it, in other words.
- **F (false)**: a line in `sup` clearly says the opposite.
- **NG (not given)**: the passage does NOT say it and does NOT say the opposite. Models often get this wrong: if you can answer it from the passage, it is not NG, so delete it.
- `sup` numbers count from 1 inside `lines` (line 1 = first line of your passage).
- `why` must be one true, simple sentence.
- If `chk` says `copies line N`, reword the statement so it is not a copy.
Then: fix the wording, change `"r": 0` to `"r": 1` on every good item, delete the bad items. Keep about the same number of T, F and NG (for example 4 + 4 + 4).

## Part F. Publish and check (1 minute)
```
python tools/make_tfng_pack.py --publish BOOKID.ch3.tfng.json --reviewer "Your Name" --out packs
python tools/make_tfng_pack.py --verify packs/BOOKID.ch3.tfng.json.gz
```
`--verify` must show your counts and no `FAIL`. The file `packs/BOOKID.ch3.tfng.json.gz` is the finished pack.
```
python tools/make_tfng_pack.py --index packs --book BOOKID
```
This writes `packs/BOOKID.tfng-index.json`, the list the app reads to find your passages. Upload both files to the same place as your translation packs (`packs/`). Without the index file the app shows no trainer for that book.

## Notes
- Do not put any token or password in a notebook.
- The sample pack (`sample.p1...`) is only a demo: hand-written, not reviewed, marked `sample: true`. Do not ship it.
- Check the model's licence on its Hugging Face page before shipping packs (default model was Apache-2.0 when written).
