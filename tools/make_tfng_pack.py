#!/usr/bin/env python3
"""True / False / Not Given packs (Task 60): candidates made offline by an open model, then checked by a person, then published.
Free: runs on a free Kaggle or Colab GPU, no keys, no paid API. Format and steps: TFNG-PACKS.md

    # 1. candidates (on Kaggle or Colab): statements for lines 1-14 of a passage, written to packs/<book>.<passage>.tfng.json (all r = 0)
    python tools/make_tfng_pack.py --text book.txt --book 1342 --passage ch3 --from-line 120 --to-line 133 --title "Pride and Prejudice"
    # 2. a person edits that file: fixes wording, sets "r": 1 on every item that is right, deletes the rest
    # 3. publish (keeps only r = 1) and check
    python tools/make_tfng_pack.py --publish packs/1342.ch3.tfng.json --reviewer "Your Name"
    python tools/make_tfng_pack.py --verify packs/1342.ch3.tfng.json.gz

Without a model (hand-written statements, same checks): --engine table --table items.json
Passage lines come from the same sentence splitter as the translation packs (tools/make_translation_pack.py), so line keys match the app.
Exit codes: 0 done, 1 a check failed (--verify, --publish), 2 bad arguments or a missing tool."""
import argparse, datetime, gzip, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from make_translation_pack import load_sentences, sentence_key, KEY_NAME, die   # the SAME splitter and the SAME key hash: no copy

FORMAT, VERSION = 'wordtrail-tfng-pack', 1
ANSWERS = ('T', 'F', 'NG')
DEFAULT_MODEL = 'Qwen/Qwen2.5-7B-Instruct'
LICENSES = {'Qwen/Qwen2.5-7B-Instruct': 'Apache-2.0', 'mistralai/Mistral-7B-Instruct-v0.3': 'Apache-2.0'}   # from the model cards when written: ALWAYS check the card
MIN_W, MAX_W = 6, 35


def words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def one_sentence(s):
    return len(re.findall(r'[.!?](?:\s|$)', s.strip())) <= 1


# ---------- checks on one item (used by generate, publish and verify) ----------
def problems(it, n_lines):
    """-> list of reasons the item is NOT valid (empty = valid)."""
    bad = []
    if not isinstance(it, dict):
        return ['not an object']
    st, a, why, sup = it.get('st'), it.get('a'), it.get('why'), it.get('sup')
    if a not in ANSWERS:
        bad.append('a must be T, F or NG')
    if not isinstance(st, str) or not (MIN_W <= len(words(st)) <= MAX_W):
        bad.append('statement must have %d-%d words' % (MIN_W, MAX_W))
    if not isinstance(why, str) or not why.strip() or not one_sentence(why):
        bad.append('why must be one sentence')
    ok_sup = isinstance(sup, list) and all(isinstance(x, int) and not isinstance(x, bool) and 1 <= x <= n_lines for x in sup) and len(set(sup)) == len(sup)
    if not ok_sup:
        bad.append('sup must be a list of line numbers 1-%d' % n_lines)
    elif a in ('T', 'F') and not 1 <= len(sup) <= 3:
        bad.append('T and F need 1-3 supporting lines')
    elif a == 'NG' and sup:
        bad.append('NG must have no supporting line')
    if it.get('r') not in (0, 1):
        bad.append('r must be 0 or 1')
    return bad


def warnings(items, lines):
    """Hints for the reviewer, written into item['chk'] (never errors). 'copies line N' = nearly word for word (too easy); 'same as item' = repeated."""
    seen = {}
    lw = [set(words(t)) for _, t in lines]
    for it in items:
        chk, sw = [], set(words(it['st']))
        for i, s in enumerate(lw):
            if sw and s and len(sw & s) / len(sw | s) >= 0.8:
                chk.append('copies line %d' % (i + 1))
                break
        key = ' '.join(words(it['st']))
        if key in seen:
            chk.append('same as item ' + seen[key])
        seen.setdefault(key, it['id'])
        if chk:
            it['chk'] = chk
        else:
            it.pop('chk', None)


# ---------- engines: turn passage lines into raw candidates [{st, a, why, sup}] ----------
PROMPTS = {
    'T': 'TRUE: each statement says the same as one or two lines of the passage, in DIFFERENT words (do not copy a line).',
    'F': 'FALSE: each statement clearly contradicts one line (change a fact, a number, a direction or a reason, or say the opposite). The passage must give the opposite.',
    'NG': 'NOT GIVEN: each statement is about the same topic and sounds likely, but the passage neither says it nor contradicts it. A reader could not decide it from the passage. Use "line": null.',
}


def engine_table(path):
    try:
        raw = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e:
        die('cannot read %s: %s' % (path, e))
    items = raw.get('items', []) if isinstance(raw, dict) else raw
    return lambda lines, per: [{'st': x.get('st'), 'a': x.get('a'), 'why': x.get('why'), 'sup': x.get('sup', []), 'r': x.get('r', 0)} for x in items]


def parse_json_list(text):
    """The model should answer with a JSON list; accept a list inside other text, else single {...} objects."""
    i, j = text.find('['), text.rfind(']')
    if 0 <= i < j:
        try:
            v = json.loads(text[i:j + 1])
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
        except ValueError:
            pass
    out = []
    for m in re.finditer(r'\{[^{}]*\}', text):
        try:
            out.append(json.loads(m.group(0)))
        except ValueError:
            pass
    return out


def engine_hf(model_name, four_bit, temperature, seed):
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError:
        die('real generation needs:  pip install transformers accelerate torch   (Kaggle and Colab already have them; --4bit also needs bitsandbytes). '
            'To use hand-written statements, use --engine table.')
    kw = {'device_map': 'auto'}
    if four_bit:
        from transformers import BitsAndBytesConfig
        kw['quantization_config'] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
    else:
        kw['torch_dtype'] = torch.float16
    tok = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(model_name, **kw).eval()
    torch.manual_seed(seed)
    print('model %s (%s)' % (model_name, '4-bit' if four_bit else 'fp16'), flush=True)

    def ask(lines, a, k):
        numbered = '\n'.join('[%d] %s' % (i + 1, t) for i, (_, t) in enumerate(lines))
        msg = ('You write IELTS Reading "True / False / Not Given" practice for learners of English (about B2 level).\n'
               'Passage, one numbered line per sentence:\n%s\n\n'
               'Write %d statements whose answer is %s\n'
               'Rules: plain English, ONE sentence of %d-25 words, about the passage only, no tricks with names or spelling, '
               'each statement about a different part of the passage. For every statement add "reason" (ONE short sentence that '
               'says why the answer is right) and "line" (the line number that shows it%s).\n'
               'Answer with ONLY a JSON list: [{"statement": "...", "reason": "...", "line": 3}]' % (numbered, k, PROMPTS[a], MIN_W + 2, ', or null for NOT GIVEN'))
        ids = tok.apply_chat_template([{'role': 'user', 'content': msg}], add_generation_prompt=True, return_tensors='pt', return_dict=True).to(model.device)
        with torch.inference_mode():
            out = model.generate(**ids, max_new_tokens=900, do_sample=True, temperature=temperature, top_p=0.9)
        text = tok.decode(out[0][ids['input_ids'].shape[1]:], skip_special_tokens=True)
        res = []
        for x in parse_json_list(text):
            ln = x.get('line')
            sup = [ln] if isinstance(ln, int) and not isinstance(ln, bool) and a != 'NG' else []
            res.append({'st': (x.get('statement') or '').strip(), 'a': a, 'why': (x.get('reason') or '').strip(), 'sup': sup, 'r': 0})
        return res

    return lambda lines, per: [it for a in ANSWERS for it in ask(lines, a, per)]


# ---------- files ----------
def read_pack(path):
    try:
        if path.endswith('.gz'):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                return json.load(f)
        return json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError) as e:
        die('cannot read %s: %s' % (path, e))


def check_pack(pack):
    """-> (list of failures, per-answer counts of valid approved items)."""
    bad = []
    if pack.get('format') != FORMAT or pack.get('v') != VERSION:
        return ['not a %s v%d file' % (FORMAT, VERSION)], {}
    lines = pack.get('lines')
    if not (isinstance(lines, list) and lines and all(isinstance(r, list) and len(r) == 2 and all(isinstance(x, str) and x.strip() for x in r) for r in lines)):
        return ['lines must be a list of [key, text]'], {}
    for i, (k, t) in enumerate(lines):
        if k != sentence_key(t):
            bad.append('line %d: the key does not match its text' % (i + 1))
    items = pack.get('items') if isinstance(pack.get('items'), list) else []
    seen, counts = set(), {a: 0 for a in ANSWERS}
    for i, it in enumerate(items):
        for p in problems(it, len(lines)):
            bad.append('item %d: %s' % (i + 1, p))
        if isinstance(it, dict):
            if it.get('id') != sentence_key(it.get('st') or ''):
                bad.append('item %d: id is not the key of the statement' % (i + 1))
            if it.get('id') in seen:
                bad.append('item %d: repeated statement' % (i + 1))
            seen.add(it.get('id'))
            if it.get('r') == 1 and it.get('a') in counts:
                counts[it['a']] += 1
    if pack.get('n') is not None and pack.get('n') != len(items):
        bad.append('n says %s but the file has %d items' % (pack.get('n'), len(items)))
    return bad, counts


def out_name(book, passage):
    return '%s.%s.tfng.json' % (book, passage)


def generate(args):
    ordered = load_sentences(args)
    lo, hi = max(1, args.from_line), (args.to_line or len(ordered))
    lines = [list(x) for x in ordered[lo - 1:hi]]
    if len(lines) < 6:
        die('a passage needs at least 6 lines (got %d); check --from-line and --to-line' % len(lines))
    if args.engine == 'table':
        if not args.table:
            die('--engine table needs --table items.json')
        run, model, lic, eid = engine_table(args.table), 'hand-made table', args.licence or 'ask the author of the table', 'table'
    else:
        run, model, eid = engine_hf(args.model, args.four_bit, args.temperature, args.seed), args.model, 'hf'
        lic = args.licence or LICENSES.get(args.model, 'check the model card')
    print('%d passage lines, engine %s' % (len(lines), eid), flush=True)
    items, dropped = [], 0
    for c in run(lines, args.per_type):
        c = dict(c)
        c.setdefault('r', 0)
        c['id'] = sentence_key(c.get('st') or '')
        if problems(c, len(lines)) or any(x['id'] == c['id'] for x in items):
            dropped += 1   # a broken or repeated candidate is not worth a person's time
            continue
        items.append({k: c[k] for k in ('id', 'st', 'a', 'why', 'sup', 'r')})
    warnings(items, lines)
    pack = {'format': FORMAT, 'v': VERSION, 'book': str(args.book), 'title': args.title or '', 'passage': args.passage, 'src': 'en', 'key': KEY_NAME,
            'engine': eid, 'model': model, 'license': lic, 'from': lo,
            'made': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'lines': lines, 'n': len(items), 'items': items}
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, out_name(args.book, args.passage))
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)
    cnt = {a: sum(1 for x in items if x['a'] == a) for a in ANSWERS}
    print('wrote %s: %d candidates (T %d, F %d, NG %d), %d dropped by the checks, %d flagged for the reviewer' % (path, len(items), cnt['T'], cnt['F'], cnt['NG'], dropped, sum(1 for x in items if 'chk' in x)))
    print('NEXT: a person reads every item, fixes the wording, sets "r": 1 on the right ones, deletes the rest, then --publish.')


def publish(args):
    pack = read_pack(args.publish)
    keep = [dict((k, v) for k, v in it.items() if k != 'chk') for it in pack.get('items', []) if isinstance(it, dict) and it.get('r') == 1]
    pack['items'], pack['n'] = keep, len(keep)
    pack['reviewed'] = {'by': args.reviewer or 'none', 'on': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')}
    if args.sample:
        pack['sample'] = True   # a reader must never use a pack with sample: true (the same rule as test: true in translation packs)
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
    print('wrote %s  (%d items: T %d, F %d, NG %d, %d bytes)' % (path, len(keep), counts['T'], counts['F'], counts['NG'], os.path.getsize(path)))


def verify(path):
    pack = read_pack(path)
    bad, counts = check_pack(pack)
    items = pack.get('items') if isinstance(pack.get('items'), list) else []
    print('pack  : %s  book %s  passage %s  engine %s  model %s  licence %s' % (os.path.basename(path), pack.get('book'), pack.get('passage'), pack.get('engine'), pack.get('model'), pack.get('license')))
    print('items : %d, approved (r = 1): T %d, F %d, NG %d, waiting for review: %d' % (len(items), counts.get('T', 0), counts.get('F', 0), counts.get('NG', 0), sum(1 for x in items if isinstance(x, dict) and x.get('r') == 0)))
    if pack.get('sample'):
        print('NOTE  : this is a SAMPLE pack. Never ship it.')
    if path.endswith('.gz') and not pack.get('reviewed'):
        bad.append('a published pack needs a "reviewed" field')
    for b in bad:
        print('FAIL  : ' + b)
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description='True / False / Not Given packs: make candidates, publish the reviewed ones, verify.')
    src = ap.add_mutually_exclusive_group()
    src.add_argument('--text', help='the book as a Project Gutenberg .txt file (needs Node.js)')
    src.add_argument('--sentences', help='sentences.json made by tools/pack_sentences.js (or a plain JSON list of sentences)')
    ap.add_argument('--book', help='book id (names the file)')
    ap.add_argument('--passage', default='p1', help='passage id, letters and digits (default p1); names the file')
    ap.add_argument('--title', default='', help='book title (information only)')
    ap.add_argument('--from-line', type=int, default=1, help='first sentence of the passage, counted from 1 (default 1)')
    ap.add_argument('--to-line', type=int, default=0, help='last sentence of the passage (default: the end)')
    ap.add_argument('--per-type', type=int, default=4, help='candidates per answer type, so about 3 x this (default 4)')
    ap.add_argument('--engine', choices=['hf', 'table'], default='hf', help='hf = a Hugging Face chat model (default); table = hand-written items from --table')
    ap.add_argument('--model', default=DEFAULT_MODEL, help='Hugging Face chat model (default %s)' % DEFAULT_MODEL)
    ap.add_argument('--4bit', dest='four_bit', action='store_true', help='load the model in 4-bit (less GPU memory; needs bitsandbytes)')
    ap.add_argument('--temperature', type=float, default=0.7)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--license', dest='licence', help='licence of the model\'s output, written into the file')
    ap.add_argument('--table', help='JSON list of {st, a, why, sup} for --engine table')
    ap.add_argument('--out', default='packs', help='output folder (default packs)')
    ap.add_argument('--publish', metavar='FILE', help='candidates file (.json) edited by a person -> the .json.gz with only r = 1 items')
    ap.add_argument('--reviewer', help='name of the person who read the items (required with --publish)')
    ap.add_argument('--sample', action='store_true', help='with --publish: mark the pack sample: true (a demo, never to ship)')
    ap.add_argument('--verify', metavar='PACK', help='check a .json or .json.gz pack and print the counts')
    args = ap.parse_args()
    if args.verify:
        sys.exit(verify(args.verify))
    if args.publish:
        return publish(args)
    if not (args.text or args.sentences):
        die('give --text book.txt or --sentences sentences.json')
    if not args.book:
        die('--book is required (it names the file)')
    if not re.fullmatch(r'[A-Za-z0-9]+', args.passage):
        die('--passage may only have letters and digits')
    generate(args)


if __name__ == '__main__':
    main()
