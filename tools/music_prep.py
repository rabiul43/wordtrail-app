#!/usr/bin/env python3
"""music_prep.py — Wordtrail background music preparation tool.

Downloads CC0/CC-BY instrumental clips, normalises loudness to -18 LUFS,
finds a clean loop point near the end of each clip, and writes music.json
into the root of your wordtrail-data repo.

Usage
-----
    # Download new clips from a CSV manifest (see CLIP_SOURCES below):
    python tools/music_prep.py --download

    # (Re-)process all already-downloaded clips and rebuild music.json:
    python tools/music_prep.py --build

    # Both steps at once:
    python tools/music_prep.py --download --build

    # Preview what the tool would do without writing anything:
    python tools/music_prep.py --download --build --dry-run

MANUAL INBOX (recommended)
--------------------------
    1. python tools/music_prep.py --init --data-dir <wordtrail-data>
       creates  music/_inbox/<mood>/  folders.
    2. Download MP3s in your browser and drop each one into the folder of the
       mood it fits.  Any filename works.
    3. python tools/music_prep.py --build --data-dir <wordtrail-data> \\
           --by "Kevin MacLeod" --lic CC-BY
       --by / --lic are the credit applied to inbox files.  For mixed credits,
       put a  credits.json  in music/_inbox/  like:
         { "some-file-name.mp3": { "by": "Artist", "lic": "CC0" } }

Requirements
------------
    pip install requests mutagen
    ffmpeg must be on your PATH (https://ffmpeg.org)

Mood buckets (must match MUS_MOOD_MAP in sound/music-moods.js):
    peace, dread, danger, sorrow, merry, neutral

Output layout in your data repo
--------------------------------
    music/
        peace/   *.mp3
        dread/   *.mp3
        danger/  *.mp3
        sorrow/  *.mp3
        merry/   *.mp3
        neutral/ *.mp3
    music.json
"""

import argparse, json, math, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

# ---------------------------------------------------------------------------
# Configuration — edit this section
# ---------------------------------------------------------------------------

# Root of your local clone of the wordtrail-data repo.
# Override with --data-dir on the command line.
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "wordtrail-data"

# Mastering loudness for all clips (LUFS). Files stay at -18 for headroom and a consistent library; the app
# attenuates each clip to its playback target (-27 LUFS, MUS_TARGET_LUFS in sound/music-bus.js) using the
# `lufs` value written below, so do not change this to match the app.
TARGET_LUFS = -18.0

# How many seconds from the END of a clip to look for the best loop point
# (a zero-crossing with low energy on both sides).
LOOP_SEARCH_WINDOW = 30.0   # seconds

# Minimum silence gap (RMS below this threshold) to qualify as a loop point.
LOOP_RMS_THRESHOLD = 0.02   # 0–1 linear amplitude

# Crossfade margin: the loop point is placed this many seconds before the
# true end so the Web Audio crossfade (MUS_FADE = 6 s) has room.
LOOP_END_MARGIN = 8.0       # seconds

# ---------------------------------------------------------------------------
# Clip source catalogue
# ---------------------------------------------------------------------------
# Add rows here as you find new clips.
# Fields:
#   mood     : one of the six mood keys
#   url      : direct URL to an MP3 or OGG file
#   slug     : filename stem to save as (no extension, no spaces)
#   by       : attribution string (composer / uploader)
#   lic      : licence tag — "CC0", "CC-BY", "CC-BY-SA", or "Incompetech"
#              Incompetech = CC-BY 4.0 (Kevin MacLeod); all are safe for non-commercial use
#   trim_start : seconds to cut from the head (skip a spoken intro, etc.) — float, default 0
#   trim_end   : seconds to cut from the tail — float, default 0
#
# HOW TO FIND MORE CLIPS
#   Incompetech (CC-BY):  https://incompetech.com/music/royalty-free/music.html
#   Freesound (CC0):      https://freesound.org  (filter: CC0, type: music)
#   Pixabay (royalty-free, no attribution required): https://pixabay.com/music/
#
# Only CC0, CC-BY, and CC-BY-SA are included here.  Never use NC or ND licences.

# Automatic downloads are disabled: Pixabay and Incompetech both reject scripted
# requests (HTTP 403).  Use the INBOX instead — see "MANUAL INBOX" in the usage
# notes at the top of this file.  You can still add dict(...) rows here for
# any host that allows direct downloads.
CLIP_SOURCES = []

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# The first six are what the app asks for. The last four are optional finer moods: until a folder has clips the app
# plays the nearest existing mood instead (tension -> dread, wonder -> peace, romance -> peace, chase -> danger).
MOODS = {"peace", "dread", "danger", "sorrow", "merry", "neutral", "tension", "wonder", "romance", "chase"}


def ffmpeg(*args, capture=False):
    # loudnorm prints its JSON measurements at "info" level, so capture runs
    # need info; plain runs stay quiet.
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "info" if capture else "error"] + list(args)
    if capture:
        r = subprocess.run(cmd, capture_output=True, text=True)
        return r.stdout + r.stderr
    else:
        subprocess.run(cmd, check=True)


def ffprobe_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def measure_lufs(path):
    """Return the integrated loudness of a file in LUFS using ffmpeg loudnorm."""
    out = ffmpeg(
        "-i", str(path),
        "-af", "loudnorm=I=-18:LRA=11:TP=-1.5:print_format=json",
        "-f", "null", "-",
        capture=True,
    )
    m = re.search(r'"input_i"\s*:\s*"([-\d.]+)"', out)
    if m:
        v = float(m.group(1))
        return v if v > -120 else None
    return None


def measure_busy(path):
    """How busy a clip sounds (higher = more notes, brighter): the average sample-to-sample change relative to the
    loudness, from the clip as 8 kHz mono. Only meaningful compared with the other clips; step_build ranks them 0-1."""
    import array
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    a = array.array("h"); a.frombytes(raw[: len(raw) // 2 * 2])
    n = len(a)
    if n < 100: return None
    step = 1  # every sample of an 8 kHz clip is fine
    rms = math.sqrt(sum(x * x for x in a) / n)
    if rms < 1: return None
    diff = sum(abs(a[i] - a[i - 1]) for i in range(1, n, step)) / (n - 1)
    return diff / rms


def find_loop_point(path, duration):
    """Find a clean loop end-point: a moment of near-silence near the end of the clip.

    Strategy:
      1. Extract the last LOOP_SEARCH_WINDOW seconds as raw PCM (mono, 22050 Hz).
      2. Compute RMS in 50 ms windows.
      3. Return the timestamp of the quietest window that is at least LOOP_END_MARGIN
         seconds before the end.
    Falls back to (duration - LOOP_END_MARGIN) if nothing quiet is found.
    """
    search_start = max(0.0, duration - LOOP_SEARCH_WINDOW)
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tf:
        raw_path = tf.name

    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
             "-ss", str(search_start), "-i", str(path),
             "-ac", "1", "-ar", "22050", "-f", "s16le", raw_path],
            check=True,
        )

        import array as _array
        with open(raw_path, "rb") as f:
            data = f.read()

        samples = _array.array("h")
        samples.frombytes(data)
        sr = 22050
        win = int(sr * 0.05)   # 50 ms windows

        best_rms = 1e9
        best_t = duration - LOOP_END_MARGIN

        for i in range(0, len(samples) - win, win // 2):
            chunk = samples[i : i + win]
            rms = math.sqrt(sum(s * s for s in chunk) / len(chunk)) / 32768
            t = search_start + i / sr
            # Must be before (duration - LOOP_END_MARGIN) so the fade fits
            if t < duration - LOOP_END_MARGIN and rms < best_rms:
                best_rms = rms
                best_t = t

        return round(best_t, 3), round(best_rms, 4)
    finally:
        try:
            os.unlink(raw_path)
        except OSError:
            pass


def normalise(src, dst, trim_start=0.0, trim_end=0.0):
    """Trim, two-pass loudnorm to -18 LUFS, write mp3 to dst."""
    # Pass 1: measure
    duration = ffprobe_duration(src)
    t_end = duration - trim_end

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
        tmp = tf.name

    try:
        # Pass 1
        filter1 = f"loudnorm=I={TARGET_LUFS}:LRA=11:TP=-1.5:print_format=json"
        if trim_start > 0 or trim_end > 0:
            filter1 = f"atrim=start={trim_start}:end={t_end}," + filter1
        out = ffmpeg(
            "-i", str(src),
            "-af", filter1,
            "-f", "null", "-",
            capture=True,
        )
        # Parse pass-1 measurements
        def _jval(key):
            m = re.search(r'"' + key + r'"\s*:\s*"([-\d.]+)"', out)
            if not m:
                raise RuntimeError(f"loudnorm measurement '{key}' not found in ffmpeg output")
            return m.group(1)

        i_val  = _jval("input_i")
        lra    = _jval("input_lra")
        tp     = _jval("input_tp")
        thresh = _jval("input_thresh")
        offset = _jval("target_offset")

        # Pass 2: apply
        filter2 = (
            f"loudnorm=I={TARGET_LUFS}:LRA=11:TP=-1.5"
            f":measured_I={i_val}:measured_LRA={lra}:measured_TP={tp}"
            f":measured_thresh={thresh}:offset={offset}:linear=true"
        )
        if trim_start > 0 or trim_end > 0:
            filter2 = f"atrim=start={trim_start}:end={t_end}," + filter2

        ffmpeg(
            "-i", str(src),
            "-af", filter2,
            "-ar", "44100", "-ab", "128k",
            "-y", tmp,
        )
        shutil.move(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def download(url, dest, dry_run=False):
    fname = dest.name
    if dest.exists():
        print(f"  skip (exists): {fname}")
        return True
    print(f"  download: {fname} ← {url}")
    if dry_run:
        return False
    try:
        r = requests.get(url, timeout=60, stream=True,
                         headers={"User-Agent": "wordtrail-music-prep/1.0"})
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(65536):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"    ERROR downloading: {e}")
        return False


# ---------------------------------------------------------------------------
# Main steps
# ---------------------------------------------------------------------------

def step_download(data_dir, dry_run):
    raw_dir = data_dir / "music" / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n── Downloading {len(CLIP_SOURCES)} clips to {raw_dir} ──")
    ok = 0
    for clip in CLIP_SOURCES:
        ext = Path(urllib.parse.urlparse(clip["url"]).path).suffix or ".mp3"
        dest = raw_dir / f"{clip['mood']}__{clip['slug']}{ext}"
        if download(clip["url"], dest, dry_run=dry_run):
            ok += 1
    print(f"  {ok}/{len(CLIP_SOURCES)} clips ready.")


def inbox_clips(data_dir, by, lic):
    """Return clip dicts (with a 'raw' path) for every audio file in music/_inbox/<mood>/."""
    inbox = data_dir / "music" / "_inbox"
    credits = {}
    cj = inbox / "credits.json"
    if cj.exists():
        try:
            credits = json.loads(cj.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  WARNING: could not read credits.json: {e}")
    out = []
    for mood in sorted(MOODS):
        d = inbox / mood
        if not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            if p.suffix.lower() not in (".mp3", ".ogg", ".wav", ".flac", ".m4a"):
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", p.stem.lower()).strip("-") or "clip"
            c = credits.get(p.name, {})
            out.append(dict(mood=mood, slug=slug, raw=p,
                            by=c.get("by", by), lic=c.get("lic", lic), explicit=p.name in credits))
    return out


def step_build(data_dir, dry_run, by="Kevin MacLeod", lic="CC-BY"):
    raw_dir   = data_dir / "music" / "_raw"
    music_dir = data_dir / "music"

    # Build an index of source clip objects by slug for fast lookup
    source_by_slug = {c["slug"]: c for c in CLIP_SOURCES}

    manifest = {"v": 1, "moods": {m: [] for m in MOODS}}
    all_inbox = inbox_clips(data_dir, by, lic)

    print(f"\n── Building clips in {music_dir} ──")

    for mood in sorted(MOODS):
        mood_dir = music_dir / mood
        mood_dir.mkdir(parents=True, exist_ok=True)

        clips_for_mood = [c for c in CLIP_SOURCES if c["mood"] == mood] + \
                         [c for c in all_inbox if c["mood"] == mood]
        if not clips_for_mood:
            print(f"  [{mood}] no clips — put MP3s in music/_inbox/{mood}/")
            continue

        for clip in clips_for_mood:
            slug = clip["slug"]
            # Find raw file
            if "raw" in clip:
                raw = clip["raw"]
            else:
                raw_candidates = list(raw_dir.glob(f"{mood}__{slug}.*"))
                if not raw_candidates:
                    print(f"  [{mood}] {slug}: raw file not found — skipping")
                    continue
                raw = raw_candidates[0]

            out = mood_dir / f"{slug}.mp3"
            if not out.exists():
                print(f"  [{mood}] {slug}: normalising …")
                if not dry_run:
                    try:
                        normalise(
                            raw, out,
                            trim_start=clip.get("trim_start", 0.0),
                            trim_end=clip.get("trim_end", 0.0),
                        )
                    except Exception as e:
                        print(f"    ERROR: {e}")
                        continue
            else:
                print(f"  [{mood}] {slug}: already processed")

            if dry_run:
                continue

            # Measure duration and loop point
            try:
                dur = ffprobe_duration(out)
                lufs = measure_lufs(out)
                loop_end, loop_rms = find_loop_point(out, dur)
                loop_start = 0.0

                entry = {
                    "f":    f"{mood}/{slug}.mp3",
                    "dur":  round(dur, 2),
                    "lk":   [loop_start, loop_end],
                    "lufs": round(lufs, 1) if lufs is not None else TARGET_LUFS,
                    "by":   clip["by"],
                    "lic":  clip["lic"],
                }
                manifest["moods"][mood].append(entry)
                print(f"    → dur={dur:.1f}s  lufs={lufs:.1f}  loop_end={loop_end:.1f}s  rms_at_loop={loop_rms:.4f}")
            except Exception as e:
                print(f"    ERROR measuring {out}: {e}")

    # Keep what is already in music.json: a clip that is not in the inbox any more stays (if its file is on disk), and a
    # clip that is rebuilt keeps its old credit unless music/_inbox/credits.json names it. Nothing is lost by a rebuild.
    old_path = data_dir / "music.json"
    if old_path.exists():
        try: old = json.loads(old_path.read_text(encoding="utf-8"))
        except Exception: old = {}
        explicit = {f"{c['mood']}/{c['slug']}.mp3" for c in all_inbox if c.get("explicit")}
        for mood, olds in (old.get("moods") or {}).items():
            lst = manifest["moods"].setdefault(mood, [])
            have = {c["f"]: c for c in lst}
            for oc in olds:
                f = oc.get("f")
                if not f: continue
                if f in have:
                    if f not in explicit:
                        for k in ("by", "lic"):
                            if oc.get(k): have[f][k] = oc[k]
                elif (data_dir / "music" / f).is_file():
                    lst.append(oc); print(f"  kept {f} (already in music.json)")

    if not dry_run:
        out_path = data_dir / "music.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        total = sum(len(v) for v in manifest["moods"].values())
        print(f"\n── Wrote {out_path}  ({total} clips across {len(manifest['moods'])} moods) ──")
        step_energy(data_dir, dry_run=False)   # energy "e" for every clip, ranked across the whole library
        _print_attribution(manifest)
    else:
        print("\n── Dry run: music.json not written ──")


def _print_attribution(manifest):
    """Print a ready-to-paste attribution block for all CC-BY clips."""
    cc_by = []
    for clips in manifest["moods"].values():
        for c in clips:
            if c["lic"] in ("CC-BY", "CC-BY-SA", "Incompetech"):
                cc_by.append(c)
    if not cc_by:
        return
    print("\n── Attribution required for these clips ──")
    seen = set()
    for c in cc_by:
        key = (c["by"], c["lic"])
        if key not in seen:
            seen.add(key)
            if c["lic"] == "Incompetech":
                print(f'  "{c["f"]}" by {c["by"]} — incompetech.com, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)')
            else:
                print(f'  "{c["f"]}" by {c["by"]} — {c["lic"]}')
    print("  Add these to your app's About / Credits page.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def step_energy(data_dir, dry_run):
    """SAFE way to add the energy value "e" to an existing music.json. It only adds "e" to each clip. It does not
    re-encode anything, does not touch credits, lengths or loop points, and keeps clips that are not in music/_inbox.
    The old file is saved as music.json.bak first."""
    mj = data_dir / "music.json"
    if not mj.exists():
        sys.exit(f"ERROR: {mj} not found")
    manifest = json.loads(mj.read_text(encoding="utf-8"))
    clips = [c for v in (manifest.get("moods") or {}).values() for c in v]
    print(f"\n── Measuring energy for {len(clips)} clips ──")
    busy = {}
    for c in clips:
        p = data_dir / "music" / c["f"]
        if not p.is_file():
            print(f"  {c['f']}: file not found, skipped"); continue
        try:
            b = measure_busy(p)
        except Exception as e:
            print(f"  {c['f']}: could not measure ({e})"); continue
        if b is not None:
            busy[c["f"]] = b
            print(f"  {c['f']}: busyness {b:.3f}")
    ranked = sorted(busy, key=busy.get)
    for i, f in enumerate(ranked):
        e = round(i / (len(ranked) - 1), 2) if len(ranked) > 1 else 0.5
        for c in clips:
            if c["f"] == f: c["e"] = e
    if dry_run:
        print("\n── Dry run: music.json not changed ──"); return
    shutil.copyfile(mj, data_dir / "music.json.bak")
    mj.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n── Added energy to {len(ranked)} clips in {mj} (old file: music.json.bak) ──")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--download", action="store_true", help="Download raw clips from CLIP_SOURCES")
    ap.add_argument("--build",    action="store_true", help="Normalise clips and write music.json")
    ap.add_argument("--energy-only", action="store_true", help="SAFE: only add the energy value e to the existing music.json (nothing is re-encoded, credits are kept)")
    ap.add_argument("--data-dir", default=str(DATA_DIR), help="Path to your wordtrail-data repo (default: %(default)s)")
    ap.add_argument("--init",     action="store_true", help="Create music/_inbox/<mood>/ folders and exit")
    ap.add_argument("--by",       default="Kevin MacLeod", help="Credit for inbox clips (default: %(default)s)")
    ap.add_argument("--lic",      default="CC-BY", help="Licence for inbox clips: CC0, CC-BY, CC-BY-SA (default: %(default)s)")
    ap.add_argument("--dry-run",  action="store_true", help="Print what would happen without doing it")
    args = ap.parse_args()

    if not args.download and not args.build and not args.init and not args.energy_only:
        ap.print_help()
        sys.exit(0)

    data_dir = Path(args.data_dir).expanduser().resolve()
    if not data_dir.is_dir():
        sys.exit(f"ERROR: data dir not found: {data_dir}\nPass --data-dir /path/to/wordtrail-data")

    if args.init:
        for m in sorted(MOODS):
            (data_dir / "music" / "_inbox" / m).mkdir(parents=True, exist_ok=True)
        print(f"Created inbox folders in {data_dir / 'music' / '_inbox'}")
        print("Drop MP3 files into the folder of the mood they fit, then run --build.")
        return

    # Quick sanity check for ffmpeg
    if (args.build or args.energy_only) and not args.dry_run:
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            sys.exit("ERROR: ffmpeg and ffprobe must be on your PATH.\nInstall from https://ffmpeg.org")

    if args.download:
        step_download(data_dir, dry_run=args.dry_run)

    if args.energy_only:
        step_energy(data_dir, dry_run=args.dry_run)

    if args.build:
        step_build(data_dir, dry_run=args.dry_run, by=args.by, lic=args.lic)

    print("\nDone.")


if __name__ == "__main__":
    main()
