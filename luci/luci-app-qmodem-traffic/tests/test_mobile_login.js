'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../htdocs/luci-static/resources/qmodem/mobile-login.js'),'utf8');
const E=(tag,attrs={},children)=>({tag,attrs,children,style:{},value:'',addEventListener(){},click(){this.attrs.click();}});
const all=n=>!n || typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(all):[n,...all(n.children)];
let modal=null,callbacks=0,snapshots=0,starts=0,failSend=false;
const requests=[],sms={node:E('fieldset',{},'本次验证码短信'),reset(){},close(){},snapshot:async()=>{snapshots++;return {};},start:()=>starts++};
const ui={showModal:(title,children)=>modal={title,children},hideModal:()=>modal=null};
const api=new Function('L','E','_','ui','dom','smsMonitor','window','fetch',source)(
 {Class:{extend:x=>x},url:x=>x},E,x=>x,ui,{content:(n,c)=>n.children=c},{create:(s,cb,carrier)=>{assert.equal(carrier,'mobile');return sms;}},{addEventListener(){},removeEventListener(){},setInterval(){return 1;},clearInterval(){}},async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>body.action==='send' && failSend?{ok:false,code:'SMS_1',msg:'请等待60秒',can_retry:true,retry_after:60}:body.action==='challenge'?{ok:true,session_id:'fixture',image:'data:image/png;base64,Zml4dHVyZQ=='}:{ok:true}};});
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const button=text=>all(modal.children).find(n=>n.tag==='button' && n.children===text);
const input=label=>all(modal.children).find(n=>n.tag==='input' && n.attrs['aria-label']===label);
(async()=>{
 api.open('2_1',()=>callbacks++);assert.equal(modal.title,'中国移动登录');input('移动手机号').value='13000000000';button('获取图片验证').attrs.click();await flush();assert(requests.some(r=>r.action==='challenge'));
 input('图片验证码').value='123456';button('发送验证码').attrs.click();await flush();assert.equal(snapshots,1);assert.equal(starts,1);assert(requests.some(r=>r.action==='send' && r.captcha==='123456'));
 input('短信验证码').value='654321';button('登录').attrs.click();await flush();assert.equal(callbacks,1);assert.equal(modal,null);assert(!requests.some(r=>r.action==='logout'));
 failSend=true;const start=requests.length;api.open('2_1',()=>callbacks++);input('移动手机号').value='13000000000';button('获取图片验证').attrs.click();await flush();
 input('图片验证码').value='123456';const image=all(modal.children).find(n=>n.tag==='img'),original=image.src,send=button('发送验证码');send.attrs.click();await flush();
 assert.equal(input('图片验证码').value,'123456');assert.equal(image.src,original);assert.equal(image.style.display,'');assert.equal(send.disabled,true);
 assert(!requests.slice(start).some(r=>r.action==='cancel'),'sending failure must retain the existing captcha session');
 button('取消').attrs.click();await flush();assert.equal(modal,null);
 console.log('PASS: mobile native login shows manual captcha and SMS monitor, snapshots on send, closes and refreshes parent after SSO');
})().catch(e=>{console.error(e);process.exitCode=1;});
