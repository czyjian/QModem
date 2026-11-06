import test from 'node:test';
import assert from 'node:assert/strict';
import {registerTelecomTest} from '../src/routes/telecom-test.js';
test('isolates SIM sessions, does not relogin on X201, expires credentials',async()=>{
 let handler,time=0,logins=0;
 registerTelecomTest({post:(path,fn)=>handler=fn},{limiter:{take:()=>true},now:()=>time,upstream:{login:async()=>{logins++;return {ok:true,credentials:{token:'fixture'}};},usage:async()=>({ok:false,code:'X201'})}});
 const sim={section:'2_1',identity:'123456789012345'};
 const reply={code(){return this;},send(value){return value;}};
 const call=body=>handler({body:{_sim:sim,...body}},reply);
 const logged=await call({action:'login',phone:'13000000000',password:'123456'});
 assert.ok(logged.session_id);assert.equal(logged.credentials,undefined);
 const wrong=await call({action:'usage',session_id:logged.session_id,_sim:{...sim,identity:'999999999999999'}});
 assert.equal(wrong.ok,false);
 const failed=await call({action:'usage',session_id:logged.session_id});
 assert.match(failed.msg,/X201/);assert.equal(logins,1);
 time=900001;
 assert.match((await call({action:'usage',session_id:logged.session_id})).msg,/过期/);
});
