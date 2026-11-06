import test from 'node:test';
import assert from 'node:assert/strict';
import {registerTelecomTest} from '../src/routes/telecom-test.js';
test('device authorization stays server-side, sends once, binds to SIM and clears after use',async()=>{
 let handler,calls=[];
 const sim={section:'2_1',identity:'123456789012345'};
 registerTelecomTest({post:(p,f)=>handler=f},{limiter:{take:()=>true},upstream:{authorize:async body=>{
  calls.push(body);
  if(body.action==='challenge')return {ok:true,state:{phone:body.phone,_key:'private'},challenge:{background_img:'fixture'}};
  if(body.action==='send_sms')return {ok:true,state:body.state};
  return {ok:true,device_id:'authorized-fixture'};
 }}});
 const reply={code(){return this;},send(v){return v;}};
 const call=b=>handler({body:{_sim:sim,...b}},reply);
 const c=await call({action:'challenge',phone:'13000000000'});
 assert.ok(c.session_id);assert.equal(c.state,undefined);
 assert.equal((await call({action:'authorize',session_id:c.session_id,code:'123456'})).ok,false);
 const send={action:'send_sms',session_id:c.session_id,distance:0.5,track:'0.5#0#123',start_time:100,end_time:200};
 assert.equal((await call({...send,_sim:{...sim,identity:'999999999999999'}})).ok,false);
 assert.equal((await call(send)).ok,true);
 assert.equal((await call(send)).ok,false);
 assert.equal(calls.filter(x=>x.action==='send_sms').length,1);
 const result=await call({action:'authorize',session_id:c.session_id,code:'123456'});
 assert.equal(result.device_id,'authorized-fixture');assert.equal(result.state,undefined);
 assert.equal((await call({action:'authorize',session_id:c.session_id,code:'123456'})).ok,false);
});
