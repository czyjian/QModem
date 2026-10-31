'use strict';
'require network';
'require protocol.dhcpv6 as dhcpv6';

return network.registerProtocol('qmodem_rm500u6', {
	getI18n: dhcpv6.getI18n,
	getPackageName: dhcpv6.getPackageName,
	renderFormOptions: dhcpv6.renderFormOptions
});
