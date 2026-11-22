# Touch feel (performance Task 10)

Only `src/css/99z-perf.css` changed (sections 7 and 8).

Already in place, so not repeated: `touch-action: manipulation` on buttons, links, cards, chips, tabs (99z section 5); a press scale for `.btn .chip .tile .card .tab .ib .play ...` with reduced-motion and `html[data-lite]` switched off (70-collections-detail-motion.css, "Motion system"); `overscroll-behavior: contain` on `.sheet`, `.sheet .body`, `.reader`, `.dmenu`, `.cf-back`.

Added:
- 7. Any other `button` / `[role=button]` / `[role=tab]` (not listed in the motion system, not disabled, not a slider or handle) dips to 72% opacity while pressed, on touch screens only. Opacity only: no scaling, so it cannot fight an element's own `transform`, and the same in lite mode and reduced motion.
- 8. `overscroll-behavior: contain` on the lists that scroll inside a sheet or card: `.trpop .rq.sug .wf__res .ec-card .ec-lib-body .lt-fb .ws-paper .wr-ta .livetr .ow-card .ad-out .sp-fs-card .ws-body`, and `.reader` / `#reader` again as a safety net.
