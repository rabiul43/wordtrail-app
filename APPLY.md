Wordtrail: final changes (Settings polish, My Library empty state, Black theme, White theme)

Use this INSTEAD of the earlier Settings, My Library, Black and White zips. Do not apply those on top of it.
Onboarding and Home changes are NOT included (you did not ask to apply them). No Cobalt theme.

1. Copy everything in src/ over your project's src/ (same paths). 20 files: 4 new, 16 replaced.
2. Replace build.py with the one in this zip. It is your uploaded build.py plus 4 lines (after the 99b-confirm.css line):
       ('file', 'src/css/99f-settings-polish.css'),
       ('file', 'src/css/99f-library-polish.css'),
       ('file', 'src/css/99g-black-theme.css'),
       ('file', 'src/css/99h-white-theme.css'),
   If your build.py has changed since you uploaded it, add just those 4 lines instead.
3. Run: python build.py
   (dist/index.html in this zip is the same result, already built, if you just want to try it.)

What you get
- Settings: every on/off setting is the same switch; Calm mode and Customise home sit in cards with dividers.
- My Library: when nothing is saved or downloaded, an empty-state card with a "Find a book" button; thin dividers between rows.
- Black theme (true #000) and White theme (true #FFF): Settings > Reading > Theme, and the reader's Aa sheet.
  Theme order: Auto, Light, White, Dark, Black, Sepia, High contrast. Names are translated in all 9 languages.

Checked on the built app: it starts, 45 unit checks pass, no console errors, themes save and survive a reload.
Not checked: book page, reader and sound screens in the new themes; desktop width; real covers (the catalog was not reachable).

To remove a part: delete its CSS file and its build.py line (the Black/White buttons and head-script entries are small and listed in the theme CSS comments;
the library empty card is the block marked "the empty hint is optional" in src/js/282-library-hub.js).
