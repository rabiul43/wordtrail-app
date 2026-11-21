#!/usr/bin/env python3
"""texts_status.py - Wordtrail Task 6a: make the "status list" of book texts.

For every book in catalog.json it works out where a text can come from:
  h  our own copy in Hugging Face Book_Text has the Gutenberg file for this book's number
  p  a timing file exists (wordtrail-packs: wt_packs_v2/<id>.json.gz or wt_packs/<id>.json.gz)
  a  the catalog has an archive.org id
  s  the Gutenberg number was FOUND BY SEARCH here (the catalog had none)
and writes, in Book_Text/status/ :
  texts.json            {"v":1,"made":..,"n":..,"b":{"<LibriVox id>":[gutenberg number or 0,"flags"]}}
  found-gutenberg.json  the numbers found by search, with the title/author they matched (to check by eye)
  maybe-gutenberg.json  doubtful matches, NEVER used by the app (to review in the dashboard)
  texts-report.txt      the counts and examples
Work in progress (searches already done) is saved as status/_work/search-cache.json.gz, so a stopped run
(12-hour limit, lost connection) loses nothing: run the cell again and it carries on.

Used from the Kaggle notebook (one cell) and from tools/texts_status_check.py (offline test with fake data).
The Hugging Face key is read from Kaggle Secrets (HF_TOKEN) and is never written anywhere.
"""
import difflib
import glob
import gzip
import io
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BOOK_TEXT = 'rabiul43/Book_Text'
PACKS = 'rabiul43/wordtrail-packs'
STATUS_DIR = 'status'
CACHE_PATH = STATUS_DIR + '/_work/search-cache.json.gz'
GUTENDEX = 'https://gutendex.com/books/?search='
CATALOG_URLS = [
    'https://raw.githubusercontent.com/rabiul43/wordtrail-data/main/catalog.json',
    'https://raw.githubusercontent.com/rabiul43/wordtrail-data/master/catalog.json',
]
LIMIT_BYTES = 1_500_000          # texts.json must stay under this
FLAG_ORDER = 'hpas'
UPLOAD_EVERY = 500               # searches between uploads of the work file


# ---------------------------------------------------------------- text helpers
def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def norm(s):
    s = strip_accents(str(s or '')).lower().replace('&', ' and ')
    s = re.sub(r"[\u2019'`]", '', s)
    s = re.sub(r'[\W_]+', ' ', s, flags=re.UNICODE)
    return re.sub(r'\s+', ' ', s).strip()


# same rule as Core.gutTitle in the app: drop LibriVox labels such as "(version 2)" or "(Dramatic Reading)"
_VOLISH = re.compile(r'\b(vol(ume)?s?|parts?|books?|bk|no|number|tome|band|chapter|canto|act)\b|\d', re.I)
_VERSION = re.compile(r'^\s*(version|ver\.?|v\.?)\s*\d+\s*$', re.I)
_TAIL = re.compile(r'\s*[(\[]([^()\[\]]*)[)\]]\s*$')
_GROUP = re.compile(r'[(\[]([^()\[\]]*)[)\]]')
_LABEL = re.compile(r'(dramatic|reading|version|abridged|unabridged|illustrated|audio|solo|multi|librivox|play)', re.I)


def clean_title(t):
    full = str(t or '').strip()
    s = full
    while True:
        m = _TAIL.search(s)
        if not m:
            break
        tag = m.group(1)
        if _VOLISH.search(tag) and not _VERSION.match(tag):
            break
        n = s[:m.start()].strip()
        if not n:
            break
        s = n
    return s or full


_ARTICLES = {'the', 'a', 'an', 'der', 'die', 'das', 'le', 'la', 'les', 'el', 'los', 'las', 'il', 'lo', 'l'}
_MAINSPLIT = re.compile(r'\s*(?::|;|\s[-\u2013\u2014]\s|,\s*or,?\s)\s*', re.I)


_CANON = {'vol': 'volume', 'volumen': 'volume', 'volumes': 'volume', 'pt': 'part', 'parts': 'part', 'bk': 'book',
          'books': 'book', 'no': 'number'}   # "Vol. 1" and "Volume 1" are the same thing when comparing titles


def _drop_article(n):
    t = [_CANON.get(x, x) for x in n.split()]
    if len(t) > 1 and t[0] in _ARTICLES:
        t = t[1:]
    return ' '.join(t)


def title_forms(raw, with_alt=True):
    """The ways a title can be written, normalised: whole, main part (before ':' ';' ', or'), and a (translated) name in brackets."""
    c = clean_title(raw)
    out = []

    def add(x):
        n = _drop_article(norm(x))
        if len(n) >= 2 and n not in out:
            out.append(n)
    add(c)
    add(_MAINSPLIT.split(c)[0])
    if with_alt:
        for g in _GROUP.findall(str(raw or '')):
            if not _VOLISH.search(g) and not _LABEL.search(g) and len(g.strip()) >= 3:
                add(g)
    return out


_MARK = {'vol', 'volume', 'volumes', 'part', 'parts', 'book', 'books', 'bk', 'tome', 'tomo', 'band', 'canto', 'act',
         'chapter', 'no', 'number', 'volumen', 'livre', 'buch', 'teil', 'libro', 'parte'}
_ROM = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12,
        'xiii': 13, 'xiv': 14, 'xv': 15, 'xvi': 16, 'xvii': 17, 'xviii': 18, 'xix': 19, 'xx': 20}


def title_numbers(raw):
    """Volume / part / issue numbers in a title. Two titles with different numbers are different books."""
    toks = norm(clean_title(raw)).split()
    nums = set()
    for i, t in enumerate(toks):
        if t.isdigit():
            nums.add(int(t))
        elif t in _ROM and i > 0 and toks[i - 1] in _MARK:
            nums.add(_ROM[t])
    return nums


_GENERIC = {'various', 'unknown', 'anonymous', 'librivox', 'anon'}


def author_is_generic(book):
    toks = set(norm(book.get('authors')).split()) | set(norm(book.get('last')).split())
    return bool(toks & _GENERIC) or not norm(book.get('last'))


def hit_authors_generic(authors):
    if not authors:
        return True
    return any(set(norm(a).split()) & {'various', 'anonymous', 'unknown'} for a in authors)


def author_matches(last, authors):
    toks = [t for t in norm(last).split() if len(t) >= 2]
    if not toks:
        return False
    for a in authors or []:
        words = set(norm(a).split())
        if all(t in words for t in toks):
            return True
    return False


_LANG = {'english': 'en', 'german': 'de', 'spanish': 'es', 'french': 'fr', 'dutch': 'nl', 'portuguese': 'pt',
         'italian': 'it', 'russian': 'ru', 'ancient greek': 'grc', 'greek': 'el', 'japanese': 'ja', 'latin': 'la',
         'swedish': 'sv', 'finnish': 'fi', 'danish': 'da', 'polish': 'pl', 'chinese': 'zh', 'hebrew': 'he',
         'esperanto': 'eo', 'catalan': 'ca', 'hungarian': 'hu', 'czech': 'cs', 'norwegian': 'no', 'tagalog': 'tl',
         'afrikaans': 'af', 'welsh': 'cy', 'irish': 'ga', 'bulgarian': 'bg', 'ukrainian': 'uk', 'arabic': 'ar',
         'sanskrit': 'sa', 'korean': 'ko', 'turkish': 'tr', 'romanian': 'ro', 'serbian': 'sr', 'croatian': 'hr',
         'icelandic': 'is', 'lithuanian': 'lt', 'latvian': 'lv', 'slovenian': 'sl', 'yiddish': 'yi',
         'persian': 'fa', 'bengali': 'bn', 'hindi': 'hi', 'middle english': 'enm', 'old english': 'ang'}


def lang_code(name):
    return _LANG.get(str(name or '').strip().lower())   # None: Multilingual / unknown -> no language check


_RANK = {'none': 0, 'weak': 1, 'prefix': 2, 'close': 3, 'exact': 4}


def title_rel(lv_forms, hit_forms):
    best = 'none'
    for a in lv_forms:
        for b in hit_forms:
            if a == b and (len(a) >= 3 or not a.isascii()):
                r = 'exact'
            else:
                ratio = difflib.SequenceMatcher(None, a, b).ratio()
                ta, tb = a.split(), b.split()
                short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
                common = set(ta) & set(tb)
                jac = len(common) / (len(set(ta) | set(tb)) or 1)
                if ratio >= 0.92:
                    r = 'close'
                elif len(short) >= 3 and long_[:len(short)] == short:
                    r = 'prefix'
                elif ratio >= 0.75 or (jac >= 0.6 and len(common) >= 2):
                    r = 'weak'
                else:
                    r = 'none'
            if _RANK[r] > _RANK[best]:
                best = r
    return best


def decide(book, hits):
    """hits: [[gutenberg id, title, [author names], [language codes]], ...]
    -> {'kind': 'found'|'maybe'|'none', 'gid', 'title', 'author', 'why'}
    'found' only when the title AND the author clearly agree (and language and volume number do not clash)
    and exactly one Gutenberg book fits. Anything doubtful is 'maybe' (never used by the app)."""
    forms = title_forms(book['title'])
    nums = title_numbers(book['title'])
    generic = author_is_generic(book)
    lang = lang_code(book.get('lang'))
    main_tokens = len(forms[0].split()) if forms else 0
    cands = []
    for h in hits or []:
        gid, htitle, hauthors, hlangs = h[0], h[1], list(h[2] or []), [str(x).lower() for x in (h[3] or [])]
        t = title_rel(forms, title_forms(htitle, with_alt=False))
        if t == 'none':
            continue
        if lang is not None and lang not in hlangs:
            continue                                     # another language: not this recording's text
        v_ok = nums == title_numbers(htitle)
        a_ok = hit_authors_generic(hauthors) if generic else author_matches(book.get('last'), hauthors)
        if generic:
            certain = a_ok and v_ok and t == 'exact' and main_tokens >= 2
        else:
            certain = a_ok and v_ok and t in ('exact', 'close', 'prefix')
        maybe = (t in ('exact', 'close', 'prefix') if generic else (a_ok and t != 'none') or t in ('exact', 'close'))
        if not (certain or maybe):
            continue
        why = []
        if not a_ok:
            why.append('the author differs' if not generic else 'Gutenberg names an author')
        if not v_ok:
            why.append('the volume or part number differs')
        if t in ('weak', 'prefix') and not certain:
            why.append('the title only partly agrees')
        elif t == 'close':
            why.append('the title is almost the same')
        cands.append({'gid': int(gid), 'title': htitle, 'author': '; '.join(hauthors), 'certain': certain,
                      'rank': _RANK[t], 'a': a_ok, 'v': v_ok, 'why': ', '.join(why)})
    if not cands:
        return {'kind': 'none', 'gid': 0, 'title': '', 'author': '', 'why': 'no Gutenberg book looks like it'}
    certain = {}
    for c in cands:
        if c['certain']:
            certain.setdefault(c['gid'], c)
    if len(certain) == 1:
        c = next(iter(certain.values()))
        return {'kind': 'found', 'gid': c['gid'], 'title': c['title'], 'author': c['author'], 'why': 'title and author agree'}
    if len(certain) > 1:
        c = sorted(certain.values(), key=lambda x: -x['rank'])[0]
        return {'kind': 'maybe', 'gid': c['gid'], 'title': c['title'], 'author': c['author'],
                'why': 'more than one Gutenberg book fits (%s)' % ', '.join(str(g) for g in sorted(certain)[:4])}
    c = sorted(cands, key=lambda x: (-x['rank'], not x['a'], not x['v']))[0]
    return {'kind': 'maybe', 'gid': c['gid'], 'title': c['title'], 'author': c['author'], 'why': c['why'] or 'not sure'}


# ---------------------------------------------------------------- searching
def build_queries(book):
    clean = clean_title(book['title'])
    full = str(book['title'] or '').strip()
    named = not author_is_generic(book)
    last = str(book.get('last') or '').strip()
    qs = []

    def add(q):
        q = q.strip()
        if q and q not in qs:
            qs.append(q)
    if named:
        add(clean + ' ' + last)
        add(clean)
    else:
        add(clean)
    if clean != full:
        if named:
            add(full + ' ' + last)
        add(full)
    return qs[:3]


def http_fetch(url, timeout=25, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'wordtrail-texts-status/1.0'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 404:
                return {'results': []}
            time.sleep(2 + 3 * i)            # 429 / 5xx: wait longer each time
        except Exception as e:                 # timeout, connection lost, bad JSON
            last = e
            time.sleep(2 + 3 * i)
    raise RuntimeError('search failed: %s' % last)


def search_book(book, fetch):
    """Search Gutendex (at most 3 questions, stops early when a sure match appears). Returns {'h': hits, 'q': n}."""
    hits, seen, n = [], set(), 0
    for q in build_queries(book):
        d = fetch(GUTENDEX + urllib.request.quote(q))
        n += 1
        for x in (d.get('results') or [])[:12]:
            if x.get('id') in seen:
                continue
            seen.add(x.get('id'))
            hits.append([x.get('id'), x.get('title') or '', [a.get('name', '') for a in (x.get('authors') or [])],
                         list(x.get('languages') or [])])
        if decide(book, hits)['kind'] == 'found':
            break
    return {'h': hits, 'q': n}


def run_searches(todo, cache, fetch, workers=3, delay=0.3, deadline=None, save=None, chunk=100,
                 clock=time.time, sleep=time.sleep):
    """Search every book in todo that is not in cache yet; save after every chunk. Returns stats."""
    stats = {'searched': 0, 'failed': [], 'stopped': None}
    bad_chunks = 0

    def one(b):
        try:
            r = search_book(b, fetch)
        except Exception:
            return None
        sleep(delay)
        return r
    for i in range(0, len(todo), chunk):
        if deadline is not None and clock() >= deadline:
            stats['stopped'] = 'time'
            break
        part = todo[i:i + chunk]
        with ThreadPoolExecutor(workers) as ex:
            res = list(ex.map(one, part))
        ok = 0
        for b, r in zip(part, res):
            if r is None:
                stats['failed'].append(b['id'])
            else:
                cache[str(b['id'])] = r
                ok += 1
        stats['searched'] += ok
        bad_chunks = bad_chunks + 1 if ok == 0 else 0
        if save:
            save(cache)
        if bad_chunks >= 3:
            stats['stopped'] = 'down'      # the search site does not answer: stop, nothing is lost
            break
    return stats


# ---------------------------------------------------------------- catalog and status
def parse_books(cat):
    out = []
    for r in cat['b']:
        g = str(r[5] or '').strip()
        out.append({'id': int(r[0]), 'title': str(r[1] or '').strip(), 'authors': str(r[2] or '').strip(),
                    'last': str(r[3] or '').strip(), 'lang': str(r[4] or '').strip(),
                    'gid': int(g) if g.isdigit() else 0, 'arch': str(r[8] or '').strip(), 'secs': r[6]})
    return out


def load_catalog(extra_paths=(), log=print):
    paths = list(extra_paths) + ['catalog.json', '/kaggle/working/catalog.json'] + \
        sorted(glob.glob('/kaggle/input/**/catalog.json', recursive=True))
    for p in paths:
        if os.path.isfile(p):
            log('catalog: using the file ' + p)
            return json.load(open(p, encoding='utf-8'))
    for u in CATALOG_URLS:
        try:
            req = urllib.request.Request(u, headers={'User-Agent': 'wordtrail-texts-status/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read().decode('utf-8'))
            log('catalog: downloaded from ' + u)
            return d
        except Exception as e:
            log('catalog: could not download from %s (%s)' % (u, e))
    raise SystemExit('The catalog could not be found. Add catalog.json to this notebook (Add Data > Upload, or drag it into '
                     'the file list), then run the cell again.')


def classify(gid, has_file, found, p, a):
    if gid and has_file:
        return 'gut_own'
    if gid and not found:
        return 'gut_catalog'
    if gid:
        return 'gut_found'
    if p:
        return 'timing'
    if a:
        return 'archive'
    return 'none'


LABELS = [('gut_own', 'Gutenberg text, our own copy in Book_Text'),
          ('gut_catalog', 'Gutenberg number in the catalog, but NOT in Book_Text (the slower usual routes)'),
          ('gut_found', 'Gutenberg number found by search, NOT in Book_Text (the slower usual routes)'),
          ('timing', 'timing-file text only'),
          ('archive', 'archive.org link only'),
          ('none', 'no text anywhere')]


def build_status(books, cache, bt_gids, pack_ids, made):
    texts, found_map, maybe_map = {}, {}, {}
    counts = {k: 0 for k, _ in LABELS}
    extra = {'p': 0, 'a': 0, 's': 0, 'maybe': 0, 'unsearched': [], 'none_maybe': 0, 'none_noseconds': 0,
             'none_lang': {}, 'cat_gid': 0, 'cat_gid_in_bt': 0}
    for b in books:
        bid = str(b['id'])
        gid, found = b['gid'], False
        if gid:
            extra['cat_gid'] += 1
            extra['cat_gid_in_bt'] += gid in bt_gids
        else:
            c = cache.get(bid)
            if c is None:
                extra['unsearched'].append(b['id'])
            else:
                d = decide(b, c['h'])
                if d['kind'] == 'found':
                    gid, found = d['gid'], True
                    found_map[bid] = [d['gid'], d['title'], d['author']]
                elif d['kind'] == 'maybe':
                    maybe_map[bid] = [d['gid'], d['title'], d['author'], d['why']]
        p, a = b['id'] in pack_ids, bool(b['arch'])
        has_file = bool(gid) and gid in bt_gids
        flags = ('h' if has_file else '') + ('p' if p else '') + ('a' if a else '') + ('s' if found else '')
        texts[bid] = [gid, flags]
        extra['p'] += p
        extra['a'] += a
        extra['s'] += found
        k = classify(gid, has_file, found, p, a)
        counts[k] += 1
        if k == 'none':
            extra['none_maybe'] += bid in maybe_map
            extra['none_noseconds'] += not b['secs']
            extra['none_lang'][b['lang']] = extra['none_lang'].get(b['lang'], 0) + 1
    extra['maybe'] = len(maybe_map)
    tj = {'v': 1, 'made': made, 'n': len(texts), 'k': 'b: id -> [gutenberg number or 0, flags]. h=in Book_Text p=timing file a=archive.org s=number found by search', 'b': texts}
    fj = {'v': 1, 'made': made, 'n': len(found_map), 'b': found_map}
    mj = {'v': 1, 'made': made, 'n': len(maybe_map), 'b': maybe_map}
    return tj, fj, mj, counts, extra


def dumps(o):
    return json.dumps(o, separators=(',', ':'), ensure_ascii=False)


def make_report(books, tj, fj, mj, counts, extra, bt_n, pack_n, made, searched_note=''):
    n = len(books)
    L = ['Wordtrail text status report  (%s)' % made, '=' * 60, '',
         'Books in the catalog: %d' % n,
         'Gutenberg files in Book_Text: %d   Timing files found: %d' % (bt_n, pack_n), '',
         'WHERE EACH BOOK GETS ITS TEXT (best source first)']
    for k, lab in LABELS:
        L.append('  %6d  %s' % (counts[k], lab))
    L += ['',
          'Extra counts',
          '  %6d  books with a timing file (p)' % extra['p'],
          '  %6d  books with an archive.org id (a)' % extra['a'],
          '  %6d  books whose Gutenberg number was found by search (s)  <- filter "found by search"' % extra['s'],
          '  %6d  doubtful matches, NOT used (maybe-gutenberg.json)' % extra['maybe'],
          '  %6d  catalog Gutenberg numbers: %d of them have the file in Book_Text' % (extra['cat_gid'], extra['cat_gid_in_bt']),
          '  %6d  "no text anywhere" books  <- filter "no text anywhere"' % counts['none'],
          '            of those: %d have a doubtful match, %d have no recording length (0 s)' % (extra['none_maybe'], extra['none_noseconds'])]
    top = sorted(extra['none_lang'].items(), key=lambda x: -x[1])[:8]
    if top:
        L.append('            languages of those: ' + ', '.join('%s %d' % kv for kv in top))
    if extra['unsearched']:
        L.append('  NOT SEARCHED (run again): %d books, e.g. %s' % (len(extra['unsearched']), extra['unsearched'][:10]))
    if searched_note:
        L.append(searched_note)
    byid = {str(b['id']): b for b in books}
    L += ['', 'FOUND BY SEARCH, first 40 (check a few by eye)', '-' * 60]
    for bid, (gid, t, a) in list(fj['b'].items())[:40]:
        L.append('  %s  %s | %s  ->  #%d  %s | %s' % (bid, byid[bid]['title'][:40], byid[bid]['authors'][:20], gid, t[:40], a[:20]))
    L += ['', 'DOUBTFUL (not used), first 40', '-' * 60]
    for bid, (gid, t, a, why) in list(mj['b'].items())[:40]:
        L.append('  %s  %s | %s  ->  #%d  %s  [%s]' % (bid, byid[bid]['title'][:40], byid[bid]['authors'][:20], gid, t[:40], why))
    return '\n'.join(L) + '\n'


def check_outputs(books, tj, fj, mj, size):
    """Stops the upload if anything looks wrong."""
    ids = {str(b['id']) for b in books}
    assert tj['n'] == len(books) == len(tj['b']), 'texts.json does not list every book'
    assert set(tj['b']) == ids, 'texts.json ids differ from the catalog'
    assert size < LIMIT_BYTES, 'texts.json is too big: %d bytes' % size
    cat = {str(b['id']): b['gid'] for b in books}
    for bid, (gid, flags) in tj['b'].items():
        assert isinstance(gid, int) and gid >= 0, 'bad number for ' + bid
        assert all(c in FLAG_ORDER for c in flags) and list(flags) == sorted(flags, key=FLAG_ORDER.index), 'bad flags for ' + bid
        if cat[bid]:
            assert gid == cat[bid] and 's' not in flags, 'a catalog number was changed for ' + bid
        if 's' in flags:
            assert bid in fj['b'] and fj['b'][bid][0] == gid, 'found number not in found-gutenberg.json: ' + bid
        if bid in mj['b']:
            assert gid == 0 and 's' not in flags, 'a doubtful match was used for ' + bid


# ---------------------------------------------------------------- Hugging Face (only used in "full" mode)
def get_token():
    tok = None
    try:
        from kaggle_secrets import UserSecretsClient
        tok = UserSecretsClient().get_secret('HF_TOKEN')
    except Exception:
        pass
    tok = tok or os.environ.get('HF_TOKEN')
    if not tok:
        raise SystemExit('No Hugging Face key found. In Kaggle: Add-ons > Secrets > add HF_TOKEN, tick it for this notebook, run again.')
    return tok


class Hub:
    def __init__(self, token):
        try:
            import huggingface_hub  # noqa: F401
        except ImportError:
            import subprocess
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'huggingface_hub'], check=True)
        from huggingface_hub import HfApi
        self.token = token
        self.api = HfApi(token=token)

    def _tree(self, repo, path, recursive):
        for e in self.api.list_repo_tree(repo, repo_type='dataset', path_in_repo=path, recursive=recursive):
            yield getattr(e, 'path', '')

    def list_gids(self):
        """Gutenberg numbers that really have a file: texts/<n // 1000>/<n>.txt.gz"""
        gids, odd = set(), 0
        for p in self._tree(BOOK_TEXT, 'texts', True):
            m = re.fullmatch(r'texts/(\d+)/(\d+)\.txt\.gz', p)
            if m:
                if int(m.group(1)) == int(m.group(2)) // 1000:
                    gids.add(int(m.group(2)))
                else:
                    odd += 1
        if odd:
            print('note: %d files in Book_Text are in the wrong folder and were not counted' % odd)
        return gids

    def list_pack_ids(self):
        ids = set()
        for folder in ('wt_packs_v2', 'wt_packs'):
            try:
                for p in self._tree(PACKS, folder, False):
                    m = re.fullmatch(folder + r'/(\d+)\.json(\.gz)?', p)
                    if m:
                        ids.add(int(m.group(1)))
            except Exception as e:
                print('note: could not list %s (%s)' % (folder, e))
        return ids

    def get_bytes(self, repo, path):
        from huggingface_hub import hf_hub_download
        try:
            p = hf_hub_download(repo, path, repo_type='dataset', token=self.token, force_download=True)
        except Exception as e:
            if '404' in str(e) or 'Entry Not Found' in str(e) or e.__class__.__name__ in ('EntryNotFoundError', 'RemoteEntryNotFoundError'):
                return None
            raise
        return open(p, 'rb').read()

    def put_bytes(self, repo, path, data, msg):
        self.api.upload_file(path_or_fileobj=io.BytesIO(data), path_in_repo=path, repo_id=repo, repo_type='dataset', commit_message=msg)

    def commit(self, repo, files, msg):
        from huggingface_hub import CommitOperationAdd
        ops = [CommitOperationAdd(path_in_repo=p, path_or_fileobj=io.BytesIO(d)) for p, d in files.items()]
        self.api.create_commit(repo_id=repo, repo_type='dataset', operations=ops, commit_message=msg)


# ---------------------------------------------------------------- the cell
def _load_cache(path):
    try:
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_cache(path, cache):
    tmp = path + '.tmp'
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        json.dump(cache, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, path)


def _cache_bytes(path):
    return open(path, 'rb').read()


def pick_trial(books, n, n_check, seed=6):
    rnd = random.Random(seed)
    nog = [b for b in books if not b['gid']]
    various = [b for b in nog if author_is_generic(b)]
    foreign = [b for b in nog if not author_is_generic(b) and b['lang'] != 'English']
    english = [b for b in nog if not author_is_generic(b) and b['lang'] == 'English']
    q1 = n // 4
    pick = rnd.sample(various, min(q1, len(various))) + rnd.sample(foreign, min(q1, len(foreign)))
    pick += rnd.sample(english, min(n - len(pick), len(english)))
    have = [b for b in books if b['gid']]
    check = rnd.sample(have, min(n_check, len(have)))
    return pick, check


def print_table(rows, out=print):
    head = ('id', 'LibriVox title', 'author', 'answer', 'Gutenberg title', '#', 'note')
    w = (6, 30, 16, 6, 30, 6, 40)
    out(' | '.join(h.ljust(x) for h, x in zip(head, w)))
    out('-+-'.join('-' * x for x in w))
    for r in rows:
        out(' | '.join(str(c)[:x].ljust(x) for c, x in zip(r, w)))


def run(mode='trial', trial_n=None, trial_check=None, max_hours=10.5, workers=3, delay=0.3, force_partial=False,
        hub=None, fetch=None, catalog=None, workdir=None, clock=time.time, sleep=time.sleep, out=print):
    if mode not in ('trial', 'full'):
        raise SystemExit('MODE must be "trial" or "full"')
    trial_n = trial_n if trial_n is not None else globals().get('TRIAL_N', 20)          # the notebook cell can set TRIAL_N / TRIAL_CHECK
    trial_check = trial_check if trial_check is not None else globals().get('TRIAL_CHECK', 10)
    t0 = clock()
    workdir = workdir or ('/kaggle/working' if os.path.isdir('/kaggle/working') else '.')
    fetch = fetch or http_fetch
    books = parse_books(catalog if catalog is not None else load_catalog(log=out))
    nog = [b for b in books if not b['gid']]
    out('catalog: %d books, %d with a Gutenberg number, %d without' % (len(books), len(books) - len(nog), len(nog)))
    cpath = os.path.join(workdir, 'search-cache.json.gz')
    cache = _load_cache(cpath)

    if mode == 'trial':
        pick, check = pick_trial(books, trial_n, trial_check)
        todo = [b for b in pick + check if str(b['id']) not in cache]
        out('trial: %d books without a number + %d books whose number is known (to test the search); %d still to search' % (len(pick), len(check), len(todo)))
        st = run_searches(todo, cache, fetch, workers, delay, t0 + 1800, lambda c: _save_cache(cpath, c), 10, clock, sleep)
        rows = []
        for b in pick + check:
            c = cache.get(str(b['id']))
            known = b['gid']
            if c is None:
                rows.append((b['id'], b['title'], b['authors'], 'ERROR', '', '', 'the search did not answer; run again'))
                continue
            d = decide(b, c['h'])
            note = d['why']
            if known:
                note = ('RIGHT: same number as the catalog' if d['kind'] == 'found' and d['gid'] == known else
                        'WRONG BOOK PICKED!' if d['kind'] == 'found' else 'not found (safe)') + '  [%s]' % d['why']
            rows.append((b['id'], b['title'], b['authors'], d['kind'].upper() if not known else 'check', d['title'], d['gid'] or '', note))
        print_table(rows, out)
        wrong = sum(1 for r in rows if r[6].startswith('WRONG'))
        right = sum(1 for r in rows if r[6].startswith('RIGHT'))
        out('')
        out('Test on books whose number is known: right %d, wrong %d, not found %d (of %d).' % (right, wrong, len(check) - right - wrong, len(check)))
        out('Wrong must be 0. Nothing was uploaded. If it looks good, set MODE = "full" and run the cell again.')
        return {'rows': rows, 'wrong': wrong, 'right': right, 'failed': st['failed']}

    # ---- full run
    hub = hub or Hub(get_token())
    raw = hub.get_bytes(BOOK_TEXT, CACHE_PATH)
    if raw:
        try:
            remote = json.loads(gzip.decompress(raw).decode('utf-8'))
            out('restored %d earlier searches from Hugging Face' % len(remote))
            remote.update(cache)
            cache = remote
        except Exception as e:
            out('could not read the saved work file (%s); starting from this notebook\'s own copy' % e)
    out('listing the files in Book_Text and wordtrail-packs (this takes a minute)...')
    bt_gids = hub.list_gids()
    pack_ids = hub.list_pack_ids()
    out('Book_Text has %d Gutenberg files; %d books have a timing file' % (len(bt_gids), len(pack_ids)))
    if not bt_gids or not pack_ids:
        raise SystemExit('A list came back empty: stopping, so no wrong status list is written. Check the HF_TOKEN key and run again.')
    todo = [b for b in nog if str(b['id']) not in cache]
    out('%d of %d books without a number are already searched; %d to do' % (len(nog) - len(todo), len(nog), len(todo)))
    last_up = [len(cache)]

    def save(c):
        _save_cache(cpath, c)
        if len(c) - last_up[0] >= UPLOAD_EVERY:
            try:
                hub.put_bytes(BOOK_TEXT, CACHE_PATH, _cache_bytes(cpath), 'texts status: searches so far (%d)' % len(c))
                last_up[0] = len(c)
                out('  saved progress: %d searches done (%.0f min)' % (len(c), (clock() - t0) / 60))
            except Exception as e:
                out('  (progress upload failed, will try again: %s)' % e)
    st = run_searches(todo, cache, fetch, workers, delay, t0 + max_hours * 3600, save, 100, clock, sleep)
    _save_cache(cpath, cache)
    try:
        hub.put_bytes(BOOK_TEXT, CACHE_PATH, _cache_bytes(cpath), 'texts status: searches so far (%d)' % len(cache))
    except Exception as e:
        out('(final progress upload failed: %s)' % e)
    missing = [b['id'] for b in nog if str(b['id']) not in cache]
    if missing and not force_partial:
        why = {'time': 'the time limit I set (%.1f hours) was reached' % max_hours, 'down': 'the search site stopped answering'}.get(st['stopped'], 'some searches failed')
        out('NOT FINISHED: %d books are still not searched (%s). Nothing is lost. Run this cell again to continue.' % (len(missing), why))
        return {'finished': False, 'missing': len(missing)}
    made = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(clock()))
    tj, fj, mj, counts, extra = build_status(books, cache, bt_gids, pack_ids, made)
    tbytes = dumps(tj).encode('utf-8')
    check_outputs(books, tj, fj, mj, len(tbytes))
    note = ('NOTE: %d books were not searched (forced partial run).' % len(missing)) if missing else ''
    report = make_report(books, tj, fj, mj, counts, extra, len(bt_gids), len(pack_ids), made, note)
    out('\n' + report)
    files = {STATUS_DIR + '/texts.json': tbytes,
             STATUS_DIR + '/found-gutenberg.json': dumps(fj).encode('utf-8'),
             STATUS_DIR + '/maybe-gutenberg.json': dumps(mj).encode('utf-8'),
             STATUS_DIR + '/texts-report.txt': report.encode('utf-8')}
    hub.commit(BOOK_TEXT, files, 'texts status list (%d books)' % len(books))
    out('uploaded 4 files in one step. Checking them by reading them back...')
    rows = []
    for path, data in files.items():
        back = hub.get_bytes(BOOK_TEXT, path)
        ok = back == data
        rows.append((path, len(data), len(back or b''), 'OK' if ok else 'DIFFERENT'))
    for r in rows:
        out('  %-34s sent %8d bytes, read back %8d  %s' % r)
    if any(r[3] != 'OK' for r in rows):
        raise SystemExit('FINAL CHECK FAILED: a file read back is not the same as the file sent. Run the cell again.')
    back = json.loads(hub.get_bytes(BOOK_TEXT, STATUS_DIR + '/texts.json').decode('utf-8'))
    out('FINAL COUNT CHECK: catalog %d books, texts.json lists %d, found by search %d, size %.2f MB (limit %.1f MB) -> %s' % (
        len(books), back['n'], extra['s'], len(tbytes) / 1e6, LIMIT_BYTES / 1e6,
        'ALL GOOD' if back['n'] == len(books) == len(back['b']) else 'MISMATCH'))
    if back['n'] != len(books):
        raise SystemExit('FINAL CHECK FAILED: the counts differ.')
    return {'finished': True, 'counts': counts, 'extra': extra, 'files': {p: len(d) for p, d in files.items()}}
