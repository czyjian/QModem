'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/sms.js'), 'utf8');
const L = { Class: { extend: function(service) { return service; } } };
function load(name, dependencies, names) {
	const text = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/qmodem/' + name + '.js'), 'utf8');
	return new Function('L', ...(names || []), text)(L, ...(dependencies || []));
}
const phone = load('phone', [load('phone-lib'), load('phone-mcc')], ['phoneLib', 'phoneMcc']);

function createService(listResults, syncResult, modemList, sections, storageResult, country) {
	let listCalls = 0;
	const sends = [];
	const rpc = {
		declare: function(spec) {
			return function() {
				if (spec.method === 'send') {
					sends.push(Array.from(arguments));
					return Promise.resolve({ status: 'success' });
				}
				if (spec.method === 'config_get') return Promise.resolve({ default_country: country || '' });
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
		getSimInfo: function() { return Promise.resolve({ modem_info: [{ key: 'IMSI', value: '460110000000001' }] }); },
		getModemSections: function() { return Promise.resolve(sections || []); },
		formatModemName: function(name, alias, fallback) {
			return name ? String(name).toUpperCase() : fallback;
		}
	};
	const service = new Function('rpc', 'qmodem', 'phone', 'L', '_', source)(rpc, qmodem, phone, L, function(value) { return value; });
	return { service: service, listCalls: function() { return listCalls; }, sends: sends };
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

	const variants = ['17607123407', '8617607123407', '+8617607123407', '008617607123407', '176 0712 3407'];
	for (const value of variants) {
		assert.strictEqual(phone.identify(value, 'CN').key, '+8617607123407', value);
		await stored.service.sendSms('2_1', value, 'test');
		assert.deepStrictEqual(stored.sends.at(-1), ['2_1', '8617607123407', 'test', true]);
	}
	for (const value of ['10000', '10086', '10659200', '106 5581 0010']) {
		await stored.service.sendSms('2_1', value, 'test');
		assert.deepStrictEqual(stored.sends.at(-1), ['2_1', value.replace(/ /g, ''), 'test', false]);
	}
	assert.strictEqual(phone.identify('BANK', 'CN').key, 'BANK');
	assert.strictEqual(phone.identify('__proto__', 'CN').key, '__proto__');
	assert.strictEqual(phone.identify('07911123456', 'GB').key, '+447911123456');
	assert.strictEqual(phone.identify('020 7946 0018', 'GB').key, '+442079460018');
	assert.strictEqual(phone.identify('06 698201', 'IT').key, '+3906698201');
	assert.strictEqual(phone.identify('+442079460018', 'CN').key, '+442079460018');
	assert.strictEqual(phone.identify('442079460018', 'CN').key, '+442079460018');
	assert.strictEqual(phone.identify('+8617607123407', 'GB').key, '+8617607123407');
	assert.strictEqual(phone.identify('17607123407').key, '17607123407');
	assert.strictEqual(phone.regionFromSim({modem_info: [{key: 'IMSI', value: '234150000000001'}]}), 'GB');
	assert.strictEqual(phone.regionFromSim({modem_info: [{key: 'IMSI', value: '901000000000001'}]}), undefined);
	const history = variants.map((sender, i) => ({ id: i + 1, sender: sender, type: 'received', timestamp: i + 1, is_read: i === 0 }));
	history.push({id: 6, recipient: '+8617607123407', type: 'sent', timestamp: 9});
	history.push({id: 7, sender: '10086', type: 'received', timestamp: 10});
	history.push({id: 8, sender: '__proto__', type: 'received', timestamp: 11});
	const historyBefore = JSON.stringify(history);
	const grouped = createService([{mode: 'direct', messages: history}]);
	const merged = await grouped.service.listSms('2_1');
	const thread = merged.conversations.find(item => item.contact === '+8617607123407');
	assert.strictEqual(merged.conversations.length, 3);
	assert.strictEqual(thread.messages.length, 6);
	assert.strictEqual(thread.unread_count, 4);
	assert.strictEqual(thread.last_timestamp, 9);
	assert.strictEqual(JSON.stringify(history), historyBefore, 'original numbers and message IDs are preserved');
	const linked = createService([{mode: 'direct', messages: history}]);
	assert.strictEqual((await linked.service.getConversation('2_1', '8617607123407')).messages.length, 6);
	const sim = createService([{mode: 'direct', msg: [{index: 42, sender: '17607123407', content: 'test'}]}]);
	const simMessage = (await sim.service.getSimSms('2_1')).messages[0];
	assert.strictEqual(simMessage.sender, '17607123407');
	assert.strictEqual(simMessage.index, 42);
	assert.strictEqual(simMessage.display_sender, '+86 176 0712 3407');
	const sentSim = createService([{mode: 'direct', messages: [{id: 9, type: 'sent', recipient: '8617607123407'}]}]);
	assert.strictEqual((await sentSim.service.getSimSms('2_1')).messages[0].display_sender, '+86 176 0712 3407');
	await assert.rejects(stored.service.sendSms('2_1', '+999123456789', 'test'), /destination country/);
	await assert.rejects(stored.service.sendSms('2_1', 'BANK', 'test'), /destination country/);
	const british = createService([], null, null, null, null, 'GB');
	await british.service.sendSms('3_1', '02079460018', 'test');
	assert.deepStrictEqual(british.sends[0], ['3_1', '442079460018', 'test', true]);
	console.log('PASS: country-aware conversation grouping, SIM display, service numbers and send destinations');
}

main().catch(function(error) {
	console.error(error);
	process.exit(1);
});
