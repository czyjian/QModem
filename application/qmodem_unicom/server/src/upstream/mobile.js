import {queryMobileShop} from './mobile-shop.js';
import {publicEncrypt,constants,createHash,createDecipheriv,randomBytes} from 'node:crypto';
import {parseCookieHeader} from './cookies.js';
const HOSTS=new Set(['login.10086.cn','shop.10086.cn','wx.10086.cn']);
const LOGIN='https://login.10086.cn',BACK='https://shop.10086.cn/i/?f=home';
const PAGE=LOGIN+'/login.html?channelID=12003&backUrl='+encodeURIComponent(BACK);
const HOME='https://wx.10086.cn/website/spa/main/newHome';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsgDq4OqxuEisnk2F0EJFmw4xKa5IrcqEYHvqxPs2CHEg2kolhfWA2SjNuGAHxyDDE5MLtOvzuXjBx/5YJtc9zj2xR/0moesS+Vi/xtG1tkVaTCba+TV+Y5C61iyr3FGqr+KOD4/XECu0Xky1W9ZmmaFADmZi7+6gO9wjgVpU9aLcBcw/loHOeJrCqjp7pA98hRJRY+MML8MK15mnC4ebooOva+mJlstW6t/1lghR8WNV8cocxgcHHuXBxgns2MlACQbSdJ8c6Z3RQeRZBzyjfey6JCCfbEKouVrWIUuPphBL3OANfgp0B+QG31bapvePTfXU48TYK0M5kE+8LgbbWQIDAQAB';
export const encryptMobile=value=>publicEncrypt({key:'-----BEGIN PUBLIC KEY-----\n'+KEY+'\n-----END PUBLIC KEY-----',padding:constants.RSA_PKCS1_PADDING},Buffer.from(value)).toString('base64');
export function allowedMobileUrl(value){try{const url=new URL(value);return url.protocol==='https:' && HOSTS.has(url.hostname) && !url.username && !url.password && (!url.port || url.port==='443');}catch{return false;}}
export function validMobileJar(jar){return Array.isArray(jar) && jar.length<=64 && jar.every(c=>c && ['10086.cn',...HOSTS].includes(c.domain) && typeof c.hostOnly==='boolean' && typeof c.path==='string' && c.path.startsWith('/') && c.path.length<=512 && typeof c.name==='string' && typeof c.value==='string' && parseCookieHeader(c.name+'='+c.value)!=null && c.name.length<=128 && c.value.length<=4096 && Number.isFinite(c.expires));}
function absorb(jar,headers,url){
 for(const line of headers.getSetCookie?.() || []){
  const [pair,...attrs]=line.split(';'),i=pair.indexOf('=');if(i<1)continue;
  const name=pair.slice(0,i).trim(),value=pair.slice(i+1).trim();if(!parseCookieHeader(name+'='+value))continue;
  const cookie={name,value,domain:url.hostname,hostOnly:true,path:'/',expires:Date.now()+30*86400000};
  for(const attr of attrs){const [raw,...tail]=attr.trim().split('='),v=tail.join('=');switch(raw.toLowerCase()){
   case 'domain':cookie.domain=v.replace(/^\./,'').toLowerCase();cookie.hostOnly=false;break;
   case 'path':cookie.path=v || '/';break;
   case 'max-age':if(/^-?\d+$/.test(v))cookie.expires=Date.now()+Number(v)*1000;break;
   case 'expires':if(!attrs.some(a=>/^\s*max-age=/i.test(a)) && Number.isFinite(Date.parse(v)))cookie.expires=Date.parse(v);break;
  }}
  if(!(url.hostname===cookie.domain || url.hostname.endsWith('.'+cookie.domain)) || !validMobileJar([cookie]))continue;
  const old=jar.findIndex(c=>c.name===name && c.domain===cookie.domain && c.path===cookie.path);if(old>=0)jar.splice(old,1);
  if(cookie.value && cookie.expires>Date.now() && jar.length<64)jar.push(cookie);
 }
}
export function mobileCookieHeader(jar,url){url=new URL(url);return jar.filter(c=>c.expires>Date.now() && (c.hostOnly?c.domain===url.hostname:url.hostname===c.domain || url.hostname.endsWith('.'+c.domain)) && (url.pathname===c.path || url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).map(c=>c.name+'='+c.value).join('; ');}
export async function mobileRequest(jar,target,{form,json,headers={},follow=false,deadline=Date.now()+22000}={}){
 for(let redirects=0;redirects<=5;redirects++){
  if(!allowedMobileUrl(target))throw new Error('UNSAFE_REDIRECT');
  const url=new URL(target),cookie=mobileCookieHeader(jar,url);
  let response;try{response=await fetch(url,{method:form || json?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now()))),headers:{'User-Agent':UA,Accept:'application/json, text/javascript, */*; q=0.01',Referer:url.hostname==='login.10086.cn'?PAGE:HOME,...(cookie?{Cookie:cookie}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}:json?{'Content-Type':'application/json'}:{}),...headers},body:form?new URLSearchParams(form).toString():json?JSON.stringify(json):undefined});}catch{throw new Error('NETWORK_ERROR');}
  absorb(jar,response.headers,url);
  if(follow && response.status>=300 && response.status<400 && response.headers.get('location')){target=new URL(response.headers.get('location'),url).href;form=null;json=null;headers={};continue;}
  const reader=response.body?.getReader(),chunks=[];let size=0;
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new Error('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}}catch(error){throw new Error(error.message==='RESPONSE_TOO_LARGE'?error.message:'NETWORK_ERROR');}
  return {status:response.status,body:Buffer.concat(chunks),type:response.headers.get('content-type') || '',location:response.headers.get('location')};
 }
 throw new Error('REDIRECT_LIMIT');
}
const parse=body=>{try{return JSON.parse(Buffer.isBuffer(body)?body.toString():body);}catch{return null;}};
export function decodeMobile(body){const text=Buffer.isBuffer(body)?body.toString('utf8'):String(body);if(/^\s*\{/.test(text))return parse(text);const hex=text.trim().replace(/^"|"$/g,'');if(!/^(?:[0-9a-f]{2})+$/i.test(hex))return null;try{const cipher=createDecipheriv('aes-128-cbc',Buffer.from('1234123412ABCDEF'),Buffer.from('ABCDEF1234123412'));return parse(Buffer.concat([cipher.update(Buffer.from(hex,'hex')),cipher.final()]));}catch{return null;}}
export function mobileSummary(payload){
 const flow=(payload?.data?.resultData?.planRemainFlowInfo || payload?.data?.resultData?.planRemianFlowInfo);
 if(!flow)return {ok:false,code:'UNKNOWN_FLOW_FORMAT'};
 const num=v=>(typeof v==='number' || typeof v==='string' && v.trim()!=='') && Number.isFinite(Number(v)) && Number(v)>=0?Number(v):null;
 const block=(value,name)=>{if(!value)return null;const factor=({'03':1,'04':1024,MB:1,GB:1024,KB:1/1024})[value.unit || '04'];if(factor==null)return null;const scale=v=>num(v)==null?null:num(v)*factor;let used=scale(value.usedNum),total=scale(value.sumNum),remaining=scale(value.remainNum);if(total==null && used!=null && remaining!=null)total=used+remaining;if(remaining==null && total!=null && used!=null)remaining=Math.max(0,total-used);if(used==null && total!=null && remaining!=null)used=Math.max(0,total-remaining);return remaining==null?null:{name,used_mb:used,total_mb:total,remaining_mb:remaining};};
 const total=block(flow.totalInfo,'合计');if(!total)return {ok:false,code:'UNKNOWN_FLOW_FORMAT'};
 const details=[block(flow.planRemain || flow.planRemian,'通用流量'),block(flow.directionalFlowInfo,'定向流量'),block(flow.otherRemian,'其他流量')].filter(Boolean);
 return {...total,ok:true,details,updated_at:Math.floor(Date.now()/1000),signed_rate:null,qci:null};
}
function fingerprint(){let acc=0,bytes=[];for(const c of UA){bytes.unshift(c.charCodeAt(0)&255);if(bytes.length===4){acc^=bytes.reduce((n,v,i)=>n | v<<(i*8),0);bytes=[];}}if(bytes.length)acc^=bytes.reduce((n,v,i)=>n | v<<(i*8),0);return [Date.now().toString(16),String(Math.random()).replace('.','').slice(0,7),(acc>>>0).toString(16),(1920*1080).toString(16),String(BigInt('0x'+randomBytes(7).toString('hex'))%1000000000000000n).padStart(15,'0')].join('-');}
export function createMobileUpstream({request=mobileRequest,encrypt=encryptMobile}={}){
 const http=(jar,url,options={})=>request(jar,url,options);
 const client={
  challenge:async phone=>{try{const jar=[],deadline=Date.now()+22000;await http(jar,PAGE,{follow:true,deadline});await http(jar,LOGIN+'/loadSendflag.htm?timestamp='+Date.now(),{deadline});await http(jar,LOGIN+'/checkUidAvailable.action',{form:{},headers:{'X-Requested-With':'XMLHttpRequest',Origin:LOGIN},deadline});const image=await http(jar,LOGIN+'/captchazh.htm?type=12&timestamp='+Date.now(),{deadline});if(image.status!==200 || !/^image\/(png|jpeg|gif)/i.test(image.type))return {ok:false,code:'CAPTCHA_UNAVAILABLE'};return {ok:true,state:{phone,jar},image:'data:'+image.type.split(';')[0]+';base64,'+image.body.toString('base64')};}catch(e){return {ok:false,code:e.message};}},
  send:async(state,captcha)=>{
   const jar=structuredClone(state.jar),deadline=Date.now()+22000,headers={'X-Requested-With':'XMLHttpRequest',Origin:LOGIN};
   let stage='captcha';
   try{
    const checked=await http(jar,LOGIN+'/verifyCaptcha.htm',{form:{inputCode:captcha},headers,deadline});
    if(String(parse(checked.body)?.resultCode)!=='0')return {ok:false,code:'CAPTCHA_REJECTED',state:{...state,jar},stage};
    stage='number';
    const number=await http(jar,LOGIN+'/chkNumberAction.action',{form:{userName:encrypt(state.phone),loginMode:'01',channelID:'12003'},headers,deadline});
    if(parse(number.body)===false || parse(number.body)==='false')return {ok:false,code:'NOT_MOBILE',state:{...state,jar},stage};
    stage='token';
    const token=parse((await http(jar,LOGIN+'/loadToken.action',{form:{userName:encrypt(state.phone)},headers,deadline})).body)?.result;
    if(typeof token!=='string' || !token)return {ok:false,code:'TOKEN_UNAVAILABLE',state:{...state,jar},stage};
    stage='send';
    const result=await http(jar,LOGIN+'/sendRandomCodeAction.action',{form:{userName:encrypt(state.phone),inputCode:encrypt(captcha),type:'01',channelID:'12003'},headers:{...headers,'Xa-before':token},deadline});
    const code=String(parse(result.body));
    return code==='0'?{ok:true,state:{...state,jar}}:{ok:false,code:/^\d{1,10}$/.test(code)?'SMS_'+code:'SMS_REJECTED',state:{...state,jar},stage};
   }catch(e){return {ok:false,code:e.message,state:{...state,jar},stage};}
  },
  login:async(state,code,captcha)=>{try{const jar=structuredClone(state.jar),deadline=Date.now()+22000,device=[createHash('md5').update('cmcc-v1|'+state.phone).digest('hex'),createHash('md5').update('cmcc-v1-inst|'+state.phone).digest('hex')].join('_');const result=parse((await http(jar,LOGIN+'/login.htm',{form:{accountType:'01',account:encrypt(state.phone),password:encrypt(code),smsPwd:encrypt(code),pwdType:'02',email_sms:'',inputCode:captcha,backUrl:BACK,rememberMe:'0',channelID:'12003',loginMode:'01',protocol:'https:',isNew:'1',deviceId:device,deviceIdSource:'cache',timestamp:String(Date.now())},headers:{'X-Requested-With':'XMLHttpRequest',Origin:LOGIN},deadline})).body);if(String(result?.result)!=='0' || ['3011','3012'].includes(String(result.code)))return {ok:false,code:/^[0-9]{1,10}$/.test(String(result?.code))?String(result.code):'LOGIN_REJECTED'};const target=result.islocal===true?BACK:new URL(String(result.assertAcceptURL || ''));if(target instanceof URL){if(!allowedMobileUrl(target.href))return {ok:false,code:'UNSAFE_REDIRECT'};target.searchParams.set('backUrl',BACK);target.searchParams.set('artifact',String(result.artifact || ''));target.searchParams.set('type',String(result.type || ''));}await http(jar,String(target),{follow:true,deadline});if(!jar.some(c=>['cmccssotoken','is_login'].includes(c.name)))return {ok:false,code:'SSO_INCOMPLETE'};return {ok:true,credentials:{phone:state.phone,jar}};}catch(e){return {ok:false,code:e.message==='Invalid URL'?'SSO_INCOMPLETE':e.message};}},
  wxUsage:async (credentials,deadline)=>{try{const jar=structuredClone(credentials.jar);const home=await http(jar,HOME,{follow:false,deadline});if(home.status===403 || home.status===412)return {ok:false,code:'QUERY_BLOCKED'};if(/系统.{0,8}(?:维护|升级)|暂停.{0,8}服务/.test(home.body.toString()))return {ok:false,code:'MAINTENANCE'};if(home.status>=300 && home.status<400)return {ok:false,code:'TOKEN_EXPIRED'};if(home.status!==200)return {ok:false,code:'HTTP_'+home.status};const csrf=home.body.toString().match(/"csrf":"([^"]+)"/)?.[1];const headers={'X-Requested-With':'XMLHttpRequest','e76ccba5165fa9b4966ad82a0088e520':fingerprint(),Lrsbhbg8:'ZS93dUFVa2kzaEpQSjM0SG55MUFDdz09',...(csrf?{'csrf-token':csrf}:{})};const result=await http(jar,'https://wx.10086.cn/website/uniApi/getNewMarginInfo',{json:{operation:'getCustomerKeyMessage'},headers,deadline});if([403,412].includes(result.status))return {ok:false,code:'QUERY_BLOCKED'};if([301,302,401].includes(result.status))return {ok:false,code:'TOKEN_EXPIRED'};if(result.status!==200)return {ok:false,code:'HTTP_'+result.status};const data=decodeMobile(result.body);if(/未登录|请登录|notLogin/.test(JSON.stringify(data)))return {ok:false,code:'TOKEN_EXPIRED'};const summary=mobileSummary(data);return summary.ok?{ok:true,data:summary,credentials:{phone:credentials.phone,jar}}:summary;}catch(e){return {ok:false,code:e.message};}}
 };
 client.usage=async credentials=>{
  const deadline=Date.now()+22000;
  const shop=await queryMobileShop(credentials,{request,deadline});
  if(shop.ok)return shop;
  const wx=await client.wxUsage(credentials,deadline);
  if(wx.ok)return wx;
  return wx.code==='TOKEN_EXPIRED' && shop.code!=='TOKEN_EXPIRED'?shop:wx;
 };
 return client;
}
