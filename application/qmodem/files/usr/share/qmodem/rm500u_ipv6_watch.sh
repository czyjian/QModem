#!/bin/sh
SCRIPT_DIR="${QMODEM_HOME:-/usr/share/qmodem}"
. "$SCRIPT_DIR/rm500u_ipv6.sh"
cfg="$1"
rm500u_needs_proxy "$cfg" || exit 0
binary="${QMODEM_NDPPD:-$SCRIPT_DIR/rm500u-ndppd}"
[ -x "$binary" ] || { logger -t qmodem_ipv6 'RM500U-CN: ndppd is missing'; exit 1; }
rundir="${QMODEM_RUNDIR:-/var/run/qmodem}/${cfg}_dir"
mkdir -p "$rundir"
conf="$rundir/rm500u-ndppd.conf"
child=""; previous=""
stop_proxy() {
    [ -z "$child" ] || { kill "$child" 2>/dev/null; wait "$child" 2>/dev/null; }
    child=""
}
cleanup() { stop_proxy; rm -f "$conf"; }
trap 'exit 0' INT TERM
trap cleanup EXIT
while rm500u_needs_proxy "$cfg"; do
    status=$(ubus call "network.interface.${cfg}v6" status 2>/dev/null)
    device=$(printf '%s' "$status" | jsonfilter -e '@.l3_device')
    prefix=$(printf '%s' "$status" | jsonfilter -e '@["ipv6-prefix"][0].address')
    mask=$(printf '%s' "$status" | jsonfilter -e '@["ipv6-prefix"][0].mask')
    lan=$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')
    ready=1
    [ "$(printf '%s' "$status" | jsonfilter -e '@.up')" = true ] || ready=0
    case "$device:$lan" in *[!A-Za-z0-9_.:-]*|:|*:|:*) ready=0;; esac
    case "$prefix" in 2*|3*) ;; *) ready=0;; esac
    case "$prefix" in *[!A-Fa-f0-9:]*) ready=0;; esac
    [ "$mask" = 64 ] || ready=0
    [ "$device" != "$lan" ] || ready=0
    signature="$device|$lan|$prefix/$mask"
    if [ "$ready" = 0 ]; then
        stop_proxy
        previous=""
    elif [ "$signature" != "$previous" ] || [ -z "$child" ] || ! kill -0 "$child" 2>/dev/null; then
        stop_proxy
        cat > "$conf" <<EOF
proxy $device {
    router no
    timeout 1000
    ttl 30000
    rule $prefix/64 {
        iface $lan
    }
}
EOF
        "$binary" -c "$conf" &
        child=$!
        previous="$signature"
        logger -t qmodem_ipv6 "RM500U-CN NDP proxy: $device -> $lan; prefix=$prefix/64"
    fi
    sleep "${QMODEM_IPV6_WATCH_INTERVAL:-5}" &
    wait $!
done
