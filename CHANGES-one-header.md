# One header on every tab (phones, under 700px)

Home style everywhere: one row, page title on the left, buttons on the right. The "Wordtrail" logo bar is gone on phones.
Tablets and computers (700px and up) are unchanged.

What you see
- Explore, My Library, Account, See all: the slim bar (#appbar) now shows the page title instead of the logo. The big heading
  under it is hidden so the title is not shown twice; the small line under it ("Curated shelves, rebuilt daily.") stays.
- Sub-pages get a Back arrow in the same row: My Library > Saved / Downloads / ..., Account > Your activity, See all.
  The arrow presses the page's own Back button, so nothing else changed.
- Account button: the same everywhere, including Home. Signed in = photo (or first letter) with the sync dot
  (green = synced, amber = sign in again). Signed out = plain person icon, no dot. On the Account page it is still the Settings gear.
- Search icon: Explore only (it was hidden on phones everywhere by 99e because the Search tab is in the bottom bar; Explore gets it back).
- Book, author and reviews pages keep their own header row (Back + tools), so they no longer get a second bar on phones.

Files changed
- src/html/10-body-views.html: #ab-back and #ab-title in the bar; #st-acct (Home) is now a shared .sb-avatar
- src/js/080-ui-shell-favourites.js: abSource() / appBarSync() / appBarWatch(): the title and Back follow the page's own heading
  (so translations and sub-page titles work by themselves); book/author pages skip the bar on phones
- src/js/090-synced-stats-book-search.js: removed the old click redirect of the Home person icon (295 now handles every .sb-avatar)
- src/css/99-home-header.css: phone rules at the end of the file; src/css/99c-home-storytel.css: Home avatar look
- MODULES.md, DEPENDENCIES.md: refreshed by tools/deps.py
