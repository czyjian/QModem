'use strict';

// Match pdu_encode_ucs2_parts(): UTF-16 units, 8-bit concatenation reference,
// and no split between the two halves of a supplementary character.
function calculate(text) {
	var units = text.length, parts = 0, offset = 0;
	if (units && units <= 70) parts = 1;
	else while (offset < units) {
		var take = Math.min(67, units - offset);
		var last = text.charCodeAt(offset + take - 1);
		if (offset + take < units && last >= 0xd800 && last <= 0xdbff) take--;
		offset += take;
		parts++;
	}
	return { characters: Array.from(text).length, units: units, parts: parts, tooLong: parts > 16 };
}

return L.Class.extend({
	calculate: calculate,
	update: function(node, text) {
		// Both compose forms trim before sending.
		var info = calculate(text.trim());
		node.textContent = _('%s characters · %s SMS').format(info.characters, info.parts);
		if (info.tooLong) node.textContent += ' · ' + _('Maximum 16 SMS parts exceeded');
		node.title = _('Unicode SMS: 70 units for one message, 67 per part for multipart messages. Some emoji use two units.');
	}
});
