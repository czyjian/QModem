import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore, ROUTER_TOKEN } from '../src/sessions.js';
import { flowSummary } from '../src/routes/shared.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
const sim={section:'2_1',identity:'460011234567890'}, other={...sim,identity:'460019999999999'};
const token='private-carrier-token-'.repeat(3), cookie='ecs_token='+token;
const pack={elemType:'3',feePolicyId:'same',feePolicyName:'套餐流量',total:'1024',remain:'512',use:'512',endDate:'2028-01-01'};
const ocs={ok:true,code:'0000',packageName:'测试套餐',resources:[{details:[pack,{...pack,total:'2048',remain:'1024',use:'1024'}]}],unshared:[{details:[pack]}]};
function post(app,path,data={}) { return app.inject({method:'POST',url:path,headers:{'content-type':'application/json'},payload:{_sim:sim,...data}}); }
function make(store, upstream={}) {return buildApp(loadConfig({}),{logger:false,store,upstream:{smsLogin:async()=>({ecsToken:token,cookie,onlinToken:'private-online-token'}),queryOcs:async()=>ocs,...upstream}});}
test('shared session is persistent, private and isolated by SIM identity',()=>{
  const dir=mkdtempSync(join(tmpdir(),'qmodem-session-test-')), path=join(dir,'sessions.json');
  try {
    const store=createSessionStore(path); store.put(sim,{ecsToken:token,cookie},'13800000000');
    assert.equal(createSessionStore(path).get(sim).ecsToken,token);
    assert.equal(store.get(other),null);
    const raw=readFileSync(path,'utf8'); assert(!raw.includes('13800000000')); assert(!raw.includes('password'));
    if(process.platform!=='win32') {assert.equal(statSync(path).mode&0o777,0o600);assert.equal(statSync(dir).mode&0o777,0o700);}
    store.remove(sim);assert.equal(createSessionStore(path).get(sim),null);
    assert.throws(()=>store.put(sim,{ecsToken:ROUTER_TOKEN,cookie}));
    assert.throws(()=>store.put({section:'../evil',identity:sim.identity},{ecsToken:token,cookie}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('summary deduplicates exact resources, preserving blocks from the same policy',()=>{
  const summary=flowSummary(ocs);
  assert.equal(summary.total_mb,3072);assert.equal(summary.remaining_mb,1536);assert.equal(summary.details.length,2);
  assert.equal(summary.used_mb,1536);
  const missing=flowSummary({resources:[{details:[{...pack,total:'',remain:''}]}]});
  assert.equal(missing.total_mb,null);assert.equal(missing.remaining_mb,null);
  assert.equal(flowSummary({resources:[{details:[{...pack,limited:'1'}]}]}).details[0].unlimited,true);
  assert.equal(flowSummary({resources:[{details:[{...pack,limited:'1'}]}]}).used_mb,512);
  assert.equal(flowSummary({resources:[{details:[{...pack,total:'',remain:'',use:false}]}]}).used_mb,null);
});
test('one browser logs in; another queries without carrier credentials',async()=>{
  const store=createSessionStore(), app=make(store);try {
    const response=await post(app,'/gettoken/?action=login',{phone:'13800000000',code:'123456'});
    assert.equal(response.json().ecs_token,ROUTER_TOKEN);assert(!response.body.includes(token));assert(!response.body.includes('private-online-token'));assert(!response.body.includes(cookie));
    const status=await post(app,'/shared/',{action:'status'});assert.equal(status.json().logged_in,true);assert(!status.body.includes(token));
    const usage=await post(app,'/shared/',{action:'usage'});assert.equal(usage.json().total_mb,3072);assert(!usage.body.includes(token));
    assert.equal((await post(app,'/ocs_proxy/',{})).json().code,'0000');
    assert.equal((await post(app,'/shared/',{action:'usage',_sim:other})).json().code,'TOKEN_EXPIRED');
  } finally{await app.close();}
});
test('manual verification must finish before the session is saved',async()=>{
  const store=createSessionStore(), app=make(store,{smsLogin:async()=>({verification:{id:'challenge'},message:'请手动验证'})});try {
    assert.equal((await post(app,'/gettoken/?action=login',{phone:'13800000000',code:'123456'})).json().status,'need_verification');
    assert.equal(store.get(sim),null);
  }finally{await app.close();}
});
test('expiry removes the shared session; simultaneous browsers share a query cache',async()=>{
  const store=createSessionStore();store.put(sim,{ecsToken:token,cookie});let calls=0,expired=false;
  const app=make(store,{queryOcs:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return expired?{ok:false,code:'TOKEN_EXPIRED'}:ocs;}});
  try {
    await Promise.all([post(app,'/shared/',{action:'usage'}),post(app,'/shared/',{action:'usage'})]);assert.equal(calls,1);
    await post(app,'/shared/',{action:'usage'});assert.equal(calls,1);
    expired=true;assert.equal((await post(app,'/shared/',{action:'usage',refresh:true})).json().code,'TOKEN_EXPIRED');assert.equal(store.get(sim),null);
  }finally{await app.close();}
});
test('legacy browser migration validates credentials and returns only a reference',async()=>{
  const store=createSessionStore(),app=make(store);try {
    const result=await post(app,'/shared/',{action:'import',ecs_token:token,cookie,phone:'13800000000'});
    assert.equal(result.json().token,ROUTER_TOKEN);assert(!result.body.includes(token));assert(store.get(sim));
    await post(app,'/shared/',{action:'logout'});assert.equal(store.get(sim),null);
  }finally{await app.close();}
});
