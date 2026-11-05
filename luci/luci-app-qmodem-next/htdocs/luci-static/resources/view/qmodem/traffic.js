'use strict';
'require view';
'require uci';
'require poll';
'require ui';
'require dom';
'require qmodem.traffic as traffic';
'require qmodem.qmodem as qmodem';

document.head.appendChild(E('link', {
	'rel':'stylesheet',
	'href':L.resource('qmodem/qmodem-next.css') + (L.env.resource_version ? '?v='+L.env.resource_version+'&' : '?') + 'layout=traffic-chart-3'
}));

return view.extend({
	load: function() { return uci.load('qmodem'); },
	render: function() {
		// Refresh the navigation on the next load after installing the new page.
		ui.menu.flushCache();
		var modems = uci.sections('qmodem', 'modem-device');
		if (!modems.length) return E('p', {}, _('No modems configured.'));
		var selector = E('select', {'class':'cbi-input-select',id:'modem_selector'}, modems.map(function(m) { return E('option', {value:m['.name']},qmodem.formatModemName(m.name,m.alias,m['.name'])); }));
		var summary = E('div'), live = E('div'), daily = E('div'), monthly = E('div'), state = {}, selected = '', pending = false, chartUpdated = 0;
		var month = E('select', {'class':'cbi-input-select'});
		for (var i=0; i<14; i++) {
			var d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
			var key = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
			month.appendChild(E('option',{value:key},key.replace('-','/')));
		}
		function histories() {
			var days = new Date(Number(month.value.slice(0,4)),Number(month.value.slice(5)),0).getDate(), points=[];
			for(var day=1; day<=days; day++) {
				var key=month.value+'-'+String(day).padStart(2,'0'), value=(state.daily || {})[key] || {};
				points.push({label:String(day),rx:value.rx || 0,tx:value.tx || 0});
			}
			dom.content(daily,traffic.chart(points,false));
			dom.content(monthly,traffic.chart(Object.keys(state.monthly || {}).sort().map(function(key){ return {label:key.replace('-','/'),rx:state.monthly[key].rx,tx:state.monthly[key].tx}; }),false));
			dom.content(live,traffic.chart((state.live || []).map(function(p){ return {label:new Date(p.time*1000).toLocaleTimeString(),rx:p.rx,tx:p.tx}; }),true));
		}
		var enabled=E('input',{type:'checkbox'}), day=E('input',{type:'number',min:1,max:31,'class':'cbi-input-text'}), time=E('input',{type:'time','class':'cbi-input-text'}), threshold=E('input',{type:'number',min:0,max:1000000,step:0.001,'class':'cbi-input-text'});
		var correction=E('input',{type:'number',min:0,max:1000000,step:0.001,'class':'cbi-input-text',placeholder:_('Current usage reported by your carrier')});
		var fieldId=0;
		function row(label,control,table) {
			var id='traffic-field-'+(++fieldId); control.id=id;
			if(table) return E('tr',{'class':'tr'},[E('td',{'class':'td left',width:'33%'},E('label',{'for':label ? id : null},label)),E('td',{'class':'td'},control)]);
			return E('div',{'class':'cbi-value'},[E('label',{'class':'cbi-value-title','for':label ? id : null},label),E('div',{'class':'cbi-value-field'},control)]);
		}
		function section(label,children) { return E('fieldset',{'class':'cbi-section'},[E('legend',{},label)].concat(children)); }
		function update() {
			if(pending) return Promise.resolve();
			pending=true;
			var id=selector.value;
			return traffic.get(id).then(function(s){
				if (selector.value !== id) return;
				if (s.error) throw new Error(s.error);
				state=s;
				dom.content(summary,traffic.summary(s));
				if(selected !== id || (s.now || 0) - chartUpdated >= 10) { histories(); chartUpdated=s.now || 0; }
				if(selected !== id) {
					correction.value='';
					var cfg=s.config; enabled.checked=cfg.enabled; day.value=cfg.reset_day;
					time.value=String(cfg.reset_hour).padStart(2,'0')+':'+String(cfg.reset_minute).padStart(2,'0'); threshold.value=cfg.threshold_gb; selected=id;
				}
			}).catch(function(e){ dom.content(summary,E('p',{'class':'alert-message error'},e.message)); }).finally(function(){ pending=false; });
		}
		var save=E('button',{'class':'cbi-button cbi-button-apply',click:function(){
			if(!day.checkValidity() || !time.checkValidity() || !threshold.checkValidity() || !day.value || !time.value || !threshold.value) { ui.addNotification(null,E('p',{},_('Enter valid traffic settings.')),'error'); return; }
			var parts=time.value.split(':'); save.disabled=true;
			traffic.configure(selector.value,enabled.checked,Number(day.value),Number(parts[0]),Number(parts[1]),threshold.value).then(function(result){
				if(!result.success) throw new Error(result.error || _('Failed to save traffic settings.'));
				selected=''; return update();
			}).catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){save.disabled=false;});
		}},_('Save'));
		function correctUsage(clear) {
			if(!clear && (!correction.value || !correction.checkValidity() || !state.cycle)) {
				ui.addNotification(null,E('p',{},_('Enter valid current-cycle usage.')),'error'); return;
			}
			correctButton.disabled=true; clearButton.disabled=true;
			var request=clear ? traffic.clearCorrection(selector.value) : traffic.correct(selector.value,correction.value,state.cycle);
			request.then(function(result){
				if(!result.success) throw new Error(result.error || _('Failed to correct cycle usage.'));
				correction.value='';
				ui.addNotification(null,E('p',{},_('Cycle usage updated.')),'success');
				return update();
			}).catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){correctButton.disabled=false;clearButton.disabled=false;});
		}
		var correctButton=E('button',{'class':'cbi-button cbi-button-apply',click:function(){correctUsage(false);}},_('Correct cycle usage'));
		var clearButton=E('button',{'class':'cbi-button',click:function(){correctUsage(true);}},_('Restore measured usage'));
		selector.addEventListener('change',function(){ selected=''; update(); }); month.addEventListener('change',histories);
		update(); poll.add(update,1);
		return E('div',{'class':'cbi-map qmodem-traffic-page'},[
			E('fieldset',{'class':'cbi-section'},[
				E('table',{'class':'table'},[E('tbody',{},[E('tr',{'class':'tr'},[
					E('td',{'class':'td left',width:'33%'},E('label',{'for':'modem_selector'},_('Modem Name'))),
					E('td',{'class':'td'},selector)
				])])])
			]),
			section(_('Traffic Monitor'),[summary]),
			section(_('Real-time speed'),[live]),
			section(_('Daily traffic'),[row(_('Month'),month),daily]),
			section(_('Monthly traffic'),[monthly]),
			section(_('Traffic settings'),[
				E('table',{'class':'table'},[E('tbody',{},[
					row(_('Enable traffic monitoring'),enabled,true),
					row(_('Monthly reset day'),day,true),
					row(_('Reset time'),time,true),
					row(_('Cycle threshold (GB)'),threshold,true),
					row(_('Current-cycle usage (GB)'),correction,true),
					row('',E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;'},[correctButton,clearButton]),true)
				])]),
				E('details',{},[E('summary',{},_('Usage notes')),
					E('p',{'class':'cbi-section-descr'},_('Upload and download are combined. 1 GB = 1,000,000,000 bytes; 0 disables the threshold. Reset dates beyond the end of a month use its last day.')),
					E('p',{'class':'cbi-section-descr'},_('IPv4 and IPv6 devices are counted together without counting a shared device twice. History survives billing resets. Router counters may differ from carrier billing.')),
					E('p',{'class':'cbi-section-descr'},_('Speed refreshes every second; charts update every 10 seconds. Records are saved every 15 minutes and on normal shutdown. Sudden power loss may lose the latest 15 minutes. Daily history: 400 days; monthly history: 24 months.')),
					E('p',{'class':'cbi-section-descr'},_('Enter the total usage currently reported by your carrier. New traffic continues accumulating from this value. The adjustment applies only to this billing cycle and affects threshold alerts; measured upload/download and historical charts are preserved.'))
				]),
				E('div',{style:'display:flex;justify-content:flex-end;'},save)
			])
		]);
	},
	handleSaveApply:null, handleSave:null, handleReset:null
});
