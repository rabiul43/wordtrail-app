// Regenerates fixtures/test-tone.wav: a quiet 440 Hz tone, 6 seconds, 8 kHz mono 16-bit (about 96 KB).
// Run with: node fixtures/make-wav.js
const fs = require('fs'), path = require('path');
const SECS = 6, RATE = 8000, n = SECS * RATE, b = Buffer.alloc(44 + n * 2);
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write('data', 36); b.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / RATE) * 4000), 44 + i * 2);
fs.writeFileSync(path.join(__dirname, 'test-tone.wav'), b);
console.log('wrote test-tone.wav', b.length, 'bytes');
