# STATUS
Lab version: 0.2   Last tasks: P-A, P-I   Date: 2026-10-30
Packs done: P-A (`10-nature-water.js`: 28 sounds, 174 variants, avg fidelity 3.4), P-I (`90-micro-abstract.js`: 14 sounds, 280 variants, avg fidelity 3.4). Todo: P-B … P-H, P-J.
Ids: nat.* wat.* (P-A, beds + 1 spot `nat.wildlife`); micro.* (11 spot families) abs.noise abs.drone abs.texture (P-I).
P-A: ONE shared scene() builder; every variant = params only. P-I: ONE recipe interpreter (`seq` data) for all micro spots; each item also has generated "(distant)" and "(soft)" presets.
Private helpers (inside each pack, IIFE-wrapped): `band` (filter+noise+one gust/lfo, 9 nodes), `scr` (retries H.scrape), `cicada` (P-A), `microPlay` + recipe ops (P-I).
Self-test (headless Chromium, all variants): nat./wat. 202 rows 0 fail; micro./abs. 294 rows 0 fail.
Known (lab bug): `H.scrape` can throw "non-finite float" for some durations (`Math.pow(Math.sin(..),.6)` of a tiny negative number, 05-prims.js). Packs work around it; fix: `Math.pow(Math.abs(Math.sin(...)),.6)`.
Known: nodes counted at build; bird/event scheduler events are not counted. Caves/reverb beds use ~35-40 nodes.
Weak (fidelity 2): nat.wildlife (animal calls), wat.uwdetail (whale/dolphin), micro.cloth, micro.signal.
Not run: real listening; phone speaker check (sub-bass drone, low rumble, hums).
Section 18 variant keys keep catalog capitalisation ("Door opening"); P-A keys are lowercase as in its catalog.
Next: P-B (or any remaining pack)
