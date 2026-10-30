'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../htdocs/luci-static/resources/qmodem');
const L = { Class: { extend: value => value } };
function load(name, deps = {}) {
	return new Function('L', ...Object.keys(deps), fs.readFileSync(path.join(root, name + '.js'), 'utf8'))(L, ...Object.values(deps));
}
const phone = load('phone', { phoneLib: load('phone-lib'), phoneMcc: load('phone-mcc') });
const smsNumber = load('sms-number');
const sends = [];
let region = '', imsi = '460110000000001';
let messages = [
	{ type: 'received', sender: '17607123407', timestamp: 1 },
	{ type: 'sent', recipient: '8617607123407', timestamp: 2 },
	{ type: 'sent', recipient: '+8617607123407', timestamp: 3 },
	{ type: 'received', sender: '10000', timestamp: 4 }
];
const rpc = { declare: spec => (...args) => {
	if (spec.method === 'config_get') return Promise.resolve({ default_country: region });
	if (spec.method === 'list') return Promise.resolve({ mode: 'database', messages });
	if (spec.method === 'send') { sends.push(args); return Promise.resolve({ status: 'success' }); }
	return Promise.resolve({});
} };
const qmodem = { getSimInfo: () => Promise.resolve({ modem_info: [{ key: 'IMSI', value: imsi }] }) };
const service = load('sms', { rpc, qmodem, phone, smsNumber, _: value => value });
async function main() {
	assert.strictEqual(await service.getNumberContext('modem_1'), 'CN');
	let result = await service.listSms('modem_1');
	assert.strictEqual(result.conversations.length, 2);
	assert.strictEqual((await service.getConversation('modem_1', '17607123407')).messages.length, 3);
	assert.strictEqual(service.resolveRecipient('17607123407', '', 'CN', true), '+8617607123407');
	assert.strictEqual(service.resolveRecipient('8617607123407', '', 'CN', true), '+8617607123407');
	assert.strictEqual(service.resolveRecipient('008617607123407', '', 'CN', true), '+8617607123407');
	assert.strictEqual(service.resolveRecipient('10000', '', 'CN', true), '10000');
	assert.strictEqual(service.resolveRecipient('10655810010', '', 'CN', true), '10655810010');
	assert.strictEqual(service.resolveRecipient('17607123407', '', 'CN', false), '17607123407');
	assert.strictEqual(service.resolveRecipient('7911123456', '44', 'CN', true), '+447911123456');
	assert.strictEqual(service.resolveRecipient('+447911123456', '86', 'CN', true), '+447911123456');
	const destination = service.resolveRecipient('17607123407', '', 'CN', true);
	await service.sendSms('modem_1', destination, 'test', null, '17607123407');
	assert.deepStrictEqual(sends[0], ['modem_1', destination, 'test', '17607123407', '']);
	region = 'GB';
	assert.strictEqual(await service.getNumberContext('modem_1'), 'GB');
	region = ''; imsi = '234150000000001';
	assert.strictEqual(await service.getNumberContext('modem_1'), 'GB', 'SIM changes are not cached');
	await service.sendSms('modem_1', '+447911123456', 'reply', null, '07911123456');
	assert.strictEqual(sends[1][3], '+447911123456', 'trunk prefix normalization does not request an invalid backend alias');
	messages = [
		{ type: 'received', sender: '7911123456', timestamp: 1 },
		{ type: 'sent', recipient: '+447911123456', conversation_contact: '7911123456', timestamp: 2 }
	];
	result = await service.listSms('modem_1');
	assert.strictEqual(result.conversations.length, 1, 'upstream explicit reply associations survive normalization');
	imsi = '460110000000001';
	function element(tag, attrs, children) {
		return { tag, attrs: attrs || {}, children: children || [], value: '', checked: !!(attrs && attrs.checked),
			listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
	}
	function descendants(node) {
		return [node].concat((Array.isArray(node.children) ? node.children : []).flatMap(child =>
			typeof child === 'object' ? descendants(child) : []));
	}
	const widget = load('sms-address', { smsNumber, smsService: service,
		ui: { addNotification() { assert.fail('unexpected widget notification'); } }, E: element, _: value => value });
	const field = widget.create(() => '17607123407', () => 'modem_1');
	await new Promise(resolve => setImmediate(resolve));
	const inputs = descendants(field.node).filter(node => node.tag === 'input');
	const code = inputs.find(node => node.attrs.type === 'text');
	const automatic = inputs.find(node => node.attrs.type === 'checkbox');
	assert.strictEqual(automatic.checked, true);
	assert.strictEqual(field.recipient(), '+8617607123407');
	code.value = ''; code.listeners.input();
	assert.strictEqual(automatic.checked, false, 'explicit clearing disables inference for this send');
	assert.strictEqual(field.recipient(), '17607123407');
	automatic.checked = true; automatic.listeners.change();
	assert.strictEqual(field.recipient(), '+8617607123407');
	console.log('PASS: upstream SMS addressing with automatic countries, merged conversations and exact send preview');
}
main().catch(error => { console.error(error); process.exit(1); });
