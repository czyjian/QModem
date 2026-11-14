import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelecomUpstream} from '../src/upstream/telecom-node.js';
import {registerTelecomTest} from '../src/routes/telecom-test.js';
import {createTelecomStore} from '../src/telecom-store.js';

test('SMS login retains only query credentials internally and never requests a password login',async()=>{
 const api=createTelecomUpstream({encrypt:()=> 'fixture',post:async(kind,body)=>{
  assert.equal(kind,'userLoginNormal');assert.equal(body.content.fieldData.loginType,'2');
  return {ok:true,data:{loginSuccessResult:{token:'sms-token',provinceCode:'p',cityCode:'c',password:'private',name:'private'}}};
 }});
 const result=await api.authorize({action:'sms_login',state:{phone:'13000000000',_uid:'0123456789abcdef0123456789abcdef'},code:'654321'});
 assert.deepEqual(result,{ok:true,credentials:{token:'sms-token',phonenum:'13000000000',provinceCode:'p',cityCode:'c',auth_profile:'sms_v2'}});
});

test('SMS query must succeed before replacing shared credentials; other SIMs and cancelled sessions cannot reuse it',async()=>{
 const sim={section:'2_1',identity:'460031234567890'},other={...sim,identity:'460031234567891'};
 const store=createTelecomStore();store.put(sim,{token:'old-token',phonenum:'13000000000'});
 let handler,failQuery=true,queries=0,auth=0;
 const upstream={authorize:async body=>{
  if(body.action==='challenge')return {ok:true,state:{phone:body.phone},challenge:{}};
  if(body.action==='send_sms')return {ok:true,state:body.state};
  assert.equal(body.action,'sms_login');auth++;return {ok:true,credentials:{token:'sms-token',phonenum:'13000000000'}};
 },usage:async credentials=>{queries++;assert.equal(credentials.token,'sms-token');return failQuery?{ok:false,code:'X201'}:{ok:true,total_mb:2048,used_mb:1024,remaining_mb:1024};}};
 registerTelecomTest({post:(p,f)=>handler=f},{store,upstream,limiter:{take:()=>true}});
 const reply={code(){return this;},send(value){return value;}};
 const call=(body,context=sim)=>handler({body:{_sim:context,...body}},reply);
 const challenge=await call({action:'challenge',phone:'13000000000'}),id=challenge.session_id;
 assert.equal((await call({action:'sms_login',session_id:id,code:'654321',shared:true})).ok,false);
 assert.equal((await call({action:'send_sms',session_id:id,distance:0.2,track:'0.200#0.000#200',start_time:100,end_time:200})).ok,true);
 assert.equal((await call({action:'sms_login',session_id:id,code:'654321',shared:true},other)).ok,false);
 const login=await call({action:'sms_login',session_id:id,code:'654321',shared:true});
 assert.equal(login.ok,true);assert(!JSON.stringify(login).includes('sms-token'));assert.equal(auth,1);
 assert.equal(store.get(sim).credentials.token,'old-token');
 assert.equal((await call({action:'usage',session_id:id})).ok,false);
 assert.equal(store.get(sim).credentials.token,'old-token');
 failQuery=false;
 assert.equal((await call({action:'usage',session_id:id})).remaining_mb,1024);
 assert.equal(store.get(sim).credentials.token,'sms-token');
 assert.equal((await call({action:'shared_usage'})).remaining_mb,1024);
 assert.equal(queries,2,'shared query should reuse the successful result');
 await call({action:'shared_logout'});
 assert.equal(store.get(sim),null);
 assert.equal((await call({action:'usage',session_id:id})).ok,false);
});

test('logout during an in-flight SMS usage query cannot recreate a shared login',async()=>{
 const sim={section:'2_1',identity:'460031234567890'},store=createTelecomStore();
 let handler,resolve,started;
 const ready=new Promise(r=>started=r);
 const upstream={authorize:async body=>body.action==='challenge'?{ok:true,state:{phone:body.phone},challenge:{}}:body.action==='send_sms'?{ok:true,state:body.state}:{ok:true,credentials:{token:'sms-token',phonenum:'13000000000'}},usage:()=>{started();return new Promise(r=>resolve=r);}};
 registerTelecomTest({post:(p,f)=>handler=f},{store,upstream,limiter:{take:()=>true}});
 const call=body=>handler({body:{_sim:sim,...body}},{code(){return this;},send(v){return v;}});
 const {session_id}=await call({action:'challenge',phone:'13000000000'});
 await call({action:'send_sms',session_id,distance:0.2,track:'0.200#0.000#200',start_time:100,end_time:200});
 await call({action:'sms_login',session_id,code:'654321',shared:true});
 const pending=call({action:'usage',session_id});await ready;
 await call({action:'shared_logout'});
 resolve({ok:true,total_mb:2048,remaining_mb:1024});
 assert.equal((await pending).code,'SESSION_CHANGED');assert.equal(store.get(sim),null);
});
