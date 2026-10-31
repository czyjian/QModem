#!/bin/sh
set -eu
source_file="$(dirname "$0")/../files/usr/share/qmodem/vendor/quectel.sh"
for name in get_scs quectel_scs_target quectel_serving_scs quectel_display_scs; do
    eval "$(awk -v name="$name" '$0 == name "()" { found=1 } found { print } found && $0 == "}" { exit }' "$source_file")"
done
uci() { printf '%s\n' "$test_model"; }
config_section=modem0
test_model=rm500u-cn
platform=unisoc
sa='+QENG: "servingcell","CONNECT","NR5G-SA","FDD",460,01,944248405,901,943D02,428910,1,40,-51,-3,30,-20,76,0'
[ "$(quectel_serving_scs "$sa" NR5G-SA)" = 15 ]
[ "$(quectel_display_scs 15)" = '15 kHz' ]
nsa='+QENG: "NR5G-NSA",460,01,901,-51,30,-3,428910,1,944248405,943D02,1'
[ "$(quectel_serving_scs "$nsa" NR5G-NSA)" = 30 ]
[ -z "$(quectel_serving_scs '+QENG: "NR5G-NSA",460,01' NR5G-NSA)" ]
for invalid in '' - -17 -20 N/A '1.5' '1e2' '1;print 99' 99; do
    record=$(printf '%s\n' "$sa" | awk -F, -v value="$invalid" 'BEGIN {OFS=","} {$18=value;print}')
    [ -z "$(quectel_serving_scs "$record" NR5G-SA)" ]
done
# Existing get_scs is also used for locking: preserve its conversion unchanged.
for pair in 0:15 1:30 2:60 3:120 4:240 5:480 6:960; do
    [ "$(get_scs "${pair%:*}")" = "${pair#*:}" ]
done
legacy_sa='+QENG: "servingcell","NOCONN","NR5G-SA","TDD",460,01,944248405,901,943D02,627264,78,12,-51,-3,30,2,76'
legacy_nsa='+QENG: "NR5G-NSA",460,01,901,-51,30,-3,627264,78,12,0,0,0,0,0,1'
check_legacy() {
    [ "$(quectel_serving_scs "$legacy_sa" NR5G-SA)" = 60 ]
    [ "$(quectel_serving_scs "$legacy_nsa" NR5G-NSA)" = 30 ]
    [ "$(quectel_display_scs 60)" = 60 ]
}
platform=qualcomm
check_legacy
# Every other Quectel entry keeps the old field positions and unitless text.
support="$(dirname "$0")/../files/usr/share/qmodem/modem_support.json"
jq -r '.modem_support | .[] | to_entries[] | select(.value.manufacturer == "quectel" and .key != "rm500u-cn") | [.key,.value.platform] | @tsv' "$support" |
while read -r test_model platform; do
    check_legacy
done
# A Fibocom module cannot enter the target branch, even with a reused USB slot.
test_model=rw350r-gl
platform=mediatek
if quectel_scs_target; then exit 1; fi
check_legacy
echo 'PASS: RM500U SA/NSA, invalid data, all other Quectel models, RW exclusion and locking conversions'
