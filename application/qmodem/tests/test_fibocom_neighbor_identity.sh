#!/bin/sh
set -eu
source_file="$(dirname "$0")/../files/usr/share/qmodem/vendor/fibocom.sh"
for name in fibocom_hex_to_dec fibocom_neighbor_identity; do
    eval "$(awk -v name="$name" '$0 == name "()" { found=1 } found { print } found && $0 == "}" { exit }' "$source_file")"
done
for value in FFFFFF FFFFFFF 00FFFFFFF 0xFFFFFFFFF; do
    [ -z "$(fibocom_neighbor_identity "$value")" ]
done
[ "$(fibocom_neighbor_identity 180618)" = 1574424 ]
[ "$(fibocom_neighbor_identity 60233C001)" = 25806749697 ]
[ "$(fibocom_neighbor_identity 0)" = 0 ]
[ -z "$(fibocom_neighbor_identity '')" ]
echo 'PASS: Fibocom unavailable neighbor identities without changing real TAC/NCI'
