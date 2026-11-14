'use strict';
'require ui';
'require dom';
'require qmodem.telecom-sms as telecomSms';
return L.Class.extend({
 open:function open(section,onLogin,options){
  var smsOnly=!options || options.smsOnly!==false;
  var session='',authSession='',closed=false,pending=false,sent=false,hasShared=false,verifying=false,observer=null;
  var phone=E('input',{type:'tel',maxlength:11,'class':'cbi-input-text',autocomplete:'off'});
  var password=E('input',{type:'password',maxlength:6,'class':'cbi-input-text',autocomplete:'off'});
  var device=E('input',{type:'text',maxlength:256,'class':'cbi-input-text',autocomplete:'off'});
  var status=E('div',{'class':'cbi-value-description'});
  var code=E('input',{type:'text',maxlength:6,inputmode:'numeric',autocomplete:'one-time-code','class':'cbi-input-text',disabled:true});
  var sms=telecomSms.create(section,function(error){cleanup();ui.hideModal();ui.addNotification(null,E('p',{},error.message));});
  function restore(){verifying=false;if(!closed)ui.showModal(_('中国电信登录'),[root]);}
  function dropAuth(){sms.reset();if(authSession)request({action:'logout',session_id:authSession}).catch(function(){});authSession='';sent=false;code.value='';code.disabled=true;bind.disabled=true;phone.disabled=false;}
  function image(value){
   if(typeof value!=='string' || value.length>1500000)throw new Error(_('验证图片异常'));
   if(/^[A-Za-z0-9+/=\r\n]+$/.test(value))return 'data:image/png;base64,'+value;
   if(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(value))return value;
   throw new Error(_('验证图片格式不支持'));
  }
  function challengeDialog(challenge){
   var geometry=null,start=null,end=null,track=[];
   var background=E('img',{src:image(challenge.background_img),alt:_('电信验证背景'),style:'display:block;width:100%;'});
   var piece=E('img',{src:image(challenge.slider_img),alt:_('手动拖动的拼图'),style:'position:absolute;top:0;pointer-events:none;'});
   var range=E('input',{type:'range',min:0,max:1000,value:0,step:1,disabled:true,style:'display:block;width:100%;box-sizing:border-box;margin:12px 0 0;','aria-label':_('手动拖动拼图滑块')});
   var hint=E('div',{'class':'cbi-value-description'},_('请手动拖动滑块，将拼图对齐缺口，再点击“验证并发送”。'));
   function move(){if(!geometry)return;var scale=background.clientWidth/background.naturalWidth;piece.style.width=(piece.naturalWidth*scale)+'px';piece.style.left=(Number(range.value)/1000*geometry.travel-geometry.left)*scale+'px';}
   range.addEventListener('pointerdown',function(){start=Date.now();track=[];end=null;});
   range.addEventListener('keydown',function(){if(!start)start=Date.now();});
   range.addEventListener('input',function(){if(!start)start=Date.now();end=Date.now();if(track.length<200)track.push((Number(range.value)/1000).toFixed(3)+'#0.000#'+end);move();submit.disabled=false;});
   var submit=E('button',{type:'button','class':'cbi-button cbi-button-action',disabled:true,click:function(){
    if(pending || !start || !end || !track.length)return;
    pending=true;submit.disabled=true;range.disabled=true;
    var snapshot=null;
    sms.snapshot().then(function(value){snapshot=value;if(closed)throw new Error(_('登录已关闭'));return request({action:'send_sms',session_id:authSession,distance:Number(range.value)/1000,track:track.join('%'),start_time:start,end_time:end});}).then(function(){
     if(closed)return;sent=true;code.disabled=false;bind.disabled=false;dom.content(status,smsOnly ? _('短信已发送，请输入验证码并登录。') : _('短信已发送，请输入验证码并点击“授权设备”。'));restore();sms.start(snapshot);
    }).catch(function(error){if(!closed)dom.content(hint,error.message+_('；请取消后重新获取验证。'));}).finally(function(){pending=false;});
   }},_('验证并发送'));
   var cancel=E('button',{type:'button','class':'cbi-button',click:function(){if(pending)return;dropAuth();restore();}},_('取消验证'));
   verifying=true;ui.showModal(_('电信官方滑块验证'),[E('div',{style:'width:100%;max-width:360px;margin:auto;'},[E('div',{style:'position:relative;overflow:hidden;'},[background,piece]),range]),hint,E('div',{'class':'right'},[cancel,submit])]);
   Promise.all([background.decode(),piece.decode()]).then(function(){
    if(closed)return;
    // Only inspect transparent margins; the user locates and solves the puzzle.
    var canvas=document.createElement('canvas');canvas.width=piece.naturalWidth;canvas.height=piece.naturalHeight;
    var ctx=canvas.getContext('2d');ctx.drawImage(piece,0,0);var pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,left=canvas.width,right=-1;
    for(var x=0;x<canvas.width;x++)for(var y=0;y<canvas.height;y++)if(pixels[(y*canvas.width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);}
    if(right<left || background.naturalWidth<=right-left+1)throw new Error(_('验证图片尺寸异常'));
    geometry={left:left,travel:background.naturalWidth-(right-left+1)};range.disabled=false;move();
   }).catch(function(error){if(!closed)dom.content(hint,error.message);});
  }
  var authorize=E('button',{type:'button','class':'cbi-button',click:function(){
   if(pending || closed)return;
   if(!/^1[0-9]{10}$/.test(phone.value.trim())){dom.content(status,_('请输入 11 位电信手机号'));return;}
   dropAuth();if(session){request({action:'logout',session_id:session}).catch(function(){});session='';}pending=true;authorize.disabled=true;phone.disabled=true;device.value='';dom.content(status,_('正在获取官方验证…'));
   request({action:'challenge',phone:phone.value.trim()}).then(function(data){
    if(closed){request({action:'logout',session_id:data.session_id}).catch(function(){});return;}
    authSession=data.session_id;challengeDialog(data.challenge);
   }).catch(function(error){if(!closed){dropAuth();dom.content(status,error.message);}}).finally(function(){pending=false;authorize.disabled=false;});
  }},smsOnly ? _('获取验证码') : _('短信授权 DeviceId'));
  var bind=E('button',{type:'button','class':'cbi-button cbi-button-action',disabled:true,click:function(){
   if(pending || closed || !sent)return;
   if(!/^[0-9]{6}$/.test(code.value)){dom.content(status,_('请输入 6 位短信验证码'));return;}
   pending=true;bind.disabled=true;
   var payload={action:'authorize',session_id:authSession,code:code.value};code.value='';
   request(payload).then(function(data){if(closed)return;sms.reset();device.value=data.device_id;authSession='';sent=false;code.disabled=true;phone.disabled=false;dom.content(status,_('短信设备授权成功，DeviceId 已填入。请使用服务密码点击“登录”。'));}).catch(failure).finally(function(){payload.code='';pending=false;if(!closed)bind.disabled=!sent;});
  }},_('授权设备'));
  function field(label,input){return E('div',{'class':'cbi-value'},[E('label',{'class':'cbi-value-title'},label),E('div',{'class':'cbi-value-field'},input)]);}
  function request(data){return fetch(L.url('admin/modem/unicom_api/telecom_test')+'/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({config_section:section},data))}).then(function(response){return response.json().then(function(data){if(!response.ok || !data.ok)throw new Error(data.msg || _('电信查询失败'));return data;});});}
  function query(){return request(smsOnly && session ? {action:'usage',session_id:session} : {action:'shared_usage',refresh:true}).then(function(data){if(!closed){hasShared=true;leave();if(onLogin)onLogin(data);}});}
  function finish(){pending=false;if(!closed){login.disabled=false;refresh.disabled=!(hasShared || smsOnly && session);}}
  function failure(error){if(!closed)dom.content(status,error.message);}
  var login=E('button',{type:'button','class':'cbi-button cbi-button-action',click:function(){
   if(pending || closed)return;
   if(smsOnly){
    if(!session && (!sent || !/^[0-9]{6}$/.test(code.value))){dom.content(status,_('请先获取短信验证码，再输入 6 位验证码登录。'));return;}
    pending=true;login.disabled=true;refresh.disabled=true;
    if(session){query().catch(failure).finally(finish);return;}
    dom.content(status,_('正在使用短信验证码登录…'));
    var smsPayload={action:'sms_login',session_id:authSession,code:code.value,shared:true};code.value='';
    request(smsPayload).then(function(data){if(closed){request({action:'logout',session_id:data.session_id}).catch(function(){});return;}session=data.session_id;authSession='';sent=false;sms.reset();dom.content(status,_('短信登录成功，正在查询流量…'));return query();}).catch(failure).finally(function(){smsPayload.code='';finish();});return;
   }
   pending=true;login.disabled=true;refresh.disabled=true;dom.content(status,_('正在登录电信…'));
   var old=session;session='';if(old)request({action:'logout',session_id:old}).catch(function(){});
   var promise=request({action:'login',shared:true,phone:phone.value.trim(),password:password.value,device_id:device.value.trim()});password.value='';
   promise.then(function(data){if(closed){request({action:'logout',session_id:data.session_id});return;}session=data.session_id;dom.content(status,_('登录成功，正在查询…'));return query();}).catch(failure).finally(finish);
  }},_('登录'));
  var refresh=E('button',{type:'button','class':'cbi-button',disabled:true,click:function(){if(pending)return;pending=true;login.disabled=true;refresh.disabled=true;query().catch(failure).finally(finish);}},_('刷新'));
  function cleanup(){if(closed)return;closed=true;if(observer)observer.disconnect();dropAuth();sms.close();password.value='';device.value='';if(session)request({action:'logout',session_id:session}).catch(function(){});session='';window.removeEventListener('hashchange',leave);window.removeEventListener('pagehide',cleanup);}
  function leave(){cleanup();ui.hideModal();}
  window.addEventListener('hashchange',leave);window.addEventListener('pagehide',cleanup);
  var close=E('button',{type:'button','class':'cbi-button',click:leave},_('关闭'));
  var switchMode=E('button',{type:'button','class':'cbi-button',click:function(){if(pending)return;leave();open(section,onLogin,{forceLogin:true,smsOnly:!smsOnly});}},smsOnly ? _('改用服务密码登录') : _('改用短信验证码登录'));
  var root=E('div',{},[
   E('p',{},smsOnly ? _('完成滑块验证并获取短信验证码后登录，无需服务密码。') : _('先点击“短信授权 DeviceId”，手动完成官方验证和短信授权，再用服务密码登录查询。密码不保存；查询会话保存在路由器，供已登录 LuCI 的浏览器共享，登出时清除。')),
   field(_('电信手机号'),phone),field(smsOnly ? _('官方验证') : _('设备授权'),authorize),field(_('短信验证码'),smsOnly ? code : [code,bind])
  ].concat(smsOnly ? [] : [field(_('短信授权 DeviceId'),device),field(_('服务密码'),password)]).concat([
   sms.node,
   E('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;'},[login,refresh,switchMode]),status,
   E('div',{'class':'right'},close)
  ]));restore();
  phone.addEventListener('input',function(){if(!pending){dropAuth();device.value='';}});
  if(window.MutationObserver){observer=new window.MutationObserver(function(){if(!closed && (!document.body.classList.contains('modal-overlay-active') || (!root.isConnected && !verifying)))cleanup();});observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});}
  if(!options || !options.forceLogin){
   pending=true;login.disabled=true;
   request({action:'shared_status'}).then(function(data){if(!closed && data.logged_in)return query();}).catch(failure).finally(finish);
  }
  return {close:leave};
 }
});
