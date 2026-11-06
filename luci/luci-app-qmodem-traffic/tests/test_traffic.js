'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/qmodem/traffic.js'), 'utf8');
function E(tag, attrs, children) { return { tag, attrs, children }; }
const traffic = new Function('baseclass','rpc','E','_', source)(
    { extend: o => o }, { declare: () => () => Promise.resolve({}) }, E, s => s);
assert.equal(traffic.bytes(1000000000,1000),'1.00 GB');
assert.equal(traffic.bytes(NaN),'0 B');
const state = {config:{enabled:true,threshold_gb:1},now:100,since:90,cycle_rx:600000000,cycle_tx:500000000,total_rx:700000000,total_tx:500000000,rx_rate:125000,tx_rate:12500,exceeded:true};
let text = JSON.stringify(traffic.summary(state));
assert(text.includes('Traffic usage has reached the configured threshold.'));
assert(text.includes('1.02 GB'));
assert(text.includes('1.00 / 0.10 Mbps'));
assert(!text.includes('stale.'));
text = JSON.stringify(traffic.summary({...state,stale:true}));
assert(text.includes('Traffic samples are stale.'));
assert(JSON.stringify(traffic.summary({config:{enabled:false}})).includes('disabled.'));
assert(JSON.stringify(traffic.summary({config:{enabled:true}})).includes('first traffic sample'));
assert.equal(traffic.cycleTotal({...state,cycle_total:2500000000}),2500000000);
assert(traffic.cycleBreakdown({...state,cycle_adjustment:-100000000}).includes('−95.37 MB'));
assert.equal(traffic.formatDate('2026-11-01 00:00'),'2026/11/01 00:00:00');
assert(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(traffic.formatDate(1793786187)));
const smooth = new Function('rpc', source.slice(0,source.indexOf('var chartSequence'))+'\nreturn smoothPath;')({declare:()=>()=>{}});
assert.equal(smooth([]),'');
assert.equal(smooth([[10,20]]),'M10,20');
for(const coords of [[[0,100],[50,0],[100,100]],[[0,5],[1,5],[2,5]],[[0,100],[1,95],[2,0],[3,0]]]) {
    const d=smooth(coords);
    assert(!/NaN|Infinity/.test(d));
    const segments=d.split(' C').slice(1).map(s=>s.split(',').map(Number));
    segments.forEach((s,i)=>{
        const low=Math.min(coords[i][1],coords[i+1][1]), high=Math.max(coords[i][1],coords[i+1][1]);
        for(let step=0;step<=100;step++) {
            const t=step/100, y=(1-t)**3*coords[i][1]+3*(1-t)**2*t*s[1]+3*(1-t)*t*t*s[3]+t**3*s[5];
            assert(y>=low-1e-9 && y<=high+1e-9,'smoothing must preserve measured bounds');
        }
    });
}
console.log('PASS: traffic summaries, threshold warning, disabled and stale states, binary units and explicit legacy decimal units');
console.log('PASS: smooth charts preserve constant values and measured peak bounds');
