#!/usr/bin/env python3
"""ambient_loudness_audit.py - for each ambient recording: how loud it is, and what the app will do to it.

    python tools/ambient_loudness_audit.py --recordings ../wordtrail-data/recordings.json      # the numbers stored by ambient_prep.py (no network, no ffmpeg)
    python tools/ambient_loudness_audit.py --recordings recordings.json --compare              # also: what the OLD levelling did (an estimate), side by side
    python tools/ambient_loudness_audit.py --dir ./my-recordings                               # a folder of audio files named after the sounds (rain.mp3 ...); needs ffmpeg
    python tools/ambient_loudness_audit.py --selftest                                          # check the gain rule against the app's own JavaScript

Prints, for every file: its speech-band level (300-4000 Hz, both channels, silence ignored), its peak, the reference level of its sound, the gain the app
will apply when it loads the file (the same rule as ambRecGain in sound/ambient-recordings.js), and the level it ends up at. A file is FLAGGED when it is more than
3 dB (--threshold) away from its reference as delivered (so the app has to change it a lot), or when a limit stops the gain from reaching the reference.
Other notes: peaks over 0 dBFS in the file, bursty sounds (loudest 3 s far above the average), entries with no numbers.

The reference table (AMB_REC_REF) and the gain limits (AMB_REC_LIMIT) are read from the app's source files every time, so this tool cannot drift from the app.
It never uses the network: a recordings.json entry with no stored numbers is reported as such (measure it with ambient_prep.py), and a web address is never downloaded.
Exit code 0, or 1 with --strict when anything is flagged (for a check before publishing).
"""
import argparse, json, math, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

AUDIO = (".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus", ".aac", ".webm")
OLD_TARGET_RMS, OLD_MIN, OLD_MAX = 0.12, 0.15, 5.0       # what ambRecPrep used before the change: plain RMS of the left channel to 0.12, gain held between 0.15 and 5


def read_source():
    """The reference table and the gain limits, straight from the app's source."""
    scenes = open(os.path.join(ROOT, "src/js/sound/ambient-scenes.js"), encoding="utf-8").read()
    rec = open(os.path.join(ROOT, "src/js/sound/ambient-recordings.js"), encoding="utf-8").read()
    m = re.search(r"const AMB_REC_REF = \{([^}]*)\}", scenes)
    if not m: sys.exit("ambient_loudness_audit: AMB_REC_REF not found in src/js/sound/ambient-scenes.js")
    ref = {k: (float(a), float(b)) for k, a, b in re.findall(r"(\w+):\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]", m.group(1))}
    l = re.search(r"const AMB_REC_LIMIT = \{([^}]*)\}", rec)
    if not ref or not l: sys.exit("ambient_loudness_audit: the reference table or the limits could not be read from the source")
    lim = {k: float(v) for k, v in re.findall(r"(\w+):\s*(-?[\d.]+)", l.group(1))}
    for k in ("maxDb", "minDb", "peakDb"):
        if k not in lim: sys.exit("ambient_loudness_audit: AMB_REC_LIMIT has no " + k)
    return ref, lim


def num(v, lo, hi):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi


def gain_db(ref, lim, sb, pk):
    """The gain (dB) the app applies to a recording with speech-band level sb and peak pk (dBFS, or None). Same rule as ambRecGain.
    Returns (gain_db, note) where note says which limit held it back, if any."""
    db = ref[0] - sb
    note = ""
    if db > lim["maxDb"]: db, note = lim["maxDb"], "gain capped at +%g dB" % lim["maxDb"]
    elif db < lim["minDb"]: db, note = lim["minDb"], "gain capped at %g dB" % lim["minDb"]
    if num(pk, -90, 20):
        room = lim["peakDb"] - pk                   # the loudest sample may not pass +peakDb dBFS
        if db > room: db, note = room, "peak cap (+%g dBFS)" % lim["peakDb"]
    return db, note


def old_estimate(sb, sh):
    """What the old levelling did, estimated from the stored numbers: it levelled the plain whole-spectrum RMS to 0.12 with the gain held between 0.15 and 5.
    The whole level is worked out as sb / share. It is an estimate: the old code measured only the left channel with no silence gate."""
    if not num(sh, 0.0001, 1.0): return None
    total = sb - 10.0 * math.log10(sh)
    g = max(20 * math.log10(OLD_MIN), min(20 * math.log10(OLD_MAX), 20 * math.log10(OLD_TARGET_RMS) - total))
    return g, sb + g


def entries_from_json(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        sys.exit("cannot read %s: %s" % (path, e))
    if not isinstance(d, dict): sys.exit("%s must be an object like {\"rain\": {\"file\": ...}}" % path)
    out = []
    for k, m in d.items():
        if not isinstance(m, dict): continue
        out.append({"key": k, "sb": m.get("sb"), "pk": m.get("pk"), "st": m.get("st"), "sh": m.get("sh"), "file": m.get("file", ""), "src": "stored"})
    return out


def entries_from_dir(folder, ref):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"): sys.exit("--dir needs ffmpeg and ffprobe on the PATH (they measure the files)")
    import ambient_prep
    out = []
    for name in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(name)
        if ext.lower() not in AUDIO: continue
        e = {"key": stem.lower(), "file": name, "src": "measured", "sb": None, "pk": None, "st": None, "sh": None}
        try:
            r = ambient_prep.measure(os.path.join(folder, name)); e.update({k: r.get(k) for k in ("sb", "pk", "st", "sh")})
        except Exception as ex:
            e["error"] = str(ex)[:120]
        out.append(e)
    return out


def audit(entries, ref, lim, threshold):
    """One row per entry, with everything the table needs."""
    rows = []
    for e in entries:
        r = {"key": e["key"], "file": e.get("file", ""), "flags": [], "notes": []}
        rows.append(r)
        if e.get("error"): r["flags"].append("could not be measured: " + e["error"]); continue
        if e["key"] not in ref: r["notes"].append("no reference for this name (the file name must be a sound name)"); continue
        r["ref"] = ref[e["key"]][0]
        if not num(e.get("sb"), -90, 0):
            r["notes"].append("silent, or too quiet to measure (below -70 dB)" if e.get("src") == "measured" else "no loudness numbers: the app uses its fallback (run ambient_prep.py)"); continue
        r.update(sb=e["sb"], pk=e.get("pk") if num(e.get("pk"), -90, 20) else None, st=e.get("st") if num(e.get("st"), -90, 0) else None, sh=e.get("sh") if num(e.get("sh"), 0, 1) else None)
        r["off"] = r["sb"] - r["ref"]
        g, why = gain_db(ref[e["key"]], lim, r["sb"], r["pk"])
        r["gain"], r["after"] = g, r["sb"] + g
        if abs(r["off"]) > threshold: r["flags"].append("%+.1f dB from its reference as delivered" % r["off"])
        if why: r["flags"].append(why + ("; ends %.1f dB from its reference" % (r["after"] - r["ref"]) if abs(r["after"] - r["ref"]) > 0.05 else ""))
        if r["pk"] is None: r["notes"].append("no peak stored: the app measures it while loading")
        elif r["pk"] > 0: r["notes"].append("peak %+.1f dBFS in the file" % r["pk"])
        if r["st"] is not None and r["st"] - r["sb"] > 6: r["notes"].append("bursty (loudest 3 s is %.1f dB above the average)" % (r["st"] - r["sb"]))
        o = old_estimate(r["sb"], r["sh"])
        if o: r["old_gain"], r["old_after"] = o
    return rows


def f(v, w, d=1, sign=False):
    return (" " * w) if v is None else ("{:>%d.%df}" % (w, d)).format(v) if not sign else ("{:>+%d.%df}" % (w, d)).format(v)


def show(rows, compare, threshold):
    head = "  %-8s%9s%8s%8s%9s%9s%9s" % ("sound", "level", "peak", "short", "share", "ref", "off")
    head += "%10s%10s" % ("gain", "ends at")
    if compare: head += "%12s%11s%10s" % ("old gain*", "old level*", "old off*")
    print(head + "   flags / notes")
    for r in rows:
        if "sb" not in r:
            print("  %-8s  %s" % (r["key"], "; ".join(r["flags"] + r["notes"]))); continue
        line = "  %-8s%s%s%s%s%s%s%s%s" % (r["key"], f(r["sb"], 9), f(r["pk"], 8), f(r["st"], 8), f(r["sh"], 9, 2), f(r["ref"], 9), f(r["off"], 9, 1, True), f(r["gain"], 10, 1, True), f(r["after"], 10))
        if compare: line += "%s%s%s" % (f(r.get("old_gain"), 12, 1, True), f(r.get("old_after"), 11), f(None if "old_after" not in r else r["old_after"] - r["ref"], 10, 1, True))
        print(line + "   " + ("FLAG: " + "; ".join(r["flags"]) if r["flags"] else "ok") + ("   (" + "; ".join(r["notes"]) + ")" if r["notes"] else ""))
    done = [r for r in rows if "sb" in r]
    if not done: print("\nNothing to summarise: no file had loudness numbers."); return
    far = lambda key: max(abs(r[key]) for r in done)
    print("\n  level = speech band 300-4000 Hz in dB (0 = full scale); ref = the reference level of that sound; off = level minus ref; gain = what the app applies; ends at = level + gain.")
    print("  Flagged: %d of %d files (more than %.1f dB from the reference as delivered, or held back by a limit)." % (sum(1 for r in done if r["flags"]), len(done), threshold))
    print("  Farthest from its reference: as delivered %.1f dB, after the app's levelling %.1f dB." % (far("off"), max(abs(r["after"] - r["ref"]) for r in done)))
    if compare:
        olds = [r for r in done if "old_after" in r]
        if olds:
            print("  * Old levelling (estimate: whole-spectrum level to RMS 0.12, gain 0.15..5, from level and share): farthest from the reference %.1f dB, so the sounds ended further from"
                  " their references than the new levelling leaves them." % max(abs(r["old_after"] - r["ref"]) for r in olds))
            print("    Spread (loudest minus quietest) of the speech-band levels: as delivered %.1f dB, old levelling %.1f dB (est.), new levelling %.1f dB (= the spread of the references)." % (
                max(r["sb"] for r in olds) - min(r["sb"] for r in olds), max(r["old_after"] for r in olds) - min(r["old_after"] for r in olds), max(r["after"] for r in olds) - min(r["after"] for r in olds)))


def selftest(ref, lim):
    bad = []
    def check(name, ok, detail=""):
        print("  %s %s%s" % ("ok  " if ok else "FAIL", name, ("  " + detail) if detail and not ok else ""))
        if not ok: bad.append(name)
    check("the reference table was read for 12 sounds, every value a pair of negative levels", len(ref) == 12 and all(a < 0 and b < 0 for a, b in ref.values()), str(ref))
    check("the limits were read (+36 / -40 dB, +6 dBFS peak)", lim == {"maxDb": 36.0, "minDb": -40.0, "peakDb": 6.0}, str(lim))
    # 1. the gain rule against the app's own JavaScript
    node = shutil.which("node")
    if not node: print("  skip the comparison with the app's JavaScript: node is not installed")
    else:
        js = r"""
const fs=require('fs'),vm=require('vm'),p=process.argv[1];
const sc=fs.readFileSync(p+'/src/js/sound/ambient-scenes.js','utf8'),rc=fs.readFileSync(p+'/src/js/sound/ambient-recordings.js','utf8');
const line=(s,n)=>{const i=s.indexOf('const '+n+' ');return s.slice(i,s.indexOf('\n',i));};
function grab(s,n){const i=s.indexOf('function '+n+'(');let d=0,j=s.indexOf('{',i);for(;j<s.length;j++){if(s[j]==='{')d++;else if(s[j]==='}'&&--d===0)return s.slice(i,j+1);}}
const c=vm.createContext({Math,isFinite});
vm.runInContext([line(sc,'AMB_REC_REF'),line(rc,'AMB_REC_LIMIT'),line(rc,'ambRecNum'),grab(rc,'ambRecGain'),'this.f={g:ambRecGain,REF:AMB_REC_REF}'].join('\n'),c);
const out=[];for(const k of Object.keys(c.f.REF))for(const sb of [-80,-60,-40,-30,-25,-20,-15,-5,-1])for(const pk of [-30,-10,-3,0,3,null]){
 const meta=pk==null?{sb}:{sb,pk};out.push([k,sb,pk,20*Math.log10(c.f.g(k,meta,null,0))]);}
console.log(JSON.stringify(out));"""
        r = subprocess.run([node, "-e", js, ROOT], capture_output=True, text=True)
        if r.returncode != 0: check("the JavaScript gain function could be run", False, r.stderr.strip()[:200])
        else:
            worst, n = 0.0, 0
            for k, sb, pk, js_db in json.loads(r.stdout):
                py_db, _ = gain_db(ref[k], lim, sb, pk); worst = max(worst, abs(py_db - js_db)); n += 1
            check("the gain rule matches ambRecGain in the app on %d combinations (largest difference %.2g dB)" % (n, worst), worst < 1e-6)
    # 2. flags
    ent = lambda k, sb, pk=-10, st=None, sh=0.5: {"key": k, "sb": sb, "pk": pk, "st": st, "sh": sh, "src": "stored"}
    r = lambda e: audit([e], ref, lim, 3.0)[0]
    a = ref["rain"][0]
    check("a file 2.9 dB from its reference is not flagged, 3.1 dB is", not r(ent("rain", a + 2.9))["flags"] and bool(r(ent("rain", a - 3.1))["flags"]))
    check("the gain brings a file exactly to its reference", abs(r(ent("rain", a - 3.1))["after"] - a) < 1e-9 and abs(r(ent("rain", a - 3.1))["gain"] - 3.1) < 1e-9)
    check("a very quiet file is flagged because the gain cap stops it short", any("capped" in x for x in r(ent("rain", a - 50, -70))["flags"]))
    check("a spiky file is flagged because the peak cap stops the gain", any("peak cap" in x for x in r(ent("rain", a - 20, -2))["flags"]) and r(ent("rain", a - 20, -2))["gain"] < 20)
    check("no numbers, an unknown name and a missing peak give notes, never an error", all(not x["flags"] and x["notes"] for x in audit([{"key": "rain", "sb": None, "src": "stored"}, {"key": "zzz", "sb": -20, "src": "stored"}], ref, lim, 3.0)) and bool(r(ent("rain", a, None))["notes"]))
    check("a file that could not be measured is flagged", bool(audit([{"key": "rain", "error": "bad file"}], ref, lim, 3.0)[0]["flags"]))
    check("the old levelling estimate is the whole level to RMS 0.12 within its 0.15..5 limits", abs(old_estimate(-20.0, 0.5)[0] - (20 * math.log10(0.12) - (-20.0 + 3.0103))) < 1e-3 and old_estimate(-60.0, 0.5)[0] == 20 * math.log10(5) and old_estimate(-20, None) is None)
    print("\nSELFTEST " + ("FAILED: " + ", ".join(bad) if bad else "passed"))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description="Show how loud each ambient recording is and what the app does to it.")
    ap.add_argument("--recordings", help="a recordings.json that holds the numbers written by ambient_prep.py")
    ap.add_argument("--data-dir", default=os.environ.get("WORDTRAIL_DATA"), help="the folder that holds recordings.json (used when --recordings is not given)")
    ap.add_argument("--dir", help="a folder of audio files named after the sounds (rain.mp3, wind.wav ...); they are measured with ffmpeg")
    ap.add_argument("--threshold", type=float, default=3.0, help="flag a file this many dB (or more) away from its reference (default 3)")
    ap.add_argument("--compare", action="store_true", help="also show what the old levelling did (an estimate from level and share)")
    ap.add_argument("--strict", action="store_true", help="exit with 1 when any file is flagged")
    ap.add_argument("--selftest", action="store_true", help="check the tool against the app's JavaScript and exit")
    a = ap.parse_args()
    ref, lim = read_source()
    if a.selftest: sys.exit(selftest(ref, lim))
    if a.dir:
        if not os.path.isdir(a.dir): sys.exit("folder not found: " + a.dir)
        entries = entries_from_dir(a.dir, ref); where = a.dir
    else:
        path = a.recordings or (os.path.join(a.data_dir, "recordings.json") if a.data_dir else None)
        if not path or not os.path.isfile(path): sys.exit("give --recordings FILE (a recordings.json with numbers), --data-dir FOLDER, or --dir FOLDER of audio files")
        entries = entries_from_json(path); where = path
    rows = audit(entries, ref, lim, a.threshold)
    print("Ambient loudness audit of %s (reference from the app's source; nothing is downloaded)\n" % where)
    show(rows, a.compare, a.threshold)
    sys.exit(1 if a.strict and any(r["flags"] for r in rows) else 0)


if __name__ == "__main__":
    main()
