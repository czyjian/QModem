'use strict';
'require qmodem.phone-lib as phoneLib';
'require qmodem.phone-mcc as phoneMcc';

function parse(value, country) {
	try {
		var number = phoneLib.parsePhoneNumberFromString(value, { defaultCountry: country, extract: false });
		return number && number.isValid() ? number : null;
	} catch (e) { return null; }
}

return L.Class.extend({
	countries: function() { return phoneLib.getCountries(); },
	countryCallingCode: function(country) { return phoneLib.getCountryCallingCode(country); },
	regionFromSim: function(result) {
		var imsi = (result && result.modem_info || []).filter(function(entry) { return entry.key === 'IMSI'; })[0];
		var value = imsi ? String(imsi.value).trim() : '';
		return /^\d{14,15}$/.test(value) ? phoneMcc.countries[value.slice(0, 3)] : undefined;
	},
	identify: function(raw, country) {
		raw = raw == null ? '' : String(raw).trim();
		var value = raw.replace(/[\s().-]/g, '');
		var unchanged = { key: raw, display: raw, recipient: value, international: false };
		if (!/^\+?\d+$/.test(value)) return unchanged;
		var explicit = value[0] === '+';
		// Service numbers are local identities, even when they contain many digits.
		if (!explicit && (value.length <= 6 || (country === 'CN' && /^10\d+$/.test(value)))) {
			unchanged.key = unchanged.display = value;
			return unchanged;
		}
		var national = country ? parse(value, country) : null;
		var international = parse(explicit ? value : '+' + value);
		var number;
		if (explicit) number = international;
		// A valid national number belongs to the selected region. In particular,
		// Chinese mobiles beginning with 1 must not be guessed as North American.
		else if (national) number = national;
		// Accept a bare country code only if it is not also a valid local number.
		else if (country && international)
			number = international;
		if (!number) return unchanged;
		return { key: number.number, display: number.formatInternational(),
			recipient: number.number.slice(1), international: true };
	}
});
