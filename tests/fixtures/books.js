// Made-up books used by every test. Nothing here is a real LibriVox recording.
// Catalog rows use the same column order as catalog.json in the wordtrail-data repo:
// [id, title, authors, authorLast, lang, gutenbergId, totalSeconds, sections, archiveId, genres, textUrl]
const BOOKS = [
  { id: '9001', title: 'The Lantern Keeper', first: 'Mara', last: 'Quill', gid: '90010', genres: 'Fiction, Mystery' },
  { id: '9002', title: 'Lantern Hill Mysteries', first: 'Oskar', last: 'Brandt', gid: '90020', genres: 'Fiction, Mystery' },
  { id: '9003', title: 'Tales of the Moor', first: 'Edith', last: 'Harrow', gid: '90030', genres: 'Fiction, Short stories' },
  { id: '9004', title: 'A Short Guide to Gardens', first: 'Ivor', last: 'Penn', gid: '90040', genres: 'Non-fiction, Nature' },
  { id: '9005', title: 'The River and the Clock', first: 'Nell', last: 'Ashby', gid: '90050', genres: 'Fiction, Adventure' },
  { id: '9006', title: 'Letters from a Quiet Town', first: 'Hana', last: 'Voss', gid: '90060', genres: 'Fiction, Romance' }
];
const SECTION_SECONDS = 6;     // matches fixtures/test-tone.wav
const SECTIONS = 2;
const AUDIO_URL = n => 'https://archive.org/download/test-book/chapter' + n + '.wav';

const catalogRows = () => BOOKS.map(b => [b.id, b.title, b.first + ' ' + b.last, b.last, 'English', b.gid, SECTION_SECONDS * SECTIONS, SECTIONS, 'test-book-' + b.id, b.genres, '']);
const catalog = () => ({ b: catalogRows() });

// Reading levels: every test book is "Medium" (tier 1), which is the level the tests pick in onboarding.
// Without this file the app hides all books while a level is chosen.
const levels = () => ({ v: 1, tiers: ['Easy', 'Medium', 'Hard'], cefr: [['B2', 'ages 14-16']], b: Object.fromEntries(BOOKS.map(b => [b.id, [1, 0]])) });

// The shape the LibriVox API returns for one audiobook (with its tracks).
const librivoxBook = b => ({
  id: b.id, title: b.title, language: 'English', totaltimesecs: SECTION_SECONDS * SECTIONS, num_sections: SECTIONS,
  url_iarchive: 'https://archive.org/details/test-book-' + b.id, url_text_source: '', copyright_year: '1900', description: 'A made-up book for tests.',
  authors: [{ first_name: b.first, last_name: b.last, dob: '1850', dod: '1920' }],
  sections: Array.from({ length: SECTIONS }, (_, i) => ({
    id: b.id + '0' + (i + 1), section_number: String(i + 1), title: 'Chapter ' + (i + 1), listen_url: AUDIO_URL(i + 1), playtime: String(SECTION_SECONDS),
    readers: [{ display_name: 'Test Reader' }]
  }))
});

// Book text (Project Gutenberg style). Must be 4000+ characters or the app ignores it.
const bookText = b => {
  const para = 'The lantern swung slowly in the dark window, and the old keeper watched the road. Nobody came that night, and nobody came the next. ';
  const chapter = n => 'CHAPTER ' + ['I', 'II'][n - 1] + '.\n\n' + Array.from({ length: 14 }, () => para.repeat(3).trim()).join('\n\n') + '\n\n';
  return 'The Project Gutenberg eBook of ' + b.title + '\n\nTitle: ' + b.title + '\nAuthor: ' + b.first + ' ' + b.last + '\n\n*** START OF THE PROJECT GUTENBERG EBOOK ' + b.title.toUpperCase() + ' ***\n\n' +
    b.title.toUpperCase() + '\n\nby ' + b.first + ' ' + b.last + '\n\n' + chapter(1) + chapter(2) + '*** END OF THE PROJECT GUTENBERG EBOOK ' + b.title.toUpperCase() + ' ***\n';
};

module.exports = { BOOKS, SECTION_SECONDS, SECTIONS, AUDIO_URL, catalog, levels, librivoxBook, bookText };
