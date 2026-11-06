'use strict';
'require dom';
'require uci';
'require qmodem.qmodem as qmodem';

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

function queryUrl(value) {
	try {
		var url = new URL(value || '/qmodem-unicom/', window.location.href);
		if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
		return url.href;
	} catch (e) { return null; }
}

function flow(value) {
	if (typeof value !== 'number' || !isFinite(value) || value < 0) return '—';
	return value >= 1024 ? (value / 1024).toFixed(2) + ' GB' : value.toFixed(2) + ' MB';
}

return L.Class.extend({
	identify: identify,
	queryUrl: queryUrl,
	flow: flow,
	create: function(selector) {
		var node=E('div'), active=false, generation=0, pending=null, current='', rendered=false;
		var loginTarget='', detailTarget='', carrierValue=E('td',{'class':'td'},_('正在识别…'));
		var carrierRow=E('fieldset',{'class':'cbi-section'},[
			E('table',{'class':'table',style:'margin-bottom:0;'},[E('tbody',{},[E('tr',{'class':'tr'},[
				E('td',{'class':'td left',width:'33%'},_('当前SIM卡运营商')),carrierValue
			])])])
		]);
		var status=E('div',{'class':'cbi-value-description'}), summary=E('div'), login=E('button',{type:'button','class':'cbi-button',click:function(){window.open(loginTarget,'_blank','noopener,noreferrer');}},_('登录'));
		var statusBox=E('div',{'class':'cbi-value',style:'display:block;margin:0 0 12px;padding:0;'},[
			E('div',{'class':'cbi-value-field',style:'margin:0;width:100%;'},[status])
		]);
		var details=E('button',{type:'button','class':'cbi-button',click:function(){window.open(detailTarget,'_blank','noopener,noreferrer');}},_('在新窗口打开'));
		var refresh=E('button',{type:'button','class':'cbi-button',click:function(){update(true);}},_('刷新'));
		var actions=E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;'},[login,refresh,details]);
		function message(text,kind) {
			rendered=false;
			dom.content(node,[carrierRow,E('p',{'class':kind ? 'alert-message '+kind : ''},text)]);
		}
		function prepare(id) {
			var target=queryUrl(uci.get('qmodem','main','unicom_query_url'));
			if (!target) throw new Error(_('The carrier query page address is invalid.'));
			var url=new URL(target); url.searchParams.set('modem',id); detailTarget=url.href;
			var loginUrl=new URL('/qmodem-unicom/',window.location.href);
			loginUrl.searchParams.set('modem',id); loginUrl.searchParams.set('login','1'); loginTarget=loginUrl.href;
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
				throw new Error(data.msg || _('联通流量查询失败'));
			}
			login.style.display='none';
			status.className='';
			var caption=_('中国联通')+(data.mobile ? ' · '+data.mobile : '')+(data.package_name ? ' · '+data.package_name : '');
			dom.content(status,caption);
			var rows=[E('tr',{'class':'tr'},[E('th',{'class':'th'},_('流量包')),E('th',{'class':'th'},_('剩余流量')),E('th',{'class':'th'},_('总流量'))])];
			rows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},_('合计')),E('td',{'class':'td'},flow(data.remaining_mb)),E('td',{'class':'td'},flow(data.total_mb))]));
			(data.details || []).forEach(function(item){
				rows.push(E('tr',{'class':'tr'},[E('td',{'class':'td'},item.name),E('td',{'class':'td'},item.unlimited ? _('不限量') : flow(item.remaining_mb)),E('td',{'class':'td'},item.unlimited ? _('不限量') : flow(item.total_mb))]));
			});
			dom.content(summary,[E('table',{'class':'table',style:'margin-bottom:0;'},rows),E('p',{'class':'cbi-value-description'},_('更新时间')+': '+new Date(data.updated_at*1000).toLocaleString())]);
		}
		function update(force) {
			if(!active) return Promise.resolve();
			if(pending) return pending;
			var id=selector.value, request=generation;
			refresh.disabled=true;
			pending=qmodem.getSimInfo(id).then(function(data){
				if(request!==generation || selector.value!==id) return;
				if(!data || data.error || !Array.isArray(data.modem_info)) throw new Error(_('Unable to identify the SIM carrier.'));
				var sim=identify(data), key=id+':'+sim.carrier+':'+sim.status+':'+sim.identity;
				dom.content(carrierValue,sim.carrier==='unicom' ? _('中国联通') : sim.carrier==='mobile' ? _('中国移动') : sim.carrier==='telecom' ? _('中国电信') : _('未识别'));
				if(key!==current) {
					current=key;
					if(sim.status && sim.status!=='ready') {message(_('The SIM card is not ready. Insert or unlock the SIM card first.'));return;}
					if(sim.carrier!=='unicom') {message(sim.carrier==='mobile' ? _('China Mobile usage queries are not supported yet.') : sim.carrier==='telecom' ? _('China Telecom usage queries are not supported yet.') : _('Unable to identify a supported SIM carrier. Only China Unicom is supported for now.'));return;}
					prepare(id);
				}
				if(sim.carrier!=='unicom' || (sim.status && sim.status!=='ready')) return;
				return fetch(L.url('admin/modem/unicom_api/shared')+'/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'usage',config_section:id,refresh:force===true})}).then(function(response){
					return response.json().then(function(result){if(!response.ok) throw new Error(result.msg || _('联通查询服务不可用'));return result;});
				}).then(function(result){if(request===generation && selector.value===id) paint(result);});
			}).catch(function(error){
				if(request!==generation || selector.value!==id) return;
				if(rendered) dom.content(status,_('查询未更新')+': '+error.message);
				else { current='';message(error.message,'error'); }
			}).finally(function(){pending=null;refresh.disabled=false;if(active && request!==generation) update();});
			return pending;
		}
		function reset(){generation++;current='';dom.content(carrierValue,_('正在识别…'));message(_('Identifying the SIM carrier...'));}
		reset();
		return {node:node,update:function(){return update(false);},activate:function(value){active=value;if(active)return update(false);},change:function(){reset();return update(false);}};
	}
});
