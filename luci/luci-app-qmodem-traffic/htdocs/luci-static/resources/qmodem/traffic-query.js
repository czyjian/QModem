'use strict';
'require dom';
'require qmodem.qmodem as qmodem';
'require qmodem.carrier-login as carrierLogin';
'require qmodem.telecom-test as telecomTest';
'require qmodem.mobile-login as mobileLogin';

// Prefer the SIM's home network over the registered network (roaming).
function identify(data) {
	var fields = {};
	((data && data.modem_info) || []).forEach(function(entry) {
		if (entry && typeof entry.value === 'string') fields[entry.key] = entry.value.trim();
	});
	var status = (fields['SIM Status'] || '').toLowerCase();
	if (status && status !== 'ready') return { carrier: '', status: status, identity: '' };
	var imsi = fields.IMSI || '', isp = fields.ISP || '', carrier = '';
	if (/^460\d{10,12}$/.test(imsi)) {
		var mnc = imsi.slice(3, 5);
		if (['01', '06', '09', '10'].indexOf(mnc) !== -1) carrier = 'unicom';
		else if (['00', '02', '04', '07', '08', '13'].indexOf(mnc) !== -1) carrier = 'mobile';
		else if (['03', '05', '11', '12'].indexOf(mnc) !== -1) carrier = 'telecom';
		else carrier = 'other';
	} else if (/联通|unicom|^460(?:01|06|09|10)$/i.test(isp)) carrier = 'unicom';
	else if (/移动|cmcc|china\s*mobile|^460(?:00|02|04|07|08|13)$/i.test(isp)) carrier = 'mobile';
	else if (/电信|telecom|chn-ct|^460(?:03|05|11|12)$/i.test(isp)) carrier = 'telecom';
	return { carrier: carrier, status: status, identity: imsi || fields.ICCID || isp };
}

function flow(value) {
	if (typeof value !== 'number' || !isFinite(value) || value < 0) return '—';
	return value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2) + ' MB';
}

return L.Class.extend({
	identify: identify,
	flow: flow,
	create: function(selector) {
		var node=E('div'), active=false, generation=0, pending=null, current='', rendered=false, refreshQueued=false, loggingOut=false;
		var loginDialog=null, detailTarget='', currentCarrier='', carrierValue=E('td',{'class':'td'},_('正在识别…'));
		var carrierRow=E('fieldset',{'class':'cbi-section'},[
			E('table',{'class':'table',style:'margin-bottom:0;'},[E('tbody',{},[E('tr',{'class':'tr'},[
				E('td',{'class':'td left',width:'33%'},_('当前SIM卡运营商')),carrierValue
			])])])
		]);
		var status=E('div',{'class':'cbi-value-description'}), summary=E('div'), login=E('button',{type:'button','class':'cbi-button',click:function(){
			if(loginDialog)loginDialog.close();
			loginDialog=(currentCarrier==='mobile' ? mobileLogin : currentCarrier==='telecom' ? telecomTest : carrierLogin).open(selector.value,function(){loginDialog=null;update(true);});
		}},_('登录'));
		var statusBox=E('div',{'class':'cbi-value',style:'display:block;margin:0 0 12px;padding:0;'},[
			E('div',{'class':'cbi-value-field',style:'margin:0;width:100%;'},[status])
		]);
		var details=E('button',{type:'button','class':'cbi-button',click:function(){window.open(detailTarget,'_blank','noopener,noreferrer');}},_('在新窗口打开'));
		var refresh=E('button',{type:'button','class':'cbi-button',click:function(){update(true);}},_('刷新'));
		var logout=E('button',{type:'button','class':'cbi-button',title:_('清除当前 SIM 的共享登录，其他浏览器也需要重新登录。'),click:function(){
			if(loggingOut)return;
			var id=selector.value, request=++generation;loggingOut=true;logout.disabled=true;
			fetch(L.url('admin/modem/unicom_api/'+(currentCarrier==='mobile' ? 'mobile' : currentCarrier==='telecom' ? 'telecom_test' : 'shared'))+'/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:currentCarrier==='telecom' ? 'shared_logout' : 'logout',config_section:id})}).then(function(response){return response.json().then(function(result){if(!response.ok || !result.ok)throw new Error(result.msg || _('登出失败'));return result;});}).then(function(){
				if(request===generation && selector.value===id)paint({ok:false,code:'TOKEN_EXPIRED'});
			}).catch(function(error){if(request===generation && selector.value===id)dom.content(status,error.message);}).finally(function(){loggingOut=false;logout.disabled=false;});
		}},_('登出'));
		var actions=E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;'},[login,refresh,details]);
		function message(text,kind) {
			rendered=false;
			dom.content(node,[carrierRow,actions,E('p',{'class':kind ? 'alert-message '+kind : ''},text)]);
		}
		function prepare(id) {
			detailTarget=currentCarrier==='mobile' ? 'https://wx.10086.cn/website/spa/main/newHome' : currentCarrier==='telecom' ? 'https://www.189.cn/web/' : 'https://www.10010.com/e5/index.html';
			status.className='cbi-value-description';
			dom.content(summary,[]); dom.content(status,_('正在读取登录状态…'));
			login.style.display=''; refresh.disabled=true;
			dom.content(node,[carrierRow,actions,statusBox,summary]); rendered=true;
		}
		function paint(data) {
			if (data.ok === false) {
				if(data.code === 'TOKEN_EXPIRED' || data.code === 'BLACKLIST') {
					status.className='cbi-value-description';
					login.style.display=''; dom.content(summary,[]);
					dom.content(status,_('尚未登录或登录已过期，请登录后查询。')); return;
				}
				if(data.logged_in){login.style.display='none';dom.content(status,data.msg || _('查询暂不可用'));if(!summary.firstChild)dom.content(summary,[logout]);return;}
                throw new Error(data.msg || _('流量查询失败'));
			}
			login.style.display='none';
			status.className='';
			var caption=_(currentCarrier==='mobile' ? '中国移动' : currentCarrier==='telecom' ? '中国电信' : '中国联通')+(data.mobile ? ' · '+data.mobile : '')+(data.package_name ? ' · '+data.package_name : '');
			dom.content(status,data.scope_note ? [caption,E('div',{'class':'cbi-value-description'},data.scope_note)] : caption);
			var rows=[E('tr',{'class':'tr'},[E('th',{'class':'th'},_('流量包')),E('th',{'class':'th'},_('剩余流量')),E('th',{'class':'th'},_('总流量'))])];
			rows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},_('合计')),E('td',{'class':'td'},flow(data.remaining_mb)),E('td',{'class':'td'},flow(data.total_mb))]));
			(data.details || []).forEach(function(item){
				rows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},item.name),E('td',{'class':'td'},item.unlimited ? _('不限量') : flow(item.remaining_mb)),E('td',{'class':'td'},item.unlimited ? _('不限量') : flow(item.total_mb))]));
			});
			var networkRows=[];
			if(data.signed_rate)networkRows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},_('签约速率')),E('td',{'class':'td',colspan:2,title:_('套餐签约值，不代表实时测速结果。')},data.signed_rate)]));
			if(data.qci)networkRows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},'QCI'),E('td',{'class':'td',colspan:2},data.qci)]));
			if(networkRows.length)networkRows.unshift(E('tr',{'class':'tr'},[E('th',{'class':'th'},_('网络信息')),E('th',{'class':'th',colspan:2},_('当前值'))]));
			function columns(){return E('colgroup',{},[E('col',{style:'width:50%;'}),E('col',{style:'width:25%;'}),E('col',{style:'width:25%;'})]);}
			dom.content(summary,[E('table',{'class':'table',style:'table-layout:fixed;margin-bottom:12px;'+(networkRows.length ? '' : 'display:none;')},[columns(),E('tbody',{},networkRows)]),E('table',{'class':'table',style:'table-layout:fixed;margin-bottom:0;'},[columns(),E('tbody',{},rows)]),E('div',{style:'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:12px;'},[
				logout,E('span',{'class':'cbi-value-description',style:'margin-left:auto;text-align:right;'},_('更新时间')+': '+new Date(data.updated_at*1000).toLocaleString())
			])]);
		}
		function update(force) {
			if(!active || loggingOut) return Promise.resolve();
			if(pending){if(force)refreshQueued=true;return pending;}
			var id=selector.value, request=generation;
			refresh.disabled=true;
			pending=qmodem.getSimInfo(id).then(function(data){
				if(request!==generation || selector.value!==id) return;
				if(!data || data.error || !Array.isArray(data.modem_info)) throw new Error(_('Unable to identify the SIM carrier.'));
				var sim=identify(data), key=id+':'+sim.carrier+':'+sim.status+':'+sim.identity;
				dom.content(carrierValue,sim.carrier==='unicom' ? _('中国联通') : sim.carrier==='mobile' ? _('中国移动') : sim.carrier==='telecom' ? _('中国电信') : _('未识别'));
				if(key!==current) {
					if(loginDialog){loginDialog.close();loginDialog=null;}

					current=key;currentCarrier=sim.carrier;
					if(sim.status && sim.status!=='ready') {message(_('The SIM card is not ready. Insert or unlock the SIM card first.'));return;}
					if(sim.carrier!=='unicom' && sim.carrier!=='telecom' && sim.carrier!=='mobile') {message(_('当前 SIM 卡运营商暂不支持流量查询。'));return;}
					prepare(id);
				}
				if((sim.carrier!=='unicom' && sim.carrier!=='telecom' && sim.carrier!=='mobile') || (sim.status && sim.status!=='ready')) return;
				return fetch(L.url('admin/modem/unicom_api/'+(currentCarrier==='mobile' ? 'mobile' : currentCarrier==='telecom' ? 'telecom_test' : 'shared'))+'/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:currentCarrier==='telecom' ? 'shared_usage' : 'usage',config_section:id,refresh:force===true})}).then(function(response){
					return response.json().then(function(result){if(!response.ok) throw new Error(result.msg || _('联通查询服务不可用'));return result;});
				}).then(function(result){if(request===generation && selector.value===id) paint(result);});
			}).catch(function(error){
				if(request!==generation || selector.value!==id) return;
				if(rendered) dom.content(status,_('查询未更新')+': '+error.message);
				else { current='';message(error.message,'error'); }
			}).finally(function(){pending=null;refresh.disabled=false;if(active && (request!==generation || refreshQueued)){var forceRefresh=refreshQueued;refreshQueued=false;update(forceRefresh);}});
			return pending;
		}
		function reset(){if(loginDialog){loginDialog.close();loginDialog=null;}generation++;current='';dom.content(carrierValue,_('正在识别…'));message(_('Identifying the SIM carrier...'));}
		reset();
		return {node:node,update:function(){return update(false);},activate:function(value){active=value;if(active)return update(false);if(loginDialog){loginDialog.close();loginDialog=null;}},change:function(){reset();return update(false);}};
	}
});
