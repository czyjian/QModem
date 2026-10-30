'use strict';
'require qmodem.sms-number as smsNumber';
'require qmodem.sms as smsService';
'require ui';

return L.Class.extend({
	create: function(getNumber, getModem) {
		var pending = false, sequence = 0, country;
		var automatic = E('input', { 'type': 'checkbox', 'checked': 'checked' });
		var code = E('input', { 'type': 'text', 'class': 'cbi-input-text',
			'placeholder': _('As entered'), 'maxlength': '4', 'aria-label': _('Country calling code (optional)') });
		var preview = E('span');
		var save = E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-neutral' }, _('Save for this modem'));
		var field = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Country calling code (optional)')),
			E('div', { 'class': 'cbi-value-field' }, [ E('div', { 'class': 'qmodem-sms-address' }, [
				E('div', { 'class': 'qmodem-sms-address-controls' }, [ code, save ]),
				E('div', { 'class': 'qmodem-sms-address-status' }, [
					E('label', { 'class': 'qmodem-sms-address-auto' }, [ automatic, _('Automatically identify country from SIM') ]),
					E('div', { 'class': 'qmodem-sms-address-preview' }, [ E('span', { 'class': 'qmodem-sms-address-caption' }, _('Send to:')), preview ]) ]),
				E('details', { 'class': 'qmodem-sms-address-help' }, [
					E('summary', {}, _('About number recognition')),
					E('p', {}, _('Automatic identification uses the selected default country or SIM. Enter a country code to override it, or disable automatic identification to send as entered. The preview shows the actual destination.')) ]) ]) ])
		]);
		function recipient() {
			if (pending) throw new Error('Loading country calling code');
			return smsService.resolveRecipient(getNumber(), code.value, country, automatic.checked);
		}
		function update() {
			try { preview.textContent = recipient(); }
			catch (e) { preview.textContent = getNumber() ? _(e.message) : '—'; }
		}
		code.addEventListener('input', function() { automatic.checked = false; update(); });
		automatic.addEventListener('change', update);
		save.addEventListener('click', function() {
			var selectedModem = getModem(), normalized;
			try { normalized = smsNumber.normalizeCode(code.value); }
			catch (err) { ui.addNotification(null, E('p', _(err.message)), 'error'); return; }
			save.disabled = true;
			smsService.setCountryCode(selectedModem, normalized).then(function() {
				ui.addNotification(null, E('p', _('Configuration saved')), 'info');
			}).catch(function(err) { ui.addNotification(null, E('p', err.message), 'error'); })
				.finally(function() { if (!pending) save.disabled = false; });
		});
		function load() {
			var current = ++sequence;
			pending = true; code.disabled = true; save.disabled = true; code.value = ''; country = undefined; automatic.checked = false; update();
			return Promise.all([smsService.getCountryCode(getModem()), smsService.getNumberContext(getModem())]).then(function(values) {
				var value = values[0];
				if (current !== sequence) return;
				country = values[1];
				value = smsNumber.normalizeCode(value);
				automatic.checked = !value;
				code.value = value ? '+' + value : '';
				pending = false; code.disabled = false; save.disabled = false; update();
			}).catch(function(err) {
				if (current !== sequence) return;
				pending = false; code.disabled = false; save.disabled = false;
				ui.addNotification(null, E('p', _('Failed to load country calling code') + ': ' + err.message), 'error');
				update();
			});
		}
		load();
		return { node: field, recipient: recipient, update: update,
			load: load };
	}
});
