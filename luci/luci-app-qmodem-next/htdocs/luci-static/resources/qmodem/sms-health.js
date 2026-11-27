'use strict';
'require rpc';
'require ui';
'require dom';
'require qmodem.qmodem as qmodem';

var status = rpc.declare({ object: 'qmodem.sms', method: 'status', expect: {} });
var config = rpc.declare({ object: 'qmodem.sms', method: 'config_get', params: ['modem_id'], expect: {} });
var syncStatus = rpc.declare({ object: 'qmodem.sms', method: 'sync_status', expect: {} });
var list = rpc.declare({ object: 'qmodem.sms', method: 'list', params: ['modem_id', 'limit', 'offset'], expect: {} });

function classify(command, response, mode) {
 var m;
 if (/\+(?:CMS|CME) ERROR|(?:^|\n)\s*ERROR\s*(?:\n|$)/.test(response)) return ['unknown', '模组拒绝查询或不支持此指令，无法确认。'];
 if (command === 'AT+CPIN?') {
  m=response.match(/\+CPIN:\s*([^\r\n]+)/);
  return !m?['unknown','未返回 SIM 状态。']:m[1].trim()==='READY'?['ok','SIM 卡已就绪。']:['error','SIM 卡未就绪：'+m[1].trim()];
 }
 if (command === 'AT+CEREG?' || command === 'AT+C5GREG?') {
  m=response.match(/\+(?:CEREG|C5GREG):\s*\d+\s*,\s*(\d+)/);
  return !m?['unknown','未返回可识别的网络注册状态。']:/^[15]$/.test(m[1])?['ok','已注册网络；这不代表运营商已开通短信或解除管控。']:['unknown','此制式当前未注册；使用其他制式时属于正常情况，不能据此判定短信故障。'];
 }
 if(command==='AT+CMGF?') {
  m=response.match(/\+CMGF:\s*(\d+)/);
  return !m?['unknown','未返回短信格式。']:m[1]==='0'?['ok','当前为 PDU 格式。']:['warning','当前为文本格式，可能与短信读取程序不一致；可重新应用短信设置。'];
 }
 if(command==='AT+CNMI?') {
  m=response.match(/\+CNMI:\s*(\d+)\s*,\s*(\d+)/);
  return !m?['unknown','未返回接收通知设置。']:mode==='database_urc'&&(m[1]==='0'||m[2]==='0')?['warning','事件接收模式下，新短信通知未开启。']:['ok',mode==='database_urc'?'已配置新短信通知；仍需实际来信验证事件链路。':'已读取接收通知配置；轮询模式不依赖实时通知。'];
 }
 if(command==='AT+CSCA?') return /\+CSCA:\s*"[^"\s]+"/.test(response)?['ok','模组返回了短信中心号码。']:['unknown','未返回短信中心号码；部分网络由 IMS 管理，不能据此判定发送故障。'];
 if(command==='AT+CPMS?') {
  var values=Array.from(response.matchAll(/"([A-Z]+)"\s*,\s*(\d+)\s*,\s*(\d+)/g));
  if(!values.length)return ['unknown','未返回可识别的短信存储容量。'];
  var full=values.some(function(v){return +v[3]>0&&+v[2]>=+v[3];});
  return [full?'warning':'ok',values.map(function(v){return v[1]+'：'+v[2]+'/'+v[3];}).join('；')+(full?'。存储已满，请先备份再清理短信。':'。')];
 }
 return ['unknown','无法确认。'];
}
function check(modem, report) {
 var mode,port;
 function row(name,state,detail){report({name:name,state:state,detail:detail});}
 function attempt(name,fn,assess){return Promise.resolve().then(fn).then(assess,function(){row(name,'unknown','查询失败，请检查服务连接或权限后重试。');});}
 return attempt('短信服务',status,function(s){row('短信服务',s.status==='ready'?'ok':'error',s.status==='ready'?'短信服务可访问。':'服务未就绪，请检查短信服务运行状态。');})
 .then(function(){return attempt('短信配置',function(){return config(modem);},function(c){
  if(c.status!=='success'){row('短信配置','error','无法读取当前模组配置。');return;}
  mode=c.mode;
  var names={direct:'直接读取',database_poll:'数据库轮询',database_urc:'数据库事件接收'};
  row('短信配置',names[mode]&&(mode==='direct'||c.use_ubus)?'ok':'warning',(names[mode]||'未知模式')+(mode==='database_poll'?'，轮询间隔 '+c.poll_interval+' 秒。':'。')+(c.auto_delete?'当前启用了入库后自动删除模组短信。':'当前保留模组中的短信。'));
 });})
 .then(function(){return attempt('数据库读取',function(){return mode==='direct'||!mode?null:list(modem,1,0);},function(r){row('数据库读取',!r?'unknown':r.status==='error'?'error':'ok',!r?'直接读取模式或配置未知，跳过数据库检查。':r.status==='error'?'读取失败，请检查数据库及存储空间。':'数据库可读取；未触发同步或删除短信。');});})
 .then(function(){return attempt('最近同步',syncStatus,function(s){
  if(s.modem_id!==modem||!s.last_sync_at){row('最近同步','unknown','没有当前模组的最近同步记录；不代表接收故障。');return;}
  row('最近同步',s.status==='error'?'error':'ok',new Date(Number(s.last_sync_at)*1000).toLocaleString()+(s.status==='error'?'，同步失败，请检查模组通信及存储设置。':'，最近一次同步完成；不代表新短信已到达。'));
 });})
 .then(function(){return attempt('AT 通信端口',function(){return qmodem.getAtCfg(modem);},function(c){port=c&&c.at_cfg&&c.at_cfg.using_port;row('AT 通信端口',port?'ok':'unknown',port?'已取得当前模组通信端口。':'未取得通信端口，跳过模组查询。');});})
 .then(function(){
  if(!port)return;
  var queries=[['SIM 卡','AT+CPIN?'],['LTE 网络注册','AT+CEREG?'],['5G 网络注册','AT+C5GREG?'],['短信格式','AT+CMGF?'],['接收通知','AT+CNMI?'],['短信中心','AT+CSCA?'],['短信存储','AT+CPMS?']];
  return queries.reduce(function(chain,q){return chain.then(function(){return attempt(q[0],function(){return qmodem.sendAt(modem,port,q[1],true);},function(r){var raw=r&&r.at_cfg&&r.at_cfg.res;var result=raw?classify(q[1],raw,mode):['unknown','模组没有返回可识别的结果。'];row(q[0],result[0],result[1]);});});},Promise.resolve());
 });
}
return L.Class.extend({
 classify:classify,check:check,
 show:function(modem){
  var body=E('tbody'), progress=E('p',{'class':'spinning'},_('正在检查…'));
  var retry=E('button',{'class':'cbi-button cbi-button-action',disabled:true},_('重新检查'));
  function run(){
   retry.disabled=true;dom.content(body,[]);progress.className='spinning';progress.textContent=_('正在检查…');
   check(modem,function(r){var labels={ok:'正常',warning:'需注意',error:'异常',unknown:'无法确认'};body.appendChild(E('tr',{'class':'tr'},[E('td',{'class':'td'},_(r.name)),E('td',{'class':'td'},_(labels[r.state])),E('td',{'class':'td'},r.detail)]));})
   .then(function(){progress.textContent=_('检查完成');},function(){progress.textContent=_('检查未完成，请重试。');}).finally(function(){progress.className='';retry.disabled=false;});
  }
  retry.addEventListener('click',run);
  var dialog=ui.showModal(_('短信健康检查'),[
   E('p',{},_('仅查询当前模组，不发送短信、不修改设置、不触发同步或删除。运营商管控及手机是否收到短信，需要另外确认。')),
   progress,E('table',{'class':'table'},body),E('div',{'class':'right'},[retry,' ',E('button',{'class':'cbi-button',click:ui.hideModal},_('关闭'))])
  ],'cbi-modal','qmodem-sms-health-modal');
  if(dialog&&typeof dialog.getBoundingClientRect==='function'){
   var bounds=dialog.getBoundingClientRect();
   if(bounds.width>0){var width=Math.min(bounds.width*1.5,document.documentElement.clientWidth-32);dialog.appendChild(E('style',{},'.modal.qmodem-sms-health-modal { box-sizing: border-box; width: '+width+'px !important; max-width: calc(100vw - 2rem) !important; }'));}
  }
  run();
 }
});
