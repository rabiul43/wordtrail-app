# My Library hub (phones)

Under 700 px the Downloads tab is no longer in the bottom bar. My Library opens on a list of pages
(Saved, Downloads, Following, Rated, Synced books): icon tile, title, "N Titles", chevron.
A row opens that page inside My Library; the back arrow in its header, or the phone's Back, returns to the list.
Tablets and computers keep the chips and the Downloads tab.

Files: src/js/282-library-hub.js (new), src/css/99e-library-hub.css (new), src/html/10-body-views.html (#shelf-hub, #shelf-back),
src/js/080 (shelfHub, applyShelfMode, tabHlPaint, showTab, uiInit), 270 (Back), 300 (tab + back wiring), build.py (2 lines).

## Account page: Settings button
On the Account page the header account button becomes a gear and opens Settings (080 appBarShow sets html[data-acct]; 295 click; CSS at the end of 99e-library-hub.css).
