'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class Element {
    constructor(tag, attrs = {}, children = []) {
        this.tag = tag; this.attrs = attrs; this.children = [];
        this.value = typeof children === 'string' ? children : '';
        this.scrollTop = 0; this.clientHeight = 100; this.scrollHeight = 1000;
        this.isConnected = true;
        if (Array.isArray(children)) children.forEach(child => this.appendChild(child));
    }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    get firstChild() { return this.children[0]; }
    querySelector(selector) {
        return this.children.filter(c => c instanceof Element).map(c =>
            c.attrs.class === selector.slice(1) ? c : c.querySelector(selector)).find(Boolean);
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    getBoundingClientRect() { return { width: 600, height: 400 }; }
}
const E = (tag, attrs, children) => new Element(tag, attrs, children);
const callbacks = new Set();
const poll = { add(fn, seconds) { assert.equal(seconds, 2); callbacks.add(fn); }, remove(fn) { callbacks.delete(fn); } };
let dialog, response = { log: 'first\nlast' }, calls = 0;
const qmodem = { formatModemName: () => 'modem', getDialLog: async () => {
    calls++; if (response instanceof Error) throw response; return response;
} };
const ui = { showModal(title, children) { dialog = E('div', {}, children); return dialog; } };
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/network_config.js'), 'utf8');
const api = new Function('view', 'uci', 'rpc', 'ui', 'qmodem', 'poll', 'document', 'E', 'L', '_', source)(
    { extend: obj => obj }, { get: () => '' }, { declare: () => () => {} }, ui, qmodem, poll,
    { head: E('head'), documentElement: { clientWidth: 1200, clientHeight: 900 } }, E,
    { resource: s => s, env: {}, bind: (fn, obj) => fn.bind(obj) }, s => s);

(async () => {
    api.showDialLogDialog('2_3');
    await new Promise(resolve => setImmediate(resolve));
    const area = dialog.querySelector('.dial-log-content');
    assert.equal(area.scrollTop, area.scrollHeight, 'open at newest line');
    assert.equal(callbacks.size, 1);
    const refresh = [...callbacks][0];
    area.scrollTop = 900;
    response = { log: 'first\nlast\nnew' };
    await refresh();
    assert.equal(area.value, response.log);
    assert.equal(area.scrollTop, 1000, 'follow new output at bottom');
    area.scrollTop = 100;
    response = { log: 'more output' };
    await refresh();
    assert.equal(area.scrollTop, 100, 'preserve history position');
    assert.equal(dialog.querySelector('.dial-log-content'), area, 'reuse textarea');
    response = new Error('offline');
    await refresh();
    assert.equal(area.value, 'more output', 'retain log on RPC failure');
    response = { log: '' };
    await refresh();
    assert.equal(area.value, '', 'clear stale output');
    const container = dialog.children.find(c => c instanceof Element && c.querySelector('.dial-log-content'));
    container.isConnected = false;
    const before = calls;
    await refresh();
    assert.equal(calls, before, 'no requests after close');
    assert.equal(callbacks.size, 0, 'remove closed dialog poll');
    console.log('PASS: log tail, automatic refresh, history position, RPC errors and close cleanup');
})().catch(err => { console.error(err); process.exitCode = 1; });
