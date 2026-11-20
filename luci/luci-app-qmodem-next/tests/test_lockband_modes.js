'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/config_advanced.js'), 'utf8');
function E(tag, attrs, children) {
    return { tag, attrs: attrs || {}, style: {}, children: children == null ? [] : Array.isArray(children) ? children : [children],
        appendChild(child) { this.children.push(child); } };
}
let pref, writes = 0;
const qmodem = {
    getLockBand: async () => ({ lockband: Object.fromEntries(['UMTS', 'LTE', 'NR', 'NR_NSA'].map(key => [key, {
        available_band: [{ band_id: '1', band_name: key + '_1' }, { band_id: '3', band_name: key + '_3' }],
        lock_band: key === 'NR_NSA' ? ['0'] : []
    }])) }),
    getNetworkPrefer: async () => pref,
    setLockBand() { writes++; }
};
const view = new Function('view', 'ui', 'dom', 'qmodem', 'neighborCell', 'document', 'E', 'L', '_', source)(
    { extend: x => x }, {}, { content: (el, node) => { el.children = [node]; } }, qmodem, {},
    { head: E('head') }, E, { env: {}, resource: x => x }, x => x
);
function walk(node) { return node && typeof node === 'object' ? [node].concat((node.children || []).flatMap(walk)) : []; }
(async () => {
    for (let mask = 1; mask < 8; mask++) {
        pref = { network_prefer: { '3G': String(mask & 1 ? 1 : 0), '4G': String(mask & 2 ? 1 : 0), '5G': String(mask & 4 ? 1 : 0) } };
        const content = E('div');
        await view.loadLockBand({ id: '2_3' }, content);
        const all = walk(content);
        for (const [key, active] of [['UMTS', !!(mask & 1)], ['LTE', !!(mask & 2)], ['NR', !!(mask & 4)], ['NR_NSA', (mask & 6) === 6]]) {
            const inputs = all.filter(n => n.tag === 'input' && n.attrs.name === 'band_2_3_' + key);
            assert.equal(inputs.length, 2);
            // LuCI sets every non-null attribute; disabled="false" still disables HTML controls.
            assert.ok(inputs.every(n => (n.attrs.disabled != null) === !active));
            if (active) assert.ok(inputs.every(n => n.attrs.checked === 'checked'));
            const display = all.find(n => n.attrs.id === 'locked_2_3_' + key);
            const section = all.find(n => n.tag === 'fieldset' && walk(n).some(child => child === display));
            assert.ok(walk(section).filter(n => n.tag === 'button').every(n => (n.attrs.disabled != null) === !active));
            if (!active) assert.equal(display.textContent, key === 'NR_NSA' && (mask & 4) && !(mask & 2) ? 'Not enabled; enable 4G first' : 'Not enabled');
        }
    }
    pref = null;
    const failed = E('div');
    await view.loadLockBand({ id: '2_3' }, failed);
    assert.ok(walk(failed).filter(n => n.tag === 'input').every(n => n.attrs.disabled));
    assert.equal(writes, 0, 'rendering never changes modem band settings');
    console.log('PASS: seven mode combinations gate bands and NSA; failed reads disable controls without writes');
})().catch(err => { console.error(err); process.exitCode = 1; });
