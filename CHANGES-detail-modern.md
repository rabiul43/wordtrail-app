# New book page design (phones, Settings switch)

Settings > "New book page design on phones" (default on). Under 700 px only; tablets and computers keep the banner layout.

- Back and Share float as two glass circles over the cover glow (no black bar, no "Book details" label). The round Share beside the heart is hidden.
- A round download icon sits beside the heart. It shows the state: download arrow, a progress ring while downloading, a gold check when saved.
- Tapping it opens a bottom sheet with the Listen offline options (size, "Also save background music" as a switch, Download / Cancel / Remove). It is the same card node as before, moved into the sheet and back, so all the download code is unchanged. The sheet closes when Download, Cancel or Remove is tapped; the icon then shows the state.
- Chip rows are tighter and the arrows on the section headings are gone.

Files: src/css/99n-detail-modern.css (new), build.py (1 line), src/js/131-book-stats-share.js (ddBtn + .det-dlhost wrapper), src/js/281-book-download-card.js (ddBtn, ddIconPaint, ddSheet, one line at the end of ddPaint), src/js/090 (applyDet), 290 (load switch), 300 (init + switch), src/html/30-sheets-settings.html (switch row).
Switch off = the previous look: the card shows under the buttons again, the icon is hidden.
