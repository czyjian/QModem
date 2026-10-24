'use strict';
'require rpc';
'require qmodem.qmodem as qmodem';
'require qmodem.phone as phone';

var callList = rpc.declare({ object: 'qmodem.sms', method: 'list', params: [ 'modem_id', 'limit', 'offset' ], expect: { } });
var callSync = rpc.declare({ object: 'qmodem.sms', method: 'sync', params: [ 'modem_id' ], expect: { } });
var callSend = rpc.declare({ object: 'qmodem.sms', method: 'send', params: [ 'modem_id', 'recipient', 'content', 'international' ], expect: { } });
var callDelete = rpc.declare({ object: 'qmodem.sms', method: 'delete', params: [ 'modem_id', 'id', 'index' ], expect: { } });
var callMarkRead = rpc.declare({ object: 'qmodem.sms', method: 'mark_read', params: [ 'modem_id', 'id' ], expect: { } });
var callStorageGet = rpc.declare({ object: 'qmodem.sms', method: 'storage_get', params: [ 'modem_id' ], expect: { } });
var callStorageSet = rpc.declare({ object: 'qmodem.sms', method: 'storage_set', params: [ 'modem_id', 'mem1', 'mem2', 'mem3' ], expect: { } });
var callConfigure = rpc.declare({ object: 'qmodem.sms', method: 'configure', params: [ 'modem_id', 'mode', 'poll_interval', 'forwarding', 'auto_delete', 'default_country' ], expect: { } });
var callModemList = rpc.declare({ object: 'qmodem.sms', method: 'modem_list', expect: { } });
var callConfigGet = rpc.declare({ object: 'qmodem.sms', method: 'config_get', params: [ 'modem_id' ], expect: { } });

function messagesFrom(result) {
	return (result.messages || result.msg || result.received || []).map(function(message) {
		message = Object.assign({}, message);
		if (!message.type) message.type = 'received';
		if (message.is_read == null) message.is_read = false;
		if (message.success != null && message.is_success == null) message.is_success = message.success;
		return message;
	});
}

function conversations(messages, country) {
	var grouped = Object.create(null);
	messages.forEach(function(message) {
		var contact = phone.identify(message.type === 'received' ? message.sender : message.recipient, country).key;
		if (!grouped[contact]) grouped[contact] = { contact: contact, messages: [], last_timestamp: 0, unread_count: 0 };
		grouped[contact].messages.push(message);
		grouped[contact].last_timestamp = Math.max(grouped[contact].last_timestamp, message.timestamp || 0);
		if (message.type === 'received' && !message.is_read) grouped[contact].unread_count++;
	});
	return Object.keys(grouped).map(function(key) { return grouped[key]; })
		.sort(function(a, b) { return b.last_timestamp - a.last_timestamp; });
}

function listRaw(modem) {
	return callList(modem, 500, 0).then(function(result) {
		if (result.status === 'error') return Promise.reject(new Error(result.error || 'SMS backend error'));
		return result;
	});
}

function syncRaw(modem) {
	return callSync(modem).then(function(result) {
		if (result.status === 'error') return Promise.reject(new Error(result.error || 'SMS synchronization failed'));
		return result;
	});
}

function deleteMany(modem, ids) {
	ids = Array.isArray(ids) ? ids : [ ids ];
	return Promise.all(ids.map(function(id) { return callDelete(modem, id, id); })).then(function(results) {
		return { success: results.every(function(result) { return result.status === 'success'; }), deleted: results.length };
	});
}

function parseStorage(result) {
	var storage = { mem1: result.configured || 'SM', mem2: 'SM', mem3: 'SM', ME: { used: 0, total: 0 }, SM: { used: 0, total: 0 } };
	var match = (result.response || '').match(/\+CPMS:\s*"?([^",]+)"?\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"?([^",]+)"?\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*"?([^",]+)"?\s*,\s*(\d+)\s*,\s*(\d+))?/);
	if (!match) return storage;
	storage.mem1 = match[1]; storage.mem2 = match[4]; storage.mem3 = match[7] || match[4];
	[ [ match[1], match[2], match[3] ], [ match[4], match[5], match[6] ], [ match[7], match[8], match[9] ] ].forEach(function(values) {
		if (values[0] === 'SM' || values[0] === 'ME') storage[values[0]] = { used: +values[1] || 0, total: +values[2] || 0 };
	});
	return storage;
}

return L.Class.extend({
	getCountries: function() { return phone.countries(); },
	getCountryCallingCode: function(country) { return phone.countryCallingCode(country); },
	getNumberContext: function(modem) {
		// Re-read the SIM identity rather than caching a country across a SIM swap.
		return callConfigGet(modem).then(function(config) {
			if (config.default_country) return config.default_country;
			return qmodem.getSimInfo(modem).then(function(result) { return phone.regionFromSim(result); }, function() { return undefined; });
		});
	},
	getModems: function() {
		// Label modems like the other qmodem pages (upper-case model, alias)
		return Promise.all([ callModemList(), qmodem.getModemSections() ]).then(function(results) {
			var labels = {};
			(results[1] || []).forEach(function(section) {
				labels[section.id] = section.name;
			});
			return (results[0].modems || []).map(function(modem) {
				return {
					id: modem.modem_id,
					name: labels[modem.modem_id] || qmodem.formatModemName(modem.name, '', modem.modem_id),
					enabled: !!modem.enabled
				};
			});
		});
	},
	getConfig: function(configSection) { return callConfigGet(configSection || 'modem_1'); },
	configure: function(configSection, mode, pollInterval, forwarding, autoDelete, defaultCountry) {
		var modem = configSection || 'modem_1';
		return callConfigGet(modem).then(function(current) {
			return callConfigure(modem, mode, pollInterval,
				forwarding == null ? !!current.forwarding : forwarding, autoDelete, defaultCountry);
		}).then(function(result) {
			if (result.status === 'error') return Promise.reject(new Error(result.error || 'SMS configuration failed'));
			return result;
		});
	},
	listSms: function(configSection) {
		var modem = configSection || 'modem_1';
		var self = this;
		return Promise.all([self.getNumberContext(modem), listRaw(modem).then(function(first) {
			var refresh = first.mode === 'database_poll' ? syncRaw(modem) : Promise.resolve();
			return refresh.then(function() { return first.mode === 'database_poll' ? listRaw(modem) : first; });
		})]).then(function(results) {
			var country = results[0], result = results[1];
			var messages = messagesFrom(result);
			return { conversations: conversations(messages, country), total: messages.length, mode: result.mode, country: country };
		});
	},
	getConversation: function(configSection, contact) {
		return this.listSms(configSection).then(function(result) {
			var key = phone.identify(contact, result.country).key;
			var found = result.conversations.filter(function(item) { return item.contact === key; })[0];
			return { messages: found ? found.messages : [] };
		});
	},
	sync: function(configSection) { return syncRaw(configSection || 'modem_1'); },
	sendSms: function(configSection, recipient, message) {
		var modem = configSection || 'modem_1';
		return this.getNumberContext(modem).then(function(country) {
			var number = phone.identify(recipient, country);
			if (!/^\d{1,20}$/.test(number.recipient) ||
				(!number.international && (String(recipient).trim()[0] === '+' || number.recipient.length > 6 && !(country === 'CN' && /^10\d+$/.test(number.recipient)))))
				throw new Error(_('Cannot determine the destination country. Select a default country or enter a valid number with +country code.'));
			return callSend(modem, number.recipient, message, number.international);
		}).then(function(result) { result.success = result.status === 'success'; return result; });
	},
	deleteSms: function(configSection, type, ids) { return deleteMany(configSection || 'modem_1', ids); },
	markRead: function(configSection, ids) {
		var modem = configSection || 'modem_1'; ids = Array.isArray(ids) ? ids : [ ids ];
		return Promise.all(ids.map(function(id) { return callMarkRead(modem, id); })).then(function() { return { success: true, marked: ids.length }; });
	},
	getSentHistory: function(configSection) {
		return listRaw(configSection || 'modem_1').then(function(result) { return { messages: messagesFrom(result).filter(function(message) { return message.type === 'sent'; }) }; });
	},
	getReceivedHistory: function(configSection) {
		return listRaw(configSection || 'modem_1').then(function(result) { return { messages: messagesFrom(result).filter(function(message) { return message.type === 'received'; }) }; });
	},
	clearSentHistory: function(configSection) {
		var modem = configSection || 'modem_1';
		return this.getSentHistory(modem).then(function(result) { return deleteMany(modem, result.messages.map(function(message) { return message.id; })); });
	},
	clearReceivedHistory: function(configSection) {
		var modem = configSection || 'modem_1';
		return this.getReceivedHistory(modem).then(function(result) { return deleteMany(modem, result.messages.map(function(message) { return message.id; })); });
	},
	formatTimestamp: function(timestamp) {
		var date = new Date(timestamp * 1000), now = new Date(), days = Math.floor((now - date) / 86400000);
		if (days === 0) return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
		if (days === 1) return _('Yesterday');
		if (days < 7) return [ _('Sunday'), _('Monday'), _('Tuesday'), _('Wednesday'), _('Thursday'), _('Friday'), _('Saturday') ][date.getDay()];
		return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
	},
	formatPhoneNumber: function(number) {
		if (!number) return '';
		if (String(number)[0] === '+') return phone.identify(number).display;
		var digits = number.replace(/\D/g, '');
		return digits.length === 11 && digits.startsWith('1') ? digits.substring(0, 3) + ' ' + digits.substring(3, 7) + ' ' + digits.substring(7) : number;
	},
	truncateMessage: function(content, maximum) {
		maximum = maximum || 50; return !content || content.length <= maximum ? (content || '') : content.substring(0, maximum) + '...';
	},
	getSmsStorage: function(configSection) {
		return callStorageGet(configSection || 'modem_1').then(function(result) { return result.status === 'error' ? { error: result.error } : { storage: parseStorage(result) }; });
	},
	setSmsStorage: function(configSection, mem1, mem2, mem3) {
		return callStorageSet(configSection || 'modem_1', mem1, mem2, mem3 || mem2).then(function(result) { result.success = result.status !== 'error'; return result; });
	},
	getSimSms: function(configSection) {
		var modem = configSection || 'modem_1';
		return Promise.all([this.getNumberContext(modem), listRaw(modem)]).then(function(results) {
			var result = results[1];
			return { messages: (result.msg || result.received || result.messages || []).map(function(message) {
				var contact = message.type === 'sent' ? message.recipient : message.sender;
				return Object.assign({}, message, { display_sender: phone.identify(contact, results[0]).display });
			}) };
		});
	},
	deleteSimSms: function(configSection, index) {
		return callDelete(configSection || 'modem_1', index, index).then(function(result) { result.success = result.status === 'success'; return result; });
	}
});
