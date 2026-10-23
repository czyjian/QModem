#!/bin/sh
# Offline regression for Auto APN, dual-stack monitoring and retained logs.
set -eu
package=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
scripts="$package/files/usr/share/qmodem"
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT INT TERM

load_function()
{
    eval "$(awk -v name="$1" '
        $0 == name "()" { capture=1 }
        capture { print }
        capture && ($0 == "}" || $0 == ")") { exit }
    ' "$2")"
}
for name in resolve_auto_apn at_dial check_ip; do
    load_function "$name" "$scripts/modem_dial.sh"
done
for name in get_cgpaddr_ipv4 get_cgpaddr_ipv6; do
    load_function "$name" "$scripts/generic.sh"
done
load_function qmodem_dial_log "$scripts/modem_util.sh"
load_function log2file "$scripts/modem_util.sh"
. "$scripts/cmds/modem_dial.sh"
at_port=/dev/ttyUSB3 sim_slot=1 pdp_index=0 pdp_type=ipv4v6
manufacturer=fibocom platform=mediatek driver=rndis
auth='' username='' password='' nat_cfg='' ppp_auth_command=''
log_file="$fixture/dial_log"
m_debug() { log2file modem_dial "$1" "$log_file"; }

# Git Bash lacks flock. Exercise data/retention there; Linux also tests locking.
if ! command -v flock >/dev/null 2>&1; then
    echo 'SKIP: concurrent locking (flock unavailable)'
    flock() { :; }
    has_flock=0
else
    has_flock=1
fi
imsi_response=460110123456789
context_response='+CGDCONT: 0,"IPV4V6","internet"'
ip_response=''
at()
{
    printf '%s\n' "$2" >> "$fixture/commands"
    case "$2" in
        AT+CIMI) printf '%s\r\nOK\r\n' "$imsi_response" ;;
        'AT+CGDCONT?') printf '%s\n' "$context_response" ;;
        AT+CGPADDR=*) printf '%s\n' "$ip_response" ;;
        *) printf 'OK\r\n' ;;
    esac
}

# Reproduce the reported empty Auto APN with the real command builder.
apn=''
at_dial > /dev/null
[ "$apn" = ctnet ]
grep -Fxq 'AT+CGDCONT=0,"IPV4V6","ctnet"' "$fixture/commands"
grep -Fxq 'AT+CGACT=1,0' "$fixture/commands"
! grep -q "$imsi_response" "$log_file"

for pair in 46000:cmnet 46001:3gnet 46003:ctnet 46011:ctnet 46015:cbnet 46060:cmnet; do
    imsi_response="+CIMI: \"${pair%:*}0123456789\""
    apn=auto
    resolve_auto_apn
    [ "$apn" = "${pair#*:}" ]
done
# A new SIM must be identified afresh, without persisting a previous SIM's APN.
sim_slot=2 imsi_response=460090123456789 apn=''
resolve_auto_apn
[ "$apn" = 3gnet ]
apn=private.example
before=$(wc -l < "$fixture/commands")
resolve_auto_apn
[ "$apn" = private.example ]
[ "$(wc -l < "$fixture/commands")" = "$before" ]
imsi_response=234150123456789 apn=''
resolve_auto_apn
[ "$apn" = internet ]
context_response='+CGDCONT: 0,"IPV4V6","ims"' apn=''
resolve_auto_apn
[ -z "$apn" ]
context_response='+CGDCONT: 1,"IPV4V6","other.sim"' apn=''
resolve_auto_apn
[ -z "$apn" ]
imsi_response='+CME ERROR: 10' apn=''
resolve_auto_apn
[ -z "$apn" ]
imsi_response=460110123456789
at_dial > /dev/null
[ "$apn" = ctnet ]

ip_response=$(printf '+CGPADDR: 0,"10.162.254.120","36.14.18.52.0.0.0.0.0.0.0.0.0.0.0.1"\r\nOK\r\n')
check_ip
[ "$ipv4" = 10.162.254.120 ]
[ "$ipv6" = 240e:1234:0:0:0:0:0:1 ]
[ "$connection_status" = 3 ]
ip_response='+CGPADDR: 0,"0.0.0.0","240E:1234::1"'
check_ip
[ -z "$ipv4" ] && [ "$ipv6" = 240e:1234::1 ]
[ "$connection_status" = 2 ]
ip_response='+CGPADDR: 0,"10.162.254.120","0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0"'
check_ip
[ "$connection_status" = 1 ] && [ -z "$ipv6" ]
[ -z "$(get_cgpaddr_ipv6 '+CGPADDR: 0,"::"')" ]
[ -z "$(get_cgpaddr_ipv6 '+CGPADDR: 0,"256.0.0.0.0.0.0.0.0.0.0.0.0.0.0.1"')" ]
ip_response='+CME ERROR: 148'
check_ip
[ "$connection_status" = -1 ] && [ -z "$ipv4$ipv6" ]
grep -q 'command=AT+CGPADDR=0; response=+CME ERROR: 148' "$log_file"

# Preserve older entries past the former 100/300 limits, then trim only oldest.
qmodem_dial_log clear "$log_file"
awk 'BEGIN { for (i=1; i<=350; i++) print "entry-" i }' > "$log_file"
m_debug entry-351
qmodem_dial_log read "$log_file" > "$fixture/read"
grep -Fxq entry-1 "$fixture/read"
[ "$(wc -l < "$fixture/read")" -eq 351 ]
awk 'BEGIN { for (i=1; i<=1000; i++) print "entry-" i }' > "$log_file"
m_debug entry-1001
[ "$(wc -l < "$log_file")" -eq 1000 ]
[ "$(head -n 1 "$log_file")" = entry-2 ]
grep -q 'entry-1001$' "$log_file"
if [ "$has_flock" = 1 ]; then
    qmodem_dial_log clear "$log_file"
    for writer in a b c; do
        ( i=0; while [ "$i" -lt 50 ]; do
            qmodem_dial_log write "$log_file" "$writer-$i"
            i=$((i+1))
        done ) &
    done
    wait
    [ "$(wc -l < "$log_file")" -eq 150 ]
    [ "$(sort -u "$log_file" | wc -l)" -eq 150 ]
fi
qmodem_dial_log clear "$log_file"
[ ! -s "$log_file" ]
echo 'PASS: Auto/manual APN, retry, SIM identity, exact dial commands, IPv6, raw errors and log retention'
