#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
scripts="$root/files/usr/share/qmodem"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/uci"
export RM500U_TEST_DATA="$tmp/uci"
cat > "$tmp/bin/uci" <<'EOF'
#!/bin/sh
[ "$1" != -q ] || shift
[ "$1" = get ] || exit 1
cat "$RM500U_TEST_DATA/$2" 2>/dev/null
EOF
chmod +x "$tmp/bin/uci"
PATH="$tmp/bin:$PATH"
export PATH
. "$scripts/rm500u_ipv6.sh"
put() { printf '%s' "$2" > "$tmp/uci/$1"; }
put qmodem.modem0.name rm500u-cn
put qmodem.modem0.manufacturer quectel
put qmodem.modem0.platform unisoc
put qmodem.modem0.pdp_type ipv4v6
put qmodem.modem0.extend_prefix 1
rm500u_matches modem0
rm500u_needs_proxy modem0
put qmodem.modem0.en_bridge 1
if rm500u_needs_proxy modem0; then exit 1; fi
put qmodem.modem0.en_bridge 0
put qmodem.modem0.ra_master 1
if rm500u_needs_proxy modem0; then exit 1; fi
put qmodem.modem0.ra_master 0
put qmodem.modem0.pdp_type ip
if rm500u_needs_proxy modem0; then exit 1; fi
put qmodem.modem0.pdp_type ipv4v6

cat > "$tmp/callback" <<'EOF'
#!/bin/sh
printf '%s\n%s\n%s\n%s\n' "$RA_ADDRESSES" "$ADDRESSES" "$PREFIXES" "$*"
EOF
chmod +x "$tmp/callback"
put network.modem0v6.modem_config modem0
export QMODEM_HOME="$scripts" QMODEM_REAL_DHCPV6_SCRIPT="$tmp/callback" INTERFACE=modem0v6
export RA_ADDRESSES='2001:db8::2/64,2832441254,2832441254 2001:db8:1::2/64,0,4294967295,flag 2001:db8:2::2/64,0,0'
export ADDRESSES='2001:db8:3::2/128,1200,2400' PREFIXES='2001:db8:4::/56,3600,7200'
sh "$scripts/rm500u_dhcpv6.script" usb0 ra-updated > "$tmp/result"
expected='2001:db8::2/64,7200,7200 2001:db8:1::2/64,0,7200,flag 2001:db8:2::2/64,0,0'
[ "$(sed -n 1p "$tmp/result")" = "$expected" ]
[ "$(sed -n 2p "$tmp/result")" = "$ADDRESSES" ]
[ "$(sed -n 3p "$tmp/result")" = "$PREFIXES" ]
[ "$(sed -n 4p "$tmp/result")" = 'usb0 ra-updated' ]
put qmodem.modem0.extend_prefix 0
sh "$scripts/rm500u_dhcpv6.script" usb0 ra-updated > "$tmp/result"
[ "$(sed -n 1p "$tmp/result")" = "$RA_ADDRESSES" ]
if rm500u_needs_proxy modem0; then exit 1; fi
put qmodem.modem0.extend_prefix 1

# RW350R-GL must receive the original environment without normalization.
put qmodem.modem0.name rw350r-gl
put qmodem.modem0.manufacturer fibocom
put qmodem.modem0.platform mediatek
if rm500u_matches modem0 || rm500u_needs_proxy modem0; then exit 1; fi
sh "$scripts/rm500u_dhcpv6.script" eth2 ra-updated > "$tmp/result"
[ "$(sed -n 1p "$tmp/result")" = "$RA_ADDRESSES" ]
[ "$(sed -n 2p "$tmp/result")" = "$ADDRESSES" ]
[ "$(sed -n 3p "$tmp/result")" = "$PREFIXES" ]
[ "$(sed -n 4p "$tmp/result")" = 'eth2 ra-updated' ]
if rm500u_matches 'bad;name'; then exit 1; fi
echo 'PASS: RM500U model gating, RA bounds, withdrawal, flags, real PD and RW passthrough'
