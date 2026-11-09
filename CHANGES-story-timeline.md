# Story timeline (book page)

A "Story timeline" section after "About this book": numbered major events in order (first 4, "Show all N events"),
a "Contains spoilers" note and a Wikipedia CC BY-SA credit. Shown only for books that have an entry with status OK.

Data: Hugging Face dataset rabiul43/Story_Timeline, timelines.json (made by kaggle_make_timelines.py from the plots
that kaggle_story_timeline.py takes from Wikipedia). Read once, kept in IndexedDB for 3 days (works offline after).
REVIEW entries are not shown; to approve one, change its status to OK in timelines.json.

Files: src/js/136-story-timeline.js (new), src/css/99p-story-timeline.css (new), build.py (2 lines),
src/js/131-book-stats-share.js (tlSection(b) between about and ratingsSection).

## AI timelines for books without a Wikipedia plot
Same section, second data file: timelines_ai.json (kaggle_ai_timelines.py, status AI). Shown with the label
"Written by AI from the book's text. It may contain mistakes." instead of the Wikipedia credit. AI_REVIEW is never shown.
A Wikipedia timeline wins if a book has both. IndexedDB key is now timelines:v2 (both files in one record).
