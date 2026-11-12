#!/usr/bin/env python3
"""Share of academic words per book -> a small academic.json (Task 54).

Input  : the existing per-book vocabulary files  vocab/<book id>.json
         ({"v":1,"w":[[word, CEFR, times in the book, example], ...]}), downloaded from the data host.
         Optional: a CSV "book id,accent" (accent = british | american) if you keep one.
Output : academic.json
         {"v":1,"min":5,"b":{"<book id>": percent, ...},"a":{"<book id>": 0 british | 1 american, ...}}
         "b" only holds books with at least 8 listed words and at least 1 percent. "a" only exists when --accents is given.
Percent: occurrences of academic-word-list words among the listed words of the book (each word counted
         as often as the file says it occurs), rounded. It is a share of the LISTED words, not of the
         whole running text, because the files only list words.
Run    : python tools/academic_share.py --vocab-dir vocab --out academic.json [--accents accents.csv] [--words list.txt]
Check  : python tools/academic_share.py --self-test
"""
import argparse, csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MIN_WORDS = 8          # same minimum as the book preview (BPC.MIN_WORDS)
IELTS_MIN = 5          # percent from which the app calls a book IELTS-friendly
SUFFIXES = ['ations', 'ation', 'ments', 'ment', 'ities', 'ity', 'ings', 'ing', 'ions', 'ion', 'ives', 'ive',
            'ally', 'ously', 'ous', 'ical', 'ally', 'ness', 'ers', 'er', 'ors', 'or', 'ics', 'ic', 'als', 'al',
            'ly', 'ed', 'es', 's', 'e']


def stem(w):
    """Crude word-family key: strip common endings while at least 4 letters stay."""
    w = w.lower()
    changed = True
    while changed:
        changed = False
        for s in SUFFIXES:
            if w.endswith(s) and len(w) - len(s) >= 4:
                w = w[:-len(s)]
                changed = True
                break
    return w


def load_words(path):
    heads = [l.strip().lower() for l in open(path, encoding='utf-8') if l.strip() and not l.startswith('#')]
    return heads, {stem(h) for h in heads} | set(heads)


def share(words, awl):
    """words: the "w" list of a vocab file. Returns (percent, listed words) or None when too few words."""
    seen, tot, acad = set(), 0, 0
    for x in words if isinstance(words, list) else []:
        if not isinstance(x, list) or not x or not isinstance(x[0], str):
            continue
        w = x[0].strip().lower()
        if not w.isalpha() or w in seen:
            continue
        seen.add(w)
        c = max(1, int(x[2])) if len(x) > 2 and isinstance(x[2], (int, float)) else 1
        tot += c
        if w in awl or stem(w) in awl:
            acad += c
    if len(seen) < MIN_WORDS or not tot:
        return None
    return round(100.0 * acad / tot), len(seen)


def build(vocab_dir, awl, accents=None):
    b = {}
    for name in sorted(os.listdir(vocab_dir)):
        if not name.endswith('.json'):
            continue
        try:
            d = json.load(open(os.path.join(vocab_dir, name), encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(d, dict) or d.get('v') != 1:
            continue
        r = share(d.get('w'), awl)
        if r and r[0] >= 1:
            b[name[:-5]] = r[0]
    out = {'v': 1, 'min': IELTS_MIN, 'b': b}
    if accents:
        out['a'] = {k: v for k, v in accents.items() if k in b}
    return out


def read_accents(path):
    m = {}
    for row in csv.reader(open(path, encoding='utf-8')):
        if len(row) >= 2 and row[0].strip().isdigit():
            a = row[1].strip().lower()
            if a in ('british', 'american'):
                m[row[0].strip()] = 0 if a == 'british' else 1
    return m


def self_test():
    import tempfile
    heads, awl = load_words(os.path.join(HERE, 'awl_words.txt'))
    assert len(heads) == 570, len(heads)
    assert 'significant' in awl and stem('significantly') in awl and stem('indicated') in awl
    assert 'whale' not in awl and stem('captain') not in awl
    words = [[w, 'C1', 2, ''] for w in ['significant', 'analysis', 'whale', 'captain', 'harpoon', 'ocean', 'sail', 'storm', 'crew']]
    r = share(words, awl)                       # significant=academic; analysis only if stem matches; others not
    assert r and r[1] == 9 and 0 < r[0] < 30, r
    assert share(words[:5], awl) is None        # fewer than 8 words
    with tempfile.TemporaryDirectory() as t:
        json.dump({'v': 1, 'w': [[w, 'B2', 3, ''] for w in ['issue', 'method', 'research', 'estimate', 'factor', 'sector', 'tree', 'river', 'hill']]}, open(os.path.join(t, '1.json'), 'w'))
        json.dump({'v': 1, 'w': [[w, 'B2', 3, ''] for w in ['tree', 'river', 'hill', 'wolf', 'moon', 'fog', 'owl', 'oak']]}, open(os.path.join(t, '2.json'), 'w'))
        json.dump({'v': 1, 'w': [['issue', 'B2', 3, '']]}, open(os.path.join(t, '3.json'), 'w'))
        open(os.path.join(t, '4.json'), 'w').write('not json')
        o = build(t, awl)
        assert o['b'] == {'1': 67}, o
        assert len(json.dumps(o, separators=(',', ':'))) < 200
    print('self-test OK')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vocab-dir'); ap.add_argument('--out', default='academic.json')
    ap.add_argument('--words', default=os.path.join(HERE, 'awl_words.txt')); ap.add_argument('--accents')
    ap.add_argument('--self-test', action='store_true')
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not a.vocab_dir:
        ap.error('--vocab-dir is required')
    _, awl = load_words(a.words)
    out = build(a.vocab_dir, awl, read_accents(a.accents) if a.accents else None)
    txt = json.dumps(out, separators=(',', ':'))
    open(a.out, 'w', encoding='utf-8').write(txt)
    print('%d books, %d bytes -> %s' % (len(out['b']), len(txt.encode()), a.out))


if __name__ == '__main__':
    main()
