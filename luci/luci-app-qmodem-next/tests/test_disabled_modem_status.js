'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = [];
		if (Array.isArray(children)) {
			children.forEach(c => this.appendChild(c));
		} else if (children !== undefined && children !== null) {
			this.children.push(children);
		}
	}
	appendChild(child) {
		this.children.push(child);
		return child;
	}
	removeChild(child) {
		const idx = this.children.indexOf(child);
		if (idx !== -1)
			this.children.splice(idx, 1);
	}
	get firstChild() {
		return this.children[0];
	}
}

function registerIds(node, map) {
	if (!(node instanceof Element))
		return;
	if (node.attrs && node.attrs.id)
		map.set(node.attrs.id, node);
	node.children.forEach(c => registerIds(c, map));
}

const E = (tag, attrs, children) => new Element(tag, attrs, children);
const byId = new Map();
const devices = [
	{ '.name': '0000_0b_00_0', name: 't99w640', state: 'enabled', enable_dial: '1', alias: '' },
	{ '.name': '2_1', name: 'rw350r-gl', state: 'disabled', enable_dial: '1', alias: '-' }
];
const connectCalls = [];
const dialCalls = [];

const uci = {
	load: async () => {},
	sections: (cfg, type) => (cfg === 'qmodem' && type === 'modem-device') ? devices.slice() : [],
	get: (cfg, sid, opt) => {
		const dev = devices.find(d => d['.name'] === sid);
		return dev ? dev[opt] : undefined;
	}
};

const qmodem = {
	rcStatus: async () => ({ qmodem_network: { enabled: true, running: true } }),
	getConnectStatus: async (sid) => {
		connectCalls.push(sid);
		return { connection_status: 'yes' };
	},
	getDialStatus: async (sid) => {
		dialCalls.push(sid);
		return { running: true };
	},
	getModemDevices: () => devices.slice(),
	formatModemName: (name, alias, sid) => name || sid,
	realAlias: (alias) => (alias && alias !== '-') ? alias : ''
};

const sectionsCreated = [];
function makeSection(type, sid) {
	const sec = {
		type,
		sid,
		options: [],
		option(OptCtor, name, title) {
			const opt = { OptCtor, name, title, values: [], deps: [], value(k, v) { this.values.push([k, v]); }, depends() {} };
			this.options.push(opt);
			return opt;
		}
	};
	sectionsCreated.push(sec);
	return sec;
}

const form = {
	Map: function() {
		return {
			section(SecCtor, sid) { return makeSection(SecCtor.name, sid); },
			async render() {
				const root = E('div', {}, []);
				sectionsCreated.forEach(sec => {
					const rowIds = sec.cfgsections ? sec.cfgsections() : [sec.sid];
					rowIds.forEach(sid => {
						sec.options.forEach(opt => {
							if (opt.modalonly || !opt.cfgvalue)
								return;
							const node = opt.cfgvalue(sid);
							registerIds(node, byId);
							root.appendChild(node instanceof Element ? node : E('span', {}, String(node)));
						});
					});
				});
				return root;
			}
		};
	},
	Flag: function Flag() {},
	DummyValue: function DummyValue() {},
	Value: function Value() {},
	DynamicList: function DynamicList() {},
	ListValue: function ListValue() {}
};

const sectionForm = {
	NamedSection: function NamedSection() {},
	GridSection: function GridSection() {}
};

const poll = { add: () => {}, remove: () => {} };
const ui = { createHandlerFn: () => () => {} };
const document = {
	head: E('head'),
	getElementById: (id) => byId.get(id) || null
};

const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/network_config.js'), 'utf8');
const api = new Function(
	'view', 'form', 'sectionForm', 'uci', 'rpc', 'ui', 'qmodem', 'dom', 'poll', 'document', 'E', 'L', '_',
	source
)(
	{ extend: obj => obj }, form, sectionForm, uci, { declare: () => () => {} }, ui, qmodem, {}, poll, document, E,
	{ resource: s => s, env: {}, bind: (fn, obj) => fn.bind(obj) }, s => s
);

(async () => {
	await api.load();
	assert.deepEqual(connectCalls, ['0000_0b_00_0'], 'load() must only query enabled modems');

	await api.render();
	await new Promise(resolve => setImmediate(resolve));

	const gridSection = sectionsCreated.find(s => s.sid === 'modem-device');
	const statusOpt = gridSection.options.find(o => o.name === '_status_indicator');

	const disabledDot = statusOpt.cfgvalue('2_1').children[0];
	assert.equal(disabledDot.attrs.title, 'Disabled', 'disabled modem status must display Disabled');
	assert.match(disabledDot.attrs.style, /background-color:\s*#999;/, 'disabled modem status must remain gray');

	const enabledDot = statusOpt.cfgvalue('0000_0b_00_0').children[0];
	assert.equal(enabledDot.attrs.title, 'Connected', 'enabled modem status must display Connected');
	assert.match(enabledDot.attrs.style, /background-color:\s*#00FF00;/, 'enabled modem status must display green');

	connectCalls.length = 0;
	dialCalls.length = 0;

	await api.updateAllStatusIndicators();
	await api.updateStatusIndicator('2_1');
	await api.updateAllDialControls();
	await api.updateDialControlsForSection('2_1');

	assert.deepEqual(connectCalls, ['0000_0b_00_0'], 'polling must never call getConnectStatus for disabled modems');
	assert.deepEqual(dialCalls, ['0000_0b_00_0'], 'polling must never call getDialStatus for disabled modems');

	const disabledContainer = document.getElementById('status-indicator-2_1');
	assert.ok(disabledContainer, 'disabled status indicator container should be rendered');
	assert.equal(disabledContainer.children[0].attrs.title, 'Disabled');
	assert.match(disabledContainer.children[0].attrs.style, /background-color:\s*#999;/);

	console.log('PASS: disabled modems keep static gray Disabled status without RPC polling');
})().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
