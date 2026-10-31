#!/bin/sh
# Reuse the installed DHCPv6 implementation without editing its files.
cd /lib/netifd/proto || exit 1
add_protocol() { :; }
. ./dhcpv6.sh qmodem_rm500u6 include
init_proto "$@"

proto_qmodem_rm500u6_init_config() { proto_dhcpv6_init_config; }
proto_qmodem_rm500u6_setup() { proto_dhcpv6_setup "$@"; }
proto_qmodem_rm500u6_renew() { proto_dhcpv6_renew "$@"; }
proto_qmodem_rm500u6_teardown() { proto_dhcpv6_teardown "$@"; }

# The stock setup calls this function. Override it in this process only.
proto_run_command() {
    local interface="$1" arg var
    shift
    json_init
    json_add_int action 1
    json_add_array command
    for arg in "$@"; do
        [ "$arg" != /lib/netifd/dhcpv6.script ] || arg=/usr/share/qmodem/rm500u_dhcpv6.script
        json_add_string "" "$arg"
    done
    json_close_array
    [ -z "$_EXPORT_VARS" ] || {
        json_add_array env
        for var in $_EXPORT_VARS; do
            eval "json_add_string \"\" \"\${$var}\""
        done
        json_close_array
    }
    _proto_notify "$interface"
}

add_protocol qmodem_rm500u6
