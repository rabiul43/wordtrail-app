// Runs ../firebase/rules.test.js with the packages installed in this folder (tests/node_modules), so the
// firebase/ folder needs no package.json of its own. Used by "npm run test:rules" inside the Firestore emulator.
const path = require('path');
process.env.NODE_PATH = [path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();
require('../firebase/rules.test.js');
