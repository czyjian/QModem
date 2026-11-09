import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {shopPhoneToken,decodeShopBody,shopFlowSummary,queryMobileShop} from '../src/upstream/mobile-shop.js';
const resource=(unit,total,used,remaining)=>({resCode:'04',secResInfos:[{resConName:'国内流量',unLimitType:'01',resConInfo:{unit,totalMeal:total,useMeal:used,balMeal:remaining}}]});
const data=[{type:'1',arr:[{mealName:'套餐',planId:'fixture',expireFlag:'0',resInfos:[resource('04','102400','1024','101376'),resource('03','1048576','0','1048576'),{resCode:'01',secResInfos:[{resConInfo:{unit:'01',totalMeal:'100'}}]}]},{mealName:'失效套餐',expireFlag:'1',resInfos:[resource('05','9','0','9')]}]},{type:'2',arr:[{resInfos:[resource('05','99','0','99')]}]}];
test('shop resource codes and units differ from wx; sums only active in-plan mobile data',()=>{
 const result=shopFlowSummary(data);assert.equal(result.details.length,2);assert.equal(result.total_mb,103424);assert.equal(result.remaining_mb,102400);assert.equal(result.used_mb,1024);
 const unknown=structuredClone(data);unknown[0].arr[0].resInfos[0].secResInfos[0].unLimitType='unknown';assert.equal(shopFlowSummary(unknown).total_mb,null);
});
test('shop phone token and response use double-base64 AES-CBC with explicit unknown failure',()=>{
 assert.match(shopPhoneToken('13000000000'),/^[A-Za-z0-9+/=]+$/);
 const key=Buffer.from('043AOQGK6ykklyZA'),cipher=createCipheriv('aes-128-cbc',key,key),inner=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]).toString('base64'),outParam=Buffer.from(inner).toString('base64');
 assert.deepEqual(decodeShopBody(Buffer.from(JSON.stringify({retCode:'000000',data:{outParam}}))).data,data);
 assert.equal(decodeShopBody(Buffer.from('maintenance')),null);
});
test('shop reads only the plan-balance endpoint and never returns SSO cookies to UI',async()=>{
 const credentials={phone:'13000000000',jar:[]},calls=[];
 const result=await queryMobileShop(credentials,{request:async(jar,url,options)=>{calls.push({url,options});return {status:200,body:Buffer.from(JSON.stringify({retCode:'000000',data}))};}});
 assert(result.ok);assert.equal(result.data.total_mb,103424);assert(!('credentials' in result.data));assert.match(calls[0].url,/^https:\/\/shop\.10086\.cn\/i\/v1\/fee\/planbal\//);assert.equal(calls[0].options.form,undefined);assert.equal(calls[0].options.json,undefined);
});
