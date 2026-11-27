'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function E(tag,attrs,children){return {tag,attrs:attrs||{},style:{},children:children==null?[]:Array.isArray(children)?children:[children]};}
const tips=new Function('L','E',fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/qmodem/tips.js'),'utf8'))({Class:{extend:x=>x}},E);
const message='长说明 '+ 'https://example.invalid/'.repeat(50);
const tip=tips.description(message);
assert.equal(tip.attrs.class,'cbi-value-description');assert.equal(tip.children[0].children[0],message);
const link=E('a',{href:'/help'},'帮助');assert.strictEqual(tips.description(link).children[0].children[0],link);
assert.equal(tips.description('').children.length,0);assert.equal(tips.description([]).children.length,0);
const attributes={id:'tip',class:'extra'};const custom=tips.description('text',attributes);
assert.equal(custom.attrs.class,'cbi-value-description extra');assert.equal(attributes.class,'extra');
const checkbox=E('input',{type:'checkbox'});checkbox.id='sms-setting';checkbox.checked=true;
const label=tips.checkboxLine(checkbox,'说明');assert.equal(label.attrs.for,'sms-setting');assert.strictEqual(label.children[0],checkbox);assert.equal(checkbox.checked,true);
const input=E('input');const field=tips.helpField(input,'text');
assert.equal(field.attrs.class,'cbi-value');assert.strictEqual(field.children[0].children[0],input);
assert.equal(field.children[0].children[1].attrs.class,'cbi-value-description');
console.log('PASS: shared tips preserve text, links, controls, empty state and native markup');
