#!/usr/bin/env python3
"""Checks skip-time files (extras-<book id>.json) before they are uploaded, and lists what looks wrong.

    python tools/extras_check.py                 # checks every extras-*.json in extras_upload/
    python tools/extras_check.py some/folder     # or another folder
    python tools/extras_check.py extras-104.json # or one file
    python tools/extras_check.py --ids ids.txt   # also lists the book ids in ids.txt (one per line) that have no file yet

A file is "BAD" when the app could misread it, "CHECK" when a skip time looks odd and is worth hearing once, and "ok" otherwise.
Exit code 1 if any file is BAD.
"""
import glob, json, os, statistics, sys

HEAD_MIN, HEAD_MAX = 4.0, 60.0      # a LibriVox notice is spoken in roughly 8 to 40 seconds
ODD_FROM_MEDIAN = 8.0               # a notice this many seconds away from the book's typical one is worth a listen
TAIL_MIN_START = 60.0               # an outro cannot start in the first minute

def check(path):
    bad, odd, info = [], [], []
    try:
        d = json.load(open(path, encoding='utf-8'))
    except Exception as e:
        return ['cannot read file: %s' % e], [], [], 0, 0
    if d.get('v') != 1 or not isinstance(d.get('tracks'), dict):
        return ['needs "v": 1 and a "tracks" object (the app ignores the file otherwise)'], [], [], 0, 0
    want = os.path.basename(path)[len('extras-'):-len('.json')] if os.path.basename(path).startswith('extras-') else ''
    if want and str(d.get('bid', want)) != want:
        bad.append('file name says book %s but the file says %s' % (want, d.get('bid')))
    heads, n = {}, len(d['tracks'])
    for k, cuts in d['tracks'].items():
        if not str(k).isdigit():
            bad.append('track key %r is not a number' % k); continue
        if not isinstance(cuts, list):
            bad.append('track %s: cuts must be a list' % k); continue
        h = [c for c in cuts if len(c) > 2 and c[2] == 'head']
        t = [c for c in cuts if len(c) > 2 and c[2] == 'tail']
        for c in cuts:
            if len(c) < 3 or c[2] not in ('head', 'tail', 'mid'):
                bad.append('track %s: unknown cut %r' % (k, c)); continue
            if c[2] in ('head', 'mid') and (c[1] is None or not c[1] > c[0]):
                bad.append('track %s: %s cut %r ends before it starts' % (k, c[2], c))
            if c[0] is not None and c[0] < 0:
                bad.append('track %s: negative time in %r' % (k, c))
        if len(h) > 1: bad.append('track %s: more than one head cut' % k)
        if len(t) > 1: bad.append('track %s: more than one tail cut' % k)
        if h and h[0][1] is not None:
            e = h[0][1]
            if h[0][0] and h[0][0] > 0.5:
                info.append('track %s: head starts at %.1fs, so the spoken title before it is kept (fine if intended)' % (k, h[0][0]))
            if not HEAD_MIN <= e <= HEAD_MAX:
                odd.append('track %s: notice ends at %.1fs (usual range %d to %d s)' % (k, e, HEAD_MIN, HEAD_MAX))
            heads[k] = e
        else:
            info.append('track %s: no head cut, so the app plays this chapter from the start' % k)
        if t and t[0][0] is not None:
            if t[0][0] < TAIL_MIN_START: odd.append('track %s: outro starts at %.1fs, very early' % (k, t[0][0]))
            if h and h[0][1] and t[0][0] <= h[0][1]: bad.append('track %s: outro starts before the notice ends' % k)
    if len(heads) >= 4:
        m = statistics.median(heads.values())
        for k, e in heads.items():
            if abs(e - m) > ODD_FROM_MEDIAN:
                odd.append('track %s: notice ends at %.1fs but this book usually has about %.1fs' % (k, e, m))
    return bad, odd, info, n, len(heads)

def main(argv):
    ids = None
    if '--ids' in argv:
        i = argv.index('--ids'); ids = [x.strip() for x in open(argv[i + 1]) if x.strip()]; del argv[i:i + 2]
    target = argv[0] if argv else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'extras_upload')
    files = [target] if os.path.isfile(target) else sorted(glob.glob(os.path.join(target, 'extras-*.json')))
    if not files: print('no extras files found in', target); return 1
    nbad = 0
    for f in files:
        bad, odd, info, n, nh = check(f)
        state = 'BAD' if bad else 'CHECK' if odd else 'ok'
        nbad += bool(bad)
        print('%-6s %s  (%d tracks, %d with a notice cut)' % (state, os.path.basename(f), n, nh))
        for m in bad: print('    BAD    ' + m)
        for m in odd: print('    check  ' + m)
        if n and nh < n: print('    note   %d of %d tracks have no head cut' % (n - nh, n))
    if ids is not None:
        have = {os.path.basename(f)[len('extras-'):-len('.json')] for f in files}
        miss = [x for x in ids if x not in have]
        print('\n%d of %d book ids have no file yet%s' % (len(miss), len(ids), ':' if miss else '.'))
        if miss: print(' '.join(miss))
    print('\n%d file(s) checked, %d bad' % (len(files), nbad))
    return 1 if nbad else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
