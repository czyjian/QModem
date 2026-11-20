#!/bin/sh
set -e
source_file="$(dirname "$0")/../files/usr/share/qmodem/vendor/quectel.sh"
for name in get_band get_bandwidth quectel_lte_metric cell_info; do
    eval "$(awk -v name="$name" '$0 == name "()" { found=1 } found { print } found && $0 == "}" { exit }' "$source_file")"
done
at_port=/dev/ttyUSB3
test_model=rg520n-eu
uci() { printf '%s\n' "$test_model"; }
m_debug() { :; }
cmd_qeng_servingcell() {
    printf '%s\n' '+QENG: "servingcell","NOCONN","LTE","FDD",460,00,A9648C4,305,1350,3,5,5,7039,-88,-15,-56,9,8,90,-'
}
add_plain_info_entry() { :; }
add_bar_info_entry() { :; }
set_4g_cell_info() { actual_band=$7; actual_earfcn=$5; actual_sinr=${12}; }
# A previous band preference query may leave a colon-separated list behind.
lte_band='1:3:7:71'
cell_info
[ "$actual_band" = 3 ]
[ "$actual_earfcn" = 1350 ]
[ "$actual_sinr" = -2 ]
[ "$(quectel_lte_metric tx_power 120)" = '12 dBm' ]
[ "$(quectel_lte_metric tx_power -50)" = '-5 dBm' ]
[ "$(quectel_lte_metric tx_power -)" = '-' ]
test_model=rm500u-cn
[ "$(quectel_lte_metric sinr 9)" = '9' ]
[ "$(quectel_lte_metric tx_power 120)" = '120' ]
echo 'PASS: LTE serving band is B3, independent of configured allowed band list'
