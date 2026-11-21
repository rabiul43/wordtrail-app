#!/usr/bin/env python3
"""Offline test for tools/texts_status.py (Task 6a). Fake lists, fake searches, fake Hugging Face. No internet.
Run:  python tools/texts_status_check.py        Last line must say "0 failed".
Optional: put catalog.json next to this folder (or set CATALOG=path) to also run the real-catalog check."""
import gzip, importlib.util, io, json, os, re, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('texts_status', os.path.join(HERE, 'texts_status.py'))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)

passed = failed = 0


def ok(cond, name):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print('FAIL:', name)


def book(id, title, authors, last, lang='English', gid=0, arch='', secs=100):
    return {'id': id, 'title': title, 'authors': authors, 'last': last, 'lang': lang, 'gid': gid, 'arch': arch, 'secs': secs}


def H(gid, title, authors, langs=('en',)):
    return [gid, title, list(authors), list(langs)]


# ---- 1. title helpers
ok(T.clean_title('Emma (version 2)') == 'Emma', 'drops (version 2)')
ok(T.clean_title('Robin Hood (Dramatic Reading)') == 'Robin Hood', 'drops (Dramatic Reading)')
ok(T.clean_title('Bible (Volume 1)') == 'Bible (Volume 1)', 'keeps (Volume 1)')
ok(T.norm('Les Misérables') == 'les miserables', 'accents')
ok(T.title_numbers('Short Poetry Collection 029') == {29}, 'numbers')
ok(T.title_numbers('World\'s Story Volume XI') == {11}, 'roman after Volume')
ok(T.title_numbers('I Am Legend') == set(), 'pronoun I is not a number')
ok('pride and prejudice' in T.title_forms('Pride and Prejudice; or, First Impressions'), 'main part before ;')

# ---- 2. matching: the right book is found, the wrong one never
A = book(1, 'Pride and Prejudice', 'Jane Austen', 'Austen')
ok(T.decide(A, [H(1342, 'Pride and Prejudice', ['Austen, Jane'])])['gid'] == 1342, 'exact match found')
ok(T.decide(A, [H(1342, 'Pride and Prejudice', ['Austen, Jane'])])['kind'] == 'found', 'exact kind found')
ok(T.decide(A, [H(1342, 'Pride and Prejudice; or, First Impressions', ['Austen, Jane'])])['kind'] == 'found', 'subtitle ok')
ok(T.decide(A, [H(5, 'Pride and Prejudice', ['Brontë, Charlotte'])])['kind'] == 'maybe', 'same title, other author -> only maybe')
ok(T.decide(A, [H(6, 'Pride and Prejudice', ['Austen, Jane'], ['de'])])['kind'] == 'none', 'other language -> not used')
ok(T.decide(A, [H(7, 'Sense and Sensibility', ['Austen, Jane'])])['kind'] == 'none', 'same author, other title -> none')
ok(T.decide(book(2, 'Emma (version 2)', 'Jane Austen', 'Austen'), [H(158, 'Emma', ['Austen, Jane'])])['kind'] == 'found', 'label ignored')
ok(T.decide(book(3, 'Les Misérables', 'Victor Hugo', 'Hugo', 'French'), [H(1, 'Les miserables', ['Hugo, Victor'], ['fr'])])['kind'] == 'found', 'accents ok')
V1 = book(4, 'Les Miserables Vol 1', 'Victor Hugo', 'Hugo')
d = T.decide(V1, [H(9, 'Les Miserables, Volume 2', ['Hugo, Victor'])])
ok(d['kind'] == 'maybe' and 'volume' in d['why'], 'other volume number is not used')
ok(T.decide(V1, [H(9, 'Les Miserables, Volume 1', ['Hugo, Victor'])])['kind'] == 'found', 'same volume found')
d = T.decide(A, [H(1, 'Pride and Prejudice', ['Austen, Jane']), H(2, 'Pride and Prejudice', ['Austen, Jane'])])
ok(d['kind'] == 'maybe' and 'more than one' in d['why'], 'two different Gutenberg books fit -> maybe')
P = book(5, 'The Complete Poetical Works', 'Lord Byron', 'Byron')
ok(T.decide(P, [H(10, 'The Complete Poetical Works of Lord Byron', ['Byron, Lord'])])['kind'] == 'found', 'long prefix with author ok')
S = book(6, 'Poems', 'Lord Byron', 'Byron')
ok(T.decide(S, [H(11, 'Poems of Lord Byron', ['Byron, Lord'])])['kind'] != 'found', 'short prefix is not enough')
# Various / unknown authors: strict
VA = book(7, 'Christmas Stories of Long Ago', 'Various', 'Various')
ok(T.decide(VA, [H(20, 'Christmas Stories of Long Ago', [])])['kind'] == 'found', 'various: exact title, no named author')
ok(T.decide(VA, [H(20, 'Christmas Stories of Long Ago', ['Dickens, Charles'])])['kind'] == 'maybe', 'various: named author -> only maybe')
ok(T.decide(book(8, 'Poems', 'Various', 'Various'), [H(21, 'Poems', [])])['kind'] != 'found', 'various: one-word title never sure')
ok(T.decide(book(9, 'Short Poetry Collection 029', 'Various', 'Various'), [H(22, 'Short Poetry Collection 030', [])])['kind'] != 'found', 'numbered series differs')
ok(T.decide(book(10, 'Mystery', 'LibriVox Volunteers', 'LibriVox Volunteers'), [H(23, 'Mystery', ['Doyle'])])['kind'] != 'found', 'LibriVox volunteers is generic')
ok(T.decide(A, [])['kind'] == 'none', 'no hits')
ok(T.decide(book(11, 'Ο γάμος της Λίτσας (Litsa\'s Marriage)', 'Gregorios Xenopoulos', 'Xenopoulos', 'Greek'),
            [H(30, 'Litsa\'s Marriage', ['Xenopoulos, Gregorios'], ['el'])])['kind'] == 'found', 'bracket name used as second title')

# ---- 3. queries and searching
ok(T.build_queries(A) == ['Pride and Prejudice Austen', 'Pride and Prejudice'], 'queries named')
ok(T.build_queries(VA) == ['Christmas Stories of Long Ago'], 'queries various: title only')
ok(len(T.build_queries(book(1, 'Emma (version 2)', 'J A', 'Austen'))) <= 3, 'max 3 queries')


def fake_fetch_factory(table, log):
    def fetch(url):
        q = url.split('search=')[1]
        q = T.urllib.request.unquote(q)
        log.append(q)
        return {'results': table.get(q, [])}
    return fetch


def G(id, title, authors, langs=('en',)):
    return {'id': id, 'title': title, 'authors': [{'name': a} for a in authors], 'languages': list(langs)}


log = []
f = fake_fetch_factory({'Pride and Prejudice Austen': [G(1342, 'Pride and Prejudice', ['Austen, Jane'])]}, log)
r = T.search_book(A, f)
ok(r['q'] == 1 and len(log) == 1 and r['h'][0][0] == 1342, 'search stops after a sure match')
log.clear()
r = T.search_book(A, fake_fetch_factory({}, log))
ok(r['q'] == 2 and r['h'] == [], 'search tries both questions when nothing is found')


def boom(url):
    raise RuntimeError('down')
cache = {}
st = T.run_searches([A], cache, boom, 1, 0, None, None, 10, sleep=lambda s: None)
ok(cache == {} and st['failed'] == [1], 'a failed search is not saved (it is retried next time)')

# ---- 4. resume: stop by time, run again, nothing searched twice
books = [book(100 + i, 'Title %d Name' % i, 'Author %d' % i, 'Writer%d' % i) for i in range(25)]
calls = []
table = {}
now = [0.0]
st = T.run_searches(books, {}, fake_fetch_factory(table, calls), 2, 0, deadline=-1, chunk=10, clock=lambda: now[0], sleep=lambda s: None)
ok(st['stopped'] == 'time' and not calls, 'deadline already passed: nothing searched, stopped=time')
cache = {}
n1 = []


def clock1():
    return 0 if len(n1) < 1 else 99
def save(c):
    n1.append(len(c))
st = T.run_searches(books, cache, fake_fetch_factory(table, calls), 2, 0, deadline=50, save=save, chunk=10, clock=clock1, sleep=lambda s: None)
ok(st['stopped'] == 'time' and len(cache) == 10, 'stops between chunks when time is up (10 done)')
calls.clear()
todo = [b for b in books if str(b['id']) not in cache]
st = T.run_searches(todo, cache, fake_fetch_factory(table, calls), 2, 0, sleep=lambda s: None, chunk=10)
ok(len(cache) == 25 and len(todo) == 15, 'second run finishes the other 15')
ok(not any(str(b['id']) in {t for t in []} for b in books) and len(calls) == 15 * 2, 'no book searched twice (15 books x 2 questions)')
down = T.run_searches(books[:12], {}, boom, 1, 0, None, None, 3, sleep=lambda s: None)
ok(down['stopped'] == 'down', 'search site down: stops after 3 empty chunks')

# ---- 5. status building with fake lists
cat_books = [
    book(1, 'Pride and Prejudice', 'Jane Austen', 'Austen', gid=1342, arch='x'),      # catalog number, file in Book_Text
    book(2, 'Some Rare Book', 'John Doe', 'Doe', gid=99999),                        # catalog number, file NOT in Book_Text
    book(3, 'Emma', 'Jane Austen', 'Austen', arch='emma_lv'),                         # found by search
    book(4, 'Timing Only', 'A B', 'B'),                                               # timing file
    book(5, 'Archive Only', 'A B', 'B', arch='arch5'),                                 # archive
    book(6, 'Nothing Here', 'A B', 'B', secs=0),                                      # none
    book(7, 'Doubtful Book', 'John Doe', 'Doe'),                                      # maybe only
    book(8, 'Not Searched Yet', 'A B', 'B'),
]
fcache = {'3': {'h': [H(158, 'Emma', ['Austen, Jane'])], 'q': 1},
          '4': {'h': [], 'q': 2}, '5': {'h': [], 'q': 2}, '6': {'h': [], 'q': 2},
          '7': {'h': [H(55, 'Doubtful Book', ['Smith, Sam'])], 'q': 2}}
tj, fj, mj, counts, extra = T.build_status(cat_books, fcache, {1342, 158}, {4, 3}, 'NOW')
ok(tj['b']['1'] == [1342, 'ha'], 'book 1 flags')
ok(tj['b']['2'] == [99999, ''], 'book 2: number kept, no file')
ok(tj['b']['3'] == [158, 'hpas'], 'book 3: found by search, in Book_Text, timing file, archive')
ok(tj['b']['4'] == [0, 'p'] and tj['b']['5'] == [0, 'a'] and tj['b']['6'] == [0, ''], 'books 4 5 6')
ok(tj['b']['7'] == [0, ''] and '7' in mj['b'] and '7' not in fj['b'], 'doubtful match is listed, not used')
ok(extra['unsearched'] == [8], 'unsearched book is reported')
ok(counts == {'gut_own': 2, 'gut_catalog': 1, 'gut_found': 0, 'timing': 1, 'archive': 1, 'none': 3}, 'counts by best source: %s' % counts)
try:
    T.check_outputs(cat_books, tj, fj, mj, 1000)
    ok(True, 'check passes')
except AssertionError as e:
    ok(False, 'check passes: %s' % e)
bad = json.loads(json.dumps(tj)); bad['b']['1'] = [1111, 'h']
try:
    T.check_outputs(cat_books, bad, fj, mj, 1000); ok(False, 'changed catalog number must be caught')
except AssertionError:
    ok(True, 'changed catalog number must be caught')
try:
    T.check_outputs(cat_books, tj, fj, mj, 2_000_000); ok(False, 'too big must be caught')
except AssertionError:
    ok(True, 'too big must be caught')
rep = T.make_report(cat_books, tj, fj, mj, counts, extra, 2, 2, 'NOW')
ok('no text anywhere' in rep and 'NOT SEARCHED' in rep and 'found by search' in rep, 'report text')


# ---- 6. whole run with a fake Hugging Face
class FakeHub:
    def __init__(self, corrupt=False):
        self.files, self.commits, self.puts, self.corrupt = {}, 0, 0, corrupt

    def get_bytes(self, repo, path):
        d = self.files.get((repo, path))
        return (d + b'x') if (d is not None and self.corrupt and path.endswith('texts.json')) else d

    def put_bytes(self, repo, path, data, msg):
        self.files[(repo, path)] = data
        self.puts += 1

    def commit(self, repo, files, msg):
        self.commits += 1
        for p, d in files.items():
            self.files[(repo, p)] = d

    def list_gids(self):
        return {1342, 158}

    def list_pack_ids(self):
        return {4}


cat = {'b': [[b['id'], b['title'], b['authors'], b['last'], b['lang'], str(b['gid']) if b['gid'] else '', b['secs'], 1, b['arch'], '', ''] for b in cat_books], 'n': 8, 'v': 1}
tbl = {'Emma Austen': [G(158, 'Emma', ['Austen, Jane'])]}
with tempfile.TemporaryDirectory() as wd:
    lines = []
    hub = FakeHub()
    calls = []
    res = T.run('full', hub=hub, fetch=fake_fetch_factory(tbl, calls), catalog=cat, workdir=wd, out=lines.append, sleep=lambda s: None, delay=0)
    ok(res['finished'] and hub.commits == 1, 'full run finishes with ONE upload step')
    names = sorted(p for (r, p) in hub.files)
    ok(names == ['status/_work/search-cache.json.gz', 'status/found-gutenberg.json', 'status/maybe-gutenberg.json', 'status/texts-report.txt', 'status/texts.json'], 'files written: %s' % names)
    tj2 = json.loads(hub.files[(T.BOOK_TEXT, 'status/texts.json')])
    ok(tj2['n'] == 8 and tj2['b']['3'][0] == 158, 'texts.json content')
    ok(any('FINAL COUNT CHECK' in l and 'ALL GOOD' in l for l in lines), 'final count check printed')
    # resume: a second run on a fresh notebook disk restores the work file and searches nothing
    with tempfile.TemporaryDirectory() as wd2:
        calls2 = []
        res = T.run('full', hub=hub, fetch=fake_fetch_factory(tbl, calls2), catalog=cat, workdir=wd2, out=lambda s: None, sleep=lambda s: None, delay=0)
        ok(res['finished'] and not calls2, 'rerun on a new session restores the work file: 0 new searches')
    # a stop in the middle (time) keeps the work and writes no status list
    hubB = FakeHub()
    with tempfile.TemporaryDirectory() as wd3:
        lines = []
        res = T.run('full', hub=hubB, fetch=fake_fetch_factory(tbl, []), catalog=cat, workdir=wd3, max_hours=0, out=lines.append, sleep=lambda s: None, delay=0)
        ok(res['finished'] is False and hubB.commits == 0 and (T.BOOK_TEXT, T.CACHE_PATH) in hubB.files, 'time limit: work saved, no status list written')
        ok(any('Run this cell again' in l for l in lines), 'tells you to run again')
    # read-back that differs is caught
    with tempfile.TemporaryDirectory() as wd4:
        try:
            T.run('full', hub=FakeHub(corrupt=True), fetch=fake_fetch_factory(tbl, []), catalog=cat, workdir=wd4, out=lambda s: None, sleep=lambda s: None, delay=0)
            ok(False, 'corrupt read-back must stop the run')
        except SystemExit as e:
            ok('FINAL CHECK FAILED' in str(e), 'corrupt read-back must stop the run')
    # empty list from Hugging Face: refuse to write
    class EmptyHub(FakeHub):
        def list_gids(self):
            return set()
    with tempfile.TemporaryDirectory() as wd5:
        try:
            T.run('full', hub=EmptyHub(), fetch=fake_fetch_factory(tbl, []), catalog=cat, workdir=wd5, out=lambda s: None, sleep=lambda s: None, delay=0)
            ok(False, 'empty list must stop the run')
        except SystemExit:
            ok(True, 'empty list must stop the run')

# ---- 7. trial mode: prints a table, uploads nothing, needs no key
big = [book(1000 + i, 'Book Number %d Story' % i, 'Anna Writer%d' % i, 'Writer%d' % i, gid=(5000 + i if i % 3 == 0 else 0)) for i in range(60)]
bcat = {'b': [[b['id'], b['title'], b['authors'], b['last'], b['lang'], str(b['gid']) if b['gid'] else '', 1, 1, '', '', ''] for b in big]}


def trial_fetch(url):
    q = T.urllib.request.unquote(url.split('search=')[1])
    for b in big:
        if b['gid'] and q.startswith(b['title']):
            return {'results': [G(b['gid'], b['title'], ['%s, Anna' % b['last']])]}
    return {'results': []}
with tempfile.TemporaryDirectory() as wd6:
    lines = []
    res = T.run('trial', trial_n=8, trial_check=6, fetch=trial_fetch, catalog=bcat, workdir=wd6, out=lines.append, sleep=lambda s: None, delay=0)
    ok(res['wrong'] == 0 and res['right'] == 6, 'trial: all 6 known books found with the same number, 0 wrong')
    ok(any(l.startswith('id ') or l.startswith('id') for l in lines) and any('Nothing was uploaded' in l for l in lines), 'trial prints a table and says nothing was uploaded')
    calls3 = []
    res2 = T.run('trial', trial_n=8, trial_check=6, fetch=fake_fetch_factory({}, calls3), catalog=bcat, workdir=wd6, out=lambda s: None, sleep=lambda s: None, delay=0)
    ok(not calls3, 'trial is resumable: second run searches nothing')
    # a wrong pick is reported loudly: the fake site returns another book's number for a known book
    def liar(url):
        return {'results': [G(424242, T.urllib.request.unquote(url.split('search=')[1]).rsplit(' ', 1)[0], ['Writer0, Anna'])]}
    with tempfile.TemporaryDirectory() as wd7:
        r = T.run('trial', trial_n=0, trial_check=6, fetch=liar, catalog=bcat, workdir=wd7, out=lambda s: None, sleep=lambda s: None, delay=0)
        ok(r['wrong'] >= 1, 'trial counts a WRONG pick')

# ---- 8. no key in any file, notebook is one cell
for fn in ['texts_status.py', 'texts_status_check.py']:
    s = open(os.path.join(HERE, fn), encoding='utf-8').read()
    ok(not re.search(r'hf_[A-Za-z0-9]{20,}', s), 'no key in ' + fn)
nbp = os.path.join(HERE, '..', 'wordtrail_texts_status_kaggle.ipynb')
if os.path.exists(nbp):
    nb = json.load(open(nbp, encoding='utf-8'))
    code = [c for c in nb['cells'] if c['cell_type'] == 'code']
    src = ''.join(code[0]['source']) if code else ''
    ok(len(code) == 1, 'notebook has exactly one code cell')
    ok(open(os.path.join(HERE, 'texts_status.py'), encoding='utf-8').read().strip() in src, 'notebook cell holds the same code as tools/texts_status.py')
    ok(re.search(r'^MODE = "trial"', src, re.M) is not None and src.rstrip().endswith('run(MODE)'), 'notebook starts in trial mode and calls run(MODE)')
    ok(not re.search(r'hf_[A-Za-z0-9]{20,}', src), 'no key in notebook')

# ---- 9. the real catalog (only if it is there)
cp = os.environ.get('CATALOG') or next((p for p in [os.path.join(HERE, '..', 'catalog.json'), 'catalog.json'] if os.path.exists(p)), None)
if cp:
    real = json.load(open(cp, encoding='utf-8'))
    rb = T.parse_books(real)
    ok(len(rb) == 22498 == real['n'], 'real catalog: 22,498 books')
    ok(sum(1 for b in rb if not b['gid']) == 9177, 'real catalog: 9,177 without a number')
    ok(sum(1 for b in rb if not b['gid'] and b['arch']) == 8857, 'real catalog: 8,857 of them have an archive id')
    q = [T.build_queries(b) for b in rb if not b['gid']]
    ok(all(1 <= len(x) <= 3 for x in q), 'real catalog: every book without a number gets 1 to 3 questions')
    ids = {b['gid'] for b in rb if b['gid']}
    tj, fj, mj, counts, extra = T.build_status(rb, {}, ids, set(), 'NOW')
    size = len(T.dumps(tj).encode())
    T.check_outputs(rb, tj, fj, mj, size)
    ok(size < 1_500_000, 'real catalog: texts.json is %.2f MB (< 1.5 MB)' % (size / 1e6))
    print('real catalog: texts.json would be %.2f MB; counts if every Gutenberg file existed and nothing was found: %s' % (size / 1e6, counts))

print('%d passed, %d failed' % (passed, failed))
sys.exit(1 if failed else 0)
