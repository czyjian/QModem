import { parseCookieHeader } from '../upstream/cookies.js';
import { contextKey, ROUTER_TOKEN } from '../sessions.js';
import { networkSummary } from '../network-summary.js';

export function flowSummary(data) {
  const details = [], seen = new Set();
  for (const group of [data?.resources?.[0], data?.unshared?.[0]]) {
    for (const item of group?.details || []) {
      if (!item || item.hide === true || String(item.elemType) !== '3') continue;
      const name = String(item.addUpItemName || item.feePolicyName || '流量包').slice(0,120);
      const key = JSON.stringify([item.feePolicyId, name, item.total, item.endDate, item.flowType, item.addupItemCode]);
      if (seen.has(key)) continue;
      seen.add(key);
      const number = value => ['string','number'].includes(typeof value) && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      const total = number(item.total), used = number(item.use), remaining = number(item.remain);
      const unlimited = String(item.limited) === '1';
      details.push({ name, used_mb: used ?? (!unlimited && total!=null && remaining!=null ? Math.max(0,total-remaining) : null), total_mb: unlimited ? null : total, remaining_mb: unlimited ? null : remaining ?? (total != null && used != null ? Math.max(0,total-used) : null), unlimited });
    }
  }
  const metered = details.filter(item => !item.unlimited);
  return {
    package_name: String(data?.packageName || '').slice(0,120),
    used_mb: details.length && details.every(item=>item.used_mb!=null) ? details.reduce((sum,item)=>sum+item.used_mb,0) : null,
    total_mb: metered.length && metered.every(item=>item.total_mb != null) ? metered.reduce((sum,item)=>sum+item.total_mb,0) : null,
    remaining_mb: metered.length && metered.every(item=>item.remaining_mb != null) ? metered.reduce((sum,item)=>sum+item.remaining_mb,0) : null,
    details,
  };
}

export function registerShared(app, { upstream, store }) {
  // The LuCI controller supplies _sim after reading the actual SIM. It is not
  // accepted from the browser as authority, nor returned to other browsers.
  const cache = new Map(), pending = new Map();
  async function usage(context, logger, refresh) {
    const key = contextKey(context), session = store.get(context);
    if (!session) return { ok:false, code:'TOKEN_EXPIRED', msg:'请先登录联通' };
    const previous = cache.get(key);
    if (!refresh && previous?.session === session && Date.now()-previous.time < 30000) return previous.result;
    if (pending.has(key)) return pending.get(key);
    const query=method=>Promise.resolve().then(()=>upstream[method]?.(session.ecsToken,logger,parseCookieHeader(session.cookie)));
    const task = Promise.allSettled([query('queryOcs'),query('queryBasicData'),query('queryQci')]).then(results => {
      if(results[0].status==='rejected') throw results[0].reason;
      const data=results[0].value;
      const success=result=>result.status==='fulfilled' && result.value?.ok!==false && String(result.value?.code)==='0000' ? result.value : null;
      if (store.get(context) !== session) return {ok:false,code:'SESSION_CHANGED',msg:'登录状态已更新，请刷新'};
      if (data?.code === 'TOKEN_EXPIRED' || data?.code === 'BLACKLIST') { store.remove(context); cache.delete(key); return data; }
      if (data?.ok === false || String(data?.code) !== '0000') return {ok:false,code:'UPSTREAM_ERROR',msg:'联通余量查询失败'};
      const result = {ok:true,logged_in:true,mobile:session.mobile,updated_at:Math.floor(Date.now()/1000),...flowSummary(data),...networkSummary(success(results[1]),success(results[2]))};
      cache.set(key, {time:Date.now(),session,result});
      return result;
    }).finally(()=>pending.delete(key));
    pending.set(key,task); return task;
  }
  app.post('/shared/', async (request,reply) => {
    const context = request.body?._sim;
    if (!store || !contextKey(context)) return reply.code(400).send({ok:false,msg:'SIM 卡上下文无效'});
    const action = request.body.action;
    if (action === 'status') { const session=store.get(context); return {ok:true,logged_in:!!session,mobile:session?.mobile || '',token:session ? ROUTER_TOKEN : ''}; }
    if (action === 'logout') { store.remove(context); cache.delete(contextKey(context)); return {ok:true}; }
    if (action === 'import') {
      const token=request.body.ecs_token, cookie=request.body.cookie || '';
      if (store.get(context)) return {ok:true,logged_in:true,token:ROUTER_TOKEN};
      if (typeof token !== 'string' || token.length <=20 || token.length>4096 || token===ROUTER_TOKEN || /[^\x21-\x7e]|[;",\\]/.test(token) || !parseCookieHeader(cookie)) return reply.code(400).send({ok:false,msg:'登录会话无效'});
      const data=await upstream.queryOcs(token, request.log, parseCookieHeader(cookie));
      if (data?.ok === false || String(data?.code)!=='0000') return {ok:false,msg:'原登录会话已失效，请重新登录'};
      store.put(context,{ecsToken:token,cookie},request.body.phone);
      return {ok:true,logged_in:true,token:ROUTER_TOKEN};
    }
    if (action === 'usage') return usage(context,request.log,request.body.refresh === true);
    return reply.code(400).send({ok:false,msg:'无效的会话操作'});
  });
}
