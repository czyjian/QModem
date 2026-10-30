'use strict';
'require qmodem.neighbor-bands as bands';

function uint(value, maximum) {
	return /^\d+$/.test(String(value)) && Number(value) <= maximum;
}

return L.Class.extend({
	describe: function(rat, cell) {
		var nr = rat === 'NR';
		var prefix = nr ? 'n' : 'B';
		var rawBand = String(cell.band == null ? '' : cell.band).trim();
		var reported = rawBand.match(/^(?:n|B)?([1-9]\d*)$/i);
		var candidates = [];
		if (!reported && uint(cell.arfcn, nr ? 3279165 : 262143)) {
			(nr ? bands.nr : bands.lte).forEach(function(range) {
				if (Number(cell.arfcn) >= range[1] && Number(cell.arfcn) <= range[2])
					candidates.push(prefix + range[0]);
			});
		}
		var values = [];
		Object.keys(cell).forEach(function(key) {
			if (key === 'band') return;
			var value = cell[key];
			if (key === 'tac' || key === 'cellid') {
				var legacySentinel = String(cell.tac) === '268435455' && String(cell.cellid) === '268435455';
				if (value == null || value === '' || legacySentinel || /^(?:0x)?0*f{6,9}$/i.test(String(value)) ||
					(key === 'tac' && uint(value, Number.MAX_SAFE_INTEGER) && Number(value) > 16777215))
					value = _('Unknown');
			}
			if (value !== '' && value != null) values.push({ key: key, value: String(value) });
		});
		values.push({ key: 'band', value: reported ? prefix + reported[1] + ' (' + _('Reported by modem') + ')' :
			candidates.length ? candidates.join(' / ') + ' (' + _('Estimated from ARFCN; confirm before locking') + ')' : _('Unknown') });
		return {
			values: values,
			copyBand: reported ? reported[1] : '',
			canCopy: uint(cell.pci, nr ? 1007 : 503) && uint(cell.arfcn, nr ? 3279165 : 262143),
			needsBand: nr && !reported
		};
	}
});
