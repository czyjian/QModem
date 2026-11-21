'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
function E(tag, attrs, children) {
    return { tag, attrs: attrs || {}, className: (attrs && attrs['class']) || '', style: {},
        children: children == null ? [] : Array.isArray(children) ? children : [children],
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
const tabMenu = walk(content).find(n => n.tag === 'ul' && n.attrs['class'] === 'cbi-tabmenu');
assert.ok(tabMenu);
const tabs = tabMenu.children;
assert.equal(tabs.length, 2);
assert.equal(tabs[0].className, 'cbi-tab');
assert.equal(tabs[1].className, 'cbi-tab-disabled');
const sections = walk(content).filter(n => n.tag === 'fieldset');
assert.equal(sections.length, 2);
assert.equal(sections[0].style.display, '');
assert.equal(sections[1].style.display, 'none');
assert.ok(JSON.stringify(sections[0]).includes('Sender'));
assert.ok(!JSON.stringify(sections[0]).includes('sent body'));
assert.ok(JSON.stringify(sections[1]).includes('Recipient'));
assert.ok(!JSON.stringify(sections[1]).includes('received body'));
tabs[1].children[0].attrs.click({ preventDefault() {} });
assert.equal(tabs[0].className, 'cbi-tab-disabled');
assert.equal(tabs[1].className, 'cbi-tab');
assert.equal(sections[0].style.display, 'none');
assert.equal(sections[1].style.display, '');
// Re-rendering (e.g. poll refresh) preserves active tab
view.renderSimSmsList(content, [outgoing, incoming], 'modem0');
const refreshedSections = walk(content).filter(n => n.tag === 'fieldset');
assert.equal(refreshedSections[0].style.display, 'none');
assert.equal(refreshedSections[1].style.display, '');
let deleted;
view.handleDeleteAllSimSms = (modem, items) => { deleted = items; };
walk(refreshedSections[0]).find(n => n.tag === 'button' && n.children.includes('Delete All')).attrs.click();
assert.deepEqual(deleted, [incoming]);
walk(refreshedSections[1]).find(n => n.tag === 'button' && n.children.includes('Delete All')).attrs.click();
assert.deepEqual(deleted, [outgoing]);
let reference;
view.handleDeleteSimSms = (modem, ref) => { reference = ref; };
walk(refreshedSections[1]).find(n => n.tag === 'button' && n.children.includes('Delete')).attrs.click();
assert.deepEqual(reference, { id: 77 });
console.log('PASS: received/sent tabs switch, persist on refresh, and keep independent deletion targets');
