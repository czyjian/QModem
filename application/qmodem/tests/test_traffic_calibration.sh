#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../files/usr/share/qmodem" && pwd)
QMODEM_CALIBRATION_LIBRARY=1
. "$root/traffic_calibration.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
state='{"config":{"enabled":true,"reset_day":1,"reset_hour":0,"reset_minute":0},"now":1000,"stale":false,"cycle":"2026-11-01 00:00"}'
usage='{"used_mb":1024,"total_mb":2048,"updated_at":1000}'
calibration_evaluate "$state" "$usage" 2026-11 1000 | jq -e '.available and .target_bytes==1073741824 and .threshold_bytes==2147483648' >/dev/null
calibration_evaluate "$state" '{"used_mb":0,"total_mb":1024,"updated_at":1000}' 2026-11 1000 | jq -e '.available and .target_bytes==0' >/dev/null
for bad in '{"updated_at":1000}' '{"used_mb":null,"updated_at":1000}' '{"used_mb":-1,"updated_at":1000}' '{"used_mb":1,"total_mb":2048,"updated_at":800}' '{"used_mb":1,"total_mb":2048,"updated_at":2000}'; do
    calibration_evaluate "$state" "$bad" 2026-11 1000 | jq -e '.available==false' >/dev/null
done
for bad in '{"used_mb":1,"total_mb":null,"updated_at":1000}' '{"used_mb":1,"total_mb":0,"updated_at":1000}' '{"used_mb":1,"total_mb":100,"details":[{"unlimited":true}],"updated_at":1000}'; do
    calibration_evaluate "$state" "$bad" 2026-11 1000 | jq -e '.available==false' >/dev/null
done
for change in '.stale=true' '.config.enabled=false' '.config.reset_day=5' '.cycle="2026-10-01 00:00"' '.now=2000'; do
    changed=$(printf '%s' "$state" | jq -c "$change")
    calibration_evaluate "$changed" "$usage" 2026-11 1000 | jq -e '.available==false' >/dev/null
done

TRAFFIC_RAM="$tmp/ram";TRAFFIC_STORE="$tmp/store"
mkdir -p "$TRAFFIC_RAM" "$TRAFFIC_STORE"
fake_day=2026-11-06
date() { case "$1" in +%H:%M) echo 03:00;; +%F) echo "$fake_day";; +%s) echo 1000;; *) echo "$fake_day 03:00:00";; esac; }
calibration_config() { echo '{"enabled":true,"hour":3,"minute":0}'; }
qmodem_valid_instance() { [ "$1" = modem0 ]; }
calibration_probe() { echo '{"available":true,"target_bytes":1073741824,"threshold_bytes":2147483648,"cycle":"2026-11-01 00:00","sim_identity":"460011234567890"}'; }
ubus() {
    case "$4" in
        sim_info) echo '{"modem_info":[{"key":"IMSI","value":"460011234567890"}]}' ;;
        correct_bytes) printf '%s\n' "$5" >> "$tmp/writes"; echo '{"success":true}' ;;
        *) echo '{}';;
    esac
}
calibration_tick modem0
jq -e '.status=="success" and .target_bytes==1073741824' "$TRAFFIC_STORE/modem0.autocalibration.json" >/dev/null
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 1 ]
calibration_tick modem0
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 1 ]
fake_day=2026-11-07
calibration_probe() { echo '{"available":false,"reason":"尚未登录或登录已过期"}'; }
calibration_tick modem0
jq -e '.status=="skipped"' "$TRAFFIC_STORE/modem0.autocalibration.json" >/dev/null
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 1 ]
fake_day=2026-11-08
calibration_probe() { echo '{"available":true,"target_bytes":1073741824,"threshold_bytes":2147483648,"cycle":"2026-11-01 00:00","sim_identity":"460019999999999"}'; }
calibration_tick modem0
jq -e '.status=="skipped"' "$TRAFFIC_STORE/modem0.autocalibration.json" >/dev/null
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 1 ]
# Immediate calibration works with the daily switch disabled and preserves the daily marker.
calibration_config() { echo '{"enabled":false,"hour":3,"minute":0}'; }
calibration_probe() { echo '{"available":true,"target_bytes":1073741824,"threshold_bytes":2147483648,"cycle":"2026-11-01 00:00","sim_identity":"460011234567890"}'; }
calibration_tick modem0 manual | jq -e '.success' >/dev/null
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 2 ]
jq -e '.key=="2026-11-08 03:00"' "$TRAFFIC_STORE/modem0.autocalibration.json" >/dev/null
calibration_probe() { echo '{"available":false,"reason":"尚未登录或登录已过期"}'; }
calibration_tick modem0 manual | jq -e '.success==false and .error=="尚未登录或登录已过期"' >/dev/null
[ "$(wc -l < "$tmp/writes" | tr -d ' ')" = 2 ]
echo 'PASS: carrier byte units, unknown/stale usage, monthly-cycle guards, once-daily execution, logged-out skip and SIM-change rejection'
