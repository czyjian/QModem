import { UpstreamError } from "../upstream/client.js";
import { parseCookieHeader } from "../upstream/cookies.js";

const MIN_TOKEN_LENGTH = 20;

const QUERIES = [
  { path: "/ocs_proxy/", method: "queryOcs" },
  { path: "/basicdata_proxy/", method: "queryBasicData" },
  { path: "/qci_proxy/", method: "queryQci" },
];

export function registerProxy(app, { upstream, store }) {
  for (const { path, method } of QUERIES) {
    app.post(path, async (request, reply) => {
      const shared = store?.get(request.body?._sim);
      if (store && !shared) return reply.send({ok:false,code:'TOKEN_EXPIRED',msg:'请先登录联通'});
      const token = shared ? shared.ecsToken : typeof request.body?.ecs_token === "string" ? request.body.ecs_token.trim() : "";
      if (token.length <= MIN_TOKEN_LENGTH) {
        return reply.send({ ok: false, code: "TOKEN_EXPIRED", raw: "missing" });
      }
      if (token.length > 4096 || /[^\x21-\x7e]|[;",\\]/.test(token)) {
        return reply.code(400).send({ ok: false, code: "BAD_REQUEST", msg: "Token 格式错误" });
      }
      const cookies = parseCookieHeader(shared ? shared.cookie : request.body?.cookie);
      if (!cookies) return reply.code(400).send({ ok: false, code: "BAD_REQUEST", msg: "登录会话格式错误" });

      try {
        const result = await upstream[method](token, request.log, cookies);
        if (store && method === 'queryOcs' && ['TOKEN_EXPIRED','BLACKLIST'].includes(result?.code) && store.get(request.body._sim) === shared) store.remove(request.body._sim);
        return reply.send(result);
      } catch (error) {
        if (error instanceof UpstreamError) {
          request.log.warn({ status: error.status, method }, "上游查询失败");
          return reply.code(502).send({ ok: false, msg: error.message, code: "UPSTREAM_ERROR" });
        }
        throw error;
      }
    });
  }
}
