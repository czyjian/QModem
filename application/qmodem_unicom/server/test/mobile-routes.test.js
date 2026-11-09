import test from 'node:test';
import assert from 'node:assert/strict';
import {registerMobile} from '../src/routes/mobile.js';
import {createMobileStore} from '../src/mobile-store.js';
test('mobile sessions bind to SIM, send once, share only after SSO and retain login on query rejection',async()=>{
 let handler,blocked=false,sends=0;
 const sim={section:'2_1',identity:'460001234567890'},store=createMobileStore();
 const jar=[{name:'cmccssotoken',value:'private-fixture',domain:'10086.cn',hostOnly:false,path:'/',expires:Date.now()+60000}];
 registerMobile({post:(path,fn)=>handler=fn},{limiter:{take:()=>true},store,upstream:{challenge:async phone=>({ok:true,state:{phone,jar},image:'data:image/png;base64,Zml4dHVyZQ=='}),send:async state=>{sends++;return {ok:true,state};},login:async state=>({ok:true,credentials:{phone:state.phone,jar,password:'never-save',code:'never-save'}}),usage:async credentials=>blocked?{ok:false,code:'QUERY_BLOCKED'}:{ok:true,credentials,data:{total_mb:2048,remaining_mb:1024,details:[]}}}});
 const reply={code(){return this;},send:value=>value};const call=body=>handler({body:{_sim:sim,...body}},reply);
 const challenge=await call({action:'challenge',phone:'13000000000'});assert(challenge.session_id);assert.equal(challenge.state,undefined);
 const send={action:'send',session_id:challenge.session_id,captcha:'123456'};
 assert.equal((await call({...send,_sim:{...sim,identity:'460009999999999'}})).ok,false);
 assert.equal((await call(send)).ok,true);assert.equal((await call(send)).ok,false);assert.equal(sends,1);
 const login=await call({action:'login',session_id:challenge.session_id,code:'654321'});assert(login.ok);assert(!JSON.stringify(login).includes('private-fixture'));assert(!JSON.stringify(store.get(sim)).includes('never-save'));
 const usage=await call({action:'usage',refresh:true});assert.equal(usage.remaining_mb,1024);assert(!JSON.stringify(usage).includes('private-fixture'));
 blocked=true;const failed=await call({action:'usage',refresh:true});assert.equal(failed.code,'QUERY_BLOCKED');assert.equal(failed.logged_in,true);assert.equal((await call({action:'status'})).logged_in,true);
 await call({action:'logout'});assert.equal((await call({action:'usage'})).code,'TOKEN_EXPIRED');
});
test('SMS_1 preserves server challenge and cookies and allows only manual retry after 60 seconds',async()=>{
 let handler,time=0,sends=0;
 const sim={section:'2_1',identity:'460001234567890'};
 registerMobile({post:(p,f)=>handler=f},{now:()=>time,limiter:{take:()=>true},upstream:{
  challenge:async phone=>({ok:true,state:{phone,jar:[]},image:'fixture'}),
  send:async state=>{sends++;if(sends===1)return {ok:false,code:'SMS_1',state:{...state,marker:'kept'}};assert.equal(state.marker,'kept');return {ok:true,state};}
 }});
 const reply={code(){return this;},send:v=>v},call=body=>handler({body:{_sim:sim,...body}},reply);
 const challenge=await call({action:'challenge',phone:'13000000000'}),request={action:'send',session_id:challenge.session_id,captcha:'123456'};
 const failed=await call(request);assert.equal(failed.code,'SMS_1');assert.equal(failed.can_retry,true);assert.equal(failed.retry_after,60);
 assert.equal((await call(request)).code,'SMS_WAIT');assert.equal(sends,1);
 time=60001;assert.equal((await call(request)).ok,true);assert.equal(sends,2);
 assert.equal((await call(request)).ok,false);assert.equal(sends,2);
});
