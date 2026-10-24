#!/usr/bin/env python3
"""check_audio_data.py - look through your sound data and say what is missing or too thin.

    python tools/check_audio_data.py --data-dir ../wordtrail-data
    python tools/check_audio_data.py --data-dir ../wordtrail-data --min-clips 4

Reads music.json and openings.json in the data folder (the wordtrail-data repo) and checks them against the files
on disk. Plain Python, nothing to install. If `mutagen` is installed, it also reads the length of each opening clip.
Exit code: 0 = no errors (warnings are fine), 1 = at least one error, 2 = the data folder or music.json is unusable.

What it reports
  Music, per mood:  how many clips; clips with no loudness (lufs), no loop points (lk) or no credit (by, lic);
                    files listed but not on disk; clips that are very short or very long; loop points that make no sense.
                    A mood with fewer clips than --min-clips (default 3) is flagged: it will sound repetitive.
  Opening sounds:   which of the nine opening moods have no clip (the app then plays a sound made on the device),
                    and whether each clip has its file, credit and a sensible length.
  Files on disk not listed in music.json, so you can tidy up or rebuild with music_prep.py.
"""
import argparse, json, os, sys

# Must match MUS_MOOD_MAP in src/js/sound/music-moods.js and OS_MOODS / OS_CALM in src/js/sound/opening-sound.js.
MUSIC_MOODS = ["neutral", "peace", "dread", "danger", "sorrow", "merry"]
# Finer moods, optional: with no clips the app plays the nearest mood instead (see MUS_FALLBACK in sound/music-moods.js).
FINE_MOODS = {"tension": "dread", "wonder": "peace", "romance": "peace", "chase": "danger"}
OPENING_MOODS = ["gothic", "mystery", "romance", "adventure", "fantasy", "children", "scifi", "drama", "calm"]
MIN_DUR, MAX_DUR = 30, 240      # seconds: a clip shorter than the crossfade runway repeats too fast; very long ones use a lot of memory
OPEN_MAX = 24                   # the app plays at most 24 s of an opening clip

errors, warnings = [], []
def err(m): errors.append(m); print("  ERROR  " + m)
def warn(m): warnings.append(m); print("  warn   " + m)

def load(path):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except FileNotFoundError: return None
    except Exception as e: sys.exit(f"{path}: cannot be read ({e})")

def mp3_seconds(path):
    try:
        from mutagen import File
        f = File(path)
        return float(f.info.length) if f and f.info else None
    except Exception: return None

def check_music(root, min_clips):
    print("\nMUSIC (music.json)")
    d = load(os.path.join(root, "music.json"))
    if d is None: print("  music.json not found. Run tools/music_prep.py --build."); sys.exit(2)
    if d.get("v") != 1 or not isinstance(d.get("moods"), dict): print("  music.json is not version 1 or has no 'moods'."); sys.exit(2)
    moods, listed = d["moods"], set()
    for m in moods:
        if m not in MUSIC_MOODS and m not in FINE_MOODS: warn(f"mood '{m}' is in music.json but the app does not know it; its clips are never played")
    print(f"  {'mood':<9}{'clips':>6}  note")
    for m in MUSIC_MOODS:
        clips = moods.get(m) or []
        note = "ok"
        if not clips: note = "EMPTY: nothing plays at all for a book with no mood!" if m == "neutral" else "EMPTY: the app plays neutral music for this mood instead"
        elif len(clips) < min_clips: note = f"thin: under {min_clips} clips, will sound repetitive"
        print(f"  {m:<9}{len(clips):>6}  {note}")
        if not clips:
            if m == "neutral": errors.append("music mood 'neutral' has no clips: nothing plays at the start of a book")
            else: warnings.append(f"music mood '{m}' has no clips")
        elif len(clips) < min_clips: warnings.append(f"music mood '{m}' has only {len(clips)} clip(s)")
        check_clips(root, m, clips, listed)
    for m, fb in FINE_MOODS.items():
        clips = moods.get(m) or []
        note = f"none yet: plays '{fb}' music instead (fine)" if not clips else ("ok" if len(clips) >= min_clips else f"thin: under {min_clips} clips")
        print(f"  {m:<9}{len(clips):>6}  {note}")
        if clips and len(clips) < min_clips: warnings.append(f"music mood '{m}' has only {len(clips)} clip(s)")
        check_clips(root, m, clips, listed)
    return finish_music(root, listed)

def check_clips(root, m, clips, listed):
    if True:
        for c in clips:
            f = c.get("f") if isinstance(c, dict) else None
            if not f: err(f"{m}: a clip has no file name (f)"); continue
            listed.add(os.path.normpath(os.path.join("music", f)))
            if not os.path.isfile(os.path.join(root, "music", f)): err(f"{f}: listed but the file is not on disk")
            if "lufs" not in c: warn(f"{f}: no loudness (lufs); the app assumes it is already at target level")
            lk, dur = c.get("lk"), c.get("dur")
            if not (isinstance(lk, list) and len(lk) == 2): warn(f"{f}: no loop points (lk)")
            elif not (0 <= lk[0] < lk[1]): err(f"{f}: loop points {lk} make no sense (start must be before end)")
            elif isinstance(dur, (int, float)) and lk[1] > dur + 0.5: err(f"{f}: loop end {lk[1]} is after the clip ends ({dur})")
            if not isinstance(dur, (int, float)): warn(f"{f}: no length (dur)")
            elif dur < MIN_DUR: warn(f"{f}: only {dur:.0f} s long, it will crossfade very often")
            elif dur > MAX_DUR: warn(f"{f}: {dur:.0f} s long, it takes a lot of phone memory; 60-120 s is better")
            if not c.get("by"): warn(f"{f}: no artist (by); the credits list will say 'Unknown artist'")
            if not c.get("lic"): warn(f"{f}: no licence (lic); credits are required for CC BY")
            if not isinstance(c.get("e"), (int, float)) or not 0 <= c["e"] <= 1: warn(f"{f}: no energy (e, 0-1); the app treats it as medium, so it cannot pick quieter clips under dialogue. Rebuild with music_prep.py")

def finish_music(root, listed):
    disk = os.path.join(root, "music")
    extra = []
    if os.path.isdir(disk):
        for dp, dn, fn in os.walk(disk):
            dn[:] = [x for x in dn if not x.startswith("_")]   # skip music/_inbox
            for n in fn:
                if n.lower().endswith(".mp3"):
                    p = os.path.normpath(os.path.relpath(os.path.join(dp, n), root))
                    if p not in listed: extra.append(p)
    if extra:
        warn(f"{len(extra)} mp3 file(s) on disk are not in music.json (never played): " + ", ".join(sorted(extra)[:5]) + (" ..." if len(extra) > 5 else ""))

def check_openings(root):
    print("\nOPENING SOUNDS (openings.json)")
    d = load(os.path.join(root, "openings.json"))
    if d is None:
        warn("openings.json not found: every book uses the sound made on the device")
        print("  no openings.json; all 9 opening moods use the made sound"); return
    if not isinstance(d, dict): err("openings.json must be an object like {\"gothic\": {\"file\": ...}}"); return
    missing = [k for k in OPENING_MOODS if not (isinstance(d.get(k), dict) and d[k].get("file"))]
    print(f"  {len(OPENING_MOODS) - len(missing)} of {len(OPENING_MOODS)} moods have a recorded clip")
    if missing: print("  made on the device (no clip): " + ", ".join(missing)); warnings.append("openings without a clip: " + ", ".join(missing))
    for k in d:
        if k not in OPENING_MOODS: warn(f"opening '{k}' is not one of the nine moods; it is never used")
    for k in OPENING_MOODS:
        m = d.get(k)
        if not (isinstance(m, dict) and m.get("file")): continue
        path = os.path.join(root, m["file"])
        if "://" in m["file"]: print(f"  {k}: file is a web address, not checked on disk"); continue
        if not os.path.isfile(path): err(f"opening {k}: file '{m['file']}' is not on disk"); continue
        if not m.get("by"): warn(f"opening {k}: no artist (by)")
        if not m.get("license"): warn(f"opening {k}: no licence (the field is called 'license' here)")
        sec = mp3_seconds(path)
        if sec is not None and sec > OPEN_MAX: warn(f"opening {k}: {sec:.0f} s long; the app plays only the first {OPEN_MAX} s")
        if sec is not None and sec < 8: warn(f"opening {k}: only {sec:.0f} s long")

def main():
    ap = argparse.ArgumentParser(description="Check music.json and openings.json against the files on disk.")
    ap.add_argument("--data-dir", default=os.environ.get("WORDTRAIL_DATA", "../wordtrail-data"), help="your wordtrail-data folder")
    ap.add_argument("--min-clips", type=int, default=3, help="fewer clips than this in a mood is flagged as thin (default 3)")
    a = ap.parse_args()
    if not os.path.isdir(a.data_dir): sys.exit(f"Data folder not found: {a.data_dir}  (use --data-dir)")
    print("Checking " + os.path.abspath(a.data_dir))
    check_music(a.data_dir, a.min_clips)
    check_openings(a.data_dir)
    print(f"\nSUMMARY: {len(errors)} error(s), {len(warnings)} warning(s)")
    print("\nWHAT TO DO NEXT (full steps: MUSIC-GUIDE.md in the app repo)")
    w = " ".join(warnings + errors)
    if "no energy" in w: print("  - Add energy values:  python tools\\music_prep.py --energy-only --data-dir " + a.data_dir)
    if "only" in w and "clip(s)" in w or "no clips" in w: print("  - Thin or empty moods: add MP3s to music/_inbox/<mood>/ in the data repo (3 or more each), then:  python tools\\music_prep.py --build --data-dir " + a.data_dir)
    if "memory" in w: print("  - Very long clips use a lot of phone memory: replace them with 60-120 s versions.")
    if "openings" in w or "openings.json" in w: print("  - Opening sounds: optional. Add openings.json and clips in the data repo for recorded openings.")
    if errors: print("  - Fix the ERROR lines first.")
    print("  - Then commit and push the data repo. The app picks it up by itself.")
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
