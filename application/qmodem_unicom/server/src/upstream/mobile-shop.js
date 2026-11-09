// Read-only shop.10086.cn plan-balance protocol, verified against its public
// remain_f01f40b.js / pack_remain_1cc1975.js and commonutil implementation.
import {createCipheriv,createDecipheriv} from 'node:crypto';
const KEY=Buffer.from('043AOQGK6ykklyZA');
export function shopPhoneToken(phone){const cipher=createCipheriv('aes-128-cbc',KEY,KEY);return Buffer.from(Buffer.concat([cipher.update(phone,'utf8'),cipher.final()]).toString('base64')).toString('base64');}
export function decodeShopBody(buffer){
 try{
  const result=JSON.parse(buffer.toString('utf8'));
  if(result?.data?.outParam){
   const outer=result.data.outParam;if(typeof outer!=='string' || outer.length>2097152 || !/^[A-Za-z0-9+/=\s]+$/.test(outer))return null;
   const inner=Buffer.from(outer,'base64').toString('utf8').replace(/\s/g,'');
   try{const decipher=createDecipheriv('aes-128-cbc',KEY,KEY);result.data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(inner,'base64')),decipher.final()]).toString('utf8'));}catch{try{result.data=JSON.parse(inner);}catch{return null;}}
  }
  return result;
 }catch{return null;}
}
export function shopFlowSummary(data){
 if(!Array.isArray(data))return {ok:false,code:'UNKNOWN_FLOW_FORMAT'};
 const details=[],seen=new Set();
 const number=value=>(typeof value==='number' || typeof value==='string' && value.trim()!=='') && Number.isFinite(Number(value)) && Number(value)>=0?Number(value):null;
 for(const group of data.slice(0,30)){
  if(String(group?.type)!=='1')continue; // only in-plan resources, not charged usage
  for(const meal of (group.arr || []).slice(0,100)){
   if(String(meal?.expireFlag ?? '0')!=='0')continue;
   for(const resource of (meal.resInfos || []).slice(0,50)){
    if(String(resource?.resCode)!=='04')continue; // mobile data, exclude voice/WLAN
    for(const sub of (resource.secResInfos || []).slice(0,50)){
     if(details.length>=200)return {ok:false,code:'TOO_MANY_PACKAGES'};
     const value=sub?.resConInfo;if(!value)continue;
     const id=JSON.stringify([meal.planId || meal.mealName,sub.resConCode,sub.resConName,value]);if(seen.has(id))continue;seen.add(id);
     // Shop: 03=KB, 04=MB, 05=GB. wx uses DIFFERENT numeric codes.
     const factor=({'03':1/1024,'04':1,'05':1024,KB:1/1024,MB:1,GB:1024})[String(value.unit)];
     const unlimited=/不限|无限/.test(String(value.totalMeal)+String(value.balMeal));
     const knownLimit=sub.unLimitType==null || sub.unLimitType==='' || sub.unLimitType==='01';
     const scaled=v=>factor!=null && number(v)!=null ? number(v)*factor : null;
     let total=scaled(value.totalMeal),used=scaled(value.useMeal),remaining=scaled(value.balMeal);
     if(!knownLimit || unlimited){total=null;remaining=null;}
     if(remaining==null && total!=null && used!=null)remaining=Math.max(0,total-used);
     if(used==null && total!=null && remaining!=null)used=Math.max(0,total-remaining);
     details.push({name:[String(meal.mealName || '流量包'),String(sub.resConName || '')].filter(Boolean).join(' · ').slice(0,220),total_mb:total,used_mb:used,remaining_mb:remaining,unlimited});
    }
   }
  }
 }
 if(!details.length)return {ok:false,code:'UNKNOWN_FLOW_FORMAT'};
 const sum=field=>details.every(item=>Number.isFinite(item[field]))?details.reduce((total,item)=>total+item[field],0):null;
 return {ok:true,total_mb:sum('total_mb'),used_mb:sum('used_mb'),remaining_mb:sum('remaining_mb'),details,scope_note:'合计包含通用、定向、校园及结转等流量包，各流量包的使用范围以运营商说明为准。',updated_at:Math.floor(Date.now()/1000),signed_rate:null,qci:null};
}
export async function queryMobileShop(credentials,{request,deadline=Date.now()+22000}){
 try{
  const jar=structuredClone(credentials.jar);
  const url='https://shop.10086.cn/i/v1/fee/planbal/'+encodeURIComponent(shopPhoneToken(credentials.phone))+'?_='+Date.now();
  const response=await request(jar,url,{deadline,headers:{Referer:'https://shop.10086.cn/i/?f=packremainqry','X-Requested-With':'XMLHttpRequest','Cache-Control':'no-store'}});
  if([403,412].includes(response.status))return {ok:false,code:'QUERY_BLOCKED'};
  if(response.status!==200)return {ok:false,code:'SHOP_HTTP_'+response.status};
  const result=decodeShopBody(response.body);
  if(!result)return {ok:false,code:'SHOP_DECODE_FAILED'};
  if(String(result.retCode)==='500003')return {ok:false,code:'TOKEN_EXPIRED'};
  if(!/^0+$/.test(String(result.retCode)))return {ok:false,code:'SHOP_'+(/^[0-9]{1,10}$/.test(String(result.retCode))?result.retCode:'UNKNOWN')};
  const summary=shopFlowSummary(result.data);
  return summary.ok?{ok:true,data:summary,credentials:{phone:credentials.phone,jar}}:summary;
 }catch{return {ok:false,code:'NETWORK_ERROR'};}
}
