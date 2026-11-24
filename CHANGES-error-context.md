# Error tracking, task 2: context + breadcrumbs

New piece: `src/html/00c-error-context.html` (one line added to `build.py`, after `00b-error-collector.html`).
Small edit in `00b-error-collector.html`: `group()` returns the problem, and `report()` also copies `at` and `crumbs`.
Report format stays v1 (only new fields are added).

New fields:
- `report.ctx`: build, mode (installed/browser), theme, design, lite, language, online, connection type, data saver, memory, cores,
  window size, pixel ratio, browser, system, service worker on/off, storage used %, seconds since page load, a few non-private settings.
- `problem.at`: screen (+ open sheet), book id, online - where the user was when it FIRST happened (errors and warnings only).
- `problem.crumbs`: the last 10 user actions before it, oldest first: tap, screen, setting, audio, net, page, problem.
  A neighbour that repeats is merged ({n}).

Privacy: no typed text, no book text. A tap = id / aria-label / data-act, id, tab, view, book, sec. A setting change = its id and on/off or the
chosen value (checkbox, radio, select, range only; text fields are ignored).

Test: Settings > Diagnostics now also shows "Context" and "Last actions". Or in the console: `__wtDiag.report().ctx`, `__wtDiag.crumbs()`.
The build number comes from the existing `__WT_BUILD__` marker (filled by build.py).
