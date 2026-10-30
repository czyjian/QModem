'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const counter = new Function('L', fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/sms-counter.js'), 'utf8'))({ Class: { extend: value => value } });
for (const [length, parts] of [[0, 0], [1, 1], [70, 1], [71, 2], [80, 2], [134, 2], [135, 3], [1072, 16], [1073, 17]]) {
	for (const char of ['a', '中']) assert.strictEqual(counter.calculate(char.repeat(length)).parts, parts);
}
assert.strictEqual(counter.calculate('😀'.repeat(35)).parts, 1);
assert.strictEqual(counter.calculate('😀'.repeat(36)).parts, 2);
assert.strictEqual(counter.calculate('😀'.repeat(67)).parts, 3, 'surrogate pair boundaries must match the encoder');
assert.deepStrictEqual(counter.calculate('😀'), { characters: 1, units: 2, parts: 1, tooLong: false });
assert.strictEqual(counter.calculate('a'.repeat(1073)).tooLong, true);
const views = path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem');
for (const name of ['sms.js', 'sms_conversation.js']) {
	const source = fs.readFileSync(path.join(views, name), 'utf8');
	assert(source.includes('smsCounter.update(counter,'), name + ' must use the shared counter');
	assert(!source.includes('0/160'));
	assert(!source.includes("'value': '7bit'"), 'backend currently sends Unicode only');
}
console.log('PASS: Unicode SMS counts, 70/67 boundaries, emoji segmentation and both compose forms');
