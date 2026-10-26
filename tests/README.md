# Wordtrail tests

Browser tests (Playwright) for the built app, plus the Firestore rules tests. Everything test-related is in this
folder with its own `package.json`: **the app itself still has no dependencies** (`build.py` and `src/` never read it).

## Run them

    python build.py                    # the tests open dist/index.html, so build it first (in the project folder)
    cd tests
    npm install                        # once
    npx playwright install chromium    # once (add --with-deps on a fresh Linux machine)
    npm test                           # the browser tests
    npm run test:rules                 # the Firestore rules tests (needs Java; starts the emulator by itself)

`npm run test:ui` opens Playwright's window where you can watch each step. After a failure,
`npx playwright show-report` shows what the page looked like.

## What is covered (`specs/`)

| File | Checks |
|---|---|
| `01-onboarding` | welcome screens complete (level, language, Start reading, or Skip), are remembered, and do not return after a reload |
| `02-search` | a title / author search lists the right books, a miss says "No results", clearing returns home |
| `03-open-book` | a result opens the book page; "Read and listen" opens the player with the tracks and text; Back works |
| `04-playback` | play and pause with a real 6-second audio file: the audio moves, stops where paused, resumes, and the button label follows |
| `05-bookmark` | a bookmark is saved (settings > More > Bookmark this place), listed under My books, and survives a reload |
| `06-offline` | after the first visit the server is switched off for real, the page still reloads (from the service worker), and the saved catalog still answers a search |

## How the network is mocked

`helpers/mock-network.js` answers every request to the outside world with a small fixed reply, so the tests never
touch the real internet and give the same result every time:

- the catalog and reading levels (`fixtures/books.js`: six made-up books, none of them real LibriVox titles)
- the LibriVox API, the Cloudflare worker's book bundle (tracks + text), Gutenberg
- the audio: every track is `fixtures/test-tone.wav` (a quiet 6-second tone; `node fixtures/make-wav.js` rebuilds it)
- covers, fonts, Wikipedia, Open Library and the Firestore ratings query get an empty or "not found" answer

Anything not listed is refused (as if offline) and recorded in `net.log.unmocked`; `02-search` asserts that list is empty.
If the app starts calling a new address, add it to `answer()` in `mock-network.js`.

### Why the service worker is blocked (and where it is not)

The mock cannot see what a service worker fetches by itself, and `sw.js` fetches `catalog.json` itself once it has taken over the page.
Which came first, the page's own request (answered by the mock) or the worker's (answered by the real internet), was a race:
search then sometimes ran on the real catalog and found none of the test books. So `playwright.config.js` sets
`serviceWorkers: 'block'`. Only `06-offline` needs the worker: it makes its own browser context with `serviceWorkers: 'allow'`,
and holds the worker back until the mocked catalog has been saved (see the comment in that spec).

## Adding a test

Import `test` and `expect` from `../helpers/test` (not from `@playwright/test`) so the mock is always on, and reuse the
steps in `helpers/app.js` (`startApp`, `search`, `openBookPage`, `openPlayer`).
