'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// LuCI require resolves a protocol module to an instance, not its constructor.
const native = {
	getI18n() { return 'DHCPv6 客户端'; },
	getPackageName() { return 'odhcp6c'; },
	renderFormOptions(section) { section.nativeOptions = true; }
};
let registered;
const network = {
	registerProtocol(name, methods) { registered = { name, methods }; return methods; }
};
const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/protocol/qmodem_rm500u6.js'), 'utf8');
const protocol = new Function('network', 'dhcpv6', source)(network, native);
assert.strictEqual(registered.name, 'qmodem_rm500u6');
assert.strictEqual(protocol.getI18n(), 'DHCPv6 客户端');
assert.strictEqual(protocol.getPackageName(), 'odhcp6c');
const section = {};
protocol.renderFormOptions(section);
assert.strictEqual(section.nativeOptions, true);
console.log('PASS: RM500U protocol uses the native LuCI DHCPv6 module instance');
