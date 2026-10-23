#!/bin/sh
# Host address reporting must follow netifd independently of the modem IID.
set -eu
package=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT INT TERM
for name in handle_ip_change log_host_ipv6_state; do
    eval "$(awk -v name="$name" '
        $0 == name "()" { capture=1 }
        capture { print }
        capture && $0 == "}" { exit }
    ' "$package/files/usr/share/qmodem/modem_dial.sh")"
done
m_debug() { printf '%s\n' "$1" >> "$fixture/log"; }
ubus() { [ "$*" = 'call network.interface.cellv6 status' ]; cat "$fixture/status"; }
interface6_name=cellv6
manufacturer=test
ipv4=10.47.2.246 ipv6=0:0:0:0:18e1:1a49:69f2:d468 connection_status=3
handle_ip_change
grep -Fq 'ipv6_iid_without_prefix=0:0:0:0:18e1:1a49:69f2:d468' "$fixture/log"
! grep -q 'host IPv6' "$fixture/log"
ipv6=240e:1234::1
handle_ip_change
grep -Fq 'ipv6_address=240e:1234::1' "$fixture/log"
ipv6=::18e1:1a49:69f2:d468
handle_ip_change
grep -Fq 'ipv6_iid_without_prefix=::18e1:1a49:69f2:d468' "$fixture/log"

printf '%s\n' '{"up":false}' > "$fixture/status"
log_host_ipv6_state
grep -Fq 'up=false; addresses=none; delegated_prefixes=none; default_gateway=none' "$fixture/log"
count=$(wc -l < "$fixture/log")
log_host_ipv6_state
[ "$(wc -l < "$fixture/log")" -eq "$count" ]

# A host address arrives after CGPADDR. Only this netifd snapshot changes.
cat > "$fixture/status" <<'JSON'
{"up":true,"uptime":5,
 "ipv6-address":[{"address":"240e:45d:ce20:3b61:200:11ff:fe12:1314","mask":64}],
 "ipv6-prefix":[{"address":"240e:45d:ce20:3b61::","mask":64}],
 "route":[{"target":"::","mask":0,"nexthop":"fe80::1","valid":65530}]}
JSON
log_host_ipv6_state
grep -Fq 'addresses=240e:45d:ce20:3b61:200:11ff:fe12:1314/64; delegated_prefixes=240e:45d:ce20:3b61::/64; default_gateway=fe80::1' "$fixture/log"
count=$(wc -l < "$fixture/log")
sed 's/65530/65500/;s/"uptime":5/"uptime":35/' "$fixture/status" > "$fixture/new"
mv "$fixture/new" "$fixture/status"
log_host_ipv6_state
[ "$(wc -l < "$fixture/log")" -eq "$count" ]

# Transient RPC/JSON errors must not be reported as loss of the address.
printf '%s\n' '{broken' > "$fixture/status"
log_host_ipv6_state
printf '%s\n' '{}' > "$fixture/status"
log_host_ipv6_state
ubus() { return 1; }
log_host_ipv6_state
[ "$(wc -l < "$fixture/log")" -eq "$count" ]
ubus() { cat "$fixture/status"; }

# Renumbering, multiple addresses, and default-route/address loss are visible.
printf '%s\n' '{"up":true,"ipv6-address":[{"address":"240e:2::2","mask":64},{"address":"240e:1::1","mask":64}]}' > "$fixture/status"
log_host_ipv6_state
grep -Fq 'addresses=240e:1::1/64,240e:2::2/64; delegated_prefixes=none; default_gateway=none' "$fixture/log"
printf '%s\n' '{"up":false}' > "$fixture/status"
log_host_ipv6_state
[ "$(wc -l < "$fixture/log")" -eq "$((count+2))" ]
echo 'PASS: modem IID labels, delayed host IPv6, renumbering, route loss, deduplication and transient RPC errors'
