import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTelecomStore} from '../src/telecom-store.js';
import {registerTelecomTest} from '../src/routes/telecom-test.js';
test('shared telecom persists only required credentials, reuses token and logs out across clients',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'qmodem-telecom-')),path=join(dir,'sessions.json');
 try{
  const sim={section:'2_1',identity:'123456789012345'};
  let handler,logins=0,queries=0,time=100000;
  const upstream={login:async()=>{logins++;return {ok:true,credentials:{token:'fixture',phonenum:'13000000000',provinceCode:'1',password:'never-save',device_id:'never-save',name:'never-save'}};},usage:async()=>{queries++;return {ok:true,total_mb:2048,remaining_mb:1024};}};
  const store=createTelecomStore(path);
  registerTelecomTest({post:(p,f)=>handler=f},{store,upstream,limiter:{take:()=>true},now:()=>time});
  const reply={code(){return this;},send(v){return v;}};
  const call=body=>handler({body:{_sim:sim,...body}},reply);
  await call({action:'login',shared:true,phone:'13000000000',password:'123456'});
  assert(!readFileSync(path,'utf8').includes('never-save'));
  assert.equal(statSync(path).mode & 0o777,0o600);
  assert.equal(createTelecomStore(path).get(sim).credentials.token,'fixture');
  assert.equal(createTelecomStore(path).get({...sim,identity:'999999999999999'}),null);
  assert.equal((await call({action:'shared_usage'})).remaining_mb,1024);
  assert.equal((await call({action:'shared_usage'})).remaining_mb,1024);assert.equal(queries,1);
  time+=60000;await call({action:'shared_usage'});assert.equal(queries,2);assert.equal(logins,1);
  await call({action:'shared_logout'});
  assert.equal((await call({action:'shared_usage'})).code,'TOKEN_EXPIRED');
  assert.equal(createTelecomStore(path).get(sim),null);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
