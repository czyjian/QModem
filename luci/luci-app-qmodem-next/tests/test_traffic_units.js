const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../htdocs/luci-static/resources/qmodem/traffic.js','utf8');
const api=new Function('baseclass','rpc','_',source)({extend:o=>o},{declare:()=>()=>{}},x=>x);
assert.equal(api.bytes(1073741824,1024),'1.00 GB');
assert.equal(api.bytes(1073741824,1000),'1.07 GB');
assert.equal(api.bytes(1073741824),'1.00 GB');
assert.equal(api.bytes(34678.31*1048576,1024),'33.87 GB');
assert.equal(api.cycleBreakdown({unit_base:1024,cycle_rx:1073741824,cycle_tx:1048576,cycle_adjustment:1048576}),'Download: 1.00 GB / Upload: 1.00 MB / Adjustment: +1.00 MB');
console.log('PASS: Unicom binary units, legacy decimal units and calibration breakdown');
