#!/bin/sh
set -eu
# Run on the router; use a 60-second test session, never the user's login.
sid="$(ubus call session create '{"timeout":60}' | jsonfilter -e '@.ubus_rpc_session')"
[ "${#sid}" = 32 ]
trap 'ubus call session destroy "{\"ubus_rpc_session\":\"$sid\"}" >/dev/null 2>&1' EXIT HUP INT TERM
ubus call session grant "{\"ubus_rpc_session\":\"$sid\",\"scope\":\"ubus\",\"objects\":[[\"qmodem\",\"sim_info\"]]}" >/dev/null
ubus call session set "{\"ubus_rpc_session\":\"$sid\",\"values\":{\"username\":\"qmodem-test\",\"token\":\"qmodem-bridge-test\"}}" >/dev/null
ubus call session grant "{\"ubus_rpc_session\":\"$sid\",\"scope\":\"access-group\",\"objects\":[[\"luci-app-qmodem-next\",\"read\"]]}" >/dev/null
endpoint=http://127.0.0.1/cgi-bin/luci/admin/modem/unicom_api
check() {
	expected="$1"; shift
	actual="$(curl --silent --output /tmp/qmodem-unicom-bridge-test.json --write-out '%{http_code}' "$@")"
	[ "$actual" = "$expected" ] || { printf 'FAIL: expected %s got %s\n' "$expected" "$actual"; exit 1; }
}
check 403 -X POST -H 'Content-Type: application/json' -d '{}' "$endpoint/gettoken/?action=login"
check 200 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/json' -d '{}' "$endpoint/gettoken/?action=login"
# An empty phone is rejected locally; these tests cannot send an SMS or login.
grep -q '手机号' /tmp/qmodem-unicom-bridge-test.json
check 403 --cookie "sysauth_http=$sid" -X POST -H 'Origin: http://other.invalid' -H 'Content-Type: application/json' -d '{}' "$endpoint/gettoken/?action=login"
check 404 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/json' -d '{}' "$endpoint/unknown"
check 400 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/json' -d '{}' "$endpoint/gettoken/?action=unknown"
check 405 --cookie "sysauth_http=$sid" "$endpoint/ocs_proxy/"
check 415 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d '{}' "$endpoint/ocs_proxy/"
if [ "${REQUIRE_SHARED_SESSION:-0}" = 1 ]; then
	# This independent LuCI session has no browser storage or carrier token.
	check 200 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/json' -d '{"action":"status"}' "$endpoint/shared/"
	[ "$(jsonfilter -i /tmp/qmodem-unicom-bridge-test.json -e '@.logged_in')" = true ]
	check 200 --cookie "sysauth_http=$sid" -X POST -H 'Content-Type: application/json' -d '{"action":"usage"}' "$endpoint/shared/"
	[ "$(jsonfilter -i /tmp/qmodem-unicom-bridge-test.json -e '@.ok')" = true ]
	printf 'PASS: independent LuCI session queries shared usage without carrier credentials\n'
fi
rm -f /tmp/qmodem-unicom-bridge-test.json
printf 'PASS: bridge session ACL, same-origin guard, endpoint/action allowlist, method and content type\n'
