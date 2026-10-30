#!/bin/bash
set -eu

package_dir="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT INT TERM
awk '$0 == "set_if()" { found=1 } found { print } found && $0 == "}" { exit }' \
    "$package_dir/files/usr/share/qmodem/modem_dial.sh" |
    sed -e 's@/etc/init.d/firewall restart@mock_firewall_restart@g' \
        -e 's@/etc/init.d/dhcp restart@mock_dhcp_restart@g' \
        -e 's@/etc/init.d/network restart@mock_network_restart@g' > "$fixture/set_if.sh"
. "$fixture/set_if.sh"

uci() {
    [ "$1" != '-q' ] || shift
    operation=$1; shift
    case "$operation" in
        get) [ ! -f "$fixture/$1" ] || cat "$fixture/$1" ;;
        set) printf '%s' "${1#*=}" > "$fixture/${1%%=*}" ;;
        commit) printf '%s\n' "$1" >> "$fixture/commits" ;;
        *) echo "unexpected UCI operation: $operation" >&2; return 1 ;;
    esac
}
qmodem_config_lock() { :; }
qmodem_config_unlock() { :; }
qmodem_interface_owned() { return 0; }
qmodem_wan_zone() { echo wan; }
cleanup_bridge_passthrough() { return 0; }
handle_5gethernet() { :; }
set_led() { :; }
m_debug() { :; }
mock_firewall_restart() { :; }
mock_dhcp_restart() { :; }
mock_network_restart() { echo 'unexpected full network restart' >&2; return 1; }
ifup() { printf '%s\n' "$1" >> "$fixture/ifups"; }
append_to_fw_zone() { echo 'unexpected firewall change' >&2; return 1; }

manufacturer=fibocom platform=mediatek driver=rndis
bridge_enabled=0 managed_ipv4=0 bridge_manager=''
modem_config=modem0 interface_name=modem0 interface6_name=modem0v6
metric=15 dns_list='' modem_netcard=eth2 ethernet_5g=''
ra_master=0 extend_prefix=0 pdp_type=ipv4v6
uci set network.modem0=interface
uci set network.modem0.proto=static
uci set network.modem0.ifname=eth2
uci set network.modem0.device=eth2
uci set network.modem0.metric=15
uci set network.modem0v6=interface
uci set firewall.wan.network='modem0 modem0v6'

# Missing option on an existing interface adopts the enabled default.
set_if
[ "$(uci get network.modem0v6.sourcefilter)" = 1 ]
grep -qx network "$fixture/commits"
grep -qx modem0v6 "$fixture/ifups"

# Explicit disable and subsequent re-enable update the existing interface.
ipv6_sourcefilter=0
set_if
[ "$(uci get network.modem0v6.sourcefilter)" = 0 ]
ipv6_sourcefilter=1
set_if
[ "$(uci get network.modem0v6.sourcefilter)" = 1 ]

# Repeating the same value must not reload the network.
: > "$fixture/commits"
: > "$fixture/ifups"
set_if
[ ! -s "$fixture/commits" ]
[ ! -s "$fixture/ifups" ]

# A newly generated IPv6 interface also receives the configured value.
rm "$fixture/network.modem0v6" "$fixture/network.modem0v6.sourcefilter"
ipv6_sourcefilter=0
set_if
[ "$(uci get network.modem0v6.sourcefilter)" = 0 ]
[ "$(uci get network.modem0v6.proto)" = dhcpv6 ]

echo 'PASS: IPv6 source routing default, toggle, new/existing interface and idempotence'
