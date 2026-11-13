#!/usr/bin/env python3
"""Checks for tools/make_tfng_pack.py (Task 60). No model, no network. Run: python tools/tfng_pack_check.py
Covers: candidates from a table, the checks that drop bad items, reviewer hints, publish rules, verify, keys equal the app's hash,
and (when Node.js is there) that the keys match the real JavaScript fnv() of 160b-translate-provider.js. The real-model path is NOT run here."""
import copy, gzip, json, os, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_tfng_pack as M

SC = os.path.join(HERE, 'make_tfng_pack.py')
SENT, TABLE = os.path.join(HERE, 'samples', 'sample-tfng-passage.json'), os.path.join(HERE, 'samples', 'sample-tfng-table.json')
fails, ran = [], 0


def ok(cond, name):
    global ran
    ran += 1
    print(('ok    ' if cond else 'FAIL  ') + name)
    if not cond:
        fails.append(name)


def run(*a):
    r = subprocess.run([sys.executable, SC] + list(a), capture_output=True, text=True, encoding='utf-8')
    return r.returncode, r.stdout + r.stderr


tmp = tempfile.mkdtemp()
try:
    # 1 candidates from the hand-written table
    rc, out = run('--sentences', SENT, '--book', 'sample', '--passage', 'p1', '--engine', 'table', '--table', TABLE, '--out', tmp)
    cand = os.path.join(tmp, 'sample.p1.tfng.json')
    ok(rc == 0 and os.path.exists(cand), 'candidates are written from a table')
    pack = json.load(open(cand, encoding='utf-8'))
    ok(len(pack['lines']) == 10 and pack['n'] == 9 and pack['key'] == 'fnv1a-utf16-base36', '10 lines, 9 items, key name')
    ok(all(it['id'] == M.sentence_key(it['st']) for it in pack['items']), 'item ids are the key of the statement')
    ok([sum(1 for i in pack['items'] if i['a'] == a) for a in M.ANSWERS] == [3, 3, 3], '3 T, 3 F, 3 NG')
    ok(M.check_pack(pack)[0] == [], 'candidate file passes check_pack')

    # 2 bad candidates are dropped, hints are written
    bad_table = {'items': [
        {'st': 'Too short.', 'a': 'T', 'why': 'x.', 'sup': [1]},
        {'st': 'The warmth in the centre of the hive helps young bees to develop.', 'a': 'T', 'why': 'Line 1 says so. And more.', 'sup': [1]},
        {'st': 'Bees spread water on the walls of the hive to cool it down.', 'a': 'NG', 'why': 'It is not said.', 'sup': [6]},
        {'st': 'Bees spread water on the walls of the hive to cool it down.', 'a': 'T', 'why': 'Line 6 says so.', 'sup': [99]},
        {'st': 'Honey bees keep the centre of their hive at about 35 degrees Celsius, the warmth that young bees need to grow.', 'a': 'T', 'why': 'Line 1 says so.', 'sup': [1]},
        {'st': 'Honey bees keep the centre of the hive at about 35 degrees Celsius, the warmth young bees need to grow.', 'a': 'T', 'why': 'Line 1 says so.', 'sup': [1]}]}
    bt = os.path.join(tmp, 'bad.json'); json.dump(bad_table, open(bt, 'w'))
    rc, out = run('--sentences', SENT, '--book', 'bad', '--engine', 'table', '--table', bt, '--out', tmp)
    b = json.load(open(os.path.join(tmp, 'bad.p1.tfng.json'), encoding='utf-8'))
    ok(rc == 0 and b['n'] == 2, 'short, two-sentence, NG-with-line, out-of-range items are dropped (2 of 6 stay)')
    ok(all(any('copies line 1' in c for c in i.get('chk', [])) for i in b['items']), 'a near copy of a line is flagged for the reviewer')
    ok(all(i['r'] == 0 for i in b['items']), 'new candidates start at r = 0')

    # 3 publish rules
    rc, out = run('--publish', os.path.join(tmp, 'bad.p1.tfng.json'), '--reviewer', 'T', '--out', tmp)
    ok(rc == 1 and 'nothing to publish' in out, 'publish refuses when nothing is approved')
    rc, out = run('--publish', cand, '--out', tmp)
    ok(rc == 2 and '--reviewer' in out, 'publish needs --reviewer (or --sample)')
    c2 = json.load(open(cand, encoding='utf-8'))
    for k, it in enumerate(c2['items']):
        it['r'] = 1 if k < 8 else 0
        it['chk'] = ['x']
    json.dump(c2, open(os.path.join(tmp, 'half.json'), 'w'))
    rc, out = run('--publish', os.path.join(tmp, 'half.json'), '--reviewer', 'Test Person', '--out', tmp)
    gz = os.path.join(tmp, 'sample.p1.tfng.json.gz')
    p = json.load(gzip.open(gz, 'rt', encoding='utf-8'))
    ok(rc == 0 and p['n'] == 8 and all(i['r'] == 1 for i in p['items']), 'publish keeps only approved items')
    ok(p['reviewed']['by'] == 'Test Person' and not any('chk' in i for i in p['items']) and 'sample' not in p, 'reviewer written, hints removed, not a sample')
    rc, out = run('--verify', gz)
    ok(rc == 0 and 'approved (r = 1): T 3, F 3, NG 2' in out, 'verify reports counts of the published pack')

    # 4 verify catches damage
    for name, mut in [('a wrong line key', lambda q: q['lines'][0].__setitem__(0, 'zzz.1')),
                      ('a wrong id', lambda q: q['items'][0].__setitem__('id', 'zzz.1')),
                      ('a line number out of range', lambda q: q['items'][0].__setitem__('sup', [11])),
                      ('an NG with a supporting line', lambda q: q['items'][8].__setitem__('sup', [2])),
                      ('a bad answer letter', lambda q: q['items'][0].__setitem__('a', 'X')),
                      ('a wrong n', lambda q: q.__setitem__('n', 99)),
                      ('another version', lambda q: q.__setitem__('v', 2))]:
        q = copy.deepcopy(json.load(open(cand, encoding='utf-8'))); mut(q)
        ok(M.check_pack(q)[0] != [], 'check_pack catches ' + name)

    # 5 the shipped sample
    sample = os.path.join(HERE, '..', 'packs', 'sample.p1.tfng.json.gz')
    if os.path.exists(sample):
        rc, out = run('--verify', sample)
        ok(rc == 0 and 'SAMPLE' in out and 'T 3, F 3, NG 3' in out, 'packs/sample.p1.tfng.json.gz verifies and says it is a sample')
        s = json.load(gzip.open(sample, 'rt', encoding='utf-8'))
        ok(s.get('sample') is True and s['engine'] == 'table', 'sample pack has sample: true and engine table')
    else:
        ok(False, 'packs/sample.p1.tfng.json.gz exists')

    # 6 model answer parsing (no model needed)
    ok(len(M.parse_json_list('Here you go:\n```json\n[{"statement":"a","reason":"b","line":1},{"statement":"c","reason":"d","line":null}]\n```')) == 2, 'a JSON list inside other text is parsed')
    ok(len(M.parse_json_list('{"statement":"a","reason":"b","line":1} and {"statement":"c","reason":"d","line":2}')) == 2, 'loose objects are recovered')
    ok(M.parse_json_list('no json here') == [], 'no JSON gives an empty list')

    # 7 keys equal the app's JavaScript (needs Node and the app file)
    js = os.path.join(HERE, '..', 'src', 'js', '160b-translate-provider.js')
    if shutil.which('node'):
        fn = "const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length.toString(36); };"
        has_same = os.path.exists(js) and 'x811c9dc5' in open(js, encoding='utf-8').read()
        ok(has_same, 'the app file still has the same fnv hash')
        texts = [t for _, t in pack['lines']] + ['Ünïcode — “quoted” 😀 text.']
        r = subprocess.run(['node', '-e', fn + 'console.log(JSON.stringify(%s.map(fnv)))' % json.dumps(texts)], capture_output=True, text=True, encoding='utf-8')
        ok(r.returncode == 0 and json.loads(r.stdout) == [M.sentence_key(t) for t in texts], 'Python keys equal the JavaScript fnv() on %d texts' % len(texts))
    else:
        print('skip  : Node.js not found, key comparison with JavaScript not run')
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('\n%d checks ran, %d failed' % (ran, len(fails)))
sys.exit(1 if fails else 0)
