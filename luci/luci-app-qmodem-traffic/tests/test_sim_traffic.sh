#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../root/usr/share/qmodem" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Legacy counters cannot be assigned to a SIM retrospectively.
echo '{"boot":"b","cycle":"c","uptime":0,"cycle_rx":80,"cycle_tx":20,"devices":[{"name":"w","index":1,"rx":80,"tx":20}]}' > "$tmp/state"
sample() {
    jq -n --arg sim "$1" --argjson rx "$2" --argjson tx "$3" --arg cycle "${4:-c}" --arg boot "${5:-b}" \
      '{sim_key:$sim,carrier:"telecom",boot:$boot,cycle:$cycle,now:$rx,uptime:$rx,day:"2026-11-14",month:"2026-11",devices:[{name:"w",index:1,rx:$rx,tx:$tx}]}' > "$tmp/sample"
    jq --slurpfile sample "$tmp/sample" -f "$root/traffic.jq" "$tmp/state" > "$tmp/new"
    mv "$tmp/new" "$tmp/state"
}
sample cardA 90 25
jq -e '.sim_cycle_rx==0 and .sim_cycle_tx==0 and .cycle_rx==90' "$tmp/state" >/dev/null
sample cardA 110 30
jq -e '.sim_cycle_rx==20 and .sim_cycle_tx==5' "$tmp/state" >/dev/null
# Same operator, different SIM: no reuse of the previous card counters.
sample cardB 120 35
jq -e '.sim_cycle_rx==0 and .sim_cycle_tx==0' "$tmp/state" >/dev/null
sample cardB 150 45
jq -e '.sim_cycle_rx==30 and .sim_cycle_tx==10' "$tmp/state" >/dev/null
sample cardA 160 50
jq -e '.sim_cycle_rx==20 and .sim_cycle_tx==5' "$tmp/state" >/dev/null
sample cardA 180 60
jq -e '.sim_cycle_rx==40 and .sim_cycle_tx==15' "$tmp/state" >/dev/null
sample cardA 0 0 c reboot
jq -e '.sim_cycle_rx==40 and .sim_cycle_tx==15' "$tmp/state" >/dev/null
sample '' 10 10 c reboot
jq -e '.sim_cycle_rx==null and .sim_cycle_tx==null' "$tmp/state" >/dev/null
sample cardA 20 20 next reboot
jq -e '.sim_cycle_rx==0 and .sim_cycle_tx==0' "$tmp/state" >/dev/null
sample cardA 30 25 next reboot
jq -e '.sim_cycle_rx==10 and .sim_cycle_tx==5 and .cycle_sims.cardB==null' "$tmp/state" >/dev/null
echo 'PASS: per-SIM directions, same-carrier swaps, returning SIM, legacy migration, reboot and cycle reset'
