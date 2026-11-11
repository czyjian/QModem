#!/bin/sh
# Host-side accounting, independent of modem AT commands and dial mode.
TRAFFIC_HOME=${QMODEM_TRAFFIC_HOME:-/usr/share/qmodem}
TRAFFIC_RAM=${QMODEM_TRAFFIC_RAM:-/var/run/qmodem/traffic}
TRAFFIC_STORE=${QMODEM_TRAFFIC_STORE:-/etc/qmodem/traffic}

traffic_cycle()
{
    local year=$1 month=$2 day=$3 hour=$4 minute=$5 reset_day=$6 reset_hour=$7 reset_minute=$8 last
    # Calendar comparisons do not depend on GNU date or UTC conversion.
    last=$(traffic_month_days "$year" "$month")
    [ "$reset_day" -le "$last" ] || reset_day=$last
    if [ "$day" -lt "$reset_day" ] || { [ "$day" -eq "$reset_day" ] && [ "$((hour * 60 + minute))" -lt "$((reset_hour * 60 + reset_minute))" ]; }; then
        month=$((month - 1))
        if [ "$month" -eq 0 ]; then month=12; year=$((year - 1)); fi
        reset_day=$6
        last=$(traffic_month_days "$year" "$month")
        [ "$reset_day" -le "$last" ] || reset_day=$last
    fi
    printf '%04d-%02d-%02d %02d:%02d' "$year" "$month" "$reset_day" "$reset_hour" "$reset_minute"
}

traffic_month_days()
{
    case "$2" in
        4|6|9|11) echo 30 ;;
        2) if [ "$(($1 % 4))" = 0 ] && { [ "$(($1 % 100))" != 0 ] || [ "$(($1 % 400))" = 0 ]; }; then echo 29; else echo 28; fi ;;
        *) echo 31 ;;
    esac
}

traffic_devices()
{
    local section=$1 iface status alias owner
    alias=$(uci -q get "qmodem.$section.alias")
    [ -n "$alias" ] && [ "$alias" != - ] || alias=$section
    # Both logical families are queried, but shared device counters are read once.
    for iface in "$alias" "${alias}v6"; do
        owner=$(uci -q get "network.$iface.modem_config")
        [ -z "$owner" ] || [ "$owner" = "$section" ] || continue
        status=$(ubus -S call "network.interface.$iface" status 2>/dev/null) || continue
        printf '%s' "$status" | jq -r 'select(.up == true) | .l3_device // .device // empty'
    done | sort -u
}

traffic_sample()
{
    local section=$1 enabled rd rh rm dev counters='[]' rx tx idx sample old cycle stamp sim_cache
    [ "$(date +%s)" -ge 1577836800 ] || return 0
    config_get enabled "$section" traffic_enabled 1
    old="$TRAFFIC_RAM/$section.json"
    if [ "$enabled" != 1 ]; then
        if [ -f "$old" ] && jq -e '(.devices // [] | length) > 0' "$old" >/dev/null; then
            jq '.devices=[] | .rx_rate=0 | .tx_rate=0 | .live=[]' "$old" > "$old.new" && mv "$old.new" "$old"
        fi
        return 0
    fi
    config_get rd "$section" traffic_reset_day 1
    config_get rh "$section" traffic_reset_hour 0
    config_get rm "$section" traffic_reset_minute 0
    # Only values validated by the RPC are accepted; tolerate hand-edited UCI.
    case "$rd:$rh:$rm" in *[!0-9:]*) rd=1; rh=0; rm=0;; esac
    [ "$rd" -ge 1 ] && [ "$rd" -le 31 ] || rd=1
    [ "$rh" -le 23 ] || rh=0
    [ "$rm" -le 59 ] || rm=0
    stamp=$(date '+%Y %m %d %H %M')
    set -- $stamp
    cycle=$(traffic_cycle "$((1$1-10000))" "$((1$2-100))" "$((1$3-100))" "$((1$4-100))" "$((1$5-100))" "$rd" "$rh" "$rm")
    for dev in $(traffic_devices "$section"); do
        case "$dev" in ''|*[!A-Za-z0-9_.:-]*) continue;; esac
        [ -r "/sys/class/net/$dev/statistics/rx_bytes" ] || continue
        read -r rx < "/sys/class/net/$dev/statistics/rx_bytes"
        read -r tx < "/sys/class/net/$dev/statistics/tx_bytes"
        read -r idx < "/sys/class/net/$dev/ifindex"
        counters=$(printf '%s' "$counters" | jq -c --arg name "$dev" --argjson index "$idx" --argjson rx "$rx" --argjson tx "$tx" '. + [{name:$name,index:$index,rx:$rx,tx:$tx}]')
    done
    [ -f "$old" ] || { [ ! -f "$TRAFFIC_STORE/$section.json" ] || cp "$TRAFFIC_STORE/$section.json" "$old"; }
    [ -f "$old" ] || echo '{}' > "$old"
    sample="$TRAFFIC_RAM/$section.sample"
    sim_cache="/tmp/cache_sim_info_$section"
    [ -r "$sim_cache" ] || sim_cache=/dev/null
    jq -n --argjson now "$(date +%s)" --argjson uptime "$(cut -d' ' -f1 /proc/uptime)" \
        --arg boot "$(cat /proc/sys/kernel/random/boot_id)" --arg cycle "$cycle" \
        --arg day "$(date +%F)" --arg month "$(date +%Y-%m)" --argjson devices "$counters" --rawfile sim "$sim_cache" \
        '(($sim | fromjson? // {}).modem_info // [] | map({key:.key,value:.value}) | from_entries) as $f |
        ($f.IMSI // "") as $imsi | ($imsi[3:5]) as $mnc | ($f.ISP // "" | ascii_downcase) as $isp |
        (if $f["SIM Status"] != "ready" then "unknown"
         elif ($imsi|startswith("460")) then
           if (["01","06","09","10"]|index($mnc)) != null then "unicom"
           elif (["00","02","04","07","08","13"]|index($mnc)) != null then "mobile"
           elif (["03","05","11","12"]|index($mnc)) != null then "telecom" else "unknown" end
         elif ($isp|contains("联通") or contains("unicom")) then "unicom"
         elif ($isp|contains("移动") or contains("cmcc") or contains("china mobile")) then "mobile"
         elif ($isp|contains("电信") or contains("telecom")) then "telecom" else "unknown" end) as $carrier |
        {now:$now,uptime:$uptime,boot:$boot,cycle:$cycle,day:$day,month:$month,devices:$devices,carrier:$carrier}' > "$sample"
    if jq --slurpfile sample "$sample" -f "$TRAFFIC_HOME/traffic.jq" "$old" > "$old.new"; then
        mv "$old.new" "$old"
    fi
    rm -f "$sample" "$old.new"
}

traffic_save()
{
    local file name
    mkdir -p "$TRAFFIC_STORE"
    for file in "$TRAFFIC_RAM"/*.json; do
        [ -f "$file" ] || continue
        name=${file##*/}
        # Preserve valid snapshots only; atomic rename survives interrupted writes.
        jq -e '.now and .daily and .monthly' "$file" >/dev/null || continue
        cp "$file" "$TRAFFIC_STORE/$name.new" && mv "$TRAFFIC_STORE/$name.new" "$TRAFFIC_STORE/$name"
    done
}

traffic_loop()
{
    . /lib/functions.sh
    mkdir -p "$TRAFFIC_RAM"
    chmod 700 "$TRAFFIC_RAM"
    exec 9>"$TRAFFIC_RAM/collector.lock"
    flock -n 9 || exit 0
    trap 'traffic_save; exit 0' TERM INT
    local saved_at=$(cut -d. -f1 /proc/uptime) uptime
    while :; do
        config_load qmodem
        config_foreach traffic_sample modem-device
        uptime=$(cut -d. -f1 /proc/uptime)
        if [ "$((uptime - saved_at))" -ge 900 ]; then traffic_save; saved_at=$uptime; fi
        sleep 1 & wait $!
    done
}

if [ "${QMODEM_TRAFFIC_LIBRARY:-0}" != 1 ]; then
    case "$1" in loop) traffic_loop;; save) traffic_save;; esac
fi
