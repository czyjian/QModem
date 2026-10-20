'use strict';
'require rpc';
'require uci';

// Pre-declare all RPC methods
var callBaseInfo = rpc.declare({
	object: 'qmodem',
	method: 'base_info',
	params: ['config_section'],
	expect: { }
});

var callCellInfo = rpc.declare({
	object: 'qmodem',
	method: 'cell_info',
	params: ['config_section'],
	expect: { }
});

var callInfo = rpc.declare({
	object: 'qmodem',
	method: 'info',
	params: ['config_section'],
	expect: { }
});

var callNetworkInfo = rpc.declare({
	object: 'qmodem',
	method: 'network_info',
	params: ['config_section'],
	expect: { }
});

var callSimInfo = rpc.declare({
	object: 'qmodem',
	method: 'sim_info',
	params: ['config_section'],
	expect: { }
});

var callGetAtCfg = rpc.declare({
	object: 'qmodem',
	method: 'get_at_cfg',
	params: ['config_section'],
	expect: { }
});

var callGetImei = rpc.declare({
	object: 'qmodem',
	method: 'get_imei',
	params: ['config_section'],
	expect: { }
});

var callGetMode = rpc.declare({
	object: 'qmodem',
	method: 'get_mode',
	params: ['config_section'],
	expect: { }
});

var callGetLockband = rpc.declare({
	object: 'qmodem',
	method: 'get_lockband',
	params: ['config_section'],
	expect: { }
});

var callGetNeighborcell = rpc.declare({
	object: 'qmodem',
	method: 'get_neighborcell',
	params: ['config_section'],
	expect: { }
});

var callGetNetworkPrefer = rpc.declare({
	object: 'qmodem',
	method: 'get_network_prefer',
	params: ['config_section'],
	expect: { }
});

var callGetDns = rpc.declare({
	object: 'qmodem',
	method: 'get_dns',
	params: ['config_section'],
	expect: { }
});

var callGetSms = rpc.declare({
	object: 'qmodem',
	method: 'get_sms',
	params: ['config_section'],
	expect: { }
});

var callGetDisabledFeatures = rpc.declare({
	object: 'qmodem',
	method: 'get_disabled_features',
	params: ['config_section'],
	expect: { }
});

var callGetRebootCaps = rpc.declare({
	object: 'qmodem',
	method: 'get_reboot_caps',
	params: ['config_section'],
	expect: { }
});

var callGetCopyright = rpc.declare({
	object: 'qmodem',
	method: 'get_copyright',
	params: ['config_section'],
	expect: { }
});

var callSendAt = rpc.declare({
	object: 'qmodem',
	method: 'send_at',
	params: ['config_section', 'params'],
	expect: { }
});

var callSendSms = rpc.declare({
	object: 'qmodem',
	method: 'send_sms',
	params: ['config_section', 'params'],
	expect: { }
});

var callDeleteSms = rpc.declare({
	object: 'qmodem',
	method: 'delete_sms',
	params: ['config_section', 'index'],
	expect: { }
});

var callSetMode = rpc.declare({
	object: 'qmodem',
	method: 'set_mode',
	params: ['config_section', 'mode'],
	expect: { }
});

var callSetImei = rpc.declare({
	object: 'qmodem',
	method: 'set_imei',
	params: ['config_section', 'imei'],
	expect: { }
});

var callSetLockband = rpc.declare({
	object: 'qmodem',
	method: 'set_lockband',
	params: ['config_section', 'params'],
	expect: { }
});

var callSetNeighborcell = rpc.declare({
	object: 'qmodem',
	method: 'set_neighborcell',
	params: ['config_section', 'params'],
	expect: { }
});

var callSetNetworkPrefer = rpc.declare({
	object: 'qmodem',
	method: 'set_network_prefer',
	params: ['config_section', 'params'],
	expect: { }
});

var callDoReboot = rpc.declare({
	object: 'qmodem',
	method: 'do_reboot',
	params: ['config_section', 'params'],
	expect: { }
});

var callClearDialLog = rpc.declare({
	object: 'qmodem',
	method: 'clear_dial_log',
	params: ['config_section'],
	expect: { }
});

var callDialStatus = rpc.declare({
	object: 'qmodem',
	method: 'dial_status',
	params: ['config_section'],
	expect: { }
});

var callGetConnectStatus = rpc.declare({
	object: 'qmodem',
	method: 'get_connect_status',
	params: ['config_section'],
	expect: { }
});

var callGetDialLog = rpc.declare({
	object: 'qmodem',
	method: 'get_dial_log',
	params: ['config_section'],
	expect: { }
});

var callModemDial = rpc.declare({
	object: 'qmodem',
	method: 'modem_dial',
	params: ['config_section'],
	expect: { }
});

var callModemHang = rpc.declare({
	object: 'qmodem',
	method: 'modem_hang',
	params: ['config_section'],
	expect: { }
});

var callModemRedial = rpc.declare({
	object: 'qmodem',
	method: 'modem_redial',
	params: ['config_section'],
	expect: { }
});

var getRcStatus = rpc.declare({
	object: 'rc',
	method: 'list',
	params: ['name'],
	expect: { }
});

var callGetSimSwitchCapabilities = rpc.declare({
	object: 'qmodem',
	method: 'get_sim_switch_capabilities',
	params: ['config_section'],
	expect: { }
});

var callGetSimSlot = rpc.declare({
	object: 'qmodem',
	method: 'get_sim_slot',
	params: ['config_section'],
	expect: { }
});

var callSetSimSlot = rpc.declare({
	object: 'qmodem',
	method: 'set_sim_slot',
	params: ['config_section', 'slot'],
	expect: { }
});

// Model keys are stored lowercase (they index modem_support.json and vendor
// scripts), so upper-case them for display, matching the overview page.
function formatModemName(name, alias, fallback) {
	var model = name ? String(name).toUpperCase() : '';
	if (alias)
		return model ? alias + ' (' + model + ')' : alias;
	return model || fallback || '';
}

// Sub tabs of the SMS page. The first tab is the SMS view itself; the others
// are modules loaded on first use, so switching tabs never reloads the page.
var smsTabs = [
	{ name: 'chat', title: 'SMS Conversation' },
	{ name: 'forward', title: 'SMS Forwarder', module: 'qmodem.sms_forward' },
	{ name: 'sim', title: 'SIM Card SMS', module: 'qmodem.sms_sim' }
];

function loadSmsPanel(tab, panel) {
	return L.require(tab.module).then(function(mod) {
		return Promise.resolve(mod.load()).then(function(data) {
			return mod.render(data);
		});
	}).then(function(node) {
		panel.innerHTML = '';
		panel.appendChild(node);
	});
}

function renderSmsTabs(chatNode) {
	var menu = E('ul', { 'class': 'cbi-tabmenu', 'style': 'margin-bottom: 1em;' });
	var container = E('div', {}, [ menu ]);
	var panels = {};
	var loaded = { chat: true };

	var show = function(name) {
		if (!panels[name])
			name = 'chat';

		menu.querySelectorAll('li').forEach(function(li) {
			li.className = (li.getAttribute('data-tab') === name) ? 'cbi-tab' : 'cbi-tab-disabled';
		});

		for (var k in panels)
			panels[k].style.display = (k === name) ? '' : 'none';

		// Remember the tab in the URL so a reload stays on it
		history.replaceState(null, '', location.pathname + location.search + (name === 'chat' ? '' : '#' + name));

		if (loaded[name])
			return;

		loaded[name] = true;
		smsTabs.forEach(function(tab) {
			if (tab.name !== name)
				return;

			loadSmsPanel(tab, panels[name]).catch(function(e) {
				loaded[name] = false;
				panels[name].innerHTML = '';
				panels[name].appendChild(E('div', { 'class': 'alert-message error' },
					_('Error: %s').format(e.message)));
			});
		});
	};

	smsTabs.forEach(function(tab) {
		menu.appendChild(E('li', { 'class': 'cbi-tab-disabled', 'data-tab': tab.name },
			E('a', {
				'href': '#' + tab.name,
				'click': function(ev) {
					ev.preventDefault();
					show(tab.name);
				}
			}, _(tab.title))));

		panels[tab.name] = (tab.name === 'chat') ? E('div', {}, [ chatNode ])
			: E('div', {}, E('div', { 'class': 'spinning' }, _('Loading...')));
		container.appendChild(panels[tab.name]);
	});

	// Follow hand-edited URLs and back/forward; replaceState() does not fire this
	window.addEventListener('hashchange', function() {
		show(location.hash.replace(/^#/, ''));
	});

	show(location.hash.replace(/^#/, ''));
	return container;
}

return L.Class.extend({
	formatModemName: formatModemName,

	// Wrap the SMS view so its page holds the SMS sub tabs
	withSmsTabs: function(viewClass) {
		return viewClass.extend({
			render: function() {
				return Promise.resolve(this.super('render', arguments)).then(renderSmsTabs);
			}
		});
	},

	// Get modem base information
	getBaseInfo: function(section) {
		return callBaseInfo(section);
	},

	// Get modem cell information
	getCellInfo: function(section) {
		return callCellInfo(section);
	},

	// Get modem general information
	getInfo: function(section) {
		return callInfo(section);
	},

	// Get network information
	getNetworkInfo: function(section) {
		return callNetworkInfo(section);
	},

	// Get SIM information
	getSimInfo: function(section) {
		return callSimInfo(section);
	},

	// Get AT configuration
	getAtCfg: function(section) {
		return callGetAtCfg(section);
	},

	// Get IMEI
	getImei: function(section) {
		return callGetImei(section);
	},

	// Get current mode
	getMode: function(section) {
		return callGetMode(section);
	},

	// Get lock band configuration
	getLockBand: function(section) {
		return callGetLockband(section);
	},

	// Get neighbor cell info
	getNeighborCell: function(section) {
		return callGetNeighborcell(section);
	},

	// Get network preference
	getNetworkPrefer: function(section) {
		return callGetNetworkPrefer(section);
	},

	// Get DNS servers
	getDns: function(section) {
		return callGetDns(section);
	},

	// Get SMS messages
	getSms: function(section) {
		return callGetSms(section);
	},

	// Get disabled features
	getDisabledFeatures: function(section) {
		return callGetDisabledFeatures(section);
	},

	// Get reboot capabilities
	getRebootCaps: function(section) {
		return callGetRebootCaps(section);
	},

	// Get copyright information
	getCopyright: function(section) {
		return callGetCopyright(section);
	},

	// Send AT command
	sendAt: function(section, port, command, use_ubus) {
		var params = {
			port: port,
			at: command
		};
		
		if (use_ubus !== undefined && use_ubus !== null) {
			params.use_ubus = use_ubus;
		}
		
		return callSendAt(section, params);
	},

	// Send SMS
	sendSms: function(section, phoneNumber, content) {
		return callSendSms(section, {
			phone_number: phoneNumber,
			message_content: content
		});
	},

	// Delete SMS
	deleteSms: function(section, index) {
		return callDeleteSms(section, index);
	},

	// Set mode
	setMode: function(section, mode) {
		return callSetMode(section, mode);
	},

	// Set IMEI
	setImei: function(section, imei) {
		return callSetImei(section, imei);
	},

	// Set lock band
	setLockBand: function(section, params) {
		return callSetLockband(section, params);
	},

	// Set neighbor cell
	setNeighborCell: function(section, params) {
		return callSetNeighborcell(section, params);
	},

	// Set network preference
	setNetworkPrefer: function(section, params) {
		return callSetNetworkPrefer(section, params);
	},

	// Reboot modem
	doReboot: function(section, method) {
		return callDoReboot(section, {
			method: method || 'soft'
		});
	},

	// Clear dial log
	clearDialLog: function(section) {
		return callClearDialLog(section);
	},

	// Get dial status
	getDialStatus: function(section) {
		return callDialStatus(section);
	},

	// Get connection status
	getConnectStatus: function(section) {
		return callGetConnectStatus(section);
	},

	// Get dial log
	getDialLog: function(section) {
		return callGetDialLog(section);
	},

	// Dial modem
	modemDial: function(section) {
		return callModemDial(section);
	},

	// Hang modem
	modemHang: function(section) {
		return callModemHang(section);
	},

	// Redial modem
	modemRedial: function(section) {
		return callModemRedial(section);
	},

	// Get QModem network running status
	rcStatus: function(name) {
		return getRcStatus(name).then(function(data) {
			if (data && data[name]) {
				return data;
			}
			return false;
		});
	},

	// Get all modem sections
	getModemSections: function() {
		return uci.load('qmodem').then(function() {
			var sections = [];
			uci.sections('qmodem', 'modem-device', function(s) {
				sections.push({
					id: s['.name'],
					// 'name' is a display label; the raw (lowercase) model key stays in 'model'
					name: formatModemName(s.name, s.alias, s['.name']),
					model: s.name || '',
					alias: s.alias || '',
					enabled: s.enabled !== '0'
				});
			});
			return sections;
		});
	},

	// Format signal strength
	formatSignal: function(value, type) {
		if (!value || value === 'N/A') return 'N/A';
		
		var num = parseInt(value);
		if (isNaN(num)) return value;

		switch(type) {
			case 'rssi':
				if (num >= -70) return value + ' dBm (Excellent)';
				if (num >= -85) return value + ' dBm (Good)';
				if (num >= -100) return value + ' dBm (Fair)';
				return value + ' dBm (Poor)';
			case 'rsrp':
				if (num >= -80) return value + ' dBm (Excellent)';
				if (num >= -90) return value + ' dBm (Good)';
				if (num >= -100) return value + ' dBm (Fair)';
				return value + ' dBm (Poor)';
			case 'rsrq':
				if (num >= -10) return value + ' dB (Excellent)';
				if (num >= -15) return value + ' dB (Good)';
				if (num >= -20) return value + ' dB (Fair)';
				return value + ' dB (Poor)';
			case 'sinr':
				if (num >= 20) return value + ' dB (Excellent)';
				if (num >= 13) return value + ' dB (Good)';
				if (num >= 0) return value + ' dB (Fair)';
				return value + ' dB (Poor)';
			default:
				return value;
		}
	},

	// Get SIM switch support
	callGetSimSwitchCapabilities: function(section) {
		return callGetSimSwitchCapabilities(section);
	},

	// Get current SIM slot
	getSimSlot: function(section) {
		return callGetSimSlot(section);
	},

	// Set SIM slot
	setSimSlot: function(section, slot) {
		return callSetSimSlot(section, slot);
	}
});
