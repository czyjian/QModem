'use strict';

// Theme-native help markup. Layout belongs here; icon and typography belong
// to the active LuCI theme. Never create another icon or inject HTML strings.
function description(content, attributes) {
 var attrs=Object.assign({},attributes||{});
 attrs['class']='cbi-value-description'+(attrs['class']?' '+attrs['class']:'');
 var empty=content==null||content===''||(Array.isArray(content)&&content.length===0);
 return E('div',attrs,empty?[]:E('span',{'class':'qmodem-tip-text'},content));
}
function inlineDescription(content) {
 return description(content,{style:'margin-top:0;flex:1 1 260px;'});
}
function field(children,inline) {
 return E('div',{'class':'cbi-value',style:'display:block;margin:0;padding:0;'},[
  E('div',{'class':'cbi-value-field',style:'margin:0;width:100%;'+(inline?'display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;':'')},children)
 ]);
}
function helpField(control,content) {
 control.style.flexShrink='0';
 return field([control,inlineDescription(content)],true);
}
function note(content) {
 return E('div',{style:'margin-top:6px;'},field(inlineDescription(content),false));
}
function checkboxLine(checkbox,content) {
 checkbox.style.margin='0';checkbox.style.flexShrink='0';
 return E('label',{'for':checkbox.id,style:'display:inline-flex;align-items:center;gap:8px;margin:0;padding:0;'},[checkbox,E('span',{},content)]);
}
return L.Class.extend({description:description,inlineDescription:inlineDescription,field:field,helpField:helpField,note:note,checkboxLine:checkboxLine});
