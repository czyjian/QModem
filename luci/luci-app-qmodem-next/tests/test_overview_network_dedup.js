'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = [];
		this.parentNode = null;
		this.style = {};
		this.textContent = '';
		this._classSet = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
		this.classList = {
			add: cls => this._classSet.add(cls),
			remove: cls => this._classSet.delete(cls),
			contains: cls => this._classSet.has(cls),
			toggle: cls => (this._classSet.has(cls) ? this._classSet.delete(cls) : this._classSet.add(cls))
		};
		if (Array.isArray(children)) {
			children.forEach(c => this.appendChild(c));
		} else if (typeof children === 'string') {
			this.textContent = children;
		}
	}
	appendChild(child) {
		if (child instanceof Element) {
			if (child.parentNode && child.parentNode !== this)
				child.parentNode.removeChild(child);
			child.parentNode = this;
		}
		this.children.push(child);
		return child;
	}
	removeChild(child) {
		const idx = this.children.indexOf(child);
		if (idx !== -1) {
			this.children.splice(idx, 1);
			if (child instanceof Element)
				child.parentNode = null;
		}
	}
	setAttribute(name, value) {
		this.attrs[name] = value;
	}
	getAttribute(name) {
		return this.attrs[name] || null;
	}
	addEventListener() {}
	querySelector(selector) {
		for (const child of this.children) {
			if (!(child instanceof Element))
				continue;
			if (selector.startsWith('.')) {
				if (child.classList.contains(selector.slice(1)))
					return child;
			} else if (child.tag === selector) {
				return child;
			}
			const found = child.querySelector(selector);
			if (found)
				return found;
		}
		return null;
	}
	querySelectorAll() {
		return [];
	}
}

const E = (tag, attrs, children) => new Element(tag, attrs, children);
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/overview.js'), 'utf8');

function createHarness(networkEntries, cellEntries) {
	const domErrors = [];
	const localStorage = { getItem: () => null, setItem: () => {} };
	const qmodem = {
		displayValue: (key, value) => value,
		getBaseInfo: async () => ({ modem_info: [] }),
		getSimInfo: async () => ({ modem_info: [] }),
		getNetworkInfo: async () => ({ modem_info: networkEntries }),
		getCellInfo: async () => ({ modem_info: cellEntries }),
		getCopyright: async () => ({})
	};
	const view = new Function(
		'view', 'poll', 'ui', 'dom', 'uci', 'qmodem', 'L', 'E', 'document', 'localStorage', '_',
		source
	)(
		{ extend: obj => obj },
		{ add: () => {} },
		{},
		{ content: (_el, node) => { domErrors.push(node.textContent || 'error'); } },
		{ load: async () => {}, get: () => null },
		qmodem,
		{ resource: s => s, env: {} },
		E,
		{ head: E('head'), styleSheets: [] },
		localStorage,
		s => s
	);
	return { view, domErrors };
}

function getNetworkRows(tablesMap) {
	const table = tablesMap['Network Information'];
	assert.ok(table, 'Network Information section must be rendered');
	return table.rows
		.filter(r => r.row.style.display !== 'none')
		.map(r => ({ label: r.left.textContent, value: r.right.textContent }));
}

(async () => {
	// Case 1: Network Mode present -> omit redundant Network Type, keep Network Mode and rates.
	{
		const { view, domErrors } = createHarness(
			[
				{ key: 'Network Type', value: 'NR', full_name: 'Network Type', type: 'plain_text', class: 'Network Information' },
				{ key: 'Rx Rate', value: '10 bps', full_name: 'Receive Rate', type: 'plain_text', class: 'Network Information' }
			],
			[
				{ key: 'network_mode', value: 'NR5G-SA Mode with 2 CA', full_name: 'Network Mode', type: 'plain_text', class: 'Cell Information' },
				{ key: 'Band', value: '78', full_name: 'Band', type: 'plain_text', class: 'Cell Information' }
			]
		);
		const tablesMap = {};
		const infoContainer = E('div');
		const loadingEl = E('div');
		view.updateModemInfo('0000_0b_00_0', tablesMap, infoContainer, null, null, loadingEl, null);
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(domErrors, []);
		const rows = getNetworkRows(tablesMap);
		assert.equal(rows.some(r => r.label === 'Network Type'), false, 'Network Type should be hidden when Network Mode is present');
		assert.deepEqual(
			rows.find(r => r.label === 'Network Mode'),
			{ label: 'Network Mode', value: 'NR5G-SA Mode with 2 CA' }
		);
		assert.deepEqual(
			rows.find(r => r.label === 'Receive Rate'),
			{ label: 'Receive Rate', value: '10 bps' }
		);
	}

	// Case 2: No Network Mode (or empty value) -> keep Network Type as fallback.
	for (const cellEntries of [[], [{ key: 'network_mode', value: '   ', full_name: 'Network Mode', type: 'plain_text', class: 'Cell Information' }]]) {
		const { view, domErrors } = createHarness(
			[{ key: 'Network Type', value: 'NR', full_name: 'Network Type', type: 'plain_text', class: 'Network Information' }],
			cellEntries
		);
		const tablesMap = {};
		const infoContainer = E('div');
		const loadingEl = E('div');
		view.updateModemInfo('0000_0b_00_0', tablesMap, infoContainer, null, null, loadingEl, null);
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(domErrors, []);
		const rows = getNetworkRows(tablesMap);
		assert.deepEqual(
			rows.find(r => r.label === 'Network Type'),
			{ label: 'Network Type', value: 'NR' },
			'Network Type must remain as fallback when Network Mode is missing or blank'
		);
	}

	console.log('PASS: overview deduplicates Network Type when Network Mode is present and keeps fallback otherwise');
})().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
