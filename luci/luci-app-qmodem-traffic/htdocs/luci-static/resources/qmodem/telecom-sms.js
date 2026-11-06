'use strict';
'require rpc';
'require dom';
'require qmodem.qmodem as qmodem';
'require qmodem.carrier-login as carrierLogin';

var listSms=rpc.declare({object:'qmodem.sms',method:'list',params:['modem_id','limit','offset'],expect:{}});
var syncSms=rpc.declare({object:'qmodem.sms',method:'sync',params:['modem_id'],expect:{}});
var clock=rpc.declare({object:'system',method:'info',expect:{}});
return L.Class.extend({
 create:function(section,onChanged){
  var alive=true,timer=null,version=0,after=null,baseline=new Set(),deadline=0,identity='';
  var state=E('p',{'class':'cbi-value-description'},_('发送验证码后，仅显示本次操作之后收到的电信短信。')),messages=E('div');
  async function sim(){
   var data=await qmodem.getSimInfo(section),fields={};
   ((data && data.modem_info) || []).forEach(function(item){fields[item.key]=String(item.value || '').trim();});
   var key=fields.IMSI || fields.ICCID || '';
   if(fields['SIM Status']!=='ready' || !/^\d{10,32}$/.test(key) || (identity && identity!==key)){
    var error=new Error(_('SIM 卡已更换或尚未就绪，请重新打开登录。'));error.simChanged=true;throw error;
   }
   identity=key;
  }
  async function list(){
   var data=await listSms(section,100,0);
   if(data.status==='error')throw new Error(data.error || _('短信读取失败'));
   if(data.mode==='database_poll'){
    var sync=await syncSms(section);if(sync.status==='error')throw new Error(sync.error || _('短信同步失败'));
    data=await listSms(section,100,0);
   }
   if(data.status==='error')throw new Error(data.error || _('短信读取失败'));
   return data.messages || data.msg || data.received || [];
  }
  function stop(){version++;if(timer)window.clearTimeout(timer);timer=null;after=null;}
  function render(rows){dom.content(messages,rows.map(function(message){
   var text=String(message.content || ''),match=text.match(/验证码[\s:：为是【\[]*([0-9]{4,8})(?![0-9])/) || text.match(/(?:^|[^0-9])([0-9]{6})(?![0-9])/),value=match ? match[1] : text;
   var input=E('textarea',{'class':'cbi-input-text',readonly:'readonly',rows:3,style:'width:100%;'},text);
   function select(){input.focus();input.select();dom.content(state,_('请手动复制已选中的短信。'));}
   var copy=E('button',{type:'button','class':'cbi-button',click:function(){
    if(navigator.clipboard && navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(function(){if(alive)dom.content(state,_('已复制，可粘贴到验证码框。'));}).catch(select);
    else {var temporary=E('textarea',{readonly:'readonly',style:'position:fixed;left:-9999px;'},value);document.body.appendChild(temporary);temporary.select();try{if(document.execCommand('copy'))dom.content(state,_('已复制，可粘贴到验证码框。'));else select();}catch(e){select();}finally{temporary.remove();}}
   }},match ? _('复制验证码') : _('复制短信'));
   return E('div',{style:'margin-bottom:12px;'},[E('p',{},String(message.sender)+' · '+new Date(Number(message.timestamp)*1000).toLocaleString(undefined,{timeZone:'UTC'})),input,copy]);
  }));}
  async function poll(){
   if(!alive || after==null)return;
   var watching=version;
   if(Date.now()>deadline){stop();dom.content(state,_('本次短信监听已结束，请在短信页查看。'));return;}
   try{
    await sim();var all=await list();if(!alive || version!==watching)return;
    var recent=carrierLogin.recentMessages(all,baseline,after,'telecom');render(recent);
    dom.content(state,recent.length ? _('仅显示本次发送操作之后的电信短信，请复制验证码。') : _('等待本次发送之后的电信短信…'));
   }catch(error){if(!alive || version!==watching)return;if(error.simChanged){stop();dom.content(messages,[]);if(onChanged)onChanged(error);return;}dom.content(state,_('暂时无法读取短信')+': '+error.message);}
   if(alive && version===watching)timer=window.setTimeout(poll,3000);
  }
  return {
   node:E('fieldset',{'class':'cbi-section'},[E('legend',{},_('本次验证码短信')),state,messages]),
   snapshot:async function(){
    stop();dom.content(messages,[]);await sim();var expected=version;
    try{var data=await Promise.all([list(),clock()]);if(!alive || expected!==version)return null;if(!Number.isFinite(data[1].localtime))throw new Error(_('无法读取短信时间'));baseline=new Set(data[0].map(carrierLogin.smsKey));return {time:data[1].localtime,version:expected};}
    catch(error){if(alive)dom.content(state,_('无法确认新短信范围，请在短信页手动查看。'));return null;}
   },
   start:function(snapshot){if(!alive || !snapshot || snapshot.version!==version)return;after=snapshot.time;deadline=Date.now()+300000;poll();},
   reset:function(){stop();dom.content(messages,[]);},
   close:function(){alive=false;stop();dom.content(messages,[]);}
  };
 }
});
