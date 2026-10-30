'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
class Node {
	constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attributes = Object.entries(attrs).map(([name, value]) => ({ name, value })); this.children = []; }
	get firstChild() { return this.children[0]; }
	get firstElementChild() { return this.firstChild; }
	appendChild(node) { if (node.parent) node.parent.removeChild(node); this.children.push(node); node.parent = this; }
	removeChild(node) { this.children.splice(this.children.indexOf(node), 1); node.parent = null; }
}
const bindings = [];
const extend = value => value;
const sections = new Function('L', 'form', 'dom', 'E', fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/qmodem/form-sections.js'), 'utf8'))(
	{ Class: { extend } }, { NamedSection: { extend }, GridSection: { extend } },
	{ bindClassInstance: (...args) => bindings.push(args) }, (tag, attrs) => new Node(tag, attrs));
for (const sectionType of [sections.NamedSection, sections.GridSection]) {
	const original = new Node('div', { id: 'cbi-qmodem-main', class: 'cbi-section', 'data-tab': 'main' });
	const heading = new Node('h3'), text = new Node('span'), input = new Node('input');
	heading.appendChild(text); original.appendChild(heading); original.appendChild(input);
	const instance = { super: () => original };
	const rendered = sectionType.renderContents.call(instance);
	assert.strictEqual(rendered.tagName, 'FIELDSET');
	assert.deepStrictEqual(rendered.attributes, original.attributes);
	assert.strictEqual(rendered.firstChild.tagName, 'LEGEND');
	assert.strictEqual(rendered.firstChild.firstChild, text);
	assert.strictEqual(rendered.children[1], input, 'keep original inputs and their event handlers');
	assert.deepStrictEqual(bindings.at(-1), [rendered, instance], 'preserve LuCI class instance lookup');
	const untitled = new Node('div'); untitled.appendChild(new Node('table'));
	assert.strictEqual(sectionType.renderContents.call({ super: () => untitled }), untitled);
}
const overview = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/overview.js'), 'utf8');
assert(overview.includes('title !== legend'), 'a legend panel title must not receive two collapse listeners');
console.log('PASS: native legend sections retain attributes, form controls, bindings and single collapse handlers');
