#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../root/usr/share/qmodem" && pwd)
QMODEM_CALIBRATION_LIBRARY=1
. "$root/traffic_calibration.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
TRAFFIC_RAM="$tmp/ram"; TRAFFIC_STORE="$tmp/store"
mkdir -p "$TRAFFIC_RAM" "$TRAFFIC_STORE"
qmodem_valid_instance() { [ "$1" = modem0 ]; }
calibration_config() { echo '{"enabled":false,"hour":3,"minute":0}'; }
uci() { echo 1; }
test_identity=460011234567890
ready=ready
logged=false
expired=false
test_revision=1
fail_query=false
ubus() {
    case "$4" in
        sim_info) jq -nc --arg identity "$test_identity" --arg ready "$ready" '{modem_info:[{key:"SIM Status",value:$ready},{key:"IMSI",value:$identity}]}' ;;
        correct_bytes) echo write >> "$tmp/writes"; echo '{"success":true}';;
    esac
}
curl() { cat >/dev/null; jq -nc --argjson logged "$logged" --argjson revision "$test_revision" '{ok:true,logged_in:$logged,session_revision:$revision}'; }
calibration_probe() {
    echo probe >> "$tmp/probes"
    if [ "$expired" = true ]; then echo '{"available":false,"login_required":true,"reason":"尚未登录或登录已过期"}'; return; fi
    jq -nc --arg sim "$test_identity" '{available:true,sim_identity:$sim,target_bytes:1024,threshold_bytes:2048,cycle:"test-cycle"}'
}
jq -nc --argjson now "$(date +%s)" '{now:$now}' > "$TRAFFIC_RAM/modem0.json"
calibration_watch_sim modem0
jq -e '.pending==true' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
[ ! -f "$tmp/probes" ]
logged=true
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 1 ]
jq -e '.pending==false' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 1 ]
# Re-source as a service restart; durable state must suppress duplicates.
. "$root/traffic_calibration.sh"
calibration_config() { echo '{"enabled":false,"hour":3,"minute":0}'; }
calibration_probe() {
    echo probe >> "$tmp/probes"
    if [ "$fail_query" = true ]; then
        jq -nc --arg sim "$test_identity" '{available:false,sim_identity:$sim,reason:"运营商用量查询失败"}'; return
    fi
    if [ "$expired" = true ]; then
        jq -nc --arg sim "$test_identity" '{available:false,sim_identity:$sim,login_required:true,reason:"尚未登录或登录已过期"}'; return
    fi
    jq -nc --arg sim "$test_identity" '{available:true,sim_identity:$sim,target_bytes:1024,threshold_bytes:2048,cycle:"test-cycle"}'
}
# Re-sourcing restores defaults; keep all test state in the temporary tree.
TRAFFIC_RAM="$tmp/ram"; TRAFFIC_STORE="$tmp/store"
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 1 ]
ready=miss
calibration_watch_sim modem0
ready=ready
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 1 ]
test_identity=460031234567890
logged=false
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 1 ]
jq -e '.pending==true' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
logged=true
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 2 ]
test_identity=460011234567890
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 3 ]
! grep -q "$test_identity" "$TRAFFIC_STORE/modem0.simwatch.json"
test_identity=460001234567890
expired=true
calibration_watch_sim modem0
jq -e '.pending==true' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
[ "$(wc -l < "$tmp/writes")" -eq 3 ]
expired=false
test_revision=$((test_revision+1))
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 4 ]
test_identity=460061234567890
exec 4>"$TRAFFIC_RAM/modem0.calibration.lock"
flock -n 4
calibration_watch_sim modem0
jq -e '.pending==true' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
flock -u 4; exec 4>&-
jq '.next_at=0' "$TRAFFIC_STORE/modem0.simwatch.json" > "$tmp/new"
mv "$tmp/new" "$TRAFFIC_STORE/modem0.simwatch.json"
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 5 ]
# Query errors retain the pending task, use bounded backoff, and a fresh login
# immediately resumes it even after exhausting the old login's retry budget.
test_identity=460071234567890
fail_query=true
calibration_watch_sim modem0
jq -e '.pending==true and .attempts==1' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
probes=$(wc -l < "$tmp/probes")
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/probes")" -eq "$probes" ]
for attempt in 2 3; do
    jq '.next_at=0' "$TRAFFIC_STORE/modem0.simwatch.json" > "$tmp/new"
    mv "$tmp/new" "$TRAFFIC_STORE/modem0.simwatch.json"
    calibration_watch_sim modem0
    jq -e --argjson attempt "$attempt" '.pending==true and .attempts==$attempt' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
done
jq '.next_at=0' "$TRAFFIC_STORE/modem0.simwatch.json" > "$tmp/new"
mv "$tmp/new" "$TRAFFIC_STORE/modem0.simwatch.json"
probes=$(wc -l < "$tmp/probes")
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/probes")" -eq "$probes" ]
fail_query=false
test_revision=$((test_revision+1))
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 6 ]
jq -e '.pending==false and .completed==true and .attempts==1' "$TRAFFIC_STORE/modem0.simwatch.json" >/dev/null
# An old release's consumed-but-failed marker is repaired without another swap.
jq '.pending=false | del(.completed) | .next_at=0' "$TRAFFIC_STORE/modem0.simwatch.json" > "$tmp/new"
mv "$tmp/new" "$TRAFFIC_STORE/modem0.simwatch.json"
calibration_record modem0 '' skipped '运营商用量查询失败'
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 7 ]
calibration_config() { echo '{"enabled":false,"hour":3,"minute":0,"simchange_enabled":false}'; }
test_identity=460031234567890
calibration_watch_sim modem0
[ "$(wc -l < "$tmp/writes")" -eq 7 ]
calibration_tick modem0 manual | jq -e '.success' >/dev/null
[ "$(wc -l < "$tmp/writes")" -eq 8 ]
# The real configuration defaults to on and accepts an explicit off.
. "$root/traffic_calibration.sh"
uci() { :; }
calibration_config modem0 | jq -e '.simchange_enabled==true' >/dev/null
uci() { case "$*" in *traffic_calibration_simchange) echo 0;; esac; }
calibration_config modem0 | jq -e '.simchange_enabled==false' >/dev/null
echo 'PASS: SIM-bound one-shot calibration, login deferral, restart deduplication and daily toggle independence'
