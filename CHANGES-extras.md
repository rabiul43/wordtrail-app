# CHANGES: extras skips for all books

File changed: `src/js/140-open-book.js` (then `python build.py`).

- Removed the `EX_BOOKS` list that limited extras to books 104, 10054 and 1113. Every book now looks for `extras/extras-<id>.json` on Hugging Face.
- A book with no file (404) is remembered for 1 day, so it is not requested on every open. A file that exists is reused for 10 minutes, as before.
- Books without an extras file play exactly as before.
- The "Skip extras (test)" switch in the player menu is still there (marked "remove later").

Tested: syntax check and build only. Playback not tested on a device.
