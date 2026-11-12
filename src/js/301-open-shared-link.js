  /* ---------- Shared book link ----------
     The Share button on a book page sends https://site/?book=1234. Opening that link lands on the book's page.
     - Looks in the saved catalog first (fast, works offline), then asks LibriVox live.
     - Waits until the first-run welcome is finished (it is called again from there).
     - The ?book=... part is removed from the address bar once used, so a refresh does not open it again.
     - A class link (Task 50, ?book=ID&cc=1-3&cw=word,word) also shows the class word list after the page opens (WSH.shared, 169m).
     - If the book cannot be found a short message is shown and the app opens normally. */
  guideDoc('home', 'Share a book', "The Share button on a book page sends a link that opens that very book for the person who taps it.");
  const SHARED = { id: DEEP_ID, busy: false };
  async function sharedOpen() {
    const id = SHARED.id;
    if (!id || SHARED.busy) return;
    if (!store.get('wt:onboarded', 0)) return;
    SHARED.busy = true; SHARED.id = '';
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch (e) { /* address bar left as it is */ }
    let b = null;
    try { const r = await lvGet({ id }, { light: true }); b = r && r[0]; } catch (e) { b = null; }
    if (!b) { try { const r = await lvGet({ id }, { nonEmpty: true, tries: 1 }); b = r && r[0]; } catch (e) { b = null; } }
    SHARED.busy = false;
    if (b && b.id) { openDetail(b); try { WSH.shared(b); } catch (e) { /* a class link adds a word list; the book page is already open */ } } else toast('Could not open the shared book. Check your connection and try the link again.', 4500);
  }
  sharedOpen();
