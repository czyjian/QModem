const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'luci/luci-app-qmodem-next/htdocs/luci-static/resources/qmodem/qmodem.js'), 'utf8');
let devices = [
  { '.name': 'old', name: 'rw350r-gl', state: 'disabled', at_port: '/dev/ttyUSB3' },
  { '.name': 'live', name: 't99w640', state: 'enabled', at_port: '/dev/wwan0at0' }
];
const uci = { load: async () => {}, sections: () => devices.slice() };
const api = new Function('rpc', 'uci', 'L', '_', source)(
  { declare: () => () => Promise.resolve({}) }, uci,
  { Class: { extend: value => value } }, value => value);
(async () => {
  // Saved offline device must not be the default or receive AT operations.
  assert.deepEqual(api.getModemDevices(true).map(s => s['.name']), ['live', 'old']);
  assert.deepEqual(devices.map(s => s['.name']), ['old', 'live']);
  let sections = await api.getModemSections();
  assert.deepEqual(sections.map(s => s.id), ['live']);
  assert.equal(sections[0].enabled, true);
  // Availability follows scan state, not dial-enable flags or old model order.
  devices[0].state = 'enabled'; devices[0].enable_dial = '0';
  devices[1].state = 'disabled';
  assert.deepEqual((await api.getModemSections()).map(s => s.id), ['old']);
  devices[0].at_port = '';
  assert.deepEqual(await api.getModemSections(), []);
  assert.equal(api.getModemDevices(true).length, 2);
  devices = [];
  assert.deepEqual(api.getModemDevices(true), []);
  console.log('PASS: online defaults, offline history, scan-state changes, missing AT ports, empty inventory');
})().catch(error => { console.error(error); process.exitCode = 1; });
