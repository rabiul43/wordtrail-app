#!/usr/bin/env python3
"""Sound packs (Task 9): minimal pairs (ship / sheep) and connected speech (going to / "gonna") found in a book's OWN sentences, checked by a person, then published.
Free: no model, no key, no network. The candidates come from tools/sound-tables.json (word pairs and phrases), so the whole flow runs on any computer. Format and steps: SOUND-PACKS.md

    # 1. candidates: items found in lines 1-60 of a book, written to packs/<book>.<passage>.sound.json (all r = 0)
    python tools/make_sound_pack.py --text book.txt --book 1342 --passage ch3 --from-line 120 --to-line 180 --title "Pride and Prejudice"
    # 2. a person reads every item: sets "r": 1 on the right ones, deletes the rest
    # 3. publish (keeps only r = 1) and check
    python tools/make_sound_pack.py --publish packs/1342.ch3.sound.json --reviewer "Your Name"
    python tools/make_sound_pack.py --verify packs/1342.ch3.sound.json.gz
    # 4. the app finds a book's passages through an index file: rebuild it after every publish
    python tools/make_sound_pack.py --index packs --book 1342

Passage lines come from the same sentence splitter and key hash as the translation and TFNG packs (tools/make_translation_pack.py), so line keys match the app.
Exit codes: 0 done, 1 a check failed (--verify, --publish, --index), 2 bad arguments or a missing tool."""
import argparse, datetime, gzip, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_translation_pack import load_sentences, sentence_key, KEY_NAME, die   # the SAME splitter and the SAME key hash: no copy

FORMAT, INDEX, VERSION = 'wordtrail-sound-pack', 'wordtrail-sound-index', 1
TABLES = os.path.join(HERE, 'sound-tables.json')
MIN_LINES, MAX_LINES = 3, 60
TEXT_LICENSE = 'Project Gutenberg text, public domain in the US; check the status in your country'
DET = set('the a an my his her their our your this that these those'.split())   # "going to the market" is a trip, not the "gonna" future


# ---------- words: the SAME rule as LNC.words / LNC.fold in the app (tools/sound_drill_check.js compares them) ----------
def fold(w):
    w = unicodedata.normalize('NFD', w)
    w = ''.join(c for c in w if not unicodedata.combining(c)).lower()
    return re.sub(r"['\u2018\u2019\u02bc`]", '', w)


def toks(s):
    return [fold(m) for m in re.findall(r"[^\W_]+(?:['\u2018\u2019\u02bc`][^\W_]+)*", unicodedata.normalize('NFC', s))]


def load_tables(path=TABLES):
    try:
        t = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e:
        die('cannot read %s: %s' % (path, e))
    if t.get('format') != 'wordtrail-sound-tables' or t.get('v') != 1:
        die('%s is not a sound table' % path)
    return t


def maps(t):
    """-> (sounds: id -> label, pairs: id -> set of frozenset({a, b}), chunks: written phrase -> said form)"""
    sounds = {s['id']: s['label'] for s in t['sounds']}
    pairs = {s['id']: {frozenset(map(fold, p)) for p in s['pairs']} for s in t['sounds']}
    chunks = {c['c']: c['said'] for c in t['chunks']}
    return sounds, pairs, chunks


def find_seq(ws, seq):
    n = len(seq)
    for i in range(len(ws) - n + 1):
        if ws[i:i + n] == seq:
            return i
    return -1


# ---------- checks on one item (used by generate, publish and verify) ----------
def problems(it, lines, T):
    """-> list of reasons the item is NOT valid (empty = valid)."""
    sounds, pairs, chunks = maps(T)
    if not isinstance(it, dict):
        return ['not an object']
    bad, k, ln = [], it.get('k'), it.get('line')
    if it.get('r') not in (0, 1):
        bad.append('r must be 0 or 1')
    if k not in ('p', 'c'):
        return bad + ['k must be p (pair) or c (connected speech)']
    if not (isinstance(ln, int) and not isinstance(ln, bool) and 1 <= ln <= len(lines)):
        return bad + ['line must be a number 1-%d' % len(lines)]
    ws = toks(lines[ln - 1][1])
    if k == 'p':
        w, o, s = it.get('w'), it.get('o'), it.get('snd')
        if not (isinstance(w, str) and isinstance(o, str) and re.fullmatch(r'[a-z]{2,14}', w) and re.fullmatch(r'[a-z]{2,14}', o)) or w == o:
            return bad + ['w and o must be two different lower-case words']
        if s not in sounds:
            bad.append('snd is not a known sound')
        elif frozenset((w, o)) not in pairs[s]:
            bad.append('%s / %s is not a pair of sound %s in the table' % (w, o, s))
        if w not in ws:
            bad.append('the word "%s" is not in line %d' % (w, ln))
        if o in ws:
            bad.append('"%s" is also in line %d, so both answers would be right' % (o, ln))
    else:
        c, said = it.get('c'), it.get('said')
        if c not in chunks or chunks[c] != said:
            bad.append('c and said must be a pair of the table')
        elif find_seq(ws, [fold(x) for x in c.split(' ')]) < 0:
            bad.append('"%s" is not in line %d' % (c, ln))
    return bad


def item_id(it, lines):
    return sentence_key('%s:%s:%s' % (it['k'], lines[it['line'] - 1][0], it['w'] if it['k'] == 'p' else it['c']))


def hints(it, lines):
    """Hints for the reviewer, only in a candidates file (removed on publish)."""
    out, text = [], lines[it['line'] - 1][1]
    ws = toks(text)
    if it['k'] == 'p':
        i = ws.index(it['w']) if it['w'] in ws else -1
        raw = re.findall(r"[^\W_]+(?:['\u2018\u2019\u02bc`][^\W_]+)*", text)
        if i > 0 and raw[i][:1].isupper():
            out.append('capital letter inside the sentence: a name?')
        if len(ws) < 5:
            out.append('very short sentence')
    else:
        i = find_seq(ws, [fold(x) for x in it['c'].split(' ')])
        nxt = ws[i + len(it['c'].split(' '))] if 0 <= i and i + len(it['c'].split(' ')) < len(ws) else ''
        if it['c'] in ('going to', 'want to', 'wants to', 'got to') and nxt in DET:
            out.append('"%s %s": a place or a thing, not a reduced verb phrase' % (it['c'], nxt))
        if it['c'] == 'used to' and i > 0 and ws[i - 1] in ('be', 'get', 'got', 'am', 'is', 'are', 'was', 'were', 'been', 'getting'):
            out.append('"be used to": not the "usta" form')
        if it['c'] == 'out of' and nxt == '':
            out.append('sentence ends here')
    return out


def read_pack(path):
    try:
        if path.endswith('.gz'):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                return json.load(f)
        return json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e:
        die('cannot read %s: %s' % (path, e))


def check_pack(pack, T=None):
    """-> (list of failures, counts of valid approved items per kind)."""
    T = T or load_tables()
    bad = []
    if pack.get('format') != FORMAT or pack.get('v') != VERSION:
        return ['not a %s v%d file' % (FORMAT, VERSION)], {}
    if pack.get('key') != KEY_NAME:
        bad.append('key must be ' + KEY_NAME)
    lines = pack.get('lines')
    if not (isinstance(lines, list) and MIN_LINES <= len(lines) <= MAX_LINES and all(isinstance(r, list) and len(r) == 2 and all(isinstance(x, str) and x.strip() for x in r) for r in lines)):
        return bad + ['lines must be a list of %d-%d [key, text] rows' % (MIN_LINES, MAX_LINES)], {}
    for i, (k, t) in enumerate(lines):
        if k != sentence_key(t):
            bad.append('line %d: the key does not match its text' % (i + 1))
    items = pack.get('items') if isinstance(pack.get('items'), list) else []
    seen, counts = set(), {'p': 0, 'c': 0}
    for i, it in enumerate(items):
        for p in problems(it, lines, T):
            bad.append('item %d: %s' % (i + 1, p))
        if isinstance(it, dict) and not problems(it, lines, T):
            if it.get('id') != item_id(it, lines):
                bad.append('item %d: id is not the key of its line and word' % (i + 1))
            if it.get('id') in seen:
                bad.append('item %d: repeated item' % (i + 1))
            seen.add(it.get('id'))
            if it.get('r') == 1:
                counts[it['k']] += 1
    if pack.get('n') is not None and pack.get('n') != len(items):
        bad.append('n says %s but the file has %d items' % (pack.get('n'), len(items)))
    if not isinstance(pack.get('license'), str) or not pack['license'].strip():
        bad.append('license is missing')
    return bad, counts


def out_name(book, passage):
    return '%s.%s.sound.json' % (book, passage)


def generate(args):
    T = load_tables()
    sounds, pairs, chunks = maps(T)
    ordered = load_sentences(args)
    lo, hi = max(1, args.from_line), (args.to_line or len(ordered))
    lines = [list(x) for x in ordered[lo - 1:hi]]
    if len(lines) < MIN_LINES:
        die('a passage needs at least %d lines (got %d); check --from-line and --to-line' % (MIN_LINES, len(lines)))
    if len(lines) > MAX_LINES:
        die('a passage can have at most %d lines (got %d): use a smaller --from-line / --to-line range, or make two passages' % (MAX_LINES, len(lines)))
    items, per = [], {}
    for n, (key, text) in enumerate(lines, 1):
        ws = toks(text)
        if not 4 <= len(ws) <= 30:
            continue   # too short or too long to be a good clip
        made = {'p': False, 'c': False}   # at most one pair and one phrase per sentence
        for sid, label in sounds.items():
            for pr in T['sounds'][[s['id'] for s in T['sounds']].index(sid)]['pairs']:
                a, b = fold(pr[0]), fold(pr[1])
                for w, o in ((a, b), (b, a)):
                    if made['p'] or w not in ws or o in ws or per.get(('p', sid), 0) >= args.per_sound:
                        continue
                    it = {'k': 'p', 'line': n, 'w': w, 'o': o, 'snd': sid, 'r': 0}
                    made['p'] = True; per[('p', sid)] = per.get(('p', sid), 0) + 1
                    it['id'] = item_id(it, lines); items.append(it)
        for c, said in chunks.items():
            if made['c'] or per.get(('c', c), 0) >= args.per_phrase:
                continue
            if find_seq(ws, [fold(x) for x in c.split(' ')]) >= 0:
                it = {'k': 'c', 'line': n, 'c': c, 'said': said, 'r': 0}
                made['c'] = True; per[('c', c)] = per.get(('c', c), 0) + 1
                it['id'] = item_id(it, lines); items.append(it)
    flagged = 0
    for it in items:
        assert not problems(it, lines, T), (it, problems(it, lines, T))
        h = hints(it, lines)
        if h:
            it['chk'] = h; flagged += 1
    pack = {'format': FORMAT, 'v': VERSION, 'book': str(args.book), 'title': args.title or '', 'passage': args.passage, 'src': 'en', 'key': KEY_NAME,
            'engine': 'table', 'source': 'tools/sound-tables.json v%d' % T['v'], 'license': args.licence or T.get('license', 'check the table'), 'textLicense': TEXT_LICENSE,
            'made': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'from': lo, 'lines': lines, 'n': len(items), 'items': items}
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, out_name(args.book, args.passage))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)
    print('wrote %s: %d candidates (pairs %d, connected speech %d), %d flagged for the reviewer' % (path, len(items), sum(1 for x in items if x['k'] == 'p'), sum(1 for x in items if x['k'] == 'c'), flagged))
    print('NEXT: a person reads every item, sets "r": 1 on the right ones, deletes the rest, then --publish.')


def publish(args):
    pack = read_pack(args.publish)
    keep = [dict((k, v) for k, v in it.items() if k != 'chk') for it in pack.get('items', []) if isinstance(it, dict) and it.get('r') == 1]
    pack['items'], pack['n'] = keep, len(keep)
    pack['reviewed'] = {'by': args.reviewer or 'none', 'on': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')}
    if args.sample:
        pack['sample'] = True   # a reader must never use a pack with sample: true
    elif not args.reviewer:
        die('--reviewer "Name" is required: a published pack says who read it (use --sample only for a demo pack)')
    bad, counts = check_pack(pack)
    if not keep:
        bad.append('no item has "r": 1, nothing to publish')
    for b in bad:
        print('FAIL  : ' + b)
    if bad:
        sys.exit(1)
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, out_name(pack['book'], pack['passage']) + '.gz')
    with gzip.GzipFile(path + '.tmp', 'wb', compresslevel=9, mtime=0) as f:   # mtime 0: the same input gives the same bytes
        f.write(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    os.replace(path + '.tmp', path)
    print('wrote %s  (%d items: pairs %d, connected speech %d, %d bytes)' % (path, len(keep), counts['p'], counts['c'], os.path.getsize(path)))


def index(folder, book):
    """Writes <folder>/<book>.sound-index.json. Only packs that pass check_pack, are reviewed (or sample) and have 3 or more approved items are listed.
    The app never uses a sample pack, so an index of a sample pack is only for the tests."""
    pre, suf, rows, bad = '%s.' % book, '.sound.json.gz', [], []
    for f in sorted(os.listdir(folder)):
        if not (f.startswith(pre) and f.endswith(suf)):
            continue
        pack = read_pack(os.path.join(folder, f))
        fails, counts = check_pack(pack)
        if not (pack.get('reviewed') or pack.get('sample')):
            fails.append('not reviewed')
        if sum(counts.values()) < 3:
            fails.append('fewer than 3 approved items')
        if f != out_name(pack.get('book'), pack.get('passage')) + '.gz' or str(pack.get('book')) != str(book):
            fails.append('the file name does not match book and passage')
        if fails:
            bad.append('%s: %s' % (f, '; '.join(fails)))
        else:
            rows.append({'id': pack['passage'], 'n': sum(counts.values())})
    for b in bad:
        print('FAIL  : ' + b)
    if bad:
        return 1
    if not rows:
        print('FAIL  : no published packs for book %s in %s' % (book, folder))
        return 1
    path = os.path.join(folder, '%s.sound-index.json' % book)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'format': INDEX, 'v': 1, 'book': str(book), 'passages': rows}, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote %s  (%d passages: %s)' % (path, len(rows), ', '.join(r['id'] for r in rows)))
    return 0


def verify(path):
    pack = read_pack(path)
    bad, counts = check_pack(pack)
    items = pack.get('items') if isinstance(pack.get('items'), list) else []
    print('pack  : %s  book %s  passage %s  engine %s  licence %s' % (os.path.basename(path), pack.get('book'), pack.get('passage'), pack.get('engine'), pack.get('license')))
    print('items : %d, approved (r = 1): pairs %d, connected speech %d, waiting for review: %d' % (len(items), counts.get('p', 0), counts.get('c', 0), sum(1 for x in items if isinstance(x, dict) and x.get('r') == 0)))
    if pack.get('sample'):
        print('NOTE  : this is a SAMPLE pack. The app never uses it. Never ship it.')
    if path.endswith('.gz') and not pack.get('reviewed'):
        bad.append('a published pack needs a "reviewed" field')
    for b in bad:
        print('FAIL  : ' + b)
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description='Sound packs: minimal pairs and connected speech from a book\'s own sentences. Make candidates, publish the reviewed ones, verify.')
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--text', help='the book as a Project Gutenberg .txt file (needs Node.js)')
    src.add_argument('--sentences', help='sentences.json made by tools/pack_sentences.js (or a plain JSON list of sentences)')
    ap.add_argument('--book', help='book id (names the file)')
    ap.add_argument('--passage', default='p1', help='passage id, letters and digits (default p1); names the file')
    ap.add_argument('--title', default='', help='book title (information only)')
    ap.add_argument('--from-line', type=int, default=1, help='first sentence of the passage, counted from 1 (default 1)')
    ap.add_argument('--to-line', type=int, default=0, help='last sentence of the passage (default: the end; at most %d lines)' % MAX_LINES)
    ap.add_argument('--per-sound', type=int, default=4, help='candidates per sound contrast (default 4)')
    ap.add_argument('--per-phrase', type=int, default=3, help='candidates per connected-speech phrase (default 3)')
    ap.add_argument('--license', dest='licence', help='licence of the candidate table, written into the file (default: the one in the table)')
    ap.add_argument('--out', default='packs', help='output folder (default packs)')
    ap.add_argument('--publish', metavar='FILE', help='candidates file (.json) edited by a person -> the .json.gz with only r = 1 items')
    ap.add_argument('--reviewer', help='name of the person who read the items (required with --publish)')
    ap.add_argument('--sample', action='store_true', help='with --publish: mark the pack sample: true (a demo; the app never uses it)')
    ap.add_argument('--index', metavar='FOLDER', help='write FOLDER/<book>.sound-index.json from the published packs of --book')
    ap.add_argument('--verify', metavar='PACK', help='check a .json or .json.gz pack and print the counts')
    args = ap.parse_args()
    if args.verify:
        sys.exit(verify(args.verify))
    if args.publish:
        return publish(args)
    if args.index:
        if not args.book:
            die('--index needs --book')
        sys.exit(index(args.index, args.book))
    if not (args.text or args.sentences) or not args.book:
        ap.error('candidates need --text (or --sentences) and --book')
    if not re.fullmatch(r'[A-Za-z0-9]{1,40}', args.passage):
        die('--passage may only have letters and digits')
    generate(args)


if __name__ == '__main__':
    main()
