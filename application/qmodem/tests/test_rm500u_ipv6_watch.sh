#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
watch=""
cleanup() {
    [ -z "$watch" ] || { kill "$watch" 2>/dev/null || true; wait "$watch" 2>/dev/null || true; }
    rm -rf "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/bin" "$tmp/uci"
export RM500U_TEST_DATA="$tmp"
cat > "$tmp/bin/uci" <<'EOF'
#!/bin/sh
[ "$1" != -q ] || shift
cat "$RM500U_TEST_DATA/uci/$2" 2>/dev/null
EOF
cat > "$tmp/bin/ubus" <<'EOF'
#!/bin/sh
case "$2" in
    network.interface.modem0v6) cat "$RM500U_TEST_DATA/status";;
    network.interface.lan) echo '{"l3_device":"br-lan"}';;
esac
EOF
cat > "$tmp/bin/jsonfilter" <<'EOF'
#!/bin/sh
case "$2" in
    '@.up') jq -r '.up';;
    '@.l3_device') jq -r '.l3_device';;
    '@["ipv6-prefix"][0].address') jq -r '."ipv6-prefix"[0].address';;
    '@["ipv6-prefix"][0].mask') jq -r '."ipv6-prefix"[0].mask';;
esac
EOF
cat > "$tmp/bin/logger" <<'EOF'
#!/bin/sh
exit 0
EOF
cat > "$tmp/bin/ndppd" <<'EOF'
#!/bin/sh
echo "$$" >> "$RM500U_TEST_DATA/pids"
cat "$2" >> "$RM500U_TEST_DATA/configs"
trap 'exit 0' TERM INT
while :; do sleep 1 & wait $!; done
EOF
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" QMODEM_HOME="$root/files/usr/share/qmodem"
export QMODEM_RUNDIR="$tmp/run" QMODEM_NDPPD="$tmp/bin/ndppd" QMODEM_IPV6_WATCH_INTERVAL=1
put() { printf '%s' "$2" > "$tmp/uci/$1"; }
put qmodem.modem0.name rm500u-cn
put qmodem.modem0.manufacturer quectel
put qmodem.modem0.platform unisoc
put qmodem.modem0.extend_prefix 1
put qmodem.modem0.pdp_type ipv4v6
status() { printf '{"up":true,"l3_device":"usb0","ipv6-prefix":[{"address":"%s","mask":64}]}' "$1" > "$tmp/status"; }
status 2001:db8:1::
sh "$QMODEM_HOME/rm500u_ipv6_watch.sh" modem0 &
watch=$!
wait_for() {
    count=0
    until "$@"; do
        count=$((count+1)); [ "$count" -lt 12 ] || return 1
        sleep 1
    done
}
has_prefix() { grep -q "$1" "$tmp/configs" 2>/dev/null; }
wait_for has_prefix '2001:db8:1::/64'
first=$(head -n1 "$tmp/pids")
grep -q 'proxy usb0' "$tmp/configs"
grep -q 'iface br-lan' "$tmp/configs"
status 2001:db8:2::
wait_for has_prefix '2001:db8:2::/64'
if kill -0 "$first" 2>/dev/null; then exit 1; fi
last=$(tail -n1 "$tmp/pids")
put qmodem.modem0.name rw350r-gl
gone() { ! kill -0 "$watch" 2>/dev/null; }
wait_for gone
wait "$watch"
watch=""
if kill -0 "$last" 2>/dev/null; then exit 1; fi
[ ! -e "$tmp/run/modem0_dir/rm500u-ndppd.conf" ]
lines=$(wc -l < "$tmp/pids")
sh "$QMODEM_HOME/rm500u_ipv6_watch.sh" modem0
[ "$(wc -l < "$tmp/pids")" = "$lines" ]
echo 'PASS: RM500U proxy follows prefix changes, stops on RW swap and never starts for RW'
