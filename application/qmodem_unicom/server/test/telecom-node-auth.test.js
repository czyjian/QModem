import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDecipheriv} from 'node:crypto';
import {createTelecomUpstream,encryptLogin,encryptSlider} from '../src/upstream/telecom-node.js';
const expected=JSON.parse(readFileSync(new URL('./fixtures/telecom-auth-vectors.json',import.meta.url),'utf8'));
test('all auth bodies and slider AES ciphertexts match fixed original Python protocol vectors',async()=>{
 const captured=[];let random=0;
 const api=createTelecomUpstream({now:()=>new Date(2026,10,6,16,30,59),encrypt:text=>'cipher:'+text,post:async(kind,body)=>{
  captured.push({kind,body});
  if(kind==='password')return {ok:true,data:{loginSuccessResult:{token:'fixture-token',provinceCode:'p',cityCode:'c',password:'must-not-escape',name:'must-not-escape'}}};
  if(kind==='getLoginRandomCode')return {ok:true,data:{key:++random===1?'before':'after',isChinatelecom:'0'}};
  if(kind==='getSliderVerificationPicture')return {ok:true,data:{backgroundImg:'BG',sliderImg:'PIECE',key:'slider',extra:'MDEyMzQ1Njc4OWFiY2RlZg=='}};
  if(kind==='verificationSliderPicture')return {ok:true,data:{signSignatureString:'signature'}};
  return {ok:true,data:{loginSuccessResult:{token:'fixture-token'}}};
 }});
 const login=await api.login('13000000000','123456','fixture-device-id');
 assert.deepEqual(Object.keys(login.credentials).sort(),['cityCode','phonenum','provinceCode','token']);
 const challenge=await api.authorize({action:'challenge',phone:'13000000000'});assert.equal(challenge.ok,true);
 const sent=await api.authorize({action:'send_sms',state:challenge.state,distance:0.25,track:'0.250#0.000#200',start_time:100,end_time:200});assert.equal(sent.ok,true);
 const authorized=await api.authorize({action:'authorize',state:sent.state,code:'654321'});
 assert.equal(authorized.ok,true);assert.equal(authorized.device_id,challenge.state._uid);assert.equal(authorized.state,undefined);
 assert.deepEqual(captured,expected);
});
test('RSA public-key encryption is 1024-bit PKCS1 v1.5 and slider cipher uses padded AES ECB',()=>{
 assert.equal(Buffer.from(encryptLogin('fixture'),'base64').length,128);
 const key=Buffer.from('0123456789abcdef'),cipher=encryptSlider('0.2500',key.toString('base64'));
 const decipher=createDecipheriv('aes-128-ecb',key,null);
 assert.equal(Buffer.concat([decipher.update(Buffer.from(cipher,'base64')),decipher.final()]).toString(),'0.2500');
 assert.throws(()=>encryptSlider('fixture','not-a-key'));
});
test('failure codes are preserved without returning raw authentication payloads',async()=>{
 const api=createTelecomUpstream({post:async()=>({ok:false,code:'3006',data:{private:'must-not-escape'}})});
 assert.deepEqual(await api.login('13000000000','123456'),{ok:false,code:'3006'});
 assert.deepEqual(await api.authorize({action:'challenge',phone:'13000000000'}),{ok:false,code:'3006'});
});
test('unsigned 122001 preflight continues into manual slider, but transport failure stops',async()=>{
 const calls=[];
 const api=createTelecomUpstream({post:async kind=>{
  calls.push(kind);
  if(kind==='getLoginRandomCode')return {ok:false,code:'122001',data:{}};
  return {ok:true,data:{backgroundImg:'BG',sliderImg:'PIECE',key:'slider',extra:'MDEyMzQ1Njc4OWFiY2RlZg=='}};
 }});
 assert.equal((await api.authorize({action:'challenge',phone:'13000000000'})).ok,true);
 assert.deepEqual(calls,['getLoginRandomCode','getSliderVerificationPicture']);
 const failed=createTelecomUpstream({post:async()=>({ok:false,code:'NETWORK_ERROR'})});
 assert.equal((await failed.authorize({action:'challenge',phone:'13000000000'})).code,'NETWORK_ERROR');
});
