# Explore page: new phone design (from the approved concept)

- src/css/99i-explore-design.css: NEW. Chips, "Pick of the day" hero, "Find your level" tiles. Phones also hide the filter box (header search covers it).
- src/js/110-collections.js: exPick / exHero / exLevels, and drawCollections now draws: genre chips, hero, level tiles, then the shelves.
  - Pick of the day: one book per day from the loaded shelves (cover + length needed). Start listening = openBook(b, {play:true}); bookmark = toggleFav.
  - Level tiles: counts come from levels.json (LVL.map), shown once it has loaded. Tapping a tile sets that level filter and opens Search.
  - Chips: For you (top), then each genre shelf; tap scrolls to it. They replace the old "jump" chips.
  - The old "Start here" hero is gone; its shelf (New this week) is now the first row.
- build.py: one line to include the new CSS after 99h-white-theme.css.
Undo: delete the CSS file and its build.py line, and restore 110-collections.js.
