import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMobileStore} from '../src/mobile-store.js';
test('mobile shared cookies persist with private permissions and SIM isolation, without OTP or password',()=>{
 const root=mkdtempSync(join(tmpdir(),'qmodem-mobile-')),path=join(root,'mobile.json'),sim={section:'2_1',identity:'460001234567890'};
 try{
  const store=createMobileStore(path),jar=[{name:'cmccssotoken',value:'fixture',domain:'10086.cn',hostOnly:false,path:'/',expires:Date.now()+60000}];
  store.put(sim,{phone:'13000000000',jar,password:'must-not-save',code:'must-not-save',raw:'must-not-save'});
  assert(!readFileSync(path,'utf8').includes('must-not-save'));if(process.platform!=='win32'){assert.equal(statSync(path).mode & 0o777,0o600);assert.equal(statSync(root).mode & 0o777,0o700);}
  assert.equal(createMobileStore(path).get(sim).mobile,'130****0000');assert.equal(createMobileStore(path).get({...sim,identity:'460009999999999'}),null);
  assert.throws(()=>store.put(sim,{phone:'13000000000',jar:[{...jar[0],domain:'evil.invalid'}]}));
  store.remove(sim);assert.equal(createMobileStore(path).get(sim),null);
 }finally{rmSync(root,{recursive:true,force:true});}
});
