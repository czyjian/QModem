'use strict';
'require baseclass';
'require rpc';

var get = rpc.declare({ object: 'qmodem.traffic', method: 'get', params: ['config_section'] });
var configure = rpc.declare({ object: 'qmodem.traffic', method: 'configure', params: ['config_section', 'enabled', 'reset_day', 'reset_hour', 'reset_minute', 'threshold_gb','unit_base'] });

function bytes(n, base) {
	base = base === 1000 ? 1000 : 1024;
	n = Number(n) || 0;
	var units = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
	while (n >= base && i < units.length - 1) { n /= base; i++; }
	return n.toFixed(i ? 2 : 0) + ' ' + units[i];
}

function cycleTotal(s) { return s.cycle_total != null ? s.cycle_total : (s.cycle_rx || 0)+(s.cycle_tx || 0); }
function cycleBreakdown(s) {
	var bytes = function(n){return formatBytes(n,s.unit_base);};
	var rx=Object.prototype.hasOwnProperty.call(s,'sim_cycle_rx') ? s.sim_cycle_rx : s.cycle_rx;
	var tx=Object.prototype.hasOwnProperty.call(s,'sim_cycle_tx') ? s.sim_cycle_tx : s.cycle_tx;
	return _('Download')+': '+(rx==null ? '—' : bytes(rx))+' / '+_('Upload')+': '+(tx==null ? '—' : bytes(tx));
}
var formatBytes=bytes;
function carrierBreakdown(s) {
	var totals=s.cycle_carriers || {unknown:(s.cycle_rx || 0)+(s.cycle_tx || 0)};
	var names={telecom:_('中国电信'),unicom:_('中国联通'),mobile:_('中国移动'),unknown:_('未归属')};
	return Object.keys(names).filter(function(key){return totals[key]>0;}).map(function(key){return names[key]+': '+formatBytes(totals[key],s.unit_base);}).join(' / ');
}
function formatDate(value) {
	if(typeof value==='string') return value.replace(/-/g,'/')+(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)?':00':'');
	if(!value) return '—';
	var d=new Date(value*1000), pad=function(n){return String(n).padStart(2,'0');};
	return d.getFullYear()+'/'+pad(d.getMonth()+1)+'/'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}

// Monotone cubic interpolation keeps measured peaks within their original range.
function smoothPath(coords) {
	if (!coords.length) return '';
	if (coords.length === 1) return 'M' + coords[0].join(',');
	var slopes=[], tangents=[], i;
	for(i=0;i<coords.length-1;i++) slopes.push((coords[i+1][1]-coords[i][1])/(coords[i+1][0]-coords[i][0]));
	tangents[0]=slopes[0]; tangents[coords.length-1]=slopes[slopes.length-1];
	for(i=1;i<coords.length-1;i++) tangents[i]=slopes[i-1]*slopes[i]<=0 ? 0 : (slopes[i-1]+slopes[i])/2;
	for(i=0;i<slopes.length;i++) {
		if(!slopes[i]) { tangents[i]=0; tangents[i+1]=0; continue; }
		var alpha=tangents[i]/slopes[i], beta=tangents[i+1]/slopes[i], norm=Math.hypot(alpha,beta);
		if(norm>3) { tangents[i]=3*alpha/norm*slopes[i]; tangents[i+1]=3*beta/norm*slopes[i]; }
	}
	var path='M'+coords[0].join(',');
	for(i=0;i<coords.length-1;i++) {
		var dx=(coords[i+1][0]-coords[i][0])/3;
		path+=' C'+[coords[i][0]+dx,coords[i][1]+tangents[i]*dx,coords[i+1][0]-dx,coords[i+1][1]-tangents[i+1]*dx,coords[i+1][0],coords[i+1][1]].join(',');
	}
	return path;
}

var chartSequence=0, chartObserver=null, chartTargets=new Map();
function chart(points, speed, base) {
	var ns='http://www.w3.org/2000/svg', id='qmodem-area-'+(++chartSequence);
	function node(tag,attrs,text) {
		var el=document.createElementNS(ns,tag);
		Object.keys(attrs || {}).forEach(function(k){ el.setAttribute(k,attrs[k]); });
		if(text!=null) el.textContent=text;
		return el;
	}
	points=points.map(function(p){return {label:p.label,rx:Math.max(0,Number(p.rx)||0),tx:Math.max(0,Number(p.tx)||0)};});
	var format=speed ? function(n){return (n*8/1000000).toFixed(2)+' Mbps';} : function(n){return bytes(n,base);};
	var svg=node('svg',{width:'100%',height:260,role:'img','aria-label':_('Download and upload trends')});
	var tooltip=E('div',{'class':'qmodem-chart-tooltip',hidden:true});
	var root=E('div',{'class':'qmodem-chart'},[
		E('div',{'class':'qmodem-chart-legend'},[
			E('span',{'class':'qmodem-chart-download'},[E('i',{'aria-hidden':'true'}),_('Download')]),
			E('span',{'class':'qmodem-chart-upload'},[E('i',{'aria-hidden':'true'}),_('Upload')])
		]),svg,tooltip
	]);
	var width=960, left=96, right=24, top=20, bottom=224, paths=[], guide, markers=[];
	function draw() {
		width=Math.max(280,root.getBoundingClientRect().width || 960);
		left=width<480 ? 82 : 96;
		svg.setAttribute('viewBox','0 0 '+width+' 260');
		svg.replaceChildren(); paths=[]; markers=[];
		var defs=node('defs'), gradient=node('linearGradient',{id:id,x1:0,y1:0,x2:0,y2:1});
		gradient.appendChild(node('stop',{offset:'0%','stop-color':'var(--primary, currentColor)','stop-opacity':0.22}));
		gradient.appendChild(node('stop',{offset:'100%','stop-color':'var(--primary, currentColor)','stop-opacity':0.01}));
		defs.appendChild(gradient); svg.appendChild(defs);
		var raw=Math.max.apply(null,points.map(function(p){return Math.max(p.rx,p.tx);}).concat([1]));
		var axisValue=speed ? Math.max(1,raw*8/1000000) : raw;
		var unit=Math.pow(10,Math.floor(Math.log10(axisValue))-1);
		var max=Math.ceil(axisValue*1.1/unit)*unit*(speed ? 1000000/8 : 1);
		for(var j=0;j<=4;j++) {
			var y=top+j*(bottom-top)/4;
			svg.appendChild(node('line',{x1:left,y1:y,x2:width-right,y2:y,'class':'qmodem-chart-grid'}));
			svg.appendChild(node('text',{x:left-12,y:y,'text-anchor':'end','dominant-baseline':'middle','class':'qmodem-chart-axis'},format(max*(4-j)/4)));
		}
		['rx','tx'].forEach(function(key,series){
			var coords=points.map(function(p,i){return [left+i*(width-left-right)/Math.max(1,points.length-1),bottom-p[key]/max*(bottom-top)];});
			paths.push(coords);
			var d=smoothPath(coords), cls=series?'qmodem-chart-upload':'qmodem-chart-download';
			if(coords.length>1 && !series) svg.appendChild(node('path',{d:d+' L'+coords[coords.length-1][0]+','+bottom+' L'+coords[0][0]+','+bottom+' Z',fill:'url(#'+id+')'}));
			svg.appendChild(node('path',{d:d,fill:'none','class':'qmodem-chart-line '+cls}));
			if(coords.length===1) svg.appendChild(node('circle',{cx:coords[0][0],cy:coords[0][1],r:3,'class':'qmodem-chart-point '+cls}));
		});
		var ticks=Math.max(2,Math.floor((width-left-right)/(speed?120:80))), every=Math.max(1,Math.ceil(points.length/ticks)), lastX=-Infinity;
		points.forEach(function(p,i){
			if(i%every && i!==points.length-1) return;
			var x=left+i*(width-left-right)/Math.max(1,points.length-1);
			if(x-lastX<(speed?100:65)) return;
			lastX=x;
			svg.appendChild(node('text',{x:x,y:250,'text-anchor':'middle','class':'qmodem-chart-axis'},p.label));
		});
		guide=node('line',{y1:top,y2:bottom,'class':'qmodem-chart-guide',visibility:'hidden'}); svg.appendChild(guide);
		['qmodem-chart-download','qmodem-chart-upload'].forEach(function(cls){var marker=node('circle',{r:4,'class':'qmodem-chart-point '+cls,visibility:'hidden'});markers.push(marker);svg.appendChild(marker);});
		tooltip.hidden=true;
	}
	function hide(){ tooltip.hidden=true; if(guide)guide.setAttribute('visibility','hidden'); markers.forEach(function(m){m.setAttribute('visibility','hidden');}); }
	svg.addEventListener('pointermove',function(event){
		if(!points.length || !guide) return;
		var bounds=svg.getBoundingClientRect(), x=(event.clientX-bounds.left)*width/bounds.width;
		var index=Math.max(0,Math.min(points.length-1,Math.round((x-left)/(width-left-right)*(points.length-1)))), p=points[index];
		var position=paths[0][index]; guide.setAttribute('x1',position[0]);guide.setAttribute('x2',position[0]);guide.setAttribute('visibility','visible');
		markers.forEach(function(m,i){m.setAttribute('cx',paths[i][index][0]);m.setAttribute('cy',paths[i][index][1]);m.setAttribute('visibility','visible');});
		tooltip.textContent=p.label+'\n'+_('Download')+': '+format(p.rx)+'\n'+_('Upload')+': '+format(p.tx);
		tooltip.hidden=false;
		tooltip.style.left=Math.max(0,Math.min(root.clientWidth-tooltip.offsetWidth,position[0]+12))+'px';
		tooltip.style.top='36px';
	});
	svg.addEventListener('pointerleave',hide);
	// One shared observer; discard replaced charts during the next update.
	if(!chartObserver && typeof ResizeObserver!=='undefined') chartObserver=new ResizeObserver(function(entries){entries.forEach(function(e){var render=chartTargets.get(e.target);if(render)render();});});
	chartTargets.forEach(function(render,target){if(!target.isConnected){if(chartObserver)chartObserver.unobserve(target);chartTargets.delete(target);}});
	chartTargets.set(root,draw);
	if(chartObserver) chartObserver.observe(root);
	requestAnimationFrame(draw);
	return root;
}

return baseclass.extend({
	get: get,
	current: rpc.declare({ object: 'qmodem.traffic', method: 'current', params: ['config_section'] }),
	configure: configure,
	correct: rpc.declare({object:'qmodem.traffic',method:'correct',params:['config_section','target_gb','cycle','unit_base']}),
	clearCorrection: rpc.declare({object:'qmodem.traffic',method:'clear_correction',params:['config_section']}),
	calibrateNow: rpc.declare({object:'qmodem.traffic',method:'calibration_run',params:['config_section'],timeout:60000}),
	calibrationStatus: rpc.declare({object:'qmodem.traffic',method:'calibration_status',params:['config_section']}),
	configureCalibration: rpc.declare({object:'qmodem.traffic',method:'calibration_configure',params:['config_section','enabled','hour','minute','simchange_enabled']}),
	bytes: bytes,
	cycleTotal: cycleTotal,
	cycleBreakdown: cycleBreakdown,
	formatDate: formatDate,
	chart: chart,
	summary: function(s) {
		if (!s.config || !s.config.enabled) return E('p', {}, _('Traffic monitoring is disabled.'));
		if (!s.now) return E('p', {}, _('Waiting for the first traffic sample...'));
		var bytes=function(n){return formatBytes(n,s.unit_base);}, quota=(s.config.threshold_bytes!=null?s.config.threshold_bytes:s.config.threshold_gb*1e9)/Math.pow(s.unit_base===1000?1000:1024,3), quotaText=Number(quota.toFixed(3))+' GB';
		var today=(s.daily || {})[s.day] || {}, todayRx=today.rx || 0, todayTx=today.tx || 0;
		var rows = [
			[_('Current download / upload'), (s.rx_rate * 8 / 1000000).toFixed(2) + ' / ' + (s.tx_rate * 8 / 1000000).toFixed(2) + ' Mbps'],
			[_('本周期已用流量'), bytes(cycleTotal(s))],
			[_('本周期剩余流量'), quota > 0 ? bytes(Math.max(0, quota * Math.pow(s.unit_base===1000?1000:1024,3) - cycleTotal(s))) : _('Not set')],
			[_('Traffic threshold'), s.config.threshold_gb > 0 ? quotaText : _('Not set')],
			[_('今日已用流量'), bytes(todayRx+todayTx)+' ('+_('Download')+': '+bytes(todayRx)+' / '+_('Upload')+': '+bytes(todayTx)+')'],
			[_('本周期累计流量'), bytes((s.cycle_rx || 0)+(s.cycle_tx || 0)) + (carrierBreakdown(s) ? ' ('+carrierBreakdown(s)+')' : '')],
			[_('Billing cycle starts'), s.cycle ? formatDate(s.cycle) : '—'],
			[_('Recording since'), formatDate(s.since)]
		];
		var content = [];
		if (s.carrier_name) rows.unshift([_('当前运营商'),s.carrier_name]);
		if (s.exceeded) content.push(E('div', {'class':'alert-message warning'}, _('Traffic usage has reached the configured threshold.') + ' ' + bytes(cycleTotal(s)) + ' / ' + quotaText));
		if (s.stale) content.push(E('p', {'class':'alert-message warning'}, _('Traffic samples are stale. Check the monitoring service.')));
		content.push(E('table', {'class':'table'}, rows.map(function(row) { return E('tr', {'class':'tr'}, [E('td', {'class':'td',width:'33%'},row[0]), E('td', {'class':'td'},row[1])]); })));
		return E('div', {}, content);
	}
});
