'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../htdocs/luci-static/resources');
const L = { Class: { extend: value => value }, resource: value => value, env: {} };
const bands = new Function('L', fs.readFileSync(path.join(root, 'qmodem/neighbor-bands.js'), 'utf8'))(L);
const neighbor = new Function('L', 'bands', '_', fs.readFileSync(path.join(root, 'qmodem/neighbor-cell.js'), 'utf8'))(L, bands, value => value);
const field = (details, key) => details.values.find(item => item.key === key)?.value;

const raw = {tac: '268435455', cellid: '268435455', arfcn: '504990', pci: '52', band: ''};
const before = JSON.stringify(raw);
let info = neighbor.describe('NR', raw);
assert.equal(field(info, 'tac'), 'Unknown');
assert.equal(field(info, 'cellid'), 'Unknown');
assert.equal(field(info, 'band'), 'n41 / n90 (Estimated from ARFCN; confirm before locking)');
assert.equal(info.copyBand, '');
assert.equal(info.canCopy, true);
assert.equal(JSON.stringify(raw), before);
assert.match(field(neighbor.describe('NR', {...raw, arfcn: '524910'}), 'band'), /^n7 \/ n41 \/ n90 /);
assert.match(field(neighbor.describe('NR', {...raw, arfcn: '627264'}), 'band'), /^n77 \/ n78 /);
assert.match(field(neighbor.describe('NR', {...raw, arfcn: '693334'}), 'band'), /^n79 \(Estimated/);
assert.equal(neighbor.describe('NR', {...raw, arfcn: '693334'}).copyBand, '');
assert.equal(field(neighbor.describe('NR', {...raw, arfcn: '499199'}), 'band'), 'Unknown');
info = neighbor.describe('NR', {...raw, tac: '1574424', cellid: '25806749697', band: '41'});
assert.equal(info.copyBand, '41');
assert.equal(field(info, 'tac'), '1574424');
assert.equal(field(info, 'cellid'), '25806749697');
assert.equal(field(info, 'band'), 'n41 (Reported by modem)');
assert.equal(neighbor.describe('NR', {...raw, band: 'n78'}).copyBand, '78');
assert.equal(field(neighbor.describe('NR', {tac: '', cellid: '', pci: '0', arfcn: '504990'}), 'tac'), 'Unknown');
assert.equal(neighbor.describe('NR', {pci: 0, arfcn: 504990}).canCopy, true);
assert.equal(neighbor.describe('NR', {pci: 1008, arfcn: 504990}).canCopy, false);
assert.equal(neighbor.describe('NR', {pci: '', arfcn: 504990}).canCopy, false);
assert.equal(neighbor.describe('NR', {pci: 1, arfcn: 3279166}).canCopy, false);
assert.equal(neighbor.describe('LTE', {pci: 504, arfcn: 100}).canCopy, false);
assert.match(field(neighbor.describe('LTE', {pci: 0, arfcn: 100}), 'band'), /^B1 \(Estimated/);

function E(tag, attrs = {}, children = []) {
    const node = { tag, attrs, children: [], appendChild(child) { this.children.push(child); return child; } };
    if (Array.isArray(children)) children.forEach(child => node.appendChild(child));
    else node.appendChild(children);
    return node;
}
const notifications = [];
const api = new Function('view', 'ui', 'dom', 'qmodem', 'neighborCell', 'document', 'E', 'L', '_',
    fs.readFileSync(path.join(root, 'view/qmodem/config_advanced.js'), 'utf8'))(
        {extend: value => value}, {addNotification: (...args) => notifications.push(args)}, {}, {}, neighbor,
        {head: E('head')}, E, L, value => value);
const inputs = {rat: {}, pci: {}, arfcn: {}, band: {value: '78'}, bandRow: {style: {}}, scsRow: {style: {}}};
api.neighborCellInputs = {modem0: inputs};
function copy(cell) {
    const row = api.createNeighborCellRow({id: 'modem0'}, 'NR', cell, 1);
    const button = row.children[2].children[0];
    button.attrs.click();
    return button;
}
assert.equal(copy({...raw, pci: 0}).attrs.disabled, null);
assert.equal(inputs.pci.value, '0');
assert.equal(inputs.arfcn.value, '504990');
assert.equal(inputs.band.value, '', 'do not copy a candidate or retain a stale band');
assert.equal(notifications.at(-1)[2], 'warning');
copy({...raw, band: '41'});
assert.equal(inputs.band.value, '41');
assert.equal(notifications.at(-1)[2], 'info');
assert.equal(copy({...raw, pci: 268435455}).attrs.disabled, 'disabled');
assert.equal(inputs.band.value, '41', 'disabled copy cannot modify settings');
console.log('PASS: neighbor placeholders, overlapping DL bands, modem provenance and safe copy');
