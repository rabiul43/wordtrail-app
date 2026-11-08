# Step 2: book text made from the speech-recognition timing file

When a book is not on Gutenberg (the Step 1 card), the app now looks for the book's timing file and, if one exists, builds the text from the words in it.

- File used: the same "pack" the app already loads for synced books (`wt_packs_v2/<id>.json.gz`, then `wt_packs/<id>.json.gz` on Hugging Face), already held in `S.timings` by `fetchTimings`. `wt_merged` files are NOT used: they only hold times matched to Gutenberg text, no recognized words.
- Shape read: `tracks[i] = { u, w (words, one string), t (one start time per word), q, omit, rep }`. `w` and `t` have the same count. `q`, `omit`, `rep` are not used (they describe a match against a Gutenberg text).
- A track is used only if its audio file name matches the recording, its words and times agree in number, it has at least 20 words and its times do not run past the track length.
- LibriVox intro/outro: cut with the notice engine (`neFindIntro`/`neFindOutro`, 265). Only trusted finds ("h") are cut; a weak find keeps the words.
- Text: a full stop and a capital after a pause (0.9 s, or 0.4 s after 40 words, or any pause after 75 words, always after 110 words), a new paragraph at a pause of 1.6 s after a sentence end or 2.2 s otherwise. A split "'S" is joined, LibriVox is spelled one way. No other words are changed. A spoken "Chapter eight." standing alone is joined to the next paragraph (it would break the one-part-per-track layout).
- Each track with words starts at a "Track N" heading and maps to exactly that part. Word times: the existing alignment (`alignTrackToBook`) lines the file's words up with the built text (about 100%).
- The text is saved on the device like an own text (`src.asr = 1`), so reopening the book skips the work. A banner above the text says "Text made from speech recognition, may have errors." with "Choose another text" and "Open the text source".
- No file (404), no usable words, or fewer than 300 words: nothing changes, the Step 1 card stays.
- Code: 140 (`asrTrackText`, `asrTrackFor`, `asrBuild`, `asrCutFor`, `tryAsrText`, `asrBanner`), 150 (banner), `src/i18n/*.json` (3 new lines). Checks: tools/unit_check.js (66 pass), including a run on tools/samples/timing-104.json.gz.

- Together with Step 3: the card first shows the message and "Open the text source" only. While the timing file is checked, there is no archive.org button. If no timing-file text can be made, the card is redrawn with "Try the text from archive.org" (when there is an archive.org link). If the timing-file text loads, the card is replaced by the text and the archive.org button never appears.
