# Explore: real genre sizes, and See all shows the whole shelf

Before: every shelf was cut to its first 60 books, and the number next to the shelf name was just that cut (so every big genre said 60).

- 105-home-loaders.js (curBuild, genreShelves): each shelf still carries its first 60 books for the row (fast), plus `tot` (the real size)
  and `more(n)` (hands out more books). The genre ranking is unchanged (cover + text first, shuffled a little each day).
- 110-collections.js: the row badge and the tile/hero line show the real size; See all loads the WHOLE shelf, so Shortest / Longest / A-Z /
  Hide heard / Surprise me work on every book. The grid is drawn 120 at a time with a "Show more (N left)" button.
- 70-collections-detail-motion.css: the Show more button.
- Not changed: the Explore search box still looks inside the first 60 books of each shelf; Home rows still use 20.
