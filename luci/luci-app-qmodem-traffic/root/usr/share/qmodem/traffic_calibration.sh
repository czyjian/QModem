#!/bin/sh
# Independent of the 1-second sampler: carrier requests must not pause counters.
TRAFFIC_HOME=${QMODEM_HOME:-/usr/share/qmodem}
TRAFFIC_RAM=${QMODEM_TRAFFIC_RAM:-/var/run/qmodem/traffic}
TRAFFIC_STORE=${QMODEM_TRAFFIC_STORE:-/etc/qmodem/traffic}

calibration_config()
{
    local section=$1 enabled hour minute
    enabled=$(uci -q get "qmodem.$section.traffic_calibration_enabled")
    hour=$(uci -q get "qmodem.$section.traffic_calibration_hour")
    minute=$(uci -q get "qmodem.$section.traffic_calibration_minute")
    case "$hour" in ''|*[!0-9]*) hour=3;; esac
    case "$minute" in ''|*[!0-9]*) minute=0;; esac
    hour=$(printf '%s' "$hour" | sed 's/^0*//'); hour=${hour:-0}
    minute=$(printf '%s' "$minute" | sed 's/^0*//'); minute=${minute:-0}
    [ "$hour" -le 23 ] 2>/dev/null || hour=3
    [ "$minute" -le 59 ] 2>/dev/null || minute=0
    jq -nc --arg enabled "$enabled" --arg hour "$hour" --arg minute "$minute" '{enabled:($enabled=="1"),hour:($hour|tonumber),minute:($minute|tonumber)}'
}

# Pure eligibility/units function, also used by isolated tests. Never treats
# missing/unknown usage as zero or applies monthly data to a different cycle.
calibration_evaluate()
{
    jq -nc --argjson state "$1" --argjson usage "$2" --arg month "$3" --argjson now "$4" '
      def reject($reason): {available:false,reason:$reason};
      if $state.config.enabled != true then reject("流量监控未开启")
      elif $state.stale != false or ($state.now // 0) > $now+5 then reject("等待最新流量采样")
      elif $state.config.reset_day != 1 or $state.config.reset_hour != 0 or $state.config.reset_minute != 0 or $state.cycle != ($month+"-01 00:00") then reject("本地账期需为每月 1 日 00:00")
      elif ($usage.used_mb|type) != "number" then reject("查询接口未返回有效已用流量")
      elif $usage.used_mb < 0 or $usage.used_mb*1048576 > 1000000000000000 then reject("已用流量超出支持范围")
      elif ($usage.total_mb|type) != "number" or $usage.total_mb <= 0 or $usage.total_mb*1048576 > 1000000000000000 then reject("套餐总量不明确，无法自动设置流量阈值")
      elif any($usage.details[]?; .unlimited==true) then reject("包含不限量流量包，无法自动确定流量阈值")
      elif ($usage.updated_at|type) != "number" or $now-$usage.updated_at > 60 or $usage.updated_at > $now+5 then reject("运营商用量数据尚未刷新")
      else {available:true,reason:"可用",target_bytes:($usage.used_mb*1048576|round),threshold_bytes:($usage.total_mb*1048576|round),cycle:$state.cycle} end'
}

calibration_probe()
{
    local section=$1 fresh=${2:-false} cfg sim fields identity phone isp payload usage state result reason mobile last carrier endpoint action
    cfg=$(calibration_config "$section")
    last='{}'
    [ ! -f "$TRAFFIC_STORE/$section.autocalibration.json" ] || last=$(jq -c . "$TRAFFIC_STORE/$section.autocalibration.json" 2>/dev/null || true)
    last=${last:-'{}'}
    sim=$(ubus -S call qmodem sim_info "{\"config_section\":\"$section\"}" 2>/dev/null)
    fields=$(printf '%s' "$sim" | jq -c '[.modem_info[]? | {key:.key,value:.value}]|from_entries' 2>/dev/null)
    identity=$(printf '%s' "$fields" | jq -r '.IMSI // .ICCID // empty')
    phone=$(printf '%s' "$fields" | jq -r '.["SIM Number"] // empty' | sed 's/[^0-9]//g;s/^86//')
    isp=$(printf '%s' "$fields" | jq -r '.ISP // empty')
    carrier=''
    if printf '%s' "$identity" | grep -Eq '^460'; then
        if printf '%s' "$identity" | grep -Eq '^460(01|06|09|10)'; then carrier=unicom;
        elif printf '%s' "$identity" | grep -Eq '^460(03|05|11|12)'; then carrier=telecom;
        elif printf '%s' "$identity" | grep -Eq '^460(00|02|04|07|08|13)'; then carrier=mobile; fi
    elif printf '%s' "$isp" | grep -Eiq 'unicom|联通'; then carrier=unicom;
    elif printf '%s' "$isp" | grep -Eiq 'telecom|电信'; then carrier=telecom;
    elif printf '%s' "$isp" | grep -Eiq 'mobile|cmcc|移动'; then carrier=mobile; fi
    endpoint=shared
    action=usage
    if [ "$carrier" = telecom ]; then endpoint=telecom_test; action=shared_usage; elif [ "$carrier" = mobile ]; then endpoint=mobile; fi
    reason=''
    if [ "$(printf '%s' "$fields" | jq -r '.["SIM Status"] // empty')" != ready ]; then
        reason='SIM 卡尚未就绪'
    elif ! printf '%s' "$identity" | grep -Eq '^[0-9]{10,32}$'; then
        reason='无法确认 SIM 卡身份'
    elif [ -z "$carrier" ]; then
        reason='当前运营商暂不支持自动校准'
    elif ! command -v curl >/dev/null 2>&1; then
        reason='未安装流量查询所需的 curl'
    fi
    usage='{}'
    if [ -z "$reason" ]; then
        payload=$(jq -nc --arg section "$section" --arg identity "$identity" --argjson fresh "$fresh" --arg action "$action" '{action:$action,refresh:$fresh,_sim:{section:$section,identity:$identity}}')
        if ! usage=$(printf '%s' "$payload" | curl --silent --fail --max-time 22 --noproxy '*' -H 'Content-Type: application/json' --data-binary @- "http://127.0.0.1:8788/$endpoint/" 2>/dev/null); then
            usage='{}'; reason='流量查询服务暂不可用'
        elif ! printf '%s' "$usage" | jq -e 'type=="object"' >/dev/null 2>&1; then
            usage='{}'; reason='流量查询响应无效'
        elif [ "$(printf '%s' "$usage" | jq -r '.ok')" != true ]; then
            case "$(printf '%s' "$usage" | jq -r '.code // empty')" in
                TOKEN_EXPIRED|BLACKLIST) reason='尚未登录或登录已过期';;
                *) reason='运营商用量查询失败';;
            esac
        fi
    fi
    mobile=$(printf '%s' "$usage" | jq -r '.mobile // empty')
    if [ -z "$reason" ] && printf '%s' "$phone" | grep -Eq '^1[0-9]{10}$' && [ -n "$mobile" ]; then
        [ "$(printf '%s' "$phone" | sed 's/^\(...\)....\(....\)$/\1****\2/')" = "$mobile" ] || reason='登录账号与当前 SIM 卡号码不一致'
    fi
    if [ -z "$reason" ]; then
        state=$(ubus -S call qmodem.traffic current "{\"config_section\":\"$section\"}" 2>/dev/null)
        if ! printf '%s' "$state" | jq -e 'type=="object"' >/dev/null 2>&1; then state='{}'; fi
        result=$(calibration_evaluate "$state" "$usage" "$(date +%Y-%m)" "$(date +%s)")
    else
        result=$(jq -nc --arg reason "$reason" '{available:false,reason:$reason}')
    fi
    printf '%s' "$result" | jq -c --argjson cfg "$cfg" --argjson last "$last" --argjson usage "$usage" --arg identity "$identity" '
      . + {config:$cfg,last:$last,logged_in:($usage.ok==true),mobile:($usage.mobile // ""),used_mb:($usage.used_mb // null),sim_identity:$identity}'
}

calibration_record()
{
    local section=$1 key=$2 status=$3 reason=$4 target=${5:-null} threshold=${6:-null} file
    mkdir -p "$TRAFFIC_STORE"
    file=$(mktemp "$TRAFFIC_STORE/.autocalibration.XXXXXX") || return 1
    if jq -nc --arg key "$key" --arg status "$status" --arg reason "$reason" --arg local_time "$(date '+%Y-%m-%d %H:%M:%S')" --argjson now "$(date +%s)" --argjson target "$target" --argjson threshold "$threshold" '{key:$key,status:$status,reason:$reason,time:$now,local_time:$local_time,target_bytes:$target,threshold_bytes:$threshold}' > "$file"; then
        mv "$file" "$TRAFFIC_STORE/$section.autocalibration.json"
    else rm -f "$file"; return 1; fi
}

calibration_tick()
{
    local section=$1 mode=${2:-scheduled} cfg scheduled key last probe target threshold cycle sim after result latest
    qmodem_valid_instance "$section" || return 0
    cfg=$(calibration_config "$section")
    [ "$mode" = manual ] || [ "$(printf '%s' "$cfg" | jq -r '.enabled')" = true ] || return 0
    scheduled=$(printf '%s' "$cfg" | jq -r '(.hour|tostring|if length==1 then "0"+. else . end)+":"+(.minute|tostring|if length==1 then "0"+. else . end)')
    [ "$mode" = manual ] || [ "$(date +%H:%M)" = "$scheduled" ] || return 0
    mkdir -p "$TRAFFIC_RAM"
    exec 7>"$TRAFFIC_RAM/$section.calibration.lock"
    flock -n 7 || { [ "$mode" != manual ] || echo '{"success":false,"error":"校准正在执行，请稍后重试"}'; exec 7>&-; return 0; }
    key="$(date +%F) $scheduled"
    last=$(jq -r '.key // empty' "$TRAFFIC_STORE/$section.autocalibration.json" 2>/dev/null || true)
    if [ "$mode" = manual ]; then key="$last"; fi
    if [ "$mode" != manual ] && [ "$last" = "$key" ]; then flock -u 7; exec 7>&-; return 0; fi
    # Durable attempt marker avoids duplicate scheduled writes after restart.
    calibration_record "$section" "$key" running '正在执行' || { flock -u 7; exec 7>&-; return 1; }
    probe=$(calibration_probe "$section" true)
    if [ "$(printf '%s' "$probe" | jq -r '.available')" != true ]; then
        calibration_record "$section" "$key" skipped "$(printf '%s' "$probe" | jq -r '.reason')"
    else
        target=$(printf '%.0f' "$(printf '%s' "$probe" | jq -r '.target_bytes')")
        threshold=$(printf '%.0f' "$(printf '%s' "$probe" | jq -r '.threshold_bytes')")
        cycle=$(printf '%s' "$probe" | jq -r '.cycle')
        sim=$(printf '%s' "$probe" | jq -r '.sim_identity')
        after=$(ubus -S call qmodem sim_info "{\"config_section\":\"$section\"}" 2>/dev/null | jq -r '[.modem_info[]? | {key:.key,value:.value}]|from_entries|.IMSI // .ICCID // empty')
        latest=$(calibration_config "$section")
        if [ "$sim" != "$after" ] || [ "$cfg" != "$latest" ]; then
            calibration_record "$section" "$key" skipped 'SIM 卡或自动校准设置已变更'
        else
            result=$(ubus -S call qmodem.traffic correct_bytes "$(jq -nc --arg section "$section" --arg cycle "$cycle" --arg bytes "$target" --arg threshold "$threshold" '{config_section:$section,cycle:$cycle,target_bytes:$bytes,threshold_bytes:$threshold}')" 2>/dev/null)
            if [ "$(printf '%s' "$result" | jq -r '.success // false')" = true ]; then
                calibration_record "$section" "$key" success '已校准已用量和流量阈值' "$target" "$threshold"
            else
                calibration_record "$section" "$key" failed '校准未完成，可能账期已变化或采样已过期'
            fi
        fi
    fi
    if [ "$mode" = manual ]; then
        jq -c '{success:(.status=="success"),message:.reason,error:(if .status=="success" then null else .reason end)}' "$TRAFFIC_STORE/$section.autocalibration.json"
    fi
    flock -u 7; exec 7>&-
}

calibration_loop()
{
    . /lib/functions.sh
    . "$TRAFFIC_HOME/instance.sh"
    mkdir -p "$TRAFFIC_RAM"
    exec 9>"$TRAFFIC_RAM/calibration-loop.lock"
    flock -n 9 || exit 0
    while :; do
        config_load qmodem
        config_foreach calibration_tick modem-device
        sleep 15 & wait $!
    done
}

if [ "${QMODEM_CALIBRATION_LIBRARY:-0}" != 1 ]; then
    umask 077
    case "$1" in
        loop) calibration_loop ;;
        run)
            . "$TRAFFIC_HOME/instance.sh"
            qmodem_valid_instance "$2" || exit 2
            calibration_tick "$2" manual
            ;;
        status)
            . "$TRAFFIC_HOME/instance.sh"
            qmodem_valid_instance "$2" || exit 2
            calibration_probe "$2" false | jq 'del(.sim_identity,.target_bytes,.cycle)'
            ;;
    esac
fi
