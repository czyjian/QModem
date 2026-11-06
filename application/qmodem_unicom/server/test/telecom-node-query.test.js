import test from 'node:test';
import assert from 'node:assert/strict';
import {queryBody,basicSummary,packageSummary,flowMb,createTelecomNodeQuery} from '../src/upstream/telecom-node-query.js';
const credentials={phonenum:'13000000000',token:'fixture',provinceCode:'p',cityCode:'c'};
const base={flowInfo:{totalAmount:{used:'1048576',balance:'2097152',total:'4194304'}}};
test('matches original query payload and minute timestamp without mixing two protocols',()=>{
 const body=queryBody(credentials,'usage',new Date(2026,10,6,16,30,59));
 assert.equal(body.headerInfos.timestamp,'20261106163000');
 assert.equal(body.headerInfos.code,'qryImportantData');
 assert.equal(body.content.attach,undefined);
 assert.equal(body.content.fieldData.provinceCode,'p');
 assert.equal(body.content.fieldData.account,'35222222222');
 const packages=queryBody(credentials,'packages');
 assert.equal(packages.headerInfos.code,'userFluxPackage');
 assert.equal(packages.content.attach,'test');
 assert.equal(packages.content.fieldData.accessAuth,'1');
});
test('uses binary units, explicit totals, missing fields remain unknown',()=>{
 assert.equal(basicSummary(base).total_mb,4096);
 assert.equal(basicSummary(base).remaining_mb,2048);
 assert.equal(basicSummary({}).code,'UNKNOWN_FLOW_FORMAT');
 assert.equal(basicSummary({flowInfo:{totalAmount:{used:'',balance:'1'}}}).ok,false);
 assert.equal(flowMb('1.5GB'),1536);assert.equal(flowMb('未知'),null);
});
test('parses valid flow packages, rejects voice/invalid packages and preserves unlimited',()=>{
 const data={productOFFRatable:{ratableResourcePackages:[{title:'国内流量',productInfos:[
  {title:'结转包',leftTitle:'已用',leftHighlight:'1GB',rightTitle:'剩余',rightHighlight:'2GB',rightCommon:'/共3GB'},
  {title:'旧包',isInvalid:'1',rightTitle:'剩余',rightHighlight:'9GB'},
  {title:'不限量',isInfiniteAmount:'1'}
 ]},{title:'语音',productInfos:[{title:'通话',rightTitle:'剩余',rightHighlight:'100MB'}]}]}};
 const result=packageSummary(data);assert.equal(result.details.length,2);
 assert.equal(result.details[0].total_mb,3072);
 assert.equal(result.details[1].total_mb,null);assert.equal(result.details[1].unlimited,true);
});
test('does not relogin or lose basic usage when package endpoint fails',async()=>{
 let calls=0;
 const api=createTelecomNodeQuery({post:async kind=>{calls++;return kind==='usage'?{ok:true,data:base}:{ok:false,code:'X201'};}});
 const result=await api.usage(credentials);assert.equal(result.ok,true);assert.equal(result.total_mb,4096);assert.deepEqual(result.details,[]);assert.equal(calls,2);
 const denied=createTelecomNodeQuery({post:async()=>({ok:false,code:'X201'})});
 assert.deepEqual(await denied.usage(credentials),{ok:false,code:'X201'});
});
