'use strict';
'require ui';
'require dom';
'require rpc';
'require qmodem.qmodem as qmodem';

var listSms=rpc.declare({object:'qmodem.sms',method:'list',params:['modem_id','limit','offset'],expect:{}});
var syncSms=rpc.declare({object:'qmodem.sms',method:'sync',params:['modem_id'],expect:{}});
var clock=rpc.declare({object:'system',method:'info',expect:{}});
var VERIFY_ORIGIN='https://img.client.10010.com';

function verificationUrl(value) {
	try {var url=new URL(value);return url.origin===VERIFY_ORIGIN && url.pathname==='/loginRisk/index.html' && !url.username && !url.password;} catch(e){return false;}
}
function smsKey(message) {return String(message.id == null ? message.index : message.id)+':'+String(message.timestamp)+':'+String(message.sender);}
function recentMessages(messages,baseline,after,carrier) {
	return messages.filter(function(message){
		var sender=String(message.sender || '').replace(/^(?:\+86|0086|86)/,'').replace(/\s/g,'');
		return message.type!=='sent' && message.direction!=='sent' && message.complete!==0 && message.complete!==false &&
			(carrier==='mobile' ? ((/^10086\d*$/.test(sender) || /中国移动/.test(String(message.content || ''))) && /验证码|随机码/.test(String(message.content || ''))) : carrier==='telecom' ? ((/^10000\d*$/.test(sender) || /中国电信/.test(String(message.content || ''))) && /验证码/.test(String(message.content || ''))) : (/^10010\d*$/.test(sender) || /【中国联通】/.test(String(message.content || '')))) &&
			Number(message.timestamp)>=after && !baseline.has(smsKey(message));
	}).sort(function(a,b){return Number(b.timestamp)-Number(a.timestamp);}).slice(0,10);
}
function codeFrom(text) {
	var match=String(text || '').match(/验证码[\s:：]*([0-9]{4,8})(?![0-9])/);
	return match ? match[1] : '';
}
function identity(info) {
	var fields={};((info && info.modem_info) || []).forEach(function(item){fields[item.key]=String(item.value || '').trim();});
	if(fields['SIM Status']!=='ready' || !/^\d{10,32}$/.test(fields.IMSI || fields.ICCID || '')) throw new Error(_('SIM 卡尚未就绪，请重新打开登录。'));
	return {key:fields.IMSI || fields.ICCID,phone:(fields['SIM Number'] || '').replace(/^\+?86/,'')};
}
function deviceId() {
	try {var saved=window.localStorage.getItem('unicom_device_id');if(/^[a-f0-9]{32}$/.test(saved || ''))return saved;}catch(e){}
	var bytes=new Uint8Array(16);
	if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
	else for(var i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256);
	var value=Array.prototype.map.call(bytes,function(n){return n.toString(16).padStart(2,'0');}).join('');
	try {window.localStorage.setItem('unicom_device_id',value);}catch(e){}
	return value;
}

return L.Class.extend({
	verificationUrl:verificationUrl, recentMessages:recentMessages, smsKey:smsKey, codeFrom:codeFrom,
	open:function(section,onSuccess) {
		var alive=true,busy=false,simIdentity='',generation=0,controller=null,verifyCancel=null,verifyFrame=null;
		var smsTimer=null,cooldownTimer=null,remaining=0,baseline=new Set(),smsAfter=null,smsDeadline=0,smsPhone='';
		var device=deviceId(),observer=null;
		var phone=E('input',{type:'tel','class':'cbi-input-text',autocomplete:'tel',maxlength:11,placeholder:_('11 位手机号')});
		var code=E('input',{type:'text','class':'cbi-input-text',inputmode:'numeric',autocomplete:'one-time-code',maxlength:8});
		var password=E('input',{type:'password','class':'cbi-input-text',autocomplete:'current-password',maxlength:20});
		var mode=E('select',{'class':'cbi-input-select'},[E('option',{value:'sms'},_('短信验证码登录')),E('option',{value:'password'},_('密码登录'))]);
		var note=E('div',{'class':'cbi-value-description',role:'status','aria-live':'polite'});
		var smsArea=E('div'),smsState=E('p',{'class':'cbi-value-description'},_('发送验证码后，在此显示本次操作之后收到的运营商短信。'));
		function field(label,input) {return E('div',{'class':'cbi-value'},[E('label',{'class':'cbi-value-title'},label),E('div',{'class':'cbi-value-field'},input)]);}
		function say(text){dom.content(note,text || '');}
		function stopSms(){if(smsTimer)window.clearTimeout(smsTimer);smsTimer=null;smsAfter=null;}
		function controls(){send.disabled=busy || remaining>0 || mode.value!=='sms';submit.disabled=busy;mode.disabled=busy;phone.disabled=busy;code.disabled=busy;password.disabled=busy;}
		var send=E('button',{type:'button','class':'cbi-button',click:function(){perform('send');}},_('发送验证码'));
		var submit=E('button',{type:'button','class':'cbi-button cbi-button-apply',click:function(){perform(mode.value==='password' ? 'password' : 'login');}},_('登录'));
		var cancel=E('button',{type:'button','class':'cbi-button',click:function(){close(true);}},_('取消'));
		var codeField=field(_('短信验证码'),E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;'},[code,send]));
		var passwordField=field(_('联通 App 登录密码'),password);
		var smsSection=E('fieldset',{'class':'cbi-section'},[E('legend',{},_('本次验证码短信')),smsState,smsArea]);
		var body=E('div',{},[field(_('登录方式'),mode),field(_('手机号'),phone),codeField,passwordField,field('',note),smsSection]);
		var footer=E('div',{'class':'right'},[cancel,' ',submit]);
		function showLogin(){if(alive)ui.showModal(_('运营商登录'),[body,footer]);}
		function setMode(){passwordField.style.display=mode.value==='password' ? '' : 'none';codeField.style.display=mode.value==='sms' ? '' : 'none';smsSection.style.display=mode.value==='sms' ? '' : 'none';controls();}
		mode.addEventListener('change',function(){stopSms();dom.content(smsArea,[]);password.value='';code.value='';setMode();});
		phone.addEventListener('input',function(){if(phone.value.trim()!==smsPhone){stopSms();dom.content(smsArea,[]);dom.content(smsState,_('手机号已改变，请重新发送验证码。'));}});
		function close(hide){
			if(!alive)return;alive=false;generation++;stopSms();if(cooldownTimer)window.clearInterval(cooldownTimer);
			if(controller)controller.abort();if(verifyCancel)verifyCancel(new Error(_('验证已取消')));
			if(observer)observer.disconnect();window.removeEventListener('pagehide',pageExit);
			password.value='';code.value='';dom.content(smsArea,[]);if(hide)ui.hideModal();
		}
		function pageExit(){close(false);}
		async function ensureSim(){var sim=identity(await qmodem.getSimInfo(section));if(simIdentity && sim.key!==simIdentity){var error=new Error(_('SIM 卡已更换，请关闭并重新打开登录。'));error.code='SIM_CHANGED';throw error;}simIdentity=sim.key;return sim;}
		async function smsList(sync){
			var result=await listSms(section,100,0);
			if(result.status==='error')throw new Error(result.error || _('短信读取失败'));
			if(sync && result.mode==='database_poll'){var state=await syncSms(section);if(state.status==='error')throw new Error(state.error || _('短信同步失败'));result=await listSms(section,100,0);}
			if(result.status==='error')throw new Error(result.error || _('短信读取失败'));
			return result.messages || result.msg || result.received || [];
		}
		function copy(value,input){
			if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function(){say(_('已复制验证码'));}).catch(function(){input.focus();input.select();say(_('请手动复制已选中的短信。'));});
			else {var temporary=E('textarea',{readonly:'readonly',style:'position:fixed;left:-9999px;'},value);document.body.appendChild(temporary);temporary.select();try{if(document.execCommand('copy'))say(_('已复制，可粘贴到验证码框。'));else {input.focus();input.select();say(_('请手动复制已选中的短信。'));}}catch(e){input.focus();input.select();say(_('请手动复制已选中的短信。'));}finally{temporary.remove();}}
		}
		function renderSms(messages){
			dom.content(smsArea,messages.map(function(message){
				var text=E('textarea',{'class':'cbi-input-text',readonly:'readonly',rows:3,style:'width:100%;'},String(message.content || ''));
				var extracted=codeFrom(message.content);
				return E('div',{style:'margin-bottom:12px;'},[E('p',{},String(message.sender)+' · '+new Date(Number(message.timestamp)*1000).toLocaleString(undefined,{timeZone:'UTC'})),text,E('button',{type:'button','class':'cbi-button',click:function(){copy(extracted || String(message.content || ''),text);}},extracted ? _('复制验证码') : _('复制短信'))]);
			}));
		}
		async function pollSms(){
			if(!alive || smsAfter==null)return;
			var watching=smsAfter;
			if(Date.now()>smsDeadline){stopSms();dom.content(smsState,_('本次短信监听已结束，可重新发送验证码。'));return;}
			try{
				await ensureSim();var messages=await smsList(true);
				if(!alive || smsAfter!==watching)return;
				var recent=recentMessages(messages,baseline,watching);renderSms(recent);
				dom.content(smsState,recent.length ? _('仅显示本次发送操作之后的运营商短信，请复制所需验证码。') : _('等待本次发送之后的运营商短信…'));
			}catch(e){if(alive && smsAfter===watching){if(e.code==='SIM_CHANGED'){stopSms();dom.content(smsArea,[]);say(e.message);if(verifyCancel)verifyCancel(e);return;}dom.content(smsState,_('暂时无法读取短信')+': '+e.message);}}
			if(alive && smsAfter===watching)smsTimer=window.setTimeout(pollSms,3000);
		}
		function cooldown(){remaining=60;send.textContent=remaining+' '+_('秒后重发');controls();if(cooldownTimer)window.clearInterval(cooldownTimer);cooldownTimer=window.setInterval(function(){remaining--;send.textContent=remaining>0 ? remaining+' '+_('秒后重发') : _('发送验证码');if(remaining<=0){window.clearInterval(cooldownTimer);cooldownTimer=null;}controls();},1000);}
		function verify(input){
			if(input && (input.requiresApp || input.type==='4'))return Promise.reject(new Error(_('该验证需要在中国联通 App 内手动完成。')));
			if(!input || !input.browserSupported || !verificationUrl(input.url) || !input.id || typeof input.context?.mobile!=='string' || !input.context.mobile)return Promise.reject(new Error(_('运营商返回的验证信息不完整或不支持网页验证。')));
			return new Promise(function(resolve,reject){
				var frame=E('iframe',{src:input.url,title:_('运营商官方身份验证'),referrerpolicy:'no-referrer',style:'display:block;width:100%;height:min(65vh,560px);min-height:340px;border:0;'});
				verifyFrame=frame;var settled=false,timer;
				function context(){if(frame.contentWindow)frame.contentWindow.postMessage(input.context,VERIFY_ORIGIN);}
				function finish(error,token){if(settled)return;settled=true;window.clearTimeout(timer);window.removeEventListener('message',receive);verifyCancel=null;verifyFrame=null;showLogin();if(error)reject(error);else resolve(token);}
				function receive(event){if(!alive || event.origin!==VERIFY_ORIGIN || event.source!==frame.contentWindow)return;var data=event.data;if(!data || typeof data!=='object')return;if(data.code==='myLoad')context();else if(data.code==='0001')finish(new Error(_('已取消运营商身份验证')));else if(data.code==='0000' && typeof data.resultToken==='string' && /^[\x21-\x7e]{1,4096}$/.test(data.resultToken))finish(null,data.resultToken);}
				frame.addEventListener('load',context);window.addEventListener('message',receive);verifyCancel=function(error){finish(error);};
				ui.showModal(_('运营商官方身份验证'),[E('p',{'class':'cbi-value-description'},_('请手动完成验证。此页面由运营商提供，验证完成后返回登录。')),frame,E('div',{'class':'right'},E('button',{type:'button','class':'cbi-button',click:function(){finish(new Error(_('已取消运营商身份验证')));}},_('取消验证')))]);
				timer=window.setTimeout(function(){finish(new Error(_('身份验证已超时，请重试。')));},300000);
			});
		}
		async function post(action,payload){
			await ensureSim();if(!alive)throw new Error(_('登录已取消'));
			var response=await fetch(L.url('admin/modem/unicom_api/gettoken')+'/?action='+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},payload,{config_section:section})),signal:controller.signal});
			var result=await response.json();if(!response.ok)throw new Error(result.msg || _('登录请求失败'));return result;
		}
		async function perform(action){
			if(!alive || busy || (action==='send' && remaining>0))return;
			var number=phone.value.trim(),secret=action==='password' ? password.value : code.value.trim();
			if(!/^1\d{10}$/.test(number)){say(_('请输入 11 位手机号。'));phone.focus();return;}
			if(action==='login' && !/^\d{4,8}$/.test(secret)){say(_('请输入有效的短信验证码。'));code.focus();return;}
			if(action==='password' && (secret.length<8 || secret.length>20)){say(_('请输入 8–20 位联通 App 登录密码。'));password.focus();return;}
			busy=true;controls();say(_('正在处理…'));controller=new AbortController();var request=++generation;
			try{
				var cutoff=null;
				if(action==='send'){
					stopSms();code.value='';dom.content(smsArea,[]);smsPhone=number;
					// sms-tool exposes PDU wall-clock seconds (timegm without its
					// offset). system.info.localtime uses the same router time scale.
					// The post-click snapshot excludes all old IDs, including old
					// messages within this same second or with future timestamps.
					try {var data=await Promise.all([smsList(true),clock()]);baseline=new Set(data[0].map(smsKey));if(!Number.isFinite(data[1].localtime))throw new Error(_('无法读取短信时间'));cutoff=data[1].localtime;}
					catch(e){dom.content(smsState,_('无法确认新短信范围，请在短信页手动查看。')+' '+e.message);}
				}
				var payload={phone:number,deviceId:device};if(action!=='send')payload[action==='password' ? 'password' : 'code']=secret;
				var result=await post(action,payload);
				if(!alive || request!==generation)return;
				for(var attempt=0;result.status==='need_verification' && attempt<3;attempt++){
					var token=await verify(result.verification);
					if(!alive || request!==generation)return;
					result=await post(action,Object.assign({},payload,{operatorVerificationId:result.verification.id,operatorResultToken:token}));
				}
				if(!alive || request!==generation)return;
				if(result.status!=='success')throw new Error(result.msg || _('操作未完成，请重试。'));
				if(action==='send'){say(result.msg || _('验证码已发送。'));cooldown();if(cutoff!=null){smsAfter=cutoff;smsDeadline=Date.now()+300000;pollSms();}}
				else {close(true);if(onSuccess)onSuccess();}
			}catch(e){if(alive && request===generation && e.name!=='AbortError')say(e.message || _('登录请求失败'));}
			finally{if(alive && request===generation){busy=false;controller=null;if(action==='password')password.value='';controls();}}
		}
		mode.value='sms';setMode();showLogin();
		ensureSim().then(function(sim){if(alive && !phone.value && /^1\d{10}$/.test(sim.phone))phone.value=sim.phone;}).catch(function(e){if(alive)say(e.message);});
		window.addEventListener('pagehide',pageExit);
		if(window.MutationObserver){observer=new window.MutationObserver(function(){if(alive && (!document.body.classList.contains('modal-overlay-active') || (!body.isConnected && !(verifyFrame && verifyFrame.isConnected))))close(false);});observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});}
		return {close:function(){close(true);}};
	}
});
