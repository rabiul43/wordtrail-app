#!/usr/bin/env python3
"""ambient_prep.py - measure how loud each ambient recording is, and write the numbers into recordings.json.

    python tools/ambient_prep.py --data-dir ../wordtrail-data            # measure the files that have no numbers yet
    python tools/ambient_prep.py --data-dir ../wordtrail-data --all      # measure every file again
    python tools/ambient_prep.py --data-dir ../wordtrail-data --dry-run  # show the numbers, write nothing
    python tools/ambient_prep.py --selftest                              # check the measure on made-up sounds (needs ffmpeg only)

This is the ambient twin of music_prep.py: music clips carry a `lufs` number in music.json (musLufsGain in sound/music-bus.js
turns it into a gain); recordings carry the numbers below in recordings.json. The app reads them when a recording loads and
levels it to the reference for that sound. Nothing is re-encoded and credits are kept as they are.

What is written for each sound in recordings.json (all dB are relative to full scale, so 0 is the loudest possible):
  sb   speech-band level, 300-4000 Hz, both channels, with a silence gate (near-silent parts are ignored)  <- the main number
  pk   sample peak of the whole file, both channels
  st   loudest 3 seconds of the speech band (short-term maximum): says how bursty the sound is (thunder, crackle, crowd)
  sh   share of the (gated) energy that sits in the speech band, 0 to 1: a mid-band sound (rain, cafe) is high, a drone is low

How it is measured
  1. ffmpeg decodes the file to 44.1 kHz stereo float (a mono file is copied to both sides, so it reads the same level).
  2. For sb, st and sh the sound goes through a 300 Hz high-pass and a 4 kHz low-pass (second order, like the browser's own filters).
  3. Power is taken in 100 ms blocks (both channels averaged). Blocks below -70 dB are dropped, then blocks more than
     20 dB under the average of what is left. sb is the average power of the blocks that remain.
A `file` in recordings.json can be a path inside the data folder or a full web address (https://...). A web address is
downloaded to a temporary file, measured and deleted, so that needs internet; nothing is kept.
Needs ffmpeg and ffprobe on the PATH. Plain Python, nothing to install.
"""
import argparse, array, json, math, os, subprocess, sys, tempfile, urllib.request

RATE = 44100                 # decode rate; close to what a phone runs the audio at, so the peak is close to what is played
BLOCK = RATE // 10           # 100 ms
SHORT = 30                   # blocks in the short-term window (3 s)
HOP = 10                     # blocks between short-term windows (1 s)
ABS_GATE = -70.0             # dB: quieter blocks are silence
REL_GATE = -20.0             # dB under the average: quieter blocks are the quiet gaps, not the sound
BAND = "highpass=f=300:poles=2,lowpass=f=4000:poles=2"
FIELDS = ("sb", "pk", "st", "sh")

def db(p):
    """Power to dB. Zero gives a very low number instead of an error."""
    return 10.0 * math.log10(p) if p > 1e-12 else -120.0

def channels(path):
    """How many channels the first audio stream has (0 if it cannot be told)."""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels",
                        "-of", "default=noprint_wrappers=1:nokey=1", str(path)], capture_output=True, text=True)
    try: return int(r.stdout.strip())
    except ValueError: return 0

def decode(path, af=None):
    """The file as interleaved stereo floats at RATE, optionally through an ffmpeg filter.
    A mono file is copied to both sides at full level: ffmpeg's own mono-to-stereo upmix lowers each side by 3 dB,
    which would make every mono recording read 3 dB too quiet. More than two channels are mixed down by ffmpeg."""
    chain = []
    if channels(path) == 1: chain.append("pan=stereo|c0=c0|c1=c0")
    if af: chain.append(af)
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(path), "-vn"]
    if chain: cmd += ["-af", ",".join(chain)]
    cmd += ["-ac", "2", "-ar", str(RATE), "-f", "f32le", "-"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0: raise RuntimeError("ffmpeg could not read the file: " + r.stderr.decode("utf-8", "replace").strip()[:200])
    a = array.array("f"); a.frombytes(r.stdout[: len(r.stdout) // 8 * 8])    # whole stereo frames only
    if sys.byteorder != "little": a.byteswap()
    return a

def block_powers(a):
    """Mean power of each 100 ms block, both channels averaged. A last piece shorter than half a block is left out."""
    n = len(a) // 2
    out = []
    for s in range(0, n, BLOCK):
        e = min(n, s + BLOCK)
        if e - s < BLOCK // 2 and out: break
        seg = a[2 * s: 2 * e]
        out.append(sum(x * x for x in seg) / max(1, len(seg)))
    return out

def gate(p):
    """Which blocks count: above the absolute gate, then not more than REL_GATE under the average of those."""
    loud = [i for i, x in enumerate(p) if db(x) >= ABS_GATE]
    if not loud: return []
    avg = db(sum(p[i] for i in loud) / len(loud))
    return [i for i in loud if db(p[i]) >= avg + REL_GATE]

def short_max(p):
    """Loudest 3 s window of the power list (the whole file if it is shorter than 3 s)."""
    if not p: return None
    if len(p) <= SHORT: return db(sum(p) / len(p))
    return max(db(sum(p[s:s + SHORT]) / SHORT) for s in range(0, len(p) - SHORT + 1, HOP))

def measure(path):
    """Measure one file. Returns {sb, pk, st, sh}; sb/st/sh are None for a file that is silent all through."""
    full = decode(path)
    if len(full) < 2: raise RuntimeError("the file has no audio")
    pk = max(max(full), -min(full))
    band = decode(path, BAND)
    pb, pf = block_powers(band), block_powers(full)
    keep = gate(pb)
    res = {"pk": round(20.0 * math.log10(pk), 1) if pk > 1e-6 else -120.0, "sb": None, "st": None, "sh": None}
    if not keep: return res
    sb_p = sum(pb[i] for i in keep) / len(keep)
    all_p = sum(pf[i] for i in keep) / len(keep)
    res["sb"] = round(db(sb_p), 1)
    res["st"] = round(short_max(pb), 1)
    res["sh"] = round(min(1.0, sb_p / all_p), 2) if all_p > 0 else None
    return res

def measure_url(url):
    """Download a web address to a temporary file, measure it, and delete the file again. Needs internet."""
    if not url.lower().startswith(("http://", "https://")): raise RuntimeError("only http(s) addresses can be downloaded")
    suffix = os.path.splitext(url.split("?")[0])[1][:5] or ".mp3"
    fd, tmp = tempfile.mkstemp(suffix=suffix); os.close(fd)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "wordtrail-ambient-prep"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as out:
                while True:
                    b = r.read(1 << 16)
                    if not b: break
                    out.write(b)
        except Exception as e: raise RuntimeError("could not download it (" + str(e)[:100] + ")")
        return measure(tmp)
    finally:
        try: os.remove(tmp)
        except OSError: pass

def has_numbers(m):
    return isinstance(m, dict) and all(isinstance(m.get(k), (int, float)) for k in ("sb", "pk"))

def load_json(path):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except FileNotFoundError: return None
    except Exception as e: sys.exit(f"{path}: cannot be read ({e})")

def save_json(path, d):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(d, f, indent=2, ensure_ascii=False); f.write("\n")
    os.replace(tmp, path)

def run(root, redo, dry):
    path = os.path.join(root, "recordings.json")
    d = load_json(path)
    if d is None: sys.exit(f"recordings.json not found in {root}")
    if not isinstance(d, dict): sys.exit("recordings.json must be an object like {\"rain\": {\"file\": ...}}")
    print(f"  {'sound':<8}{'sb':>8}{'peak':>8}{'short':>8}{'share':>7}  note")
    changed = 0
    for k, m in d.items():
        if not isinstance(m, dict) or not m.get("file"): continue
        if has_numbers(m) and not redo: print(f"  {k:<8}{m['sb']:>8}{m['pk']:>8}{m.get('st', ''):>8}{m.get('sh', ''):>7}  already measured (use --all to redo)"); continue
        f = m["file"]
        try:
            if "://" in f: r = measure_url(f)        # the real list holds full web addresses: download, measure, delete
            else:
                p = os.path.join(root, f)
                if not os.path.isfile(p): print(f"  {k:<8}  WARN: {f} is not on disk"); continue
                r = measure(p)
        except Exception as e: print(f"  {k:<8}  ERROR: {e}"); continue
        if r["sb"] is None: print(f"  {k:<8}  WARN: {f} is silent all through; no numbers written"); continue
        note = "burst-heavy" if r["st"] - r["sb"] > 6 else ""
        print(f"  {k:<8}{r['sb']:>8}{r['pk']:>8}{r['st']:>8}{r['sh']:>7}  {note}")
        for key in FIELDS:
            if r[key] is not None: m[key] = r[key]
        changed += 1
    if dry: print(f"\nDry run: {changed} sound(s) measured, nothing written.")
    elif changed: save_json(path, d); print(f"\n{changed} sound(s) written to {path}")
    else: print("\nNothing to write.")

def selftest():
    """Make sounds with known levels and check the measure gives the right numbers."""
    bad = []
    def check(name, got, want, tol=0.3):
        ok = got is not None and abs(got - want) <= tol
        print(f"  {'ok  ' if ok else 'FAIL'} {name}: got {got}, want {want} +/- {tol}")
        if not ok: bad.append(name)
    def make(tmp, name, expr, extra=()):
        p = os.path.join(tmp, name)
        subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y", *expr, *extra, p], check=True)
        return p
    with tempfile.TemporaryDirectory() as t:
        sine = lambda hz, amp, sec: f"sine=f={hz}:d={sec}:r={RATE},volume={amp / 0.125}:eval=once"   # ffmpeg's sine peaks at 0.125, so scale it
        both = ",pan=stereo|c0=c0|c1=c0"      # the same wave on both sides at full level (a plain -ac 2 would lower each side by 3 dB)
        tone = lambda hz, amp, sec, ch=2: ["-f", "lavfi", "-i", sine(hz, amp, sec) + (both if ch == 2 else "")]
        # 1 kHz sine, peak 0.1: RMS 0.0707 = -23.0 dB, peak -20.0 dB, all of it in the band
        r = measure(make(t, "a.wav", tone(1000, 0.1, 6)))
        check("1 kHz tone level", r["sb"], -23.0); check("1 kHz tone peak", r["pk"], -20.0); check("1 kHz tone share", r["sh"], 1.0, 0.03)
        # the same as a mono file: must read the same
        r = measure(make(t, "m.wav", tone(1000, 0.1, 6, 1)))
        check("mono reads the same", r["sb"], -23.0)
        # 100 Hz sine at 0.5 (-9.0 dB): the 300 Hz high-pass takes off 19.1 dB there (second order), so about -28.1 dB, and almost no share
        r = measure(make(t, "b.wav", tone(100, 0.5, 6)))
        check("100 Hz tone is small in the band", r["sb"], -28.1, 1.0); check("100 Hz tone share is low", r["sh"], 0.0, 0.1)
        # tone then digital silence: the silent half must not pull the level down
        r = measure(make(t, "g.wav", ["-f", "lavfi", "-i", sine(1000, 0.1, 4) + ",apad=whole_dur=8" + both]))
        check("silence is gated out", r["sb"], -23.0)
        # a loud 3 s burst in a quiet bed: the short-term maximum must show the burst, the gated level sits in between
        bed = sine(1100, 0.02, 12)    # a different pitch from the burst, so the two add as power, not as one wave
        burst = sine(1000, 0.2, 3) + ",adelay=4000|4000,apad=whole_dur=12"
        r = measure(make(t, "x.wav", ["-f", "lavfi", "-i", bed, "-f", "lavfi", "-i", burst, "-filter_complex", "amix=inputs=2:normalize=0" + both]))
        check("burst short-term max", r["st"], -17.0, 1.0)
        if not (r["sb"] is not None and -30.0 < r["sb"] < -17.5): bad.append("burst integrated sits between bed and burst"); print("  FAIL burst integrated level", r["sb"])
        else: print(f"  ok   burst integrated level: {r['sb']} (between bed and burst)")
        # a file of pure silence has no loudness: sb stays None
        r = measure(make(t, "s.wav", ["-f", "lavfi", "-i", f"anullsrc=r={RATE}:cl=stereo", "-t", "3"]))
        none_ok = r["sb"] is None
        print(f"  {'ok  ' if none_ok else 'FAIL'} silent file has no level")
        if not none_ok: bad.append("silent file")
    print("\nSELFTEST " + ("FAILED: " + ", ".join(bad) if bad else "passed"))
    return 1 if bad else 0

def main():
    ap = argparse.ArgumentParser(description="Measure ambient recordings and write sb/pk/st/sh into recordings.json.")
    ap.add_argument("--data-dir", default=os.environ.get("WORDTRAIL_DATA", "../wordtrail-data"), help="the folder that holds recordings.json (and the audio files, unless recordings.json lists web addresses)")
    ap.add_argument("--all", action="store_true", help="measure every file again, not just the ones without numbers")
    ap.add_argument("--dry-run", action="store_true", help="show the numbers without writing recordings.json")
    ap.add_argument("--selftest", action="store_true", help="check the measure on made-up sounds and exit")
    a = ap.parse_args()
    if a.selftest: sys.exit(selftest())
    if not os.path.isdir(a.data_dir): sys.exit(f"Data folder not found: {a.data_dir}  (use --data-dir)")
    print("Measuring recordings in " + os.path.abspath(a.data_dir)); run(a.data_dir, a.all, a.dry_run)

if __name__ == "__main__":
    main()
