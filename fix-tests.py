#!/usr/bin/env python3
"""
Makes the Playwright tests work with the "New Home design" (phones: search box is behind the magnifier button).

Run from the repo root:   python fix-tests.py
(or pass the tests folder: python fix-tests.py path/to/tests)

What it changes (only inside tests/helpers and tests/specs, safe to run twice):
 1. helpers/app.js  -> search() first taps #st-search when #q is hidden
 2. any spec line   -> page.locator('#q').fill(...) gets the same tap in front of it
 3. any spec line   -> expect(page.locator('#q')).toBeVisible() becomes a check that works on phone AND desktop
"""
import re, sys, pathlib

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'tests')
if not root.is_dir():
    sys.exit(f"Can't find the tests folder '{root}'. Run this from the repo root or pass the path.")

TAP = "if (!(await page.locator('#q').isVisible())) await page.locator('#st-search').click();"
HOME_OK = "expect(page.locator('#q:visible, #st-search:visible')).toBeVisible()"
MARK = "/* wt-home-fix */"
changed = []

def rw(path, fn):
    old = path.read_text(encoding='utf-8')
    nl = '\r\n' if '\r\n' in old else '\n'
    new = fn(old.replace('\r\n', '\n')).replace('\n', nl)
    if new != old:
        path.write_text(new, encoding='utf-8'); changed.append(str(path))

# 1. the shared search() helper
def fix_helper(s):
    if MARK in s: return s
    pat = re.compile(r"(async function search\(page, term\) \{\n)")
    if not pat.search(s):
        print("  ! could not find 'async function search(page, term) {' in", helper); return s
    return pat.sub(lambda m: m.group(1) + f"  {MARK} {TAP}\n", s, count=1)

helper = root / 'helpers' / 'app.js'
if helper.exists(): rw(helper, fix_helper)
else: print("  ! tests/helpers/app.js not found")

# 2 + 3. the specs
def fix_spec(s):
    s = s.replace("expect(page.locator('#q')).toBeVisible()", HOME_OK)
    out = []
    for line in s.split('\n'):
        if re.search(r"await page\.locator\('#q'\)\.fill\(", line) and TAP not in (out[-1] if out else ''):
            indent = re.match(r"\s*", line).group(0)
            out.append(f"{indent}{TAP}")
        out.append(line)
    return '\n'.join(out)

for spec in sorted((root / 'specs').glob('*.js')):
    rw(spec, fix_spec)

print("Changed:" if changed else "Nothing to change (already fixed).")
for c in changed: print("  -", c)
