#!/usr/bin/env python3
"""List what a language file still lacks, compared with the reference language (default: bn, the fullest).
    python tools/i18n_check.py xx            # keys in bn.json that xx.json does not have
    python tools/i18n_check.py xx --ref es   # compare against another file
Also flags empty values and a few common mistakes (keys with leading/trailing spaces, broken regex)."""
import json, os, re, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "i18n")
code = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
ref = sys.argv[sys.argv.index("--ref") + 1] if "--ref" in sys.argv else "bn"
load = lambda c: json.load(open(os.path.join(root, c + ".json"), encoding="utf-8"))
a, r = load(code), load(ref)
miss = [k for k in r["dict"] if k not in a["dict"]]
print(f"{code}: {len(a['dict'])} words, {len(miss)} missing vs {ref} ({len(r['dict'])})")
for k in miss: print("  -", k)
for k, v in a["dict"].items():
    if not v.strip(): print("EMPTY:", k)
    if k != k.strip(): print("KEY HAS OUTER SPACES (never matches):", repr(k))
for pat, _ in a.get("rx", []):
    try: re.compile(pat)
    except re.error as e: print("BAD REGEX:", pat, e)
