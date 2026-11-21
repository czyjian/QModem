'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
function E(tag, attrs, children) {
    return { tag, attrs: attrs || {}, children: children == null ? [] : Array.isArray(children) ? children : [children],
        appendChild(child) { this.children.push(child); } };
}
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/qmodem/sms_sim.js'), 'utf8');
const service = { formatPhoneNumber: x => x, formatTimestamp: String };
const view = new Function('baseclass', 'poll', 'ui', 'dom', 'smsService', 'qmodem', 'document', 'E', 'L', '_', source)(
    { extend: x => x }, {}, {}, { content: el => { el.children = []; } }, service, {}, { head: E('head') }, E,
    { env: {}, resource: x => x }, x => x
);
const incoming = { type: 'received', sender: '10086', content: 'received body', delete_ref: { id: 42 } };
const outgoing = { type: 'sent', recipient: '10010', content: 'sent body', delete_ref: { id: 77 } };
const content = E('div');
view.renderSimSmsList(content, [outgoing, incoming], 'modem0');
function walk(node) { return node && typeof node === 'object' ? [node].concat(node.children.flatMap(walk)) : []; }
const sections = walk(content).filter(n => n.tag === 'fieldset');
assert.equal(sections.length, 2);
assert.ok(JSON.stringify(sections[0]).includes('Sender'));
assert.ok(!JSON.stringify(sections[0]).includes('sent body'));
assert.ok(JSON.stringify(sections[1]).includes('Recipient'));
assert.ok(!JSON.stringify(sections[1]).includes('received body'));
let deleted;
view.handleDeleteAllSimSms = (modem, items) => { deleted = items; };
walk(sections[0]).find(n => n.tag === 'button' && n.children.includes('Delete All')).attrs.click();
assert.deepEqual(deleted, [incoming]);
walk(sections[1]).find(n => n.tag === 'button' && n.children.includes('Delete All')).attrs.click();
assert.deepEqual(deleted, [outgoing]);
let reference;
view.handleDeleteSimSms = (modem, ref) => { reference = ref; };
walk(sections[1]).find(n => n.tag === 'button' && n.children.includes('Delete')).attrs.click();
assert.deepEqual(reference, { id: 77 });
console.log('PASS: received/sent sections use correct contacts and independent deletion targets');
