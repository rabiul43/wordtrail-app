#!/usr/bin/env python3
"""Automatic checks for the translation pack script (tools/make_translation_pack.py). No model, no network, no pip install:
    python tools/translation_pack_check.py
Needs Node.js (the sentence splitter and the hash proof run the app's real JavaScript). Exit code 1 if a check fails, 2 if Node is missing.
What it proves: the key of a sentence equals the app's own hash, the pack has the documented shape, a resumed run keeps earlier work,
the same input gives the same bytes, and the sample pack in tools/samples/packs/ still matches the sample book.
What it does NOT prove: that a real model translates well (that needs a GPU run; see tools/TRANSLATION-PACKS.md)."""
import gzip, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = [sys.executable, os.path.join(HERE, 'make_translation_pack.py')]
BOOK = os.path.join(HERE, 'samples', 'sample-book.txt')
if not shutil.which('node'):
    print('translation_pack_check: Node.js is needed'); sys.exit(2)
sys.path.insert(0, HERE)
import make_translation_pack as M

passed = failed = 0
def t(name, fn):
    global passed, failed
    try:
        fn(); passed += 1; print('ok    ' + name)
    except Exception as e:
        failed += 1; print('FAIL  ' + name + '\n        ' + str(e).replace('\n', '\n        ')[:600])
def run(*a, ok=0):
    r = subprocess.run(PY + list(a), capture_output=True, text=True, encoding='utf-8')
    assert r.returncode == ok, 'exit %d (wanted %d): %s' % (r.returncode, ok, (r.stdout + r.stderr)[-400:])
    return r.stdout
def load(p):
    with gzip.open(p, 'rt', encoding='utf-8') as f: return json.load(f)

tmp = tempfile.mkdtemp(prefix='packcheck-')
try:
    def key_matches_js():
        src = open(os.path.join(ROOT, 'src/js/160b-translate-provider.js'), encoding='utf-8').read()
        line = next(l for l in src.splitlines() if l.strip().startswith('const fnv = '))
        samples = ['', 'a', 'The castle stood silent above the valley.', 'সে বাগানে একা বসে ছিল।', 'café “quoted” — dash', 'emoji \U0001F600 pair', '  padded  ']
        js = line.strip() + '\nconst xs = ' + json.dumps(samples) + ';\nconsole.log(JSON.stringify(xs.map(s => fnv(s.trim()))));'
        out = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        mine = [M.sentence_key(s) for s in samples]
        assert out == mine, 'JS %s != Python %s' % (out, mine)
    t('key: the Python hash equals the app\'s own fnv for plain text, Bengali, quotes and emoji', key_matches_js)

    def shape():
        run('--text', BOOK, '--book', 'x', '--lang', 'bn', '--engine', 'dummy', '--out', tmp)
        p = load(os.path.join(tmp, 'x.bn.json.gz'))
        assert p['format'] == 'wordtrail-translation-pack' and p['v'] == 1 and p['key'] == 'fnv1a-utf16-base36'
        assert p['src'] == 'en' and p['lang'] == 'bn' and p['book'] == 'x' and p['engine'] == 'dummy' and p['test'] is True
        assert p['n'] == len(p['s']) == p['of'] == 12
        assert all(isinstance(r, list) and len(r) == 2 and re.fullmatch(r'[0-9a-z]+\.[0-9a-z]+', r[0]) and r[1] for r in p['s'])
        assert not os.path.exists(os.path.join(tmp, 'x.bn.json.gz.partial')), 'the partial file must be removed when done'
    t('pack: one json.gz per book and language, the documented fields, a test flag on dummy output', shape)

    def same_bytes():
        a = open(os.path.join(tmp, 'x.bn.json.gz'), 'rb').read()
        os.remove(os.path.join(tmp, 'x.bn.json.gz'))
        run('--text', BOOK, '--book', 'x', '--lang', 'bn', '--engine', 'dummy', '--out', tmp)
        assert a == open(os.path.join(tmp, 'x.bn.json.gz'), 'rb').read()
    t('pack: the same input gives the same bytes (so a repeat run is a no-op in git)', same_bytes)

    def limit_and_dupes():
        d = os.path.join(tmp, 'sj'); os.makedirs(d)
        sj = os.path.join(d, 's.json'); json.dump(['Hello there.', ' Hello there. ', '', 'Second one.', 'Third one.'], open(sj, 'w'))
        run('--sentences', sj, '--book', 'y', '--lang', 'fr', '--engine', 'dummy', '--out', d)
        assert load(os.path.join(d, 'y.fr.json.gz'))['n'] == 3, 'blank dropped, the same sentence once'
        run('--sentences', sj, '--book', 'y', '--lang', 'fr', '--engine', 'dummy', '--out', d, '--limit', '2')
        assert load(os.path.join(d, 'y.fr.json.gz'))['n'] == 2
    t('sentences: trimmed, blanks dropped, a repeated sentence once, --limit works, plain JSON lists are accepted', limit_and_dupes)

    def resume():
        d = os.path.join(tmp, 'rs'); os.makedirs(d)
        first = M.sentence_key('The castle stood silent above the valley.')
        open(os.path.join(d, 'r.bn.json.gz.partial'), 'w', encoding='utf-8').write(json.dumps([first, 'KEPT']) + '\n{"half writ')
        out = run('--text', BOOK, '--book', 'r', '--lang', 'bn', '--engine', 'dummy', '--out', d, '--resume')
        assert 'resumed: 1 sentences' in out, out
        rows = dict(load(os.path.join(d, 'r.bn.json.gz'))['s'])
        assert rows[first] == 'KEPT' and len(rows) == 12, 'earlier work kept, a half-written line ignored'
    t('resume: work from an interrupted run is kept and a half-written last line is ignored', resume)

    def table_gaps():
        d = os.path.join(tmp, 'tb'); os.makedirs(d)
        tb = os.path.join(d, 't.json'); json.dump({'Nobody came to find her.': 'কেউ আসেনি।'}, open(tb, 'w', encoding='utf-8'), ensure_ascii=False)
        out = run('--text', BOOK, '--book', 't', '--lang', 'bn', '--engine', 'table', '--table', tb, '--out', d)
        p = load(os.path.join(d, 't.bn.json.gz'))
        assert p['n'] == 1 and p['of'] == 12 and 'test' not in p and '11 sentences have no translation' in out
    t('table engine: sentences without a translation are left out and said so (the app translates them live)', table_gaps)

    def verify():
        assert 'cover : 12 of 12' in run('--verify', os.path.join(tmp, 'x.bn.json.gz'), '--text', BOOK)
        assert 'TEST pack' in run('--verify', os.path.join(tmp, 'x.bn.json.gz'), '--text', BOOK)
        p = load(os.path.join(tmp, 'x.bn.json.gz')); p['n'] = 5
        bad = os.path.join(tmp, 'bad.json.gz'); gzip.open(bad, 'wt', encoding='utf-8').write(json.dumps(p))
        run('--verify', bad, '--text', BOOK, ok=1)
    t('verify: reports coverage, flags test packs, fails on a wrong count', verify)

    def sample():
        out = run('--verify', os.path.join(HERE, 'samples', 'packs', 'sample.bn.json.gz'), '--text', BOOK)
        assert 'cover : 12 of 12 sentences translated, 0 missing, 0 keys' in out, out
        assert 'TEST pack' not in out
    t('sample pack: tools/samples/packs/sample.bn.json.gz covers every sentence of the sample book', sample)

    def args_errors():
        run('--book', 'z', ok=2); run('--text', BOOK, ok=2); run('--text', BOOK, '--book', 'z', '--engine', 'table', ok=2)
        r = subprocess.run(PY + ['--text', BOOK, '--book', 'z', '--out', tmp], capture_output=True, text=True)   # the real model, but no libraries here
        assert r.returncode in (0, 2)
    t('arguments: a missing book id, text or table stops with exit 2 and a clear message', args_errors)

    def no_secrets():
        pat = re.compile(r'hf_[A-Za-z0-9]{20,}|api[_-]?key\s*[=:]\s*[\'"][^\'"]+|token\s*=\s*[\'"][^\'"]+|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}', re.I)
        for f in ['make_translation_pack.py', 'pack_sentences.js', 'translation_pack_check.py', 'TRANSLATION-PACKS.md']:
            p = os.path.join(HERE, f)
            if os.path.exists(p):
                m = pat.search(open(p, encoding='utf-8').read())
                assert not m, f + ' looks like it holds a secret: ' + m.group(0)[:20]
    t('no secrets: no key or token pattern in the pack tools or their doc', no_secrets)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
print('\n%d passed, %d failed' % (passed, failed)); sys.exit(1 if failed else 0)
