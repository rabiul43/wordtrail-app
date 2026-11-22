# Store write queue (performance Task 8)

`store.set` no longer does JSON.stringify + localStorage.setItem on every call. The latest value per key waits in memory and one timer (600 ms, not pushed back) writes everything in one go.

- `src/js/030-helpers-offline-audio.js`: queue, `store.flush()`, `store.now()`, `store.del()`. `get` reads the queue first. `storeHook` and `__wtRestoring` behave as before (hook now runs once per key at write time).
- `src/js/999-app-close.js`: flush on `visibilitychange` (hidden), `pagehide`, `freeze`; added last so it runs after every other handler.
- `src/js/150-player-reader.js`: `wt:pauseT` uses `store.now` (written at once).
- Flush before direct localStorage reads and restores: `295` (acLocalKeys, acPushKeys, acFlush, acSync, both restores), `290` (backup, restore), key scans in `070`, `090`, `103`, `160`, `169f`, `190`, `300`, `sound/smart-mix.js`.
- Removing a stored key uses `store.del` (`120`, `169q`, `280`, `sound/smart-mix.js`) so a queued write cannot bring it back.
- Tools: new `tools/store_queue_check.js`; stand-in stores in `smart_mix_check`, `timed_questions_check`, `timed_reading_check` got `del`/`flush`; `goal_ask_check` waits 700 ms before reading localStorage.
