// Every spec imports { test, expect } from here instead of '@playwright/test', so the network mock is always on.
const base = require('@playwright/test');
const { mockNetwork } = require('./mock-network');

const test = base.test.extend({
  // `net.log.unmocked` lists outside requests no mock answered; `net.mocks.offline = true` cuts the outside world.
  net: [async ({ context }, use) => { await use(await mockNetwork(context)); }, { auto: true }]
});

module.exports = { test, expect: base.expect };
