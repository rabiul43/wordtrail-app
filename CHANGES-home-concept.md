# Home page: new phone design (from the approved concept, screen 1)

- src/html/10-body-views.html: the "Home" title is now a greeting (small "Good afternoon" + first name, or just the greeting when signed out); new #ex-goal section under it.
- src/js/120-search-recommendations.js: homeGreet() and homeGoal() (daily-goal ring + streak from the stats the app already keeps; hidden in Calm mode, offline mode, or when there is no goal and no streak; tap opens Account). Both run from renderRecents().
  "Picked for you" now opens on the time-of-day reason with the heading "This morning / afternoon / evening / Tonight"; the other reason chips still work.
- src/js/132-author-page-resume-card.js: the Continue listening card gets a colour from the book and a "Read along is on" line when the book has timing.
- src/css/99i-explore-design.css: all styling (phones, New Home design on). Desktop is unchanged.
Not included: the "Now reading" sentence box and "Chapter 12 of 47" (the app does not save the current sentence or chapter for the Home card).
