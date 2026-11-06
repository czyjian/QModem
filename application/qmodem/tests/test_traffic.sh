#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../files/usr/share/qmodem" && pwd)
QMODEM_TRAFFIC_LIBRARY=1
. "$root/traffic.sh"
[ "$(traffic_cycle 2026 11 1 0 0 1 0 0)" = '2026-11-01 00:00' ]
[ "$(traffic_cycle 2026 11 1 0 0 1 1 0)" = '2026-10-01 01:00' ]
[ "$(traffic_cycle 2026 2 28 0 0 31 0 0)" = '2026-02-28 00:00' ]
[ "$(traffic_cycle 2024 2 28 0 0 31 0 0)" = '2024-01-31 00:00' ]
[ "$(traffic_cycle 2024 2 29 0 0 31 0 0)" = '2024-02-29 00:00' ]
[ "$(traffic_cycle 2026 1 1 0 0 31 0 0)" = '2025-12-31 00:00' ]
# IPv4/IPv6 on one L3 device must be counted once; distinct devices are retained.
uci() { :; }
ubus() { printf '%s\n' '{"up":true,"l3_device":"wwan0"}'; }
[ "$(traffic_devices modem0)" = wwan0 ]
ubus() {
    case "$3" in *.modem0v6) echo '{"up":true,"l3_device":"wwan1"}';;
        *) echo '{"up":true,"l3_device":"wwan0"}';; esac
}
[ "$(traffic_devices modem0 | wc -l | tr -d ' ')" = 2 ]
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo '{}' > "$tmp/state"
sample()
{
    jq -n --argjson rx "$1" --argjson tx "$2" --argjson uptime "$3" --arg cycle "$4" --arg boot "${5:-boot1}" \
        '{now:(1793491200+$uptime),uptime:$uptime,boot:$boot,cycle:$cycle,day:"2026-11-01",month:"2026-11",devices:[{name:"wwan0",index:5,rx:$rx,tx:$tx}]}' > "$tmp/sample"
    jq --slurpfile sample "$tmp/sample" -f "$root/traffic.jq" "$tmp/state" > "$tmp/new"
    mv "$tmp/new" "$tmp/state"
}
# Never charge historical bytes from before the collector was installed.
sample 1000000 2000000 10 c1
jq -e '.total_rx==0 and .total_tx==0' "$tmp/state" >/dev/null
sample 1001000 2000500 20 c1
jq -e '.total_rx==1000 and .total_tx==500 and .rx_rate==100 and .tx_rate==50 and .cycle_rx==1000' "$tmp/state" >/dev/null
# Counter resets and router reboots cannot create negative or huge deltas.
sample 100 50 30 c1
jq -e '.total_rx==1000 and .rx_rate==0' "$tmp/state" >/dev/null
sample 300 150 40 c2
jq -e '.cycle_rx==200 and .cycle_tx==100 and .daily["2026-11-01"].rx==1200 and .total_rx==1200' "$tmp/state" >/dev/null
sample 99999 88888 10 c2 boot2
jq -e '.total_rx==1200 and .rx_rate==0 and (.live|length)==1' "$tmp/state" >/dev/null
# Additional IPv6-only devices contribute independently.
jq '.devices += [{name:"wwan6",index:6,rx:100,tx:50}] | .uptime=20' "$tmp/sample" > "$tmp/s2"
jq --slurpfile sample "$tmp/s2" -f "$root/traffic.jq" "$tmp/state" > "$tmp/state2"
jq '.devices[1].rx=600 | .devices[1].tx=350 | .uptime=30' "$tmp/s2" > "$tmp/s3"
jq --slurpfile sample "$tmp/s3" -f "$root/traffic.jq" "$tmp/state2" | jq -e '.total_rx==1700 and .total_tx==900' >/dev/null
# Exercise the actual RPC validation without changing host UCI.
mkdir -p "$tmp/lib" "$tmp/bin"
cat > "$tmp/lib/instance.sh" <<'EOF'
qmodem_valid_instance() { [ "$1" = modem0 ]; }
qmodem_config_lock() { :; }
qmodem_config_unlock() { :; }
EOF
cat > "$tmp/bin/uci" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$TRAFFIC_TEST_UCI_LOG"
case "$*" in '-q get qmodem.modem0.traffic_threshold_gb') echo 1;; esac
EOF
chmod +x "$tmp/bin/uci"
export QMODEM_HOME="$tmp/lib" TRAFFIC_TEST_UCI_LOG="$tmp/uci.log"
export PATH="$tmp/bin:$PATH"
rpc_file="$root/../../libexec/rpcd/qmodem.traffic"
payload='{"config_section":"modem0","enabled":true,"reset_day":31,"reset_hour":23,"reset_minute":59,"threshold_gb":"0.001"}'
printf '%s\n' "$payload" | sh "$rpc_file" call configure | jq -e '.success==true' >/dev/null
for expr in '.reset_day=0' '.reset_day=32' '.reset_day=1.5' '.reset_hour=24' '.reset_minute=60' '.enabled="true"' '.threshold_gb="-1"' '.threshold_gb="1e3"' '.threshold_gb="0.0001"' '.config_section="../escape"'; do
    : > "$tmp/uci.log"
    if printf '%s' "$payload" | jq "$expr" | jq -c . | sh "$rpc_file" call configure > "$tmp/result"; then
        echo "FAIL: accepted $expr" >&2; exit 1
    fi
    [ ! -s "$tmp/uci.log" ]
done
export QMODEM_TRAFFIC_RAM="$tmp/ram" QMODEM_TRAFFIC_STORE="$tmp/store"
mkdir -p "$QMODEM_TRAFFIC_RAM" "$QMODEM_TRAFFIC_STORE"
jq -n --argjson now "$(date +%s)" '{now:$now,cycle:"cycle1",cycle_rx:200000000,cycle_tx:100000000,total_rx:200000000,total_tx:100000000,daily:{"2026-11-01":{rx:200000000,tx:100000000}},monthly:{"2026-11":{rx:200000000,tx:100000000}}}' > "$tmp/ram/modem0.json"
printf '%s\n' '{"config_section":"modem0","target_gb":"2.5","cycle":"cycle1"}' | sh "$rpc_file" call correct | jq -e '.success' >/dev/null
get_current() { printf '%s\n' '{"config_section":"modem0"}' | sh "$rpc_file" call current; }
get_current | jq -e '.cycle_total==2500000000 and .cycle_adjustment==2200000000 and .total_rx==200000000 and .exceeded' >/dev/null
# Future traffic accumulates on the corrected baseline, without rewriting history.
jq '.cycle_rx+=100000000 | .total_rx+=100000000' "$tmp/ram/modem0.json" > "$tmp/ram/new"
mv "$tmp/ram/new" "$tmp/ram/modem0.json"
get_current | jq -e '.cycle_total==2600000000' >/dev/null
# Reject corrections made against an old billing cycle.
if printf '%s\n' '{"config_section":"modem0","target_gb":"5","cycle":"old-cycle"}' | sh "$rpc_file" call correct > /dev/null 2>&1; then exit 1; fi
# Negative offsets are valid when the operator reports less than local counters.
printf '%s\n' '{"config_section":"modem0","target_gb":"0.1","cycle":"cycle1"}' | sh "$rpc_file" call correct | jq -e '.success' >/dev/null
get_current | jq -e '.cycle_total==100000000 and .cycle_adjustment == -300000000 and (.exceeded|not)' >/dev/null
# Persistent baseline and correction survive loss of volatile RAM state.
rm "$tmp/ram/modem0.json"
get_current | jq -e '.cycle_total==100000000' >/dev/null
cp "$tmp/store/modem0.json" "$tmp/ram/modem0.json"
jq '.cycle="cycle2" | .cycle_rx=100 | .cycle_tx=200' "$tmp/ram/modem0.json" > "$tmp/ram/new"
mv "$tmp/ram/new" "$tmp/ram/modem0.json"
get_current | jq -e '.cycle_total==300 and .cycle_adjustment==0' >/dev/null
printf '%s\n' '{"config_section":"modem0"}' | sh "$rpc_file" call clear_correction | jq -e '.success' >/dev/null
get_current | jq -e '.cycle_total==300' >/dev/null
# Carrier MB is binary; the exact-byte endpoint must not apply decimal GB units.
printf '%s\n' '{"config_section":"modem0","target_bytes":"1073741824","cycle":"cycle2"}' | sh "$rpc_file" call correct_bytes | jq -e '.success' >/dev/null
printf '%s\n' '{"config_section":"modem0"}' | sh "$rpc_file" call get | jq -e '.cycle_total==1073741824 and .cycle_rx==100 and .cycle_tx==200 and .total_rx==300000000 and .daily["2026-11-01"].rx==200000000' >/dev/null
printf '%s\n' '{"config_section":"modem0","target_bytes":"1073741824","threshold_bytes":"2147483648","cycle":"cycle2"}' | sh "$rpc_file" call correct_bytes | jq -e '.success' >/dev/null
grep -q 'traffic_threshold_bytes=2147483648' "$tmp/uci.log"
for bytes in '-1' '1e9' '0.5' '1000000000000001'; do
    if printf '{"config_section":"modem0","target_bytes":"%s","cycle":"cycle2"}\n' "$bytes" | sh "$rpc_file" call correct_bytes >/dev/null 2>&1; then exit 1; fi
done
for limit in '0' '-1' '1e9' '0.5' '1000000000000001'; do
    if printf '{"config_section":"modem0","target_bytes":"1","threshold_bytes":"%s","cycle":"cycle2"}\n' "$limit" | sh "$rpc_file" call correct_bytes >/dev/null 2>&1; then exit 1; fi
done
if printf '%s\n' '{"config_section":"modem0","target_bytes":"1","cycle":"old"}' | sh "$rpc_file" call correct_bytes >/dev/null 2>&1; then exit 1; fi
printf '%s\n' '{"config_section":"modem0","enabled":false,"hour":3,"minute":0}' | sh "$rpc_file" call calibration_configure | jq -e '.success' >/dev/null
if printf '%s\n' '{"config_section":"modem0","enabled":true,"hour":24,"minute":0}' | sh "$rpc_file" call calibration_configure >/dev/null 2>&1; then exit 1; fi
printf '%s\n' '{"config_section":"modem0","target_gb":"1","cycle":"cycle2","unit_base":1024}' | sh "$rpc_file" call correct | jq -e '.success' >/dev/null
get_current | jq -e '.cycle_total==1073741824' >/dev/null
printf '%s\n' '{"config_section":"modem0","enabled":true,"reset_day":1,"reset_hour":0,"reset_minute":0,"threshold_gb":"139","unit_base":1024}' | sh "$rpc_file" call configure | jq -e '.success' >/dev/null
grep -q 'traffic_threshold_bytes=149250113536' "$tmp/uci.log"
echo 'PASS: binary manual calibration and threshold; legacy decimal inputs unchanged'
echo 'PASS: billing calendar, IPv4/IPv6 deduplication, counter resets, reboot, cycle rollover and history'
echo 'PASS: cycle corrections, future increments, persistence, negative offsets, rollover and clear'
