import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {createMobileUpstream,allowedMobileUrl,validMobileJar,mobileCookieHeader,mobileSummary,decodeMobile,encryptMobile} from '../src/upstream/mobile.js';
const cookie={name:'cmccssotoken',value:'fixture',domain:'10086.cn',hostOnly:false,path:'/',expires:Date.now()+60000};
const response=(data,status=200)=>({status,body:Buffer.from(JSON.stringify(data)),type:'application/json'});
test('mobile transport bounds SSO destinations and scopes cookies to domains and paths',()=>{
 for(const url of ['http://login.10086.cn','https://login.10086.cn.evil.invalid','https://user:secret@login.10086.cn','https://127.0.0.1','https://login.10086.cn:8443'])assert.equal(allowedMobileUrl(url),false);
 assert(allowedMobileUrl('https://shop.10086.cn/i/'));
 assert(validMobileJar([cookie]));assert(!validMobileJar([{...cookie,domain:'evil.invalid'}]));assert(!validMobileJar([{...cookie,name:null}]));
 assert.equal(mobileCookieHeader([{...cookie,domain:'login.10086.cn',hostOnly:true}],'https://wx.10086.cn/website/'),'');
 assert.equal(mobileCookieHeader([{...cookie,path:'/private'}],'https://wx.10086.cn/private-other'),'');
 assert.equal(Buffer.from(encryptMobile('fixture'),'base64').length,256);
});
test('normalizes MB/GB, unknown total and AES-encrypted query results',()=>{
 const data={data:{resultData:{planRemainFlowInfo:{totalInfo:{unit:'03',sumNum:'11264',usedNum:'1124',remainNum:'10140'},planRemian:{unit:'04',sumNum:'10',usedNum:'1',remainNum:'9'}}}}};
 const result=mobileSummary(data);assert.equal(result.total_mb,11264);assert.equal(result.remaining_mb,10140);assert.equal(result.details[0].total_mb,10240);
 assert.equal(mobileSummary({}).ok,false);
 const cipher=createCipheriv('aes-128-cbc',Buffer.from('1234123412ABCDEF'),Buffer.from('ABCDEF1234123412'));const hex=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]).toString('hex');assert.deepEqual(decodeMobile(hex),data);assert.equal(decodeMobile('maintenance page'),null);
});
test('matches current official SMS request names, verifies image first, then uses SSO without leaking challenge secrets',async()=>{
 const calls=[];
 const api=createMobileUpstream({encrypt:v=>'rsa:'+v,request:async(jar,url,options={})=>{
  calls.push({url,...options});
  if(url.includes('captchazh'))return {status:200,type:'image/png',body:Buffer.from('fixture-image')};
  if(url.endsWith('/verifyCaptcha.htm'))return response({resultCode:0});
  if(url.endsWith('/chkNumberAction.action'))return response(true);
  if(url.endsWith('/loadToken.action'))return response({result:'fixture-token'});
  if(url.endsWith('/sendRandomCodeAction.action'))return response(0);
  if(url.endsWith('/login.htm'))return response({result:'0',islocal:true});
  if(url==='https://shop.10086.cn/i/?f=home')jar.push(cookie);
  return response({});
 }});
 const challenge=await api.challenge('13000000000');assert(challenge.ok);
 assert(calls.some(c=>c.url.includes('/loadSendflag.htm?')));assert(calls.some(c=>c.url.endsWith('/checkUidAvailable.action')));
 const sent=await api.send(challenge.state,'123456');assert(sent.ok);
 assert.equal(calls.find(c=>c.url.endsWith('/chkNumberAction.action')).form.loginMode,'01');
 const sms=calls.find(c=>c.url.endsWith('/sendRandomCodeAction.action'));
 assert.deepEqual(sms.form,{userName:'rsa:13000000000',inputCode:'rsa:123456',type:'01',channelID:'12003'});
 assert.equal(sms.headers['Xa-before'],'fixture-token');
 const result=await api.login(sent.state,'654321','123456');assert(result.ok);assert(validMobileJar(result.credentials.jar));
 const login=calls.find(c=>c.url.endsWith('/login.htm'));assert.equal(login.form.pwdType,'02');assert.equal(login.form.password,'rsa:654321');
});
test('query HTTP 403 is a blocked query, not an expired session',async()=>{
 const api=createMobileUpstream({request:async()=>response({},403)});
 assert.deepEqual(await api.usage({phone:'13000000000',jar:[cookie]}),{ok:false,code:'QUERY_BLOCKED'});
});
