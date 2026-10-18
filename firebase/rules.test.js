// Tests for firestore.rules. NOT run by the person who wrote them (no Firebase emulator was available), so run
// them once before you publish the rules:
//   npm i -D @firebase/rules-unit-testing firebase
//   npx firebase emulators:exec --only firestore "node rules.test.js"      (needs firebase-tools and Java)
const fs = require('fs'), assert = require('assert');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, deleteDoc, serverTimestamp, writeBatch, increment, updateDoc } = require('firebase/firestore');

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'wordtrail-rules-test', firestore: { rules: fs.readFileSync(__dirname + '/firestore.rules', 'utf8') } });
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  const at = (db, uid, id) => doc(db, 'users', uid, 'data', id);
  const key = encodeURIComponent('wt:favs');
  const ok = async (name, p) => { await assertSucceeds(p); console.log('ok   ', name); };
  const no = async (name, p) => { await assertFails(p); console.log('denied', name); };

  // owner: the four kinds of document the app writes
  await ok('item with u', setDoc(at(alice, 'alice', key), { k: 'wt:favs', v: '[]', t: Date.now(), u: serverTimestamp() }));
  await ok('item without u (older app)', setDoc(at(alice, 'alice', encodeURIComponent('wt:prefs')), { k: 'wt:prefs', v: '{}', t: 1 }));
  await ok('clock', setDoc(at(alice, 'alice', '__clock'), { t: serverTimestamp() }));
  await ok('piece', setDoc(at(alice, 'alice', 'chunk:' + key + ':0'), { ck: 'wt:favs', i: 0, v: 'x'.repeat(1000) }));
  await ok('large header', setDoc(at(alice, 'alice', encodeURIComponent('wt:words')), { k: 'wt:words', chunks: 5, len: 1300000, t: Date.now(), u: serverTimestamp() }));
  await ok('read own', getDoc(at(alice, 'alice', key)));
  await ok('delete own', deleteDoc(at(alice, 'alice', key)));

  // everyone else
  await no('read someone else', getDoc(at(bob, 'alice', encodeURIComponent('wt:prefs'))));
  await no('write someone else', setDoc(at(bob, 'alice', key), { k: 'wt:favs', v: '[]', t: 1 }));
  await no('delete someone else', deleteDoc(at(bob, 'alice', encodeURIComponent('wt:prefs'))));
  await no('signed out read', getDoc(at(anon, 'alice', encodeURIComponent('wt:prefs'))));
  await no('signed out write', setDoc(at(anon, 'alice', key), { k: 'wt:favs', v: '[]', t: 1 }));

  // bad shapes from the owner
  await no('extra field', setDoc(at(alice, 'alice', key), { k: 'wt:favs', v: '[]', t: 1, junk: 1 }));
  await no('missing v', setDoc(at(alice, 'alice', key), { k: 'wt:favs', t: 1 }));
  await no('v not a string', setDoc(at(alice, 'alice', key), { k: 'wt:favs', v: 5, t: 1 }));
  await no('key outside wt:', setDoc(at(alice, 'alice', 'evil'), { k: 'evil', v: '[]', t: 1 }));
  await no('v over 900000', setDoc(at(alice, 'alice', key), { k: 'wt:favs', v: 'x'.repeat(900001), t: 1 }));
  await no('fake u', setDoc(at(alice, 'alice', key), { k: 'wt:favs', v: '[]', t: 1, u: new Date(0) }));
  await no('clock with a made-up time', setDoc(at(alice, 'alice', '__clock'), { t: new Date(0) }));
  await no('piece over 300000', setDoc(at(alice, 'alice', 'chunk:' + key + ':1'), { ck: 'wt:favs', i: 1, v: 'x'.repeat(300001) }));
  await no('piece index 99', setDoc(at(alice, 'alice', 'chunk:' + key + ':99'), { ck: 'wt:favs', i: 99, v: 'x' }));
  await no('header with 99 chunks', setDoc(at(alice, 'alice', encodeURIComponent('wt:words')), { k: 'wt:words', chunks: 99, len: 5, t: 1, u: serverTimestamp() }));
  await no('other collection', setDoc(doc(alice, 'users', 'alice', 'other', 'x'), { a: 1 }));
  await no('user document itself', setDoc(doc(alice, 'users', 'alice'), { a: 1 }));

  // ratings: public to read; one vote per user; the totals move only with the user's own vote
  const tot = (db, id) => doc(db, 'ratings', id), vote = (db, id, uid) => doc(db, 'ratings', id, 'votes', uid);
  const moves = (now, was) => { const o = {}; for (let k = 1; k <= 5; k++) o['c' + k] = increment((now === k ? 1 : 0) - (was === k ? 1 : 0)); return o; };
  // rate(db, uid, book, stars now, review, stars before (0 = none)): the vote and the totals move together
  const rate = (db, uid, id, r, c, was, bad) => { const b = writeBatch(db); b.set(vote(db, id, uid), { r, c: c || '', n: 'Al', t: serverTimestamp() }); b.set(tot(db, id), Object.assign({ n: increment(was ? 0 : 1), s: increment(r - was) }, bad || moves(r, was)), { merge: true }); return b.commit(); };
  const unrate = (db, uid, id, was) => { const b = writeBatch(db); b.delete(vote(db, id, uid)); b.set(tot(db, id), Object.assign({ n: increment(-1), s: increment(-was) }, moves(0, was)), { merge: true }); return b.commit(); };
  await ok('first rating', rate(alice, 'alice', '7', 4, 'Great', 0));
  await ok('anyone reads totals', getDoc(tot(anon, '7')));
  await ok('anyone reads votes', getDoc(vote(anon, '7', 'alice')));
  await ok('second user rates', rate(bob, 'bob', '7', 2, '', 0));
  await ok('change own rating (star counters move)', rate(alice, 'alice', '7', 5, 'Better', 4));
  await no('totals not moved with the vote', setDoc(vote(alice, '7', 'alice'), { r: 1, c: '', n: 'Al', t: serverTimestamp() }));
  await no('wrong star counter moved', rate(alice, 'alice', '7', 3, '', 5, moves(4, 5)));
  await no('old star counter not lowered', rate(alice, 'alice', '7', 3, '', 5, Object.assign(moves(3, 0), { c5: increment(0) })));
  await no('rate twice as a new vote (+1 again)', rate(alice, 'alice', '7', 5, '', 0));
  await no('rate as someone else', rate(bob, 'alice', '7', 5, '', 5));
  await no('totals alone changed', setDoc(tot(bob, '7'), { n: 9, s: 45, c1: 0, c2: 0, c3: 0, c4: 0, c5: 9 }));
  await no('signed out rating', rate(anon, 'alice', '8', 5, '', 0));
  await no('0 stars', rate(alice, 'alice', '9', 0, '', 0));
  await no('6 stars', rate(alice, 'alice', '9', 6, '', 0));
  await no('review over 140', rate(alice, 'alice', '9', 5, 'x'.repeat(141), 0));
  await no('delete totals', deleteDoc(tot(alice, '7')));
  await no('remove someone else\'s vote', unrate(bob, 'alice', '7', 5));
  await ok('remove own vote', unrate(alice, 'alice', '7', 5));

  // reports: one per user per review, counter x moves with it, nobody reads them
  const report = (db, who, id, uid, k, bump) => { const b = writeBatch(db), r = doc(db, 'ratings', id, 'votes', uid, 'reports', who);
    b.set(r, { k, t: serverTimestamp() }); b.update(vote(db, id, uid), { x: bump === undefined ? increment(1) : bump }); return b.commit(); };
  await ok('review to report', rate(alice, 'alice', '12', 5, 'Hello', 0));
  await ok('report a review', report(bob, 'bob', '12', 'alice', 'spam'));
  await no('same user reports it again', report(bob, 'bob', '12', 'alice', 'other'));
  await ok('second person reports it', report(env.authenticatedContext('carol').firestore(), 'carol', '12', 'alice', 'spoiler'));
  await no('report your own review', report(alice, 'alice', '12', 'alice', 'spam'));
  await no('report as someone else', report(env.authenticatedContext('dan').firestore(), 'bob', '12', 'alice', 'spam'));
  await no('signed out report', report(anon, 'x', '12', 'alice', 'spam'));
  await no('unknown reason', report(env.authenticatedContext('erin').firestore(), 'erin', '12', 'alice', 'rude'));
  await no('counter raised by 5', report(env.authenticatedContext('fay').firestore(), 'fay', '12', 'alice', 'spam', increment(5)));
  await no('counter raised without a report', updateDoc(vote(bob, '12', 'alice'), { x: increment(1) }));
  await no('changing the stars through the counter', updateDoc(vote(bob, '12', 'alice'), { x: increment(1), r: 1 }));
  await no('report a review that does not exist', report(bob, 'bob', '12', 'nobody', 'spam'));
  await no('read a report', getDoc(doc(bob, 'ratings', '12', 'votes', 'alice', 'reports', 'bob')));
  await no('delete a report', deleteDoc(doc(bob, 'ratings', '12', 'votes', 'alice', 'reports', 'bob')));
  await ok('owner edits review (starts fresh)', rate(alice, 'alice', '12', 5, 'Edited', 5));
  await no('owner sets x herself', setDoc(vote(alice, '12', 'alice'), { r: 5, c: 'Edited', n: 'Al', t: serverTimestamp(), x: 0 }));

  await env.cleanup();
  console.log('all rules tests passed');
})().catch(e => { console.error(e); process.exit(1); });
