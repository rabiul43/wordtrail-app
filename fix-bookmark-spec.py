#!/usr/bin/env python3
"""
Updates tests/specs/05-bookmark.spec.js to the current app:
  - "My books" was renamed "My Library"
  - the bookmark button is now reached via  top menu (...) > More > Bookmark  (#btn-player-settings / #qk-more no longer exist)

Run from the repo root:  python fix-bookmark-spec.py      (or: python fix-bookmark-spec.py path/to/05-bookmark.spec.js)
Safe to run twice.
"""
import re, sys, pathlib

p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'tests/specs/05-bookmark.spec.js')
if not p.exists(): sys.exit(f"Can't find {p}. Run from the repo root or pass the path.")

raw = p.read_text(encoding='utf-8'); nl = '\r\n' if '\r\n' in raw else '\n'
s = raw.replace('\r\n', '\n'); orig = s

s = s.replace('My books', 'My Library')

old = re.compile(
    r"([ \t]*)await page\.locator\('#btn-player-settings'\)\.click\(\);[^\n]*\n"
    r"[ \t]*await page\.locator\('#qk-more'\)\.click\(\);[^\n]*\n"
    r"[ \t]*await page\.locator\('#b-bm'\)\.click\(\);[^\n]*\n")
new = (r"\1const more = page.locator('#dm-more');                                  // the menu's More row (stays open once opened)" "\n"
       r"\1if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();" "\n"
       r"""\1await page.locator('#dmenu [data-go="bm"]').click();                      // Bookmark row""" "\n")
s, n = old.subn(new, s)
if n == 0 and '#dm-more' not in s:
    print("! Could not find the old 3-line menu path in openBookmarkSheet() - send me the file.")

if s != orig:
    p.write_text(s.replace('\n', nl), encoding='utf-8'); print("Updated", p)
else:
    print("Nothing to change (already fixed).")
