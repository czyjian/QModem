'use strict';
'require view';
'require uci';
'require poll';
'require ui';
'require dom';
'require qmodem.traffic as traffic';
'require qmodem.qmodem as qmodem';
'require qmodem.traffic-query as trafficQuery';

document.head.appendChild(E('link', {
	'rel':'stylesheet',
	'href':L.resource('qmodem/traffic.css') + (L.env.resource_version ? '?v='+L.env.resource_version+'&' : '?') + 'layout=traffic-chart-4'
}));

return view.extend({
	load: function() { return uci.load('qmodem'); },
	render: function() {
		// Refresh the navigation on the next load after installing the new page.
		ui.menu.flushCache();
		var modems = uci.sections('qmodem', 'modem-device');
		if (!modems.length) return E('p', {}, _('No modems configured.'));
		var selector = E('select', {'class':'cbi-input-select',id:'modem_selector'}, modems.map(function(m) { return E('option', {value:m['.name']},qmodem.formatModemName(m.name,m.alias,m['.name'])); }));
		var query = trafficQuery.create(selector), unitBase=1024;
		var unitNote=E('span');
		function quotaValue(s){return String(Number(((s.config.threshold_bytes!=null?s.config.threshold_bytes:s.config.threshold_gb*1e9)/Math.pow(unitBase,3)).toFixed(3)));}
		var summary = E('div'), live = E('div'), daily = E('div'), monthly = E('div'), state = {}, selected = '', thresholdLast = '', pending = false, chartUpdated = 0;
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
			dom.content(daily,traffic.chart(points,false,unitBase));
			dom.content(monthly,traffic.chart(Object.keys(state.monthly || {}).sort().map(function(key){ return {label:key.replace('-','/'),rx:state.monthly[key].rx,tx:state.monthly[key].tx}; }),false,unitBase));
			dom.content(live,traffic.chart((state.live || []).map(function(p){ return {label:new Date(p.time*1000).toLocaleTimeString(),rx:p.rx,tx:p.tx}; }),true));
		}
		var enabled=E('input',{type:'checkbox'}), day=E('input',{type:'number',min:1,max:31,'class':'cbi-input-text'}), time=E('input',{type:'time','class':'cbi-input-text'}), threshold=E('input',{type:'number',min:0,max:1000000,step:0.001,'class':'cbi-input-text'});
		var correction=E('input',{type:'number',min:0,max:1000000,step:0.001,'class':'cbi-input-text',placeholder:_('Current usage reported by your carrier')});
		var autoEnabled=E('input',{type:'checkbox'}), autoTime=E('input',{type:'time','class':'cbi-input-text',value:'03:00'});
		var autoLogin=E('span',{},_('正在检查登录状态…')),autoAvailable=E('span'),autoLast=E('span',{},'—');
		var autoLoaded='',autoPending=false,autoGeneration=0,monitorActive=true;
		var fieldId=0;
		function description(text) { return E('div',{'class':'cbi-value-description',style:'margin-top:0;flex:1 1 260px;'},text); }
		function nativeField(children,inline) {
			return E('div',{'class':'cbi-value',style:'display:block;margin:0;padding:0;'},[
				E('div',{'class':'cbi-value-field',style:'margin:0;width:100%;'+(inline?'display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;':'')},children)
			]);
		}
		function note(text) { return E('div',{style:'margin-top:6px;'},nativeField(description(text),false)); }
		function row(label,control,table,help) {
			var id='traffic-field-'+(++fieldId); control.id=id;
			if(table) {
				if(help) control.style.flexShrink='0';
				return E('tr',{'class':'tr'},[
					E('td',{'class':'td left',width:'33%'},E('label',{'for':label ? id : null},label)),
					E('td',{'class':'td'},help ? nativeField([control,description(help)],true) : control)
				]);
			}
			return E('div',{'class':'cbi-value'},[E('label',{'class':'cbi-value-title','for':label ? id : null},label),E('div',{'class':'cbi-value-field'},control)]);
		}
		function section(label,children) { return E('fieldset',{'class':'cbi-section'},[E('legend',{},label)].concat(children)); }
		function update() {
			if(pending) return Promise.resolve();
			pending=true;
			var id=selector.value;
			return Promise.all([traffic.get(id),qmodem.getSimInfo(id).catch(function(){return null;})]).then(function(results){
				var s=results[0], sim=trafficQuery.identify(results[1]);
				if (selector.value !== id) return;
				if (s.error) throw new Error(s.error);
				s.carrier_name=sim.carrier==='unicom' ? _('中国联通') : sim.carrier==='mobile' ? _('中国移动') : sim.carrier==='telecom' ? _('中国电信') : _('未识别');
				s.unit_base=unitBase;state=s;dom.content(unitNote,_('流量统一按 1024 进制显示，1 GB = 1,024 MB = 1,073,741,824 字节；流量阈值与手动校准使用相同口径。'));
				dom.content(summary,traffic.summary(s));
				if(selected !== id || (s.now || 0) - chartUpdated >= 10) { histories(); chartUpdated=s.now || 0; }
				if(selected !== id) {
					correction.value='';
					var cfg=s.config; enabled.checked=cfg.enabled; day.value=cfg.reset_day;
					time.value=String(cfg.reset_hour).padStart(2,'0')+':'+String(cfg.reset_minute).padStart(2,'0'); threshold.value=quotaValue(s); thresholdLast=quotaValue(s); selected=id;
				}
				if(quotaValue(state)!==thresholdLast) { if(threshold.value===thresholdLast)threshold.value=quotaValue(state); thresholdLast=quotaValue(state); }
			}).catch(function(e){ dom.content(summary,E('p',{'class':'alert-message error'},e.message)); }).finally(function(){ pending=false; });
		}
		var save=E('button',{'class':'cbi-button cbi-button-apply',click:function(){
			if(!day.checkValidity() || !time.checkValidity() || !threshold.checkValidity() || !day.value || !time.value || !threshold.value) { ui.addNotification(null,E('p',{},_('Enter valid traffic settings.')),'error'); return; }
			var parts=time.value.split(':'); save.disabled=true;
			traffic.configure(selector.value,enabled.checked,Number(day.value),Number(parts[0]),Number(parts[1]),threshold.value,unitBase).then(function(result){
				if(!result.success) throw new Error(result.error || _('Failed to save traffic settings.'));
				selected=''; return update();
			}).catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){save.disabled=false;});
		}},_('Save'));
		function correctUsage(clear) {
			if(!clear && (!correction.value || !correction.checkValidity() || !state.cycle)) {
				ui.addNotification(null,E('p',{},_('Enter valid current-cycle usage.')),'error'); return;
			}
			correctButton.disabled=true; clearButton.disabled=true;
			var request=clear ? traffic.clearCorrection(selector.value) : traffic.correct(selector.value,correction.value,state.cycle,unitBase);
			request.then(function(result){
				if(!result.success) throw new Error(result.error || _('Failed to correct cycle usage.'));
				correction.value='';
				ui.addNotification(null,E('p',{},_('Cycle usage updated.')),'success');
				return update();
			}).catch(function(e){ui.addNotification(null,E('p',{},e.message),'error');}).finally(function(){correctButton.disabled=false;clearButton.disabled=false;});
		}
		var correctButton=E('button',{'class':'cbi-button cbi-button-apply',click:function(){correctUsage(false);}},_('Correct cycle usage'));
		var clearButton=E('button',{'class':'cbi-button',click:function(){correctUsage(true);}},_('Restore measured usage'));
		function autoStatus() {
			if(autoPending || !monitorActive)return Promise.resolve();
			autoPending=true;var id=selector.value,generation=autoGeneration;
			return traffic.calibrationStatus(id).then(function(result){
				if(selector.value!==id || generation!==autoGeneration)return;
				if(result.error || !result.config)throw new Error(result.error || _('自动校准服务不可用'));
				if(autoLoaded!==id){autoEnabled.checked=result.config.enabled;autoTime.value=String(result.config.hour).padStart(2,'0')+':'+String(result.config.minute).padStart(2,'0');autoLoaded=id;}
				dom.content(autoLogin,result.logged_in ? _('已登录')+(result.mobile ? '（'+result.mobile+'）' : '') : _('未登录或查询不可用'));
				dom.content(autoAvailable,!result.config.enabled ? _('已关闭')+(result.available ? _('（查询已就绪）') : '：'+result.reason) : result.available ? _('可用，等待每天设定时间执行') : _('不可用')+'：'+result.reason);
				var last=result.last || {};
				dom.content(autoLast,last.time ? (last.local_time || traffic.formatDate(last.time))+' · '+last.reason+(last.status==='success' ? '（'+'已用 '+traffic.bytes(last.target_bytes,unitBase)+'，阈值 '+traffic.bytes(last.threshold_bytes,unitBase)+'）' : '') : _('尚未执行'));
			}).catch(function(error){if(selector.value===id && generation===autoGeneration){dom.content(autoLogin,_('无法检查登录状态'));dom.content(autoAvailable,error.message);}}).finally(function(){autoPending=false;if(monitorActive && (selector.value!==id || generation!==autoGeneration))autoStatus();});
		}
		var calibrateNow=E('button',{type:'button','class':'cbi-button cbi-button-action',click:function(){
            var id=selector.value;calibrateNow.disabled=true;dom.content(calibrateNow,_('正在校准…'));
            traffic.calibrateNow(id).then(function(result){if(!result.success)throw new Error(result.error || _('校准失败'));ui.addNotification(null,E('p',{},result.message || _('已校准已用流量和阈值。')),'success');}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){calibrateNow.disabled=false;dom.content(calibrateNow,_('立即校准'));if(selector.value===id){update();autoStatus();}});
        }},_('立即校准'));
		var autoSave=E('button',{type:'button','class':'cbi-button cbi-button-apply',click:function(){
			if(!autoTime.value || !autoTime.checkValidity()){ui.addNotification(null,E('p',{},_('请输入有效的每日校准时间。')),'error');return;}
			var id=selector.value,parts=autoTime.value.split(':');autoSave.disabled=true;
			traffic.configureCalibration(id,autoEnabled.checked,Number(parts[0]),Number(parts[1])).then(function(result){if(!result.success)throw new Error(result.error || _('自动校准设置保存失败'));if(selector.value===id){autoLoaded='';autoGeneration++;return autoStatus();}}).catch(function(error){ui.addNotification(null,E('p',{},error.message),'error');}).finally(function(){autoSave.disabled=false;});
		}},_('Save'));
		selector.addEventListener('change',function(){selected='';autoLoaded='';autoGeneration++;dom.content(autoLogin,_('正在检查登录状态…'));dom.content(autoAvailable,[]);dom.content(autoLast,'—');update();autoStatus();query.change();});month.addEventListener('change',histories);
		update(); poll.add(update,1);
		poll.add(query.update, 15);
		poll.add(autoStatus,30);
		var monitorPanel = E('div', {}, [
			section(_('Traffic Monitor'),[summary,note(_('Counts upload and download on IPv4 and IPv6 devices, counting shared devices only once. Router counters may differ from carrier billing.'))]),
			section(_('Real-time speed'),[live,note(_('Speed refreshes every second; charts update every 10 seconds.'))]),
			section(_('Daily traffic'),[row(_('Month'),month),daily,note(_('Daily history is retained for 400 days and is not deleted at billing resets.'))]),
			section(_('Monthly traffic'),[monthly,note(_('Monthly history is retained for 24 months and is not deleted at billing resets.'))]),
			section(_('Traffic settings'),[
				E('table',{'class':'table'},[E('tbody',{},[
					row(_('Enable traffic monitoring'),enabled,true,_('Records are saved every 15 minutes and on normal shutdown. Sudden power loss may lose the latest 15 minutes.')),
					row(_('Monthly reset day'),day,true,_('If the selected reset day does not exist in a month, the last day of that month is used.')),
					row(_('Reset time'),time,true,_('The billing cycle resets at this local time on the monthly reset day. Historical records are preserved.')),
					row(_('Cycle threshold (GB)'),threshold,true,_('阈值按本周期上传与下载合计计算，包含手动校准；设为 0 时不提醒。')),
					row(_('Current-cycle usage (GB)'),correction,true,_('Enter the total usage currently reported by your carrier. New traffic continues accumulating from this value. The adjustment applies only to this billing cycle and affects threshold alerts; measured upload/download and historical charts are preserved.')),
					row('',E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;'},[correctButton,clearButton]),true)
				])]),
				note(unitNote),
				E('div',{style:'display:flex;justify-content:flex-end;'},save)
			]),
			section(_('自动校准'),[
				E('table',{'class':'table'},[E('tbody',{},[
					row(_('使用流量查询页自动校准'),autoEnabled,true,_('默认关闭。开启后由路由器后台每天按查询结果校准已用流量，并将流量阈值设为套餐总量，保留手动校准及原始流量历史。')),
					row(_('每天校准时间'),autoTime,true,_('按路由器本地时间执行；路由器在该分钟离线时，等待下一天。')),
					row(_('流量查询登录状态'),autoLogin,true),
					row(_('自动校准可用状态'),autoAvailable,true),
					row(_('上次校准'),autoLast,true)
				])]),
				note(_('使用查询接口的本月已用流量和套餐总量，1 MB = 1,048,576 字节。本地账期需设为每月 1 日 00:00；登录失效、SIM 不匹配、套餐总量不明确或数据不可用时跳过校准。')),
				E('div',{style:'display:flex;justify-content:flex-end;gap:8px;'},[calibrateNow,autoSave])
			])
		]);
		var tabs = E('ul', { 'class': 'cbi-tabmenu', style: 'margin-bottom:1em;' });
		var queryPanel = E('div', {}, [query.node]);
		function show(name) {
			name = name === 'query' ? 'query' : 'monitor';
			monitorPanel.style.display = name === 'monitor' ? '' : 'none';
			queryPanel.style.display = name === 'query' ? '' : 'none';
			tabs.querySelectorAll('li').forEach(function(li) {
				var selected = li.getAttribute('data-tab') === name;
				li.className = selected ? 'cbi-tab' : 'cbi-tab-disabled';
				li.querySelector('a').setAttribute('aria-current', selected ? 'page' : 'false');
			});
			history.replaceState(null, '', location.pathname + location.search + (name === 'query' ? '#query' : ''));
			query.activate(name === 'query');
			monitorActive=name==='monitor';if(monitorActive)autoStatus();
		}
		[{name:'monitor',title:_('Traffic Monitor')},{name:'query',title:_('Traffic Query')}].forEach(function(tab) {
			tabs.appendChild(E('li', { 'data-tab': tab.name }, E('a', {
				href: '#' + tab.name,
				click: function(ev) { ev.preventDefault(); show(tab.name); }
			}, tab.title)));
		});
		window.addEventListener('hashchange', function() { show(location.hash.slice(1)); });
		show(location.hash.slice(1));
		return E('div', {'class':'cbi-map qmodem-traffic-page'}, [
			tabs,
			E('fieldset', {'class':'cbi-section'}, [
				E('table', {'class':'table', style:'margin-bottom:0;'}, [E('tbody', {}, [E('tr', {'class':'tr'}, [
					E('td', {'class':'td left', width:'33%'}, E('label', {'for':'modem_selector'}, _('Modem Name'))),
					E('td', {'class':'td'}, selector)
				])])])
			]),
			monitorPanel, queryPanel
		]);
	},
	handleSaveApply:null, handleSave:null, handleReset:null
});
