  /* ---------- music-state.js ----------
     Melodic background music that follows the story's mood.
     Clips are CC0/CC-BY files in music/ in the GitHub data repo, listed in music.json.
     The engine crossfades clips seamlessly to cover long chapters, and crossfades between
     moods when the scene changes. Music has its own audio bus (musicGain -> musicDuck -> destination),
     independent of the ambient engine: it plays with ambient off, and ambient on/off never touches it.
     It shares only the AudioContext (audioCtx() in ambient-engine.js).
     Settings > Audio: Music on/off toggle + volume slider. */

  const MUS = {
    ctx: null,      // the shared AudioContext (audioCtx()); created even when ambient is off
    master: null,   // musicGain: user volume; every clip connects here
    duck: null,     // musicDuck: gain between the carve filters and ctx.destination, driven by the narrator (musDuckTick)
    ca: null, cb: null,   // speech-band carve (3 kHz, 800 Hz): flat until the narrator speaks
    duckIv: 0,      // setInterval handle of musDuckTick (runs only while music is live, ambient on or off)
    duckS: '',      // last duck state applied: s speaking, p pause, u unknown, o off
    live: false,    // music is wanted/playing (a clip is loading or sounding): the context must not be suspended
    sTimer: 0,      // setTimeout handle: suspend the context a moment after music stops (if ambient is silent too)
    manifest: null, // parsed music.json
    mood: '',       // current mood key
    queue: [],      // shuffled clip list for current mood
    qi: 0,          // index into queue
    playing: null,  // { src, gain, _file, _lufsGain } for the current clip
    fading: null,   // previous clip still fading out
    xTimer: 0,      // setTimeout handle for the next crossfade
    rt: 0,          // setTimeout handle: retry after a failed load (offline), while the narrator plays
    lt: 0,          // setTimeout handle: music waits for the opening sound to finish
    recent: [],     // the last clips played (file names), so the same song does not come straight back
    cand: '', candN: 0,   // a finer mood must show up in two paragraphs in a row before the music changes
    gen: 0,         // bumped on every mood switch and stop, so a clip that finishes loading late is dropped
    on: false,      // true once the music bus is built on the shared context
    base: '',       // data root override (local test mode only); '' = GitHub raw
    fail: false,    // the last load of a clip failed (offline?): the Music panel shows a line about it
    mfT: 0,         // when the manifest was last fetched (ms)
    mfBusy: false,  // a manifest retry is running
    offBusy: false, // the offline panel is fetching the music list
    dl: null,       // { ctl } while "Download music for offline" runs
    dlPick: null,   // Set of moods chosen for the offline download
    slow: false,    // the pause comes from the sleep timer: fade the music out slowly, like the ambient sounds (set in 200 and 150)
    rs: null,       // where a pause left the music: { clip, pos, mood, book, t }, used by the next play to carry on (musResumeSave / musResumeTake)
    tail: null,     // the nodes of the last stop, still fading: cut short if the same clip carries on
    gest: false,    // one tap/key listener is waiting to wake the audio engine (musGestureArm)
  };

  /* Local test mode: when the app runs on localhost (tools/dev_server.py), music.json and
     the clips are read from /_data/ (your wordtrail-data folder) instead of GitHub. */
  const MUS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

