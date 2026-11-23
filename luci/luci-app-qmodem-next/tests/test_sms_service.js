'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const L = { Class: { extend: function(service) { return service; } } };
function load(name, names = [], values = []) { return new Function('L', ...names, fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/qmodem/' + name + '.js'), 'utf8'))(L, ...values); }
const phone = load('phone', ['phoneLib', 'phoneMcc'], [load('phone-lib'), load('phone-mcc')]);
const qmodem = { getSimInfo: () => Promise.resolve({}), getModemSections: () => Promise.resolve([]), formatModemName: name => name };
const smsNumber = new Function('L', fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/sms-number.js'), 'utf8'))(L);

const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/sms.js'), 'utf8');

function createService(listResults, syncResult) {
	let listCalls = 0;
	const deleteCalls = [];
	const rpc = {
		declare: function(spec) {
			return function() {
				if (spec.method === 'delete') {
					deleteCalls.push(Array.from(arguments));
					return Promise.resolve({ status: 'success', deleted: 1 });
				}
				if (spec.method === 'list')
					return Promise.resolve(listResults[listCalls++]);
				if (spec.method === 'sync')
					return Promise.resolve(syncResult);
				return Promise.resolve({});
			};
		}
	};
	const L = { Class: { extend: function(service) { return service; } } };
	const service = new Function('rpc', 'L', 'smsNumber', 'qmodem', 'phone', '_', source)(rpc, L, smsNumber, qmodem, phone, function(value) { return value; });
	return { service: service, listCalls: function() { return listCalls; }, deleteCalls: deleteCalls };
}

async function main() {
	const failed = createService([
		{ mode: 'database_poll', messages: [] }
	], { status: 'error', error: 'database mode requires use_ubus' });

	await assert.rejects(failed.service.listSms('modem_1'),
		/database mode requires use_ubus/);
	assert.strictEqual(failed.listCalls(), 1,
		'a failed sync must not be rendered as a second empty list');

	const synced = createService([
		{ mode: 'database_poll', messages: [] },
		{ mode: 'database_poll', messages: [
			{ id: 1, type: 'received', sender: '10086', timestamp: 1, content: 'ok' }
		] }
	], { status: 'success', imported: 1 });
	const result = await synced.service.listSms('modem_1');

	assert.strictEqual(synced.listCalls(), 2);
	assert.strictEqual(result.total, 1);
	assert.strictEqual(result.conversations[0].contact, '10086');
	const db = createService([{ mode: 'database_poll', messages: [
		{ id: 42, type: 'received', sender: '10086', content: 'test', timestamp: 1795421352, received_at: 1795392446 },
		{ id: 43, type: 'sent', recipient: '10086', content: 'outgoing' },
		{ id: 44, direction: 'sent', recipient: '10086', content: 'outgoing' }
	] }]);
	const dbList = await db.service.getSimSms('2_3');
	assert.strictEqual(dbList.messages.length, 3, 'message list preserves both directions for separate sections');
	assert.deepStrictEqual(dbList.messages.map(m => m.type), ['received', 'sent', 'sent']);
	assert.deepStrictEqual(dbList.messages[0].delete_ref, { id: 42 });
	assert.strictEqual(dbList.messages[0].timestamp, 1795392446, 'use import time when SMSC time is ahead');
	assert.strictEqual(dbList.messages[0].timestamp_is_utc, true, 'do not apply legacy UTC adjustment to receipt time');
	assert.strictEqual((await db.service.deleteSimSms('2_3', dbList.messages[0].delete_ref)).success, true);
	assert.deepStrictEqual(db.deleteCalls, [['2_3', 42, undefined]]);
	const direct = createService([{ mode: 'direct', msg: [
		{ id: 999, index: 7, sender: '10086', content: 'test' }
	] }]);
	const simList = await direct.service.getSimSms('2_3');
	assert.deepStrictEqual(simList.messages[0].delete_ref, { index: 7 });
	await direct.service.deleteSimSms('2_3', simList.messages[0].delete_ref);
	assert.deepStrictEqual(direct.deleteCalls, [['2_3', undefined, 7]]);
	await assert.rejects(db.service.deleteSimSms('2_3', {}), /Invalid message index/);
	await assert.rejects(db.service.deleteSimSms('2_3', { id: 42, index: 7 }), /Invalid message index/);
	assert.strictEqual(db.deleteCalls.length, 1, 'invalid references must not send a deletion request');
	console.log('PASS: SMS service propagates sync errors and renders refreshed messages');
}

main().catch(function(error) {
	console.error(error);
	process.exit(1);
});
