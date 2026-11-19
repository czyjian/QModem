#!/bin/sh
# Ensure modem_dial/modem_util wrappers pass the exact final command to at().
set -eu

PACKAGE_DIR=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
QMODEM_DIR="$PACKAGE_DIR/files/usr/share/qmodem"
GENERIC_FILE="$QMODEM_DIR/generic.sh"
FIBOCOM_FILE="$QMODEM_DIR/vendor/fibocom.sh"
FOXCONN_FILE="$QMODEM_DIR/vendor/foxconn.sh"
observed=

at()
{
    observed_port=$1
    observed=$2
    export observed_port observed
}

. "$QMODEM_DIR/cmds/modem_util.sh"
. "$QMODEM_DIR/cmds/modem_dial.sh"
. "$QMODEM_DIR/cmds/fibocom.sh"
. "$QMODEM_DIR/cmds/foxconn.sh"

cmd_util_quimslot_query /dev/ttyUSB2
[ "$observed_port" = /dev/ttyUSB2 ]
[ "$observed" = 'AT+QUIMSLOT?' ]

cmd_dial_cpin_unlock /dev/ttyUSB3 1234
[ "$observed_port" = /dev/ttyUSB3 ]
[ "$observed" = 'AT+CPIN="1234"' ]

dynamic='AT+CGDCONT=3,"IPV4V6","internet"'
cmd_dial_command /dev/ttyUSB4 "$dynamic"
[ "$observed_port" = /dev/ttyUSB4 ]
[ "$observed" = "$dynamic" ]

cmd_dial_neoway_simcross_iccid /dev/ttyUSB5
[ "$observed" = 'AT+SIMCROSS=1,1;$MYCCID' ]

cmd_gtcurcar_query /dev/ttyUSB6
[ "$observed_port" = /dev/ttyUSB6 ]
[ "$observed" = 'AT+GTCURCAR?' ]

get_function()
{
    awk -v name="$1" '
        $0 ~ "^" name "\\(\\)[[:space:]]*(\\{)?$" { capture = 1 }
        capture { print }
        capture && $0 == "}" { exit }
    ' "$2"
}

eval "$(get_function get_cgpaddr_ipv4 "$GENERIC_FILE")"
fm350_cgpaddr='+CGPADDR: 2,"10.3.4.136","0.0.0.0.0.0.0.0.24.141.77.91.197.17.80.76"'
[ "$(get_cgpaddr_ipv4 "$fm350_cgpaddr")" = '10.3.4.136' ]
[ -z "$(get_cgpaddr_ipv4 '+CGPADDR: 1,"0.0.0.0",""')" ]

eval "$(get_function fibocom_get_carrier "$FIBOCOM_FILE")"
platform=mediatek
at_port=/dev/ttyUSB6
cmd_gtcurcar_query() { printf '%s\n' '+GTCURCAR: 117,"China Telecom"'; }
cmd_cops_query() { printf '%s\n' '+COPS: 0,2,"garbled",7'; }
[ "$(fibocom_get_carrier)" = 'China Telecom' ]
cmd_gtcurcar_query() { :; }
[ "$(fibocom_get_carrier)" = 'garbled' ]

eval "$(get_function fibocom_gtact_params "$FIBOCOM_FILE")"
eval "$(get_function fibocom_gtact_requires_rat_fields "$FIBOCOM_FILE")"
eval "$(get_function fibocom_uses_empty_gtact_fields "$FIBOCOM_FILE")"
eval "$(get_function fibocom_normalize_band_list "$FIBOCOM_FILE")"
eval "$(get_function fibocom_gtact_network_prefer_from_bands "$FIBOCOM_FILE")"
eval "$(get_function fibocom_gtact_lock_params "$FIBOCOM_FILE")"
platform=qualcomm
QMODEM_TESTCASE_MODEL=fm160-cn
band_class=NR
umts_bands='1,5,8'
lte_bands='101,105'
nr_bands='5041,5078'
ALL_LTE_CODES='101,103,105'
ALL_NR_CODES='5041,5075,5078'
GTACT_PARAM2=6
GTACT_PARAM3=3
[ "$(fibocom_gtact_lock_params)" = '17,,,101,105,5041,5078' ]
platform=mediatek
QMODEM_TESTCASE_MODEL=fm350-gl
[ "$(fibocom_gtact_lock_params)" = '17,6,6,101,105,5041,5078' ]
platform=qualcomm
QMODEM_TESTCASE_MODEL=fm150-ae
[ "$(fibocom_gtact_lock_params)" = '20,6,3,1,5,8,101,105,5041,5078' ]
platform=unisoc
QMODEM_TESTCASE_MODEL=fm650-cn
[ "$(fibocom_gtact_lock_params)" = '20,6,3,1,5,8,101,105,5041,5078' ]

cmd_gtcelllock_query /dev/ttyUSB7
[ "$observed_port" = /dev/ttyUSB7 ]
[ "$observed" = 'AT+GTCELLLOCK?' ]

eval "$(get_function fibocom_is_uint "$FIBOCOM_FILE")"
eval "$(get_function fibocom_normalize_nr_band "$FIBOCOM_FILE")"
eval "$(get_function lockcell_all "$FIBOCOM_FILE")"
cmd_gtcelllock_set() { printf '%s|%s\n' "$1" "$2"; }
qmodem_lockcell_boot_hook_clear() { :; }
qmodem_lockcell_boot_hook_sync() { :; }
at_port=/dev/ttyUSB7
config_section=modem1
rat=1
pci=347
arfcn=504990
band=41
scs=1
en_boot_hook=0
lockcell_all
[ "$res" = '/dev/ttyUSB7|1,1,0,504990,347,1,5041' ]
rat=0
pci=221
arfcn=2452
band=
scs=
lockcell_all
[ "$res" = '/dev/ttyUSB7|1,0,0,2452,221' ]

platform=mediatek
QMODEM_TESTCASE_MODEL=rw350r-gl
umts_bands=
lte_bands=
nr_bands=5041,5078
GTACT_PARAM2=6
GTACT_PARAM3=6
[ "$(fibocom_gtact_params 14 "$nr_bands")" = '14,6,6,5041,5078' ]
band_class=NR
nr_bands=5001,5041,5078
[ "$(fibocom_gtact_lock_params)" = '14,6,6,5001,5041,5078' ]
lte_bands=101,103
[ "$(fibocom_gtact_lock_params)" = '17,6,6,101,103,5001,5041,5078' ]
nr_bands=
[ "$(fibocom_gtact_lock_params)" = '2,6,6,101,103' ]
lte_bands=
nr_bands=5041,5078
band_class=LTE
[ "$(fibocom_gtact_lock_params)" = '14,6,6,5041,5078' ]
nr_bands=
if fibocom_gtact_lock_params; then
    echo 'FAIL: empty selection must not enable all RATs' >&2
    exit 1
fi
lte_bands=
nr_bands=5041,5078
QMODEM_TESTCASE_MODEL=fm350-gl
[ "$(fibocom_gtact_params 14 "$nr_bands")" = '14,,,5041,5078' ]
platform=qualcomm
QMODEM_TESTCASE_MODEL=fm160-cn
[ "$(fibocom_gtact_params 14 "$nr_bands")" = '14,,,5041,5078' ]

cmd_crsm_msisdn /dev/wwan0at0
[ "$observed_port" = /dev/wwan0at0 ]
[ "$observed" = 'AT+CRSM=178,28480,1,4,28' ]

eval "$(get_function foxconn_decode_crsm_msisdn "$FOXCONN_FILE")"
[ "$(foxconn_decode_crsm_msisdn '+CRSM: 144,0,"FFFFFFFFFFFFFFFFFFFFFFFFFFFF0891685183077009F7FFFFFFFFFF"')" = '+8615387007907' ]
[ "$(foxconn_decode_crsm_msisdn '+CRSM: 144,0,"FFFFFFFFFFFFFFFFFFFFFFFFFFFF07815183077009F7FFFFFFFFFFFF"')" = '15387007907' ]
[ -z "$(foxconn_decode_crsm_msisdn '+CRSM: 144,0,"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"')" ]

eval "$(get_function foxconn_format_bandwidth "$FOXCONN_FILE")"
eval "$(get_function foxconn_format_band "$FOXCONN_FILE")"
eval "$(get_function foxconn_extract_scc_blocks "$FOXCONN_FILE")"
[ "$(foxconn_format_bandwidth '100.0MHz')" = '100M' ]
[ "$(foxconn_format_bandwidth '1.4MHz')" = '1.4M' ]
[ "$(foxconn_format_band 'n78')" = '78' ]
[ "$(foxconn_format_band 'B3')" = '3' ]
multiline_debug='RAT:NR5G_SA
nr_band:n78
nr_scc1:
nr_band:n78
nr_band_width:100.0MHz
nr_channel:633984
nr_pci:570
nr_snr:0.0dB

OK'
[ "$(foxconn_extract_scc_blocks nr "$multiline_debug")" = 'nr_scc1: nr_band:n78 nr_band_width:100.0MHz nr_channel:633984 nr_pci:570 nr_snr:0.0dB' ]

cmd_switch_slot_set /dev/wwan0at0 "AT+" 0
[ "$observed_port" = /dev/wwan0at0 ]
[ "$observed" = 'AT+SWITCH_SLOT=0' ]
cmd_switch_slot_set /dev/wwan0at0 "AT+" 1
[ "$observed_port" = /dev/wwan0at0 ]
[ "$observed" = 'AT+SWITCH_SLOT=1' ]

eval "$(get_function foxconn_get_sim_slot_value "$FOXCONN_FILE")"
at_port=/dev/wwan0at0
at_pre='AT+'
cmd_switch_slot_query() { printf 'AT+SWITCH_SLOT?\r\nSIM1 ENABLE\r\n\r\nOK\r\n'; }
[ "$(foxconn_get_sim_slot_value)" = '1' ]
cmd_switch_slot_query() { printf 'AT+SWITCH_SLOT?\r\nSIM2 ENABLE\r\n\r\nOK\r\n'; }
[ "$(foxconn_get_sim_slot_value)" = '2' ]
echo 'core cmds tests passed'
