import contextlib, io, json, logging, math, re, sys, time
import requests, certifi
logging.disable(logging.CRITICAL)
_request = requests.sessions.Session.request
def verified_request(self, method, url, **kwargs):
    if kwargs.get("verify") is False:
        raise RuntimeError("TLS verification cannot be disabled")
    kwargs["verify"] = certifi.where()
    kwargs["timeout"] = (5, 12)
    kwargs["allow_redirects"] = False
    return _request(self, method, url, **kwargs)
requests.sessions.Session.request = verified_request
from vendor.hlhk_telecom import Telecom
from vendor.device_auth import TelecomAuth, TelecomAuthError

AUTH_FIELDS = ('phone', '_uid', '_key', '_isct', '_slider', '_candidate_device_id')

def flow_mb(value):
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|B)\s*', str(value), re.I)
    if not match:
        return None
    result = float(match[1]) * {'B': 1/1048576, 'KB': 1/1024, 'MB': 1, 'GB': 1024, 'TB': 1048576}[match[2].upper()]
    return result if math.isfinite(result) else None

def packages(data):
    details = []
    for group in ((data.get('productOFFRatable') or {}).get('ratableResourcePackages') or [])[:30]:
        if not isinstance(group, dict) or '流量' not in str(group.get('title', '')):
            continue
        for item in (group.get('productInfos') or [])[:100]:
            if not isinstance(item, dict) or str(item.get('isInvalid', '0')) != '0':
                continue
            unlimited = str(item.get('isInfiniteAmount', '0')) == '1'
            used = flow_mb(item.get('leftHighlight')) if item.get('leftTitle') == '已用' else None
            remaining = flow_mb(item.get('rightHighlight')) if item.get('rightTitle') == '剩余' else None
            total_match = re.search(r'共\s*(\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB|B))', str(item.get('rightCommon', '')), re.I)
            total = flow_mb(total_match[1]) if total_match else (used + remaining if used is not None and remaining is not None else None)
            if remaining is None and total is None and not unlimited:
                continue
            details.append({'name': str(item.get('title') or group['title'])[:160], 'used_mb': used, 'remaining_mb': None if unlimited else remaining, 'total_mb': None if unlimited else total, 'unlimited': unlimited})
    return {'ok': True, 'details': details, 'package_name': str((data.get('mainProductOFFInfo') or {}).get('productOFFName') or '')[:120]}

def authorize(body):
    auth = TelecomAuth(body.get('phone') or body['state']['phone'])
    for key in AUTH_FIELDS:
        if key in body.get('state', {}):
            setattr(auth, key, body['state'][key])
    try:
        if body['action'] == 'challenge':
            value = {'challenge': auth.get_challenge()}
        elif body['action'] == 'send_sms':
            auth.send_sms(body['distance'], body['track'], body['start_time'], body['end_time'])
            value = {}
        else:
            value = auth.submit_sms(body['code'])
        return dict(value, ok=True, state={key: getattr(auth, key) for key in AUTH_FIELDS})
    except TelecomAuthError as error:
        code = str(error.code)
        return {'ok': False, 'code': code if code.isalnum() and len(code) < 32 else 'AUTH_FAILED'}

def run(body):
    if body['action'] in ('challenge', 'send_sms', 'authorize'):
        return authorize(body)
    client = Telecom()
    if body["action"] == "login":
        raw = client.do_login(body["phone"], body["password"], body.get("device_id", ""))
    else:
        client.set_login_info(body["credentials"])
        raw = client.user_flux_package() if body.get('kind') == 'packages' or body['action'] == 'packages' else client.qry_important_data()
    response = raw.get("responseData") or {}
    data = response.get("data") or {}
    code = str(response.get("resultCode", "NETWORK_ERROR"))
    if code != "0000":
        return {"ok": False, "code": code if code.isalnum() and len(code) < 32 else "UPSTREAM_ERROR"}
    if body["action"] == "login":
        info = data.get("loginSuccessResult") or {}
        if not info.get("token"):
            return {"ok": False, "code": "MISSING_TOKEN"}
        info.pop("password", None)
        info["phonenum"] = body["phone"]
        return {"ok": True, "credentials": info}
    if body['action'] == 'packages':
        return packages(data)
    if body['action'] == 'inspect':
        # Field names and types only. Never expose raw account data or tokens.
        paths = []
        def schema(value, path='', depth=0):
            if depth > 7 or len(paths) >= 250:
                return
            if isinstance(value, dict):
                for key, child in list(value.items())[:80]:
                    if isinstance(key, str) and len(key) < 64 and not any(c.isdigit() for c in key):
                        schema(child, path+'.'+key, depth+1)
            elif isinstance(value, list):
                for child in value[:1]: schema(child, path+'[]', depth+1)
            else:
                paths.append(path+':'+type(value).__name__)
        schema(data)
        return {'ok': True, 'fields': paths}
    flow = data.get("flowInfo") or {}
    def row(key, name):
        value = flow.get(key) or {}
        try:
            used, remaining = float(value["used"]) / 1024, float(value["balance"]) / 1024
            if not all(math.isfinite(n) and n >= 0 for n in (used, remaining)):
                return None
            explicit = value.get('total')
            total = float(explicit)/1024 if explicit is not None and str(explicit).strip() else used + remaining
            if not math.isfinite(total) or total < 0:
                return None
            return {"name": name, "used_mb": used, "remaining_mb": remaining, "total_mb": total}
        except (KeyError, TypeError, ValueError):
            return None
    total = row("totalAmount", "合计")
    if total is None:
        return {"ok": False, "code": "UNKNOWN_FLOW_FORMAT"}
    details = []
    try:
        # Use upstream's unit-aware flowList parser; omit unrecognised packages.
        summary = client.to_summary({'flowInfo': {'flowList': flow.get('flowList') or []}})
        for item in summary.get('flowItems', [])[:100]:
            values = [float(item[key])/1024 for key in ('use', 'balance', 'total')]
            if all(math.isfinite(n) and n >= 0 for n in values):
                details.append(dict(name=str(item['name'])[:120], used_mb=values[0], remaining_mb=values[1], total_mb=values[2]))
    except (KeyError, TypeError, ValueError, AttributeError):
        pass
    return dict(total, ok=True, details=details, breakdown_available=bool(details), signed_rate=None, updated_at=int(time.time()))

if __name__ == "__main__":
    try:
        body = json.loads(sys.stdin.read(32768))
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = run(body)
    except Exception:
        result = {"ok": False, "code": "WORKER_ERROR"}
    print(json.dumps(result, ensure_ascii=True))
