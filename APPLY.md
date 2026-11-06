Black theme (true #000, for OLED screens)

1. Copy everything in src/ over your project's src/ (same paths). 15 files are replaced, 1 is new.
   These files were not changed by the Settings or My Library zips, so no conflict.
2. In build.py add after the 99b-confirm.css line:
       ('file', 'src/css/99g-black-theme.css'),
3. Run python build.py

It appears as "Black" in Settings > Reading > Theme and in the reader's Aa sheet.
To remove it: delete 99g-black-theme.css and the build.py line, and restore the old copies of the other files.
