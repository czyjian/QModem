#!/bin/sh
set -eu
root=$(CDPATH= cd "$(dirname "$0")/../root/usr/share/qmodem" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo '{"boot":"b","cycle":"c","uptime":0,"cycle_rx":80,"cycle_tx":20,"devices":[{"name":"w","index":1,"rx":80,"tx":20}]}' > "$tmp/state"
sample() {
    jq -n --arg carrier "$1" --argjson rx "$2" --arg cycle "${3:-c}" --arg boot "${4:-b}" \
      '{carrier:$carrier,boot:$boot,cycle:$cycle,now:$rx,uptime:$rx,day:"2026-11-11",month:"2026-11",devices:[{name:"w",index:1,rx:$rx,tx:20}]}' > "$tmp/sample"
    jq --slurpfile sample "$tmp/sample" -f "$root/traffic.jq" "$tmp/state" > "$tmp/new"
    mv "$tmp/new" "$tmp/state"
    jq -e '([.cycle_carriers[]]|add)==(.cycle_rx+.cycle_tx)' "$tmp/state" >/dev/null
}
sample telecom 90
jq -e '.cycle_carriers.unknown==110' "$tmp/state" >/dev/null
sample telecom 100
jq -e '.cycle_carriers.telecom==10' "$tmp/state" >/dev/null
sample unicom 110
jq -e '.cycle_carriers.unknown==120 and .cycle_carriers.telecom==10' "$tmp/state" >/dev/null
sample unicom 130
jq -e '.cycle_carriers.unicom==20' "$tmp/state" >/dev/null
sample unicom 0 c reboot
jq -e '.cycle_carriers.unicom==20' "$tmp/state" >/dev/null
sample mobile 0 next reboot
jq -e '.cycle_rx==0 and .cycle_tx==0 and ([.cycle_carriers[]]|add)==0' "$tmp/state" >/dev/null
sample mobile 10 next reboot
jq -e '.cycle_carriers.mobile==10' "$tmp/state" >/dev/null
echo 'PASS: carrier migration, switch boundaries, reboot, cycle reset and exact totals'
