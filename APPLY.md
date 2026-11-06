1. Copy src/css/99f-library-polish.css into src/css/
2. Replace src/js/282-library-hub.js (only change: empty-state card at the end of libHubDraw)
3. In build.py add after the 99b-confirm.css line:
       ('file', 'src/css/99f-library-polish.css'),
4. Run python build.py
