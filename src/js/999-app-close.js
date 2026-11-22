  /* Write queue (030): the last visibilitychange / pagehide listener of the app. It is added here, after every other file, so
     anything those handlers saved is written too. store.now() covers values that must not wait (wt:pauseT). */
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
  window.addEventListener('pagehide', () => store.flush());
  window.addEventListener('freeze', () => store.flush());
})();
