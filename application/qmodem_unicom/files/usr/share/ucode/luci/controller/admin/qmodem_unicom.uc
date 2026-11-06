import { mkstemp, popen, readlink } from 'fs';

function fail(code, message) {
	http.status(code);
	http.prepare_content('application/json; charset=utf-8');
	http.header('Cache-Control', 'no-store');
	http.write_json({ ok: false, msg: message });
}

return {
	action_query: function(endpoint) {
		// This route is inside the LuCI cookie path; use the dispatcher's
		// authenticated session instead of copying credentials to another cookie.
		if (!ctx.authsession || ubus.call('session', 'access', {
			ubus_rpc_session: ctx.authsession, scope: 'ubus', object: 'qmodem', function: 'sim_info'
		})?.access != true)
			return fail(403, '请先登录路由器管理页面');

		let scheme = http.getenv('HTTPS') == 'on' ? 'https' : 'http';
		let origin = http.getenv('HTTP_ORIGIN');
		if ((origin && origin != scheme + '://' + http.getenv('HTTP_HOST')) || http.getenv('HTTP_SEC_FETCH_SITE') == 'cross-site')
			return fail(403, '不允许跨站请求');
		if (http.getenv('REQUEST_METHOD') != 'POST') return fail(405, '仅支持 POST 请求');
		if (!match(http.getenv('CONTENT_TYPE') ?? '', /^(application\/json|text\/plain)(;|$)/))
			return fail(415, '请求必须是 JSON');
		let len = http.getenv('CONTENT_LENGTH');
		if (!match(len ?? '', /^[0-9]{1,5}$/) || +len < 1 || +len > 16384)
			return fail(413, '请求正文过大');

		let path;
		if (endpoint == 'gettoken') {
			let query = http.getenv('QUERY_STRING') ?? '';
			if (!match(query, /^action=(send|login|password|validate)$/)) return fail(400, '无效的登录操作');
			path = '/gettoken/?' + query;
		} else if (endpoint == 'ocs_proxy' || endpoint == 'basicdata_proxy' || endpoint == 'qci_proxy' || endpoint == 'shared') {
			path = '/' + endpoint + '/';
		} else return fail(404, '接口不存在');

		let body = http.content();
		if (type(body) != 'string' || length(body) > 16384) return fail(400, '无效的请求正文');
		let payload;
		try { payload = json(body); } catch { return fail(400, '无效的 JSON 请求'); }
		if (type(payload) != 'object') return fail(400, '请求必须是 JSON 对象');
		let section = payload.config_section;
		if (!section) uci.foreach('qmodem', 'modem-device', s => { if (!section) section = s['.name']; });
		if (type(section) != 'string' || !match(section, /^[A-Za-z0-9_]{1,64}$/) || uci.get('qmodem',section) != 'modem-device')
			return fail(400, '请选择有效的模组');
		let info = ubus.call('qmodem','sim_info',{config_section:section}), sim = {};
		for (let item in info?.modem_info) sim[item.key] = item.value;
		if (sim['SIM Status'] != 'ready') return fail(409, 'SIM 卡尚未就绪');
		let identity = sim.IMSI || sim.ICCID;
		if (type(identity) != 'string' || !match(identity, /^[0-9]{10,32}$/)) return fail(409, '无法确认当前 SIM 卡身份');
		// Never trust a browser-provided SIM binding when sharing credentials.
		payload._sim = {section,identity};
		body = sprintf('%J',payload);
		let tmp = mkstemp('/tmp/qmodem-unicom.XXXXXX');
		if (!tmp) return fail(500, '无法创建请求缓冲区');
		tmp.write(body);
		tmp.flush();
		// mkstemp is unlinked immediately. Curl reads its still-open fd; no
		// account data enters argv, environment, persistent files or LuCI logs.
		let fdpath = '/proc/' + readlink('/proc/self') + '/fd/' + tmp.fileno();
		let proc = popen("curl --silent --max-time 25 --noproxy '*' -H 'Content-Type: application/json' --data-binary @" + fdpath + " --write-out '\\n%{http_code}' 'http://127.0.0.1:8788" + path + "'", 'r');
		if (!proc) { tmp.close(); return fail(502, '联通查询服务尚未就绪'); }
		let result = proc.read('all') ?? '';
		proc.close(); tmp.close();
		let lines = split(result, '\n');
		let code = +pop(lines);
		if (!length(lines) || code < 200 || code > 599) return fail(502, '联通查询服务尚未就绪，请稍后重试');
		http.status(code);
		http.prepare_content('application/json; charset=utf-8');
		http.header('Cache-Control', 'no-store');
		http.header('X-Content-Type-Options', 'nosniff');
		http.write(join('\n', lines));
	}
};
