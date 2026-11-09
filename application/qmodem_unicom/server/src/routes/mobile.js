import {randomUUID} from 'node:crypto';
import {contextKey} from '../sessions.js';
import {createMobileStore} from '../mobile-store.js';
import {createMobileUpstream} from '../upstream/mobile.js';
const codeOf=code=>/^[A-Z0-9_]{1,40}$/.test(String(code))?String(code):'UPSTREAM_ERROR';
function failure(code,logged=false){code=codeOf(code);const messages={CAPTCHA_REJECTED:'图片验证码不正确，请重新获取图片后手动输入',QUERY_BLOCKED:'已登录移动，但查询站点拒绝了路由器访问；暂勿重复发送短信',MAINTENANCE:'移动查询站点正在维护，请稍后刷新',TOKEN_EXPIRED:'尚未登录或移动登录已过期，请登录后查询',UNKNOWN_FLOW_FORMAT:'移动接口未返回可识别的流量数据',SSO_INCOMPLETE:'移动登录未取得完整查询会话，请保留页面',3011:'移动要求额外身份验证，当前短信登录尚未完成',3012:'移动要求重新完成图片验证',6001:'短信验证码不正确'};return {ok:false,code,logged_in:logged,msg:messages[code] || '移动请求未成功（'+code+'），请保留页面反馈此错误码'};}
export function registerMobile(app,{limiter,store=createMobileStore(),upstream=createMobileUpstream(),now=()=>Date.now()}){
 const pending=new Set(),sessions=new Map(),cache=new Map();
 app.post('/mobile/',async(request,reply)=>{
  const body=request.body || {},sim=body._sim,key=contextKey(sim);
  if(!key)return reply.code(400).send({ok:false,msg:'SIM 卡上下文无效'});
  for(const [id,s] of sessions)if(s.expires<=now())sessions.delete(id);
  if(body.action==='logout'){store.remove(sim);cache.delete(key);for(const [id,s] of sessions)if(s.key===key)sessions.delete(id);return {ok:true};}
  if(body.action==='cancel'){const s=sessions.get(body.session_id);if(s?.key===key)sessions.delete(body.session_id);return {ok:true};}
  if(body.action==='status')return {ok:true,logged_in:!!store.get(sim)};
  if(pending.has(key))return reply.code(409).send({ok:false,msg:'移动请求正在处理中'});
  if(body.action==='usage'){
   const saved=store.get(sim);if(!saved)return failure('TOKEN_EXPIRED');const previous=cache.get(key);
   if(!body.refresh && previous?.session===saved && now()-previous.time<30000)return previous.data;
   if(!limiter.take('mobile-query:'+key,60))return failure('RATE_LIMIT');
   pending.add(key);try{const result=await upstream.usage(saved.credentials);if(store.get(sim)!==saved)return failure('SESSION_CHANGED');if(!result.ok){if(result.code==='TOKEN_EXPIRED'){store.remove(sim);cache.delete(key);return failure(result.code);}return failure(result.code,true);}const entry=store.put(sim,result.credentials),data={...result.data,ok:true,logged_in:true,carrier:'mobile',mobile:entry.mobile};cache.set(key,{session:entry,time:now(),data});return data;}finally{pending.delete(key);}
  }
  if(body.action==='challenge'){
   if(typeof body.phone!=='string' || !/^1\d{10}$/.test(body.phone))return reply.code(400).send({ok:false,msg:'请输入 11 位移动手机号'});
   if(sessions.size>=100 || !limiter.take('mobile-challenge:'+key,10))return failure('RATE_LIMIT');
   pending.add(key);try{const result=await upstream.challenge(body.phone);if(!result.ok)return failure(result.code);for(const [id,s] of sessions)if(s.key===key)sessions.delete(id);const session_id=randomUUID();sessions.set(session_id,{key,state:result.state,expires:now()+600000,sent:false,attempts:0});return {ok:true,session_id,image:result.image};}finally{pending.delete(key);}
  }
  const session=sessions.get(body.session_id);
  if(!session || session.key!==key)return reply.code(401).send({ok:false,msg:'图片验证会话已过期，请重新获取'});
  if(!['send','login'].includes(body.action))return reply.code(400).send({ok:false,msg:'不支持的移动操作'});
  if(body.action==='send'){
   if(session.sent || session.sendBlocked || typeof body.captcha!=='string' || !/^[A-Za-z0-9\u4e00-\u9fff]{1,12}$/.test(body.captcha))return reply.code(400).send({ok:false,msg:'请填写图片验证码；如需重新验证，请手动刷新图片'});
   if(session.nextSendAt>now())return reply.code(429).send({ok:false,code:'SMS_WAIT',can_retry:true,retry_after:Math.ceil((session.nextSendAt-now())/1000),msg:'请等待发码倒计时结束后再试'});
   if(!limiter.take('mobile-send:'+key,5))return failure('RATE_LIMIT');
  }else if(!session.sent || typeof body.code!=='string' || !/^\d{6}$/.test(body.code) || ++session.attempts>5)return reply.code(400).send({ok:false,msg:'请先发送短信，再输入 6 位短信验证码'});
  pending.add(key);try{
   const result=body.action==='send'?await upstream.send(session.state,body.captcha):await upstream.login(session.state,body.code,session.captcha);
   if(sessions.get(body.session_id)!==session)return failure('SESSION_CHANGED');
   if(!result.ok){
    if(body.action==='send'){
     if(result.state)session.state=result.state;
     const retry=['SMS_1','SMS_3'].includes(result.code),canRetry=retry || result.code==='CAPTCHA_REJECTED';
     session.nextSendAt=retry?now()+60000:0;session.sendBlocked=!canRetry;
     const messages={SMS_1:'移动暂时不能发送短信，请至少 60 秒后再试',SMS_3:'移动提示短信获取过于频繁，请至少 60 秒后再试',SMS_2:'移动短信获取次数已达上限，请稍后再试'};
     return {...failure(result.code),msg:messages[result.code] || failure(result.code).msg,can_retry:canRetry,retry_after:retry?60:0};
    }
    return failure(result.code);
   }
   if(body.action==='send'){session.sent=true;session.state=result.state;session.captcha=body.captcha;return {ok:true};}
   store.put(sim,result.credentials);cache.delete(key);sessions.delete(body.session_id);return {ok:true,logged_in:true};
  }finally{pending.delete(key);}
 });
}
