import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createSessionStore } from '../src/sessions.js';
import { createTelecomStore } from '../src/telecom-store.js';
import { createMobileStore } from '../src/mobile-store.js';
import { normalizeSimPhone } from '../src/sim-phone.js';
const sim={section:'2_1',identity:'460011234567890',phone:'+86 13800001234'};
const token='private-session-token-'.repeat(3);
const cases=[
 {name:'unicom',make:createSessionStore,option:'store',path:'/shared/',status:'status',usage:'usage',save:s=>s.put(sim,{ecsToken:token,cookie:'ecs_token='+token},'13800001234')},
 {name:'telecom',make:createTelecomStore,option:'telecomStore',path:'/telecom_test/',status:'shared_status',usage:'shared_usage',save:s=>s.put(sim,{token,phonenum:'13800001234'})},
 {name:'mobile',make:createMobileStore,option:'mobileStore',path:'/mobile/',status:'status',usage:'usage',save:s=>s.put(sim,{phone:'13800001234',jar:[{name:'cmccssotoken',value:'fixture',domain:'10086.cn',hostOnly:false,path:'/',expires:Date.now()+60000}]})},
];
test('phone formats normalize without guessing incomplete or foreign numbers',()=>{
 for(const value of ['13800001234','+86 13800001234','0086-13800001234'])assert.equal(normalizeSimPhone(value),'13800001234');
 for(const value of ['',null,'138****1234','unknown','+12025550123'])assert.equal(normalizeSimPhone(value),'');
});
for(const c of cases)test(c.name+' logs out a mismatch before cache or upstream use, preserving unknown and equal numbers',async()=>{
 const store=c.make();c.save(store);
 const app=buildApp(loadConfig({}),{logger:false,[c.option]:store});
 const post=(phone,action)=>app.inject({method:'POST',url:c.path,payload:{_sim:{...sim,phone},action}});
 try{
  assert.equal((await post('008613800001234',c.status)).json().logged_in,true);
  assert.equal((await post('',c.status)).json().logged_in,true);
  // Same masked prefix/suffix, different middle digits: full comparison required.
  assert.equal((await post('13899991234',c.status)).json().logged_in,false);
  assert.equal(store.get(sim),null);
  assert.equal((await post(sim.phone,c.usage)).json().ok,false);
 }finally{await app.close();}
});
test('mismatched login is rejected before requesting a carrier SMS',async()=>{
 let called=false;const store=createSessionStore();
 const app=buildApp(loadConfig({}),{logger:false,store,upstream:{sendSmsCode:async()=>{called=true;}}});
 try{
  const r=await app.inject({method:'POST',url:'/gettoken/?action=send',payload:{_sim:sim,phone:'13900001234'}});
  assert.equal(r.statusCode,409);assert.equal(r.json().code,'SIM_PHONE_MISMATCH');assert.equal(called,false);
 }finally{await app.close();}
});
