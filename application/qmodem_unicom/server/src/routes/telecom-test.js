import {randomUUID} from 'node:crypto';
import {contextKey} from '../sessions.js';
import {createTelecomUpstream} from '../upstream/hlhk-python.js';
import {createTelecomStore} from '../telecom-store.js';
export function registerTelecomTest(app,{limiter,upstream=createTelecomUpstream(),store=createTelecomStore(),now=()=>Date.now()}){
  const sessions=new Map(),busy=new Set(),cache=new Map();
  app.post('/telecom_test/',async(request,reply)=>{
    const body=request.body || {},context=contextKey(body._sim);
    if(!context)return reply.code(400).send({ok:false,msg:'模组上下文无效'});
    for(const [id,s] of sessions)if(s.expires<=now())sessions.delete(id);
    const session=sessions.get(body.session_id);
    if(body.action==='shared_logout'){store.remove(body._sim);cache.delete(context);return {ok:true};}
    if(body.action==='shared_status')return {ok:true,logged_in:!!store.get(body._sim)};
    if(body.action==='shared_usage' || body.action==='inspect'){
      const saved=store.get(body._sim);
      if(!saved)return {ok:false,code:'TOKEN_EXPIRED',msg:'请先登录电信'};
      if(busy.has(context))return {ok:false,code:'BUSY',msg:'查询处理中，请稍后刷新'};
      const previous=cache.get(context);
      if(body.action==='shared_usage' && !body.refresh && previous?.session===saved && now()-previous.time<30000)return previous.result;
      if(!limiter.take('hlhk-shared:'+context,60))return {ok:false,msg:'查询过于频繁'};
      busy.add(context);
      try{
        const result=body.action==='inspect'?await upstream.inspect(saved.credentials,body.kind):await upstream.usage(saved.credentials);
        if(store.get(body._sim)!==saved)return {ok:false,code:'SESSION_CHANGED',msg:'登录状态已更新，请刷新'};
        if(!result.ok){
          if(body.action==='inspect')return {ok:false,code:result.code,msg:'扩展接口暂不可用'};
          if(['X201','X202','TOKEN_EXPIRED'].includes(result.code)){store.remove(body._sim);cache.delete(context);return {ok:false,code:'TOKEN_EXPIRED',msg:'电信查询登录已失效，请重新登录'};}
          return {ok:false,msg:'电信查询失败（'+result.code+'），未自动重新登录'};
        }
        if(body.action==='inspect')return result;
        const value={...result,carrier:'telecom',mobile:saved.mobile,logged_in:true};cache.set(context,{session:saved,time:now(),result:value});return value;
      }finally{busy.delete(context);}
    }
    if(body.action==='logout'){if(session?.context===context)sessions.delete(body.session_id);return {ok:true};}
    if(!['challenge','send_sms','authorize','login','usage'].includes(body.action))return reply.code(400).send({ok:false,msg:'不支持的操作'});
    if(busy.has(context))return reply.code(409).send({ok:false,msg:'请求处理中，请稍候'});
    if(['challenge','send_sms','authorize'].includes(body.action)){
      if(body.action==='challenge'){
        if(typeof body.phone!=='string' || !/^1\d{10}$/.test(body.phone))return reply.code(400).send({ok:false,msg:'请输入 11 位手机号'});
        if(sessions.size>=100 || !limiter.take('hlhk-challenge:'+context,10))return reply.code(429).send({ok:false,msg:'获取验证过于频繁'});
      }else{
        if(!session || session.context!==context || !session.state)return reply.code(401).send({ok:false,msg:'设备授权已过期，请重新获取验证'});
        if(body.action==='send_sms'){
          if(session.sent || !Number.isFinite(body.distance) || body.distance<0 || body.distance>1 || typeof body.track!=='string' || body.track.length>8000 || !/^[0-9.#%]+$/.test(body.track) || !Number.isSafeInteger(body.start_time) || !Number.isSafeInteger(body.end_time) || body.end_time<=body.start_time || body.end_time-body.start_time>120000)return reply.code(400).send({ok:false,msg:'请手动完成滑块验证，请勿重复发送'});
          if(!limiter.take('hlhk-sms:'+context,5))return reply.code(429).send({ok:false,msg:'短信发送过于频繁'});
          session.sent=true;
        }else if(!session.sent || typeof body.code!=='string' || !/^\d{6}$/.test(body.code) || ++session.attempts>5)return reply.code(400).send({ok:false,msg:'请先发送短信，再输入 6 位验证码'});
      }
      busy.add(context);
      try{
        const action=body.action;
        const result=await upstream.authorize(action==='challenge'?{action,phone:body.phone}:action==='send_sms'?{action,state:session.state,distance:body.distance,track:body.track,start_time:body.start_time,end_time:body.end_time}:{action,state:session.state,code:body.code});
        if(!result.ok)return {ok:false,msg:'设备授权失败（'+result.code+'）'};
        if(action==='challenge'){
          const session_id=randomUUID();sessions.set(session_id,{context,state:result.state,sent:false,attempts:0,expires:now()+600000});
          return {ok:true,session_id,challenge:result.challenge};
        }
        if(action==='send_sms'){session.state=result.state;return {ok:true};}
        sessions.delete(body.session_id);
        return {ok:true,device_id:result.device_id};
      }finally{busy.delete(context);}
    }
    if(body.action==='login'){
      if(typeof body.phone!=='string' || !/^1\d{10}$/.test(body.phone) || typeof body.password!=='string' || !/^\d{6}$/.test(body.password) || typeof (body.device_id ?? '')!=='string' || (body.device_id || '').length>256)return reply.code(400).send({ok:false,msg:'请输入正确的手机号、6 位服务密码和 DeviceId'});
      if(sessions.size>=100 || !limiter.take('hlhk-login:'+context,5))return reply.code(429).send({ok:false,msg:'登录过于频繁，请稍后重试'});
    }else{
      if(!session || session.context!==context || !session.credentials)return reply.code(401).send({ok:false,msg:'测试会话已过期，请重新登录'});
      if(!limiter.take('hlhk-query:'+context,30))return reply.code(429).send({ok:false,msg:'查询过于频繁，请稍后重试'});
    }
    busy.add(context);
    try{
      if(body.action==='login'){
        const result=await upstream.login(body.phone,body.password,body.device_id || '');
        if(!result.ok)return {ok:false,msg:'原版协议登录失败（'+result.code+'）；若为 3006，请检查短信授权 DeviceId。'};
        const session_id=randomUUID();sessions.set(session_id,{context,credentials:result.credentials,expires:now()+900000});
        if(body.shared===true){store.put(body._sim,result.credentials);cache.delete(context);}
        return {ok:true,session_id};
      }
      const result=await upstream.usage(session.credentials);
      if(!result.ok)return {ok:false,msg:'原版协议流量查询失败（'+result.code+'）；未自动重新登录，请保留弹框。'};
      return result;
    }finally{busy.delete(context);}
  });
}
