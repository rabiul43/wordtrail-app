# Story timeline (book page)

A "Story timeline" section after "About this book": numbered major events in order (first 4, "Show all N events"),
a "Contains spoilers" note and a Wikipedia CC BY-SA credit. Shown only for books that have an entry with status OK.

Data: Hugging Face dataset rabiul43/Story_Timeline, timelines.json (made by kaggle_make_timelines.py from the plots
that kaggle_story_timeline.py takes from Wikipedia). Read once, kept in IndexedDB for 3 days (works offline after).
REVIEW entries are not shown; to approve one, change its status to OK in timelines.json.

Files: src/js/136-story-timeline.js (new), src/css/99p-story-timeline.css (new), build.py (2 lines),
src/js/131-book-stats-share.js (tlSection(b) between about and ratingsSection).
