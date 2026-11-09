#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../root/usr/share/qmodem" && pwd)
QMODEM_CALIBRATION_LIBRARY=1
. "$root/traffic_calibration.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
TRAFFIC_STORE="$tmp/store"
mkdir -p "$TRAFFIC_STORE"
test_identity=460031234567890
calibration_config() { echo '{"enabled":true,"hour":3,"minute":0}'; }
uci() { :; }
ubus() {
    case "$*" in
        *sim_info*) printf '{"modem_info":[{"key":"SIM Status","value":"ready"},{"key":"IMSI","value":"%s"}]}' "$test_identity";;
        *current*) printf '{"config":{"enabled":true,"reset_day":1,"reset_hour":0,"reset_minute":0},"now":%s,"stale":false,"cycle":"%s"}' "$(date +%s)" "$(date '+%Y-%m-01 00:00')";;
    esac
}
curl() {
    printf '%s' "$*" > "$tmp/url"
    cat > "$tmp/payload"
    printf '{"ok":true,"used_mb":1024,"total_mb":2048,"updated_at":%s,"details":[]}' "$(date +%s)"
}
calibration_probe modem0 true > "$tmp/result"
grep -q '/telecom_test/' "$tmp/url"
jq -e '.action=="shared_usage" and .refresh==true' "$tmp/payload" >/dev/null
jq -e '.available==true and .target_bytes==1073741824 and .threshold_bytes==2147483648' "$tmp/result" >/dev/null
test_identity=460011234567890
calibration_probe modem0 true > "$tmp/result"
grep -q '/shared/' "$tmp/url"
jq -e '.action=="usage"' "$tmp/payload" >/dev/null
test_identity=460001234567890
calibration_probe modem0 true > "$tmp/result"
grep -q '/mobile/' "$tmp/url"
jq -e '.action=="usage"' "$tmp/payload" >/dev/null
jq -e '.available==true' "$tmp/result" >/dev/null
echo 'PASS: mobile, telecom and unicom calibration select matching sessions and exact byte units'
