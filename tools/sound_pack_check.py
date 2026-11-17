#!/usr/bin/env python3
"""Checks for tools/make_sound_pack.py (Task 9): python tools/sound_pack_check.py
Runs the whole flow on tools/samples/sample-sound-passage.json in a temp folder (no model, no network): candidates -> a person approves -> publish -> verify -> index,
and the refusals (no reviewer, nothing approved, a word that is not in its line, a pair that is not in the table, a tampered id or key, too many lines). Exit 0 all ok, 1 a check failed."""
import copy, gzip, json, os, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TOOL = os.path.join(ROOT, 'tools', 'make_sound_pack.py')
SAMPLE = os.path.join(ROOT, 'tools', 'samples', 'sample-sound-passage.json')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import make_sound_pack as M

ok_n = fail_n = 0


def t(name, fn):
    global ok_n, fail_n
    try:
        fn(); ok_n += 1; print('ok    ' + name)
    except AssertionError as e:
        fail_n += 1; print('FAIL  ' + name + '\n        ' + str(e)[:300])
    except Exception as e:  # noqa
        fail_n += 1; print('FAIL  ' + name + '\n        %s: %s' % (type(e).__name__, str(e)[:300]))


def run(*a):
    r = subprocess.run([sys.executable, TOOL] + list(a), capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout + r.stderr


T = M.load_tables()
tmp = tempfile.mkdtemp()
cand = os.path.join(tmp, 'sample.p1.sound.json')


def make():
    code, out = run('--sentences', SAMPLE, '--book', 'sample', '--passage', 'p1', '--out', tmp)
    assert code == 0, out
    return json.load(open(cand, encoding='utf-8'))


def test_generate():
    d = make()
    assert d['format'] == M.FORMAT and d['v'] == 1 and d['key'] == M.KEY_NAME and d['engine'] == 'table' and d['license'] and d['textLicense']
    assert all(it['r'] == 0 for it in d['items']), 'candidates are not approved'
    assert {it['k'] for it in d['items']} == {'p', 'c'}, 'both kinds are found in the sample'
    assert all(not M.problems(it, d['lines'], T) for it in d['items'])
    assert len({it['id'] for it in d['items']}) == len(d['items'])
    assert 'reviewed' not in d, 'only a published pack says who read it'


def test_flags():
    d = make()
    gt = [it for it in d['items'] if it['k'] == 'c' and it['c'] == 'going to' and 'market' in d['lines'][it['line'] - 1][1]]
    assert gt and gt[0].get('chk'), 'going to the market is flagged for the reviewer'


def test_per_limits():
    code, out = run('--sentences', SAMPLE, '--book', 'sample', '--passage', 'p1', '--out', tmp, '--per-sound', '1', '--per-phrase', '1')
    assert code == 0, out
    d = json.load(open(cand, encoding='utf-8')); per = {}
    for it in d['items']:
        key = it.get('snd') if it['k'] == 'p' else it['c']; per[key] = per.get(key, 0) + 1
    assert max(per.values()) == 1, per
    make()


def approved(d, n=None):
    d = copy.deepcopy(d)
    for it in d['items']:
        it['r'] = 1; it.pop('chk', None)
    if n:
        d['items'] = d['items'][:n]
    return d


def publish(d, *extra, name='x'):
    f = os.path.join(tmp, name + '.json'); json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
    return run('--publish', f, '--out', os.path.join(tmp, 'out'), *extra)


def test_publish_rules():
    d = make()
    code, out = publish(d, '--reviewer', 'Me')
    assert code == 1 and 'no item has' in out, 'nothing approved: ' + out
    code, out = publish(approved(d))
    assert code == 2 or code == 1, 'a reviewer is required'
    code, out = publish(approved(d), '--reviewer', 'Me')
    assert code == 0, out
    p = os.path.join(tmp, 'out', 'sample.p1.sound.json.gz')
    pk = json.loads(gzip.open(p, 'rt', encoding='utf-8').read())
    assert pk['reviewed']['by'] == 'Me' and pk['n'] == len(pk['items']) and all(it['r'] == 1 and 'chk' not in it for it in pk['items']) and 'sample' not in pk
    first = open(p, 'rb').read(); publish(approved(d), '--reviewer', 'Me'); assert open(p, 'rb').read() == first, 'the same input gives the same bytes'
    code, out = run('--verify', p)
    assert code == 0 and 'approved (r = 1)' in out, out
    code, out = publish(approved(d), '--sample', name='s')
    assert code == 0, out
    code, out = run('--verify', os.path.join(tmp, 'out', 'sample.p1.sound.json.gz'))
    assert code == 0 and 'SAMPLE' in out, out


def test_index():
    d = make()
    publish(approved(d), '--reviewer', 'Me')
    code, out = run('--index', os.path.join(tmp, 'out'), '--book', 'sample')
    assert code == 0, out
    j = json.load(open(os.path.join(tmp, 'out', 'sample.sound-index.json'), encoding='utf-8'))
    assert j['format'] == M.INDEX and j['book'] == 'sample' and j['passages'][0]['id'] == 'p1' and j['passages'][0]['n'] >= 3
    code, out = run('--index', os.path.join(tmp, 'out'), '--book', 'nobook')
    assert code == 1 and 'no published packs' in out
    unrev = approved(d); unrev['reviewed'] = None
    os.makedirs(os.path.join(tmp, 'u'), exist_ok=True)
    pk = copy.deepcopy(approved(d)); pk['n'] = len(pk['items'])
    with gzip.open(os.path.join(tmp, 'u', 'sample.p1.sound.json.gz'), 'wt', encoding='utf-8') as f:
        json.dump(pk, f)
    code, out = run('--index', os.path.join(tmp, 'u'), '--book', 'sample')
    assert code == 1 and 'not reviewed' in out, out


def test_problems():
    d = make(); lines = d['lines']
    ship = next(it for it in d['items'] if it['k'] == 'p' and it['w'] == 'ship')
    bad = lambda **kw: M.problems(dict(ship, **kw), lines, T)
    assert not bad()
    assert bad(w='boat', o='goat'), 'a word that is not in the line'
    assert bad(o='harbour'), 'a pair that is not in the table'
    assert bad(snd='th-s'), 'the pair belongs to another sound'
    assert bad(snd='nope') and bad(line=99) and bad(line=0) and bad(r=2) and bad(k='x') and bad(w='Ship') and bad(w='ship', o='ship')
    both = dict(ship, line=2, w='sheep', o='ship'); assert M.problems(both, lines, T) == [], 'line 2 holds sheep only'
    lines2 = [list(x) for x in lines]; lines2[0][1] = 'We saw a ship and a sheep.'
    assert M.problems(ship, lines2, T), 'both words in the line: both answers would be right'
    c = next(it for it in d['items'] if it['k'] == 'c')
    assert not M.problems(c, lines, T) and M.problems(dict(c, said='x'), lines, T) and M.problems(dict(c, c='in the'), lines, T)
    assert M.problems('x', lines, T) == ['not an object']


def test_check_pack():
    d = approved(make()); d['n'] = len(d['items'])
    assert not M.check_pack(d)[0]
    e = copy.deepcopy(d); e['items'][0]['id'] = 'zzz'; assert any('id is not' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); e['lines'][0][0] = 'bad.key'; assert any('key does not match' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); e['key'] = 'md5'; assert any('key must be' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); e['items'].append(copy.deepcopy(e['items'][0])); e['n'] = len(e['items']); assert any('repeated' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); e['n'] = 99; assert any('n says' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); del e['license']; assert any('license' in b for b in M.check_pack(e)[0])
    e = copy.deepcopy(d); e['lines'] = e['lines'] * 6; assert M.check_pack(e)[0], 'more than 60 lines'
    assert M.check_pack({'format': 'x'})[0]


def test_line_cap():
    big = os.path.join(tmp, 'big.json'); json.dump(['Sentence number %d has a ship in it today.' % i for i in range(70)], open(big, 'w'))
    code, out = run('--sentences', big, '--book', 'b', '--passage', 'p1', '--out', tmp)
    assert code != 0 and 'at most 60' in out, out
    code, out = run('--sentences', big, '--book', 'b', '--passage', 'p1', '--to-line', '40', '--out', tmp)
    assert code == 0, out


def test_table():
    sounds, pairs, chunks = M.maps(T)
    assert len(sounds) == 16 and len(chunks) == 24
    for s in T['sounds']:
        assert len(s['pairs']) >= 4, s['id']
        for a, b in s['pairs']:
            assert a == a.lower() and b == b.lower() and a != b
    assert len({c['c'] for c in T['chunks']}) == len(T['chunks'])


def test_shipped_sample():
    p = os.path.join(ROOT, 'packs', 'sample.p1.sound.json.gz')
    pk = json.loads(gzip.open(p, 'rt', encoding='utf-8').read())
    assert pk.get('sample') is True and not M.check_pack(pk)[0]
    code, out = run('--verify', p)
    assert code == 0 and 'SAMPLE' in out, out


for name, fn in [('candidates: format, licence, all unapproved, both kinds, every item valid', test_generate), ('the reviewer hint for "going to the market"', test_flags), ('--per-sound and --per-phrase limit the candidates', test_per_limits),
                 ('publish: needs approved items and a reviewer, keeps only r = 1, no hints, same bytes twice, --sample marks the pack', test_publish_rules), ('index: lists reviewed packs, refuses an unreviewed pack and a book with none', test_index),
                 ('problems: a missing word, a pair that is not in the table, both words in one line, bad numbers', test_problems), ('check_pack: tampered id, key, line key, repeats, n, missing licence, too many lines', test_check_pack),
                 ('a passage of more than 60 lines is refused with the way out', test_line_cap), ('the tables: 16 sounds with 4+ pairs, 24 phrases, no repeats', test_table), ('the shipped sample pack is valid and marked sample', test_shipped_sample)]:
    t(name, fn)
print('\n%d passed, %d failed' % (ok_n, fail_n))
sys.exit(1 if fail_n else 0)
