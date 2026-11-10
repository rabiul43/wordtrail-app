#!/usr/bin/env python3
"""Make a translation pack: every sentence of one book, translated into one language, in ONE compressed JSON file.
Free and offline-friendly: it uses an open model that runs on a free Kaggle or Colab GPU. No keys, no accounts, no paid API.
Full steps and the file format: tools/TRANSLATION-PACKS.md

    python tools/make_translation_pack.py --text book.txt --book 1342 --title "Pride and Prejudice" --lang bn
    python tools/make_translation_pack.py --sentences sentences.json --book 1342 --lang bn --model facebook/m2m100_418M
    python tools/make_translation_pack.py --text book.txt --book 1342 --lang bn --engine dummy --limit 20   # format test, no model
    python tools/make_translation_pack.py --verify packs/1342.bn.json.gz --text book.txt                    # coverage report

Output: <out>/<book>.<lang>.json.gz   (default out folder: packs/)
Needs: Python 3.8+, and for real translation `pip install transformers sentencepiece torch` (already there on Kaggle and Colab).
For --text it also needs Node.js (Colab and Kaggle have it) and this repository's src/js/010-core.js, so the sentences are
split exactly like the app does it. Without Node, make sentences.json on any computer with: node tools/pack_sentences.js book.txt > sentences.json
Exit codes: 0 done, 1 a check failed (--verify), 2 bad arguments or a missing tool."""
import argparse, datetime, gzip, json, os, shutil, struct, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
FORMAT, VERSION, KEY_NAME = 'wordtrail-translation-pack', 1, 'fnv1a-utf16-base36'

# The languages of the app's translation list (TR_LANGS in src/js/160-learning-tools.js): app code -> (NLLB code, M2M100 code, name)
LANGS = {
    'bn': ('ben_Beng', 'bn', 'Bengali'), 'hi': ('hin_Deva', 'hi', 'Hindi'), 'ur': ('urd_Arab', 'ur', 'Urdu'), 'ar': ('arb_Arab', 'ar', 'Arabic'),
    'es': ('spa_Latn', 'es', 'Spanish'), 'fr': ('fra_Latn', 'fr', 'French'), 'de': ('deu_Latn', 'de', 'German'), 'it': ('ita_Latn', 'it', 'Italian'),
    'pt': ('por_Latn', 'pt', 'Portuguese'), 'ru': ('rus_Cyrl', 'ru', 'Russian'), 'tr': ('tur_Latn', 'tr', 'Turkish'), 'id': ('ind_Latn', 'id', 'Indonesian'),
    'zh-CN': ('zho_Hans', 'zh', 'Chinese'), 'ja': ('jpn_Jpan', 'ja', 'Japanese'), 'ko': ('kor_Hang', 'ko', 'Korean'),
}
# Licences of the usual models, written from the model cards when this script was made. ALWAYS check the card of the model you run:
# the licence of the model decides whether its translations may ship in the app. NLLB weights are non-commercial.
LICENSES = {'facebook/nllb-200-distilled-600M': 'CC-BY-NC-4.0', 'facebook/nllb-200-distilled-1.3B': 'CC-BY-NC-4.0', 'facebook/m2m100_418M': 'MIT', 'facebook/m2m100_1.2B': 'MIT'}
DEFAULT_MODEL = 'facebook/nllb-200-distilled-600M'


def die(msg, code=2):
    print('make_translation_pack: ' + msg, file=sys.stderr)
    sys.exit(code)


# ---------- the key of a sentence: the SAME hash as the app's translation cache (fnv in src/js/160b-translate-provider.js) ----------
def sentence_key(text):
    """FNV-1a over the UTF-16 code units of the trimmed text, then base36 of the hash, '.', base36 of the length (UTF-16 units).
    Identical to the JavaScript `fnv(text)`; tools/translation_pack_check.py proves it against the real JavaScript."""
    s = text.strip()
    data = s.encode('utf-16-le')
    units = struct.unpack('<%dH' % (len(data) // 2), data)
    x = 0x811C9DC5
    for u in units:
        x ^= u
        x = (x * 0x01000193) & 0xFFFFFFFF
    return _b36(x) + '.' + _b36(len(units))


def _b36(n):
    if n == 0:
        return '0'
    d, out = '0123456789abcdefghijklmnopqrstuvwxyz', ''
    while n:
        n, r = divmod(n, 36)
        out = d[r] + out
    return out


# ---------- sentences ----------
def load_sentences(args):
    """-> list of (key, text) in book order, trimmed, empty ones dropped, the same sentence only once."""
    if args.sentences:
        try:
            raw = json.load(open(args.sentences, encoding='utf-8'))
        except (OSError, ValueError) as e:
            die('cannot read %s: %s' % (args.sentences, e))
        items = raw.get('sents', []) if isinstance(raw, dict) else raw
        texts = [(x.get('t') if isinstance(x, dict) else x) for x in items]
    else:
        if not shutil.which('node'):
            die('Node.js is needed for --text (it runs the app\'s own sentence splitter). Install Node, or run '
                '"node tools/pack_sentences.js book.txt > sentences.json" elsewhere and use --sentences sentences.json')
        r = subprocess.run(['node', os.path.join(HERE, 'pack_sentences.js'), args.text], capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0:
            die('the sentence splitter failed: ' + (r.stderr.strip() or 'unknown error'))
        texts = [x['t'] for x in json.loads(r.stdout)['sents']]
    seen, out = set(), []
    for t in texts:
        t = t.strip() if isinstance(t, str) else ''
        if not t:
            continue
        k = sentence_key(t)
        if k in seen:
            continue
        seen.add(k)
        out.append((k, t))
    return out


# ---------- engines: each one turns a list of English sentences into a list of translations (None = no translation) ----------
def engine_dummy(lang):
    return lambda batch: ['[%s] %s' % (lang, s) for s in batch]


def engine_table(path):
    try:
        table = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e:
        die('cannot read the table %s: %s' % (path, e))
    return lambda batch: [table.get(s) or None for s in batch]


def engine_hf(model_name, lang, beams, max_in, device):
    try:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    except ImportError:
        die('real translation needs:  pip install transformers sentencepiece torch   (Kaggle and Colab already have them). '
            'To only test the file format, use --engine dummy.')
    low = model_name.lower()
    fam = 'nllb' if 'nllb' in low else 'm2m' if 'm2m' in low else 'plain'   # plain = a model made for one pair (e.g. opus-mt-en-xx)
    if fam != 'plain' and lang not in LANGS:
        die('language %s is not in the app list: %s' % (lang, ', '.join(LANGS)))
    tok = AutoTokenizer.from_pretrained(model_name)
    forced = None
    if fam == 'nllb':
        tok.src_lang = 'eng_Latn'
        forced = tok.convert_tokens_to_ids(LANGS[lang][0])
    elif fam == 'm2m':
        tok.src_lang = 'en'
        forced = tok.get_lang_id(LANGS[lang][1])
    dev = device if device != 'auto' else ('cuda' if torch.cuda.is_available() else 'cpu')
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    if dev == 'cuda':
        model = model.half()
    model = model.to(dev).eval()
    print('model %s on %s (%s)' % (model_name, dev, fam), flush=True)
    stats = {'truncated': 0}

    def run(batch):
        enc = tok(batch, return_tensors='pt', padding=True, truncation=True, max_length=max_in).to(dev)
        stats['truncated'] += int((enc['attention_mask'].sum(1) >= max_in).sum())
        kw = {'num_beams': beams, 'max_new_tokens': int(max_in * 1.5)}
        if forced is not None:
            kw['forced_bos_token_id'] = forced
        with torch.inference_mode():
            out = model.generate(**enc, **kw)
        return [t.strip() or None for t in tok.batch_decode(out, skip_special_tokens=True)]
    run.stats = stats
    return run


# ---------- the pack file ----------
def pack_path(args):
    return os.path.join(args.out, '%s.%s.json.gz' % (args.book, args.lang))


def write_pack(args, ordered, done, engine_id, model, licence, extra):
    rows = [[k, done[k]] for k, _ in ordered if done.get(k)]
    pack = {'format': FORMAT, 'v': VERSION, 'book': str(args.book), 'title': args.title or '', 'src': 'en', 'lang': args.lang, 'key': KEY_NAME,
            'engine': engine_id, 'model': model, 'license': licence,
            'made': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'n': len(rows), 'of': len(ordered), 's': rows}
    pack.update(extra)
    os.makedirs(args.out, exist_ok=True)
    path, tmp = pack_path(args), pack_path(args) + '.tmp'
    with gzip.GzipFile(tmp, 'wb', compresslevel=9, mtime=0) as f:   # mtime 0: the same input gives the same bytes
        f.write(json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    os.replace(tmp, path)
    return path, len(rows)


def verify(args):
    ordered = load_sentences(args)
    try:
        with gzip.open(args.verify, 'rt', encoding='utf-8') as f:
            pack = json.load(f)
    except (OSError, ValueError) as e:
        die('cannot read the pack %s: %s' % (args.verify, e))
    bad = []
    if pack.get('format') != FORMAT or pack.get('v') != VERSION:
        bad.append('not a %s v%d file' % (FORMAT, VERSION))
    rows = pack.get('s') if isinstance(pack.get('s'), list) else []
    if any(not (isinstance(r, list) and len(r) == 2 and isinstance(r[0], str) and isinstance(r[1], str) and r[1].strip()) for r in rows):
        bad.append('a row is not [key, translation]')
    if pack.get('n') != len(rows):
        bad.append('n says %s but the file has %d rows' % (pack.get('n'), len(rows)))
    have = {r[0] for r in rows if isinstance(r, list) and r}
    want = {k for k, _ in ordered}
    missing, extra = len(want - have), len(have - want)
    print('pack  : %s  book %s  %s  engine %s  model %s  licence %s' % (os.path.basename(args.verify), pack.get('book'), pack.get('lang'), pack.get('engine'), pack.get('model'), pack.get('license')))
    print('cover : %d of %d sentences translated, %d missing, %d keys that match no sentence of this text' % (len(want & have), len(want), missing, extra))
    if pack.get('test'):
        print('NOTE  : this is a TEST pack (placeholder text, not a translation). Never ship it.')
    for b in bad:
        print('FAIL  : ' + b)
    return 1 if bad or extra else 0


def main():
    ap = argparse.ArgumentParser(description='Make a translation pack (one compressed JSON per book and language).')
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--text', help='the book as a Project Gutenberg .txt file (needs Node.js)')
    src.add_argument('--sentences', help='sentences.json made by tools/pack_sentences.js (or a plain JSON list of sentences)')
    ap.add_argument('--book', help='book id (the app\'s book id, e.g. the LibriVox or Gutenberg number). Used in the file name')
    ap.add_argument('--title', default='', help='book title (only written into the file)')
    ap.add_argument('--lang', default='bn', help='target language, the app\'s code: ' + ' '.join(LANGS) + ' (default bn)')
    ap.add_argument('--engine', choices=['hf', 'dummy', 'table'], default='hf', help='hf = a Hugging Face model (default); dummy = placeholder text to test the format; table = take translations from --table')
    ap.add_argument('--model', default=DEFAULT_MODEL, help='Hugging Face model for --engine hf (default %s). m2m100 and opus-mt models work too' % DEFAULT_MODEL)
    ap.add_argument('--license', dest='licence', help='licence of the model\'s output, written into the file (default: looked up for known models, else "check the model card")')
    ap.add_argument('--table', help='JSON file {"English sentence": "translation"} for --engine table (hand-made or corrected translations)')
    ap.add_argument('--out', default='packs', help='output folder (default packs)')
    ap.add_argument('--limit', type=int, default=0, help='only the first N sentences (a small sample)')
    ap.add_argument('--batch', type=int, default=16, help='sentences per model call (default 16; lower it if the GPU runs out of memory)')
    ap.add_argument('--beams', type=int, default=4, help='beam search width (default 4)')
    ap.add_argument('--max-tokens', type=int, default=256, help='longest sentence in tokens; longer ones are cut and counted (default 256)')
    ap.add_argument('--device', default='auto', help='auto, cuda or cpu')
    ap.add_argument('--resume', action='store_true', help='continue from the .partial file of an earlier, interrupted run')
    ap.add_argument('--verify', metavar='PACK', help='check a pack against the book (needs --text or --sentences); prints the coverage')
    args = ap.parse_args()

    if not (args.text or args.sentences):
        die('give --text book.txt or --sentences sentences.json')
    if args.verify:
        sys.exit(verify(args))
    if not args.book:
        die('--book is required (it names the file)')
    if args.engine == 'table' and not args.table:
        die('--engine table needs --table file.json')

    ordered = load_sentences(args)
    if args.limit > 0:
        ordered = ordered[:args.limit]
    if not ordered:
        die('no sentences found in the book')
    print('%d sentences, %s -> %s, engine %s' % (len(ordered), 'en', args.lang, args.engine), flush=True)

    if args.engine == 'dummy':
        run, model, licence, eid = engine_dummy(args.lang), 'none', 'none (placeholder text)', 'dummy'
    elif args.engine == 'table':
        run, model, licence, eid = engine_table(args.table), 'hand-made table', args.licence or 'ask the author of the table', 'table'
    else:
        run, model, eid = engine_hf(args.model, args.lang, args.beams, args.max_tokens, args.device), args.model, 'hf'
        licence = args.licence or LICENSES.get(args.model, 'check the model card')

    partial = pack_path(args) + '.partial'
    os.makedirs(args.out, exist_ok=True)
    done = {}
    if args.resume and os.path.exists(partial):
        for line in open(partial, encoding='utf-8'):
            try:
                k, t = json.loads(line)
                if isinstance(k, str) and isinstance(t, str) and t:
                    done[k] = t
            except ValueError:
                pass   # a half-written last line
        print('resumed: %d sentences already done' % len(done), flush=True)
    elif os.path.exists(partial):
        os.remove(partial)
    todo = sorted([(k, t) for k, t in ordered if k not in done], key=lambda x: len(x[1]))   # similar lengths together: less padding, faster
    t0, n = time.time(), 0
    with open(partial, 'a', encoding='utf-8') as pf:
        for i in range(0, len(todo), max(1, args.batch)):
            chunk = todo[i:i + max(1, args.batch)]
            for (k, _), tr in zip(chunk, run([t for _, t in chunk])):
                if tr:
                    done[k] = tr
                    pf.write(json.dumps([k, tr], ensure_ascii=False) + '\n')
            pf.flush()   # an interrupted session keeps its work: run again with --resume
            n += len(chunk)
            if (i // max(1, args.batch)) % 10 == 0 or n == len(todo):
                print('  %d / %d  (%.0f s)' % (n, len(todo), time.time() - t0), flush=True)

    extra = {}
    if args.engine == 'dummy':
        extra['test'] = True
    st = getattr(run, 'stats', None)
    if st and st['truncated']:
        extra['truncated'] = st['truncated']
    path, rows = write_pack(args, ordered, done, eid, model, licence, extra)
    if os.path.exists(partial):
        os.remove(partial)
    print('wrote %s  (%d of %d sentences, %d bytes)' % (path, rows, len(ordered), os.path.getsize(path)))
    if rows < len(ordered):
        print('NOTE: %d sentences have no translation; they are left out of the pack (the app translates them live as before).' % (len(ordered) - rows))


if __name__ == '__main__':
    main()
