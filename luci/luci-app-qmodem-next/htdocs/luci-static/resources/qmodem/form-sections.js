'use strict';
'require form';
'require dom';

// Reuse LuCI's section renderer and bindings, changing only the outer markup.
function renderFieldset(section, instance) {
	var heading = section.firstElementChild;
	if (section.tagName !== 'DIV' || !heading || !/^H[234]$/.test(heading.tagName))
		return section;
	var attributes = {};
	Array.from(section.attributes).forEach(function(attr) { attributes[attr.name] = attr.value; });
	var fieldset = E('fieldset', attributes);
	var legend = E('legend');
	while (heading.firstChild) legend.appendChild(heading.firstChild);
	section.removeChild(heading);
	fieldset.appendChild(legend);
	while (section.firstChild) fieldset.appendChild(section.firstChild);
	dom.bindClassInstance(fieldset, instance);
	return fieldset;
}

function renderContents() {
	return renderFieldset(this.super('renderContents', arguments), this);
}

return L.Class.extend({
	NamedSection: form.NamedSection.extend({ renderContents: renderContents }),
	GridSection: form.GridSection.extend({ renderContents: renderContents })
});
