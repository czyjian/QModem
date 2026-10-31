#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
extra_command() { :; }
initscript=qmodem_network
sed '/^\. "\$SCRIPT_DIR\/instance.sh"$/d' "$root/files/etc/init.d/qmodem_network" > "$tmp/service.sh"
. "$tmp/service.sh"
MODEM_RUNDIR="$tmp/run"
events="$tmp/events"
global_enabled=1
device_enabled=1
device_state=enabled
config_load() { :; }
config_get() {
    case "$3" in
        enable_dial) [ "$2" = main ] && value=$global_enabled || value=$device_enabled ;;
        state) value=$device_state ;;
    esac
    eval "$1=\$value"
}
config_foreach() { "$1" 2_1; }
rc_procd() { echo nested >> "$events"; return 99; }
procd_open_instance() { echo "$1" >> "$events"; }
procd_set_param() { :; }
procd_close_instance() { :; }
logger() { :; }

start_service
[ "$(cat "$events")" = modem_2_1 ]
for disabled in global device state; do
    : > "$events"
    global_enabled=1; device_enabled=1; device_state=enabled
    case "$disabled" in
        global) global_enabled=0 ;;
        device) device_enabled=0 ;;
        state) device_state=disabled ;;
    esac
    start_service
    [ ! -s "$events" ]
done

global_enabled=1; device_enabled=1; device_state=enabled
g_enabled=1; force_stop=0
dial() { echo dial >> "$events"; }
hang() { echo hang >> "$events"; }
_procd_ubus_call() { printf '%s\n' "$service_status"; }
for service_status in '{}' '{"qmodem_network":{"instances":{"modem_2_1":{"running":false}}}}'; do
    : > "$events"
    _update_modem 2_1
    [ "$(cat "$events")" = dial ]
done
service_status='{"qmodem_network":{"instances":{"modem_2_1":{"running":true}}}}'
: > "$events"
_update_modem 2_1
[ ! -s "$events" ]
device_enabled=0
_update_modem 2_1
[ "$(cat "$events")" = hang ]
echo 'network service tests passed'
