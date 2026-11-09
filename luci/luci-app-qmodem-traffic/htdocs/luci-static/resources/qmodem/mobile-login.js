'use strict';
'require ui';
'require dom';
'require qmodem.telecom-sms as smsMonitor';
return L.Class.extend({
 open:function(section,onSuccess){
  var closed=false,busy=false,session='',sent=false,observer=null,sendBlocked=false,retryUntil=0,retryTimer=null;
  var phone=E('input',{type:'tel',maxlength:11,'class':'cbi-input-text',autocomplete:'tel','aria-label':_('移动手机号')});
  var captcha=E('input',{type:'text',maxlength:12,'class':'cbi-input-text',autocomplete:'off','aria-label':_('图片验证码')});
  var code=E('input',{type:'text',maxlength:6,inputmode:'numeric','class':'cbi-input-text',autocomplete:'one-time-code','aria-label':_('短信验证码')});
  var image=E('img',{alt:_('中国移动官方图片验证码'),style:'display:none;max-width:180px;max-height:80px;cursor:pointer;'});
  var note=E('p',{'class':'cbi-value-description',role:'status','aria-live':'polite'});
  function request(data){return fetch(L.url('admin/modem/unicom_api/mobile')+'/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({config_section:section},data))}).then(function(response){return response.json().then(function(value){if(!response.ok || !value.ok){var error=new Error(value.msg || _('移动请求未完成'));error.canRetry=value.can_retry===true;error.retryAfter=Number(value.retry_after) || 0;throw error;}return value;});});}
  function controls(){if(closed)return;var remaining=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));phone.disabled=busy || !!session;captcha.disabled=busy || !session || sent;get.disabled=busy;send.disabled=busy || !session || sent || sendBlocked || remaining>0;login.disabled=busy || !sent;code.disabled=busy || !sent;dom.content(send,remaining>0 ? remaining+_(' 秒后可重试') : _('发送验证码'));if(!remaining && retryTimer){window.clearInterval(retryTimer);retryTimer=null;}}
  function forget(){if(retryTimer)window.clearInterval(retryTimer);retryTimer=null;retryUntil=0;sendBlocked=false;sms.reset();if(session)request({action:'cancel',session_id:session}).catch(function(){});session='';sent=false;code.value='';captcha.value='';image.style.display='none';controls();}
  var sms=smsMonitor.create(section,function(error){close();ui.addNotification(null,E('p',{},error.message));},'mobile');
  var get=E('button',{type:'button','class':'cbi-button',click:function(){
   if(busy || closed)return;
   if(!/^1[0-9]{10}$/.test(phone.value.trim())){dom.content(note,_('请输入 11 位移动手机号。'));return;}
   forget();busy=true;controls();dom.content(note,_('正在获取移动官方图片验证…'));
   request({action:'challenge',phone:phone.value.trim()}).then(function(data){if(closed){request({action:'cancel',session_id:data.session_id}).catch(function(){});return;}session=data.session_id;
    if(typeof data.image!=='string' || !/^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(data.image))throw new Error(_('移动验证图片格式不支持'));
    image.src=data.image;image.style.display='';dom.content(note,_('请手动输入图片中的字符，再点击“发送验证码”。点击图片可刷新。'));
   }).catch(function(error){if(!closed)dom.content(note,error.message);}).finally(function(){busy=false;controls();});
  }},_('获取图片验证'));
  image.addEventListener('click',function(){if(!busy)get.click();});
  var send=E('button',{type:'button','class':'cbi-button',disabled:true,click:function(){
   if(busy || closed || !session || sent || sendBlocked || retryUntil>Date.now())return;
   if(!captcha.value.trim()){dom.content(note,_('请填写图片验证码。'));return;}
   busy=true;controls();var snapshot=null;
   sms.snapshot().then(function(value){snapshot=value;if(closed)throw new Error(_('登录已关闭'));return request({action:'send',session_id:session,captcha:captcha.value.trim()});}).then(function(){if(closed)return;sent=true;dom.content(note,_('短信已发送，请复制本次收到的移动验证码并登录。'));sms.start(snapshot);}).catch(function(error){if(!closed){
    sendBlocked=!error.canRetry;
    if(error.retryAfter>0){retryUntil=Date.now()+Math.min(3600,error.retryAfter)*1000;if(retryTimer)window.clearInterval(retryTimer);retryTimer=window.setInterval(controls,1000);}
    // Retain both the official image and the user's transcription. Only an
    // explicit image refresh or closing the dialog clears the challenge.
    dom.content(note,error.message+_('；图片和填写内容已保留。'));
   }}).finally(function(){busy=false;controls();});
  }},_('发送验证码'));
  var login=E('button',{type:'button','class':'cbi-button cbi-button-apply',disabled:true,click:function(){
   if(busy || closed || !sent)return;
   if(!/^[0-9]{6}$/.test(code.value)){dom.content(note,_('请输入 6 位短信验证码。'));return;}
   busy=true;controls();var payload={action:'login',session_id:session,code:code.value};code.value='';dom.content(note,_('正在登录移动…'));
   request(payload).then(function(){if(closed)return;close();if(onSuccess)onSuccess();}).catch(function(error){if(!closed)dom.content(note,error.message);}).finally(function(){payload.code='';busy=false;controls();});
  }},_('登录'));
  function close(){if(closed)return;closed=true;if(observer)observer.disconnect();forget();sms.close();phone.value='';window.removeEventListener('hashchange',close);window.removeEventListener('pagehide',close);ui.hideModal();}
  function field(label,input){return E('div',{'class':'cbi-value'},[E('label',{'class':'cbi-value-title'},label),E('div',{'class':'cbi-value-field'},input)]);}
  var root=E('div',{},[E('p',{},_('中国移动短信登录。图片验证由用户手动完成，登录会话保存在路由器，供其他已登录 LuCI 的浏览器共享。')),field(_('移动手机号'),phone),field(_('官方图片验证'),[image,get]),field(_('图片验证码'),captcha),field(_('短信验证码'),[code,send]),sms.node,note,E('div',{'class':'right'},[E('button',{type:'button','class':'cbi-button',click:close},_('取消')),' ',login])]);
  ui.showModal(_('中国移动登录'),[root]);controls();
  window.addEventListener('hashchange',close);window.addEventListener('pagehide',close);
  if(window.MutationObserver){observer=new window.MutationObserver(function(){if(!closed && (!document.body.classList.contains('modal-overlay-active') || !root.isConnected))close();});observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});}
  return {close:close};
 }
});
