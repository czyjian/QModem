'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/qmodem/carrier-login.js'),'utf8');
function element(tag,attrs={},children){return {tag,attrs,children,style:{},value:attrs.value || '',listeners:{},contentWindow:tag==='iframe'?{postMessage(){}}:null,addEventListener(name,handler){this.listeners[name]=handler;},focus(){},select(){}};}
function flatten(node){if(!node)return[];if(Array.isArray(node))return node.flatMap(flatten);if(typeof node!=='object')return[];return[node,...flatten(node.children)];}
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(){
  let modal=null,sim='460011234567890',queries=0,successes=0;
  const events={},requests=[],responses=[],sms=[];
  const ui={showModal(title,children){modal={title,children};return modal;},hideModal(){modal=null;}};
  const window={crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,addEventListener(name,fn){events[name]=fn;},removeEventListener(name,fn){if(events[name]===fn)delete events[name];}};
  const rpc={declare(spec){if(spec.object==='system')return async()=>({localtime:1000});if(spec.method==='sync')return async()=>({status:'success'});return async()=>{queries++;return{status:'success',mode:'database_push',messages:sms.shift() || []};};}};
  const qmodem={getSimInfo:async()=>({modem_info:[{key:'SIM Status',value:'ready'},{key:'IMSI',value:sim},{key:'SIM Number',value:'8613800000000'}]})};
  const api=new Function('L','E','_','ui','dom','rpc','qmodem','window','fetch',source)(
    {Class:{extend:v=>v},url:v=>'/cgi-bin/luci/'+v},element,v=>v,ui,{content:(node,children)=>{node.children=children;}},rpc,qmodem,window,
    async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});return{ok:true,json:async()=>responses.shift()};});
  return {api,events,requests,responses,sms,open(){return api.open('2_1',()=>successes++);},get modal(){return modal;},get queries(){return queries;},get successes(){return successes;},set sim(value){sim=value;},nodes(){return flatten(modal?.children);},button(text){return flatten(modal?.children).find(n=>n.tag==='button' && n.children===text);}};
}
(async()=>{
  const first=setup(),api=first.api;
  assert(api.verificationUrl('https://img.client.10010.com/loginRisk/index.html#x'));
  for(const url of ['https://evil.invalid/loginRisk/index.html','javascript:alert(1)','https://user:password@img.client.10010.com/loginRisk/index.html'])assert(!api.verificationUrl(url));
  assert.equal(api.codeFrom('验证码：123456，请勿泄漏'),'123456');assert.equal(api.codeFrom('验证码：123456789'), '');
  const old={id:1,type:'received',sender:'10010',timestamp:2000,content:'old secret'},fresh={id:2,type:'received',sender:'10010',timestamp:1001,content:'验证码：654321【中国联通】'};
  const baseline=new Set([api.smsKey(old)]);
  assert.deepEqual(api.recentMessages([old,fresh,{...fresh,id:3,timestamp:999},{...fresh,id:4,sender:'12345',content:'private message'},{...fresh,id:5,type:'sent'},{...fresh,id:6,complete:0}],baseline,1000),[fresh]);
  const session=first.open();await flush();assert.equal(first.queries,0,'opening the login dialog must not read SMS history');
  first.sms.push([old],[old,fresh]);
  first.responses.push({status:'need_verification',verification:{id:'test-challenge',type:'10',browserSupported:true,url:'https://img.client.10010.com/loginRisk/index.html#test',context:{mobile:'encrypted-test-phone'}}},{status:'success',msg:'验证码已发送'},{status:'success'});
  first.button('发送验证码').attrs.click();await flush();
  assert.equal(first.modal.title,'运营商官方身份验证');assert.equal(first.requests.length,1);
  const frame=first.nodes().find(n=>n.tag==='iframe');
  first.events.message({origin:'https://evil.invalid',source:frame.contentWindow,data:{code:'0000',resultToken:'untrusted'}});await flush();assert.equal(first.requests.length,1);
  first.events.message({origin:'https://img.client.10010.com',source:{},data:{code:'0000',resultToken:'wrong-window'}});await flush();assert.equal(first.requests.length,1);
  first.events.message({origin:'https://img.client.10010.com',source:frame.contentWindow,data:{code:'0000',resultToken:'valid-manual-result'}});await flush();
  assert.equal(first.modal.title,'运营商登录');assert.equal(first.requests[1].payload.operatorVerificationId,'test-challenge');assert.equal(first.requests[1].payload.operatorResultToken,'valid-manual-result');
  const text=JSON.stringify(first.modal);assert(text.includes('654321'));assert(!text.includes('old secret'));
  const code=first.nodes().find(n=>n.attrs.autocomplete==='one-time-code');assert.equal(code.value,'','SMS is displayed for the user, not automatically submitted');
  code.value='654321';first.button('登录').attrs.click();await flush();assert.equal(first.successes,1);assert.equal(first.modal,null);assert.equal(first.events.message,undefined);session.close();

  const cancel=setup(),cancelSession=cancel.open();await flush();cancel.sms.push([]);cancel.responses.push({status:'need_verification',verification:{id:'cancel-me',browserSupported:true,url:'https://img.client.10010.com/loginRisk/index.html',context:{mobile:'encrypted'}}});
  cancel.button('发送验证码').attrs.click();await flush();cancel.button('取消验证').attrs.click();await flush();assert.equal(cancel.modal.title,'运营商登录');assert.equal(cancel.requests.length,1);cancelSession.close();assert.equal(cancel.modal,null);

  const swap=setup(),swapSession=swap.open();await flush();swap.sim='460019999999999';const codeInput=swap.nodes().find(n=>n.attrs.autocomplete==='one-time-code');codeInput.value='123456';swap.button('登录').attrs.click();await flush();assert.equal(swap.requests.length,0,'do not login using a SIM that changed while the dialog was open');assert(JSON.stringify(swap.modal).includes('SIM 卡已更换'));swapSession.close();
  console.log('PASS: native login, post-send SMS filtering, manual verification origin/window checks, cancellation, SIM binding and cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
