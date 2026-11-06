'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const base=path.join(__dirname,'../htdocs/luci-static/resources/qmodem/');
const element=(tag,attrs={},children)=>({tag,attrs,children,style:{},value:attrs.value || '',addEventListener(){},focus(){},select(){}});
let modal=null,callback=0,closed=0,requests=[];
const ui={showModal:(title,children)=>modal={title,children},hideModal:()=>{closed++;modal=null;}};
const dom={content:(node,children)=>node.children=children};
const flush=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
const nodes=n=>!n || typeof n!=='object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n,...nodes(n.children)];
const sms={node:element('fieldset',{},'本次验证码短信'),reset(){},close(){}};
const api=new Function('L','E','_','ui','dom','telecomSms','window','fetch',fs.readFileSync(base+'telecom-test.js','utf8'))(
 {Class:{extend:x=>x},url:x=>x},element,x=>x,ui,dom,{create:()=>sms},{addEventListener(){},removeEventListener(){}},
 async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>body.action==='shared_status' ? {ok:true,logged_in:false} : body.action==='login' ? {ok:true,session_id:'fixture'} : {ok:true,total_mb:2048,remaining_mb:1024}};}
);
(async()=>{
 api.open('2_1',()=>callback++);await flush();
 assert.equal(modal.title,'中国电信登录');
 assert(nodes(modal.children).some(n=>n===sms.node));
 const login=nodes(modal.children).find(n=>n.tag==='button' && n.children==='登录');
 login.attrs.click();await flush();
 assert.equal(callback,1);assert.equal(closed,1);assert.equal(modal,null);
 assert(requests.some(r=>r.action==='login' && r.shared===true));
 assert(requests.some(r=>r.action==='shared_usage'));
 assert(!requests.some(r=>r.action==='shared_logout'),'closing dialog must retain shared login');
 console.log('PASS: telecom login includes SMS monitor, closes on success and refreshes parent without logging out shared session');
})().catch(e=>{console.error(e);process.exitCode=1;});
