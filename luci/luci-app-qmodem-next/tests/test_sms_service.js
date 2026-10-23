'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/sms.js'), 'utf8');

function createService(listResults, syncResult, modemList, sections, storageResult) {
	let listCalls = 0;
	const rpc = {
		declare: function(spec) {
			return function() {
				if (spec.method === 'list')
					return Promise.resolve(listResults[listCalls++]);
				if (spec.method === 'sync')
					return Promise.resolve(syncResult);
				if (spec.method === 'modem_list')
					return Promise.resolve(modemList || {});
				if (spec.method === 'storage_get')
					return Promise.resolve(storageResult || {});
				return Promise.resolve({});
			};
		}
	};
	const qmodem = {
		getModemSections: function() { return Promise.resolve(sections || []); },
		formatModemName: function(name, alias, fallback) {
			return name ? String(name).toUpperCase() : fallback;
		}
	};
	const L = { Class: { extend: function(service) { return service; } } };
	const service = new Function('rpc', 'qmodem', 'L', '_', source)(rpc, qmodem, L, function(value) { return value; });
	return { service: service, listCalls: function() { return listCalls; } };
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
	console.log('PASS: SMS service propagates sync errors and renders refreshed messages');

	const labelled = createService([], null, { modems: [
		{ modem_id: '2_1', name: 'rw350r-gl', enabled: true },
		{ modem_id: '3_1', name: 'rm520n-gl', enabled: false }
	] }, [ { id: '2_1', name: 'Home (RW350R-GL)' } ]);
	const modems = await labelled.service.getModems();
	assert.deepStrictEqual(modems, [
		{ id: '2_1', name: 'Home (RW350R-GL)', enabled: true },
		{ id: '3_1', name: 'RM520N-GL', enabled: false }
	]);
	console.log('PASS: SMS modem list uses the shared modem labels');

	const stored = createService([], null, null, null, {
		configured: 'ME',
		status: 'success',
		response: 'AT+CPMS?\r\n\r\n+CPMS: "ME", 0, 50, "ME", 0, 50, "ME", 0, 50\r\n\r\nOK\r\n'
	});
	const storage = (await stored.service.getSmsStorage('2_1')).storage;
	assert.strictEqual(storage.mem1, 'ME');
	assert.strictEqual(storage.mem2, 'ME');
	assert.strictEqual(storage.mem3, 'ME');
	assert.deepStrictEqual(storage.ME, { used: 0, total: 50 });
	console.log('PASS: SMS storage parser accepts modem responses with spaces');
}

main().catch(function(error) {
	console.error(error);
	process.exit(1);
});
