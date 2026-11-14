#!/bin/sh
# Independent of the 1-second sampler: carrier requests must not pause counters.
TRAFFIC_HOME=${QMODEM_HOME:-/usr/share/qmodem}
TRAFFIC_RAM=${QMODEM_TRAFFIC_RAM:-/var/run/qmodem/traffic}
TRAFFIC_STORE=${QMODEM_TRAFFIC_STORE:-/etc/qmodem/traffic}

calibration_config()
{
    local section=$1 enabled hour minute simchange
    enabled=$(uci -q get "qmodem.$section.traffic_calibration_enabled")
    hour=$(uci -q get "qmodem.$section.traffic_calibration_hour")
    minute=$(uci -q get "qmodem.$section.traffic_calibration_minute")
    simchange=$(uci -q get "qmodem.$section.traffic_calibration_simchange")
    case "$hour" in ''|*[!0-9]*) hour=3;; esac
    case "$minute" in ''|*[!0-9]*) minute=0;; esac
    hour=$(printf '%s' "$hour" | sed 's/^0*//'); hour=${hour:-0}
    minute=$(printf '%s' "$minute" | sed 's/^0*//'); minute=${minute:-0}
    [ "$hour" -le 23 ] 2>/dev/null || hour=3
    [ "$minute" -le 59 ] 2>/dev/null || minute=0
    jq -nc --arg enabled "$enabled" --arg hour "$hour" --arg minute "$minute" --arg simchange "$simchange" '{enabled:($enabled=="1"),hour:($hour|tonumber),minute:($minute|tonumber),simchange_enabled:($simchange!="0")}'
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
                BUSY) reason='流量查询正在进行，请稍后重试';;
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
      . + {config:$cfg,last:$last,logged_in:($usage.ok==true),login_required:($usage.code=="TOKEN_EXPIRED" or $usage.code=="BLACKLIST"),query_busy:($usage.code=="BUSY"),mobile:($usage.mobile // ""),used_mb:($usage.used_mb // null),sim_identity:$identity}'
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
    [ "$mode" != simchange ] || [ "$(printf '%s' "$cfg" | jq -r '.simchange_enabled != false')" = true ] || return 0
    [ "$mode" != scheduled ] || [ "$(printf '%s' "$cfg" | jq -r '.enabled')" = true ] || return 0
    scheduled=$(printf '%s' "$cfg" | jq -r '(.hour|tostring|if length==1 then "0"+. else . end)+":"+(.minute|tostring|if length==1 then "0"+. else . end)')
    [ "$mode" != scheduled ] || [ "$(date +%H:%M)" = "$scheduled" ] || return 0
    mkdir -p "$TRAFFIC_RAM"
    exec 7>"$TRAFFIC_RAM/$section.calibration.lock"
    flock -n 7 || { [ "$mode" != manual ] || echo '{"success":false,"error":"校准正在执行，请稍后重试"}'; exec 7>&-; [ "$mode" != simchange ] || return 2; return 0; }
    key="$(date +%F) $scheduled"
    last=$(jq -r '.key // empty' "$TRAFFIC_STORE/$section.autocalibration.json" 2>/dev/null || true)
    if [ "$mode" != scheduled ]; then key="$last"; fi
    if [ "$mode" = scheduled ] && [ "$last" = "$key" ]; then flock -u 7; exec 7>&-; return 0; fi
    # Durable attempt marker avoids duplicate scheduled writes after restart.
    calibration_record "$section" "$key" running '正在执行' || { flock -u 7; exec 7>&-; return 1; }
    probe=$(calibration_probe "$section" true)
    if [ "$mode" = simchange ] && [ "$(printf '%s' "$probe" | jq -r '.sim_identity // empty' | tr -d '\n' | sha256sum | cut -d' ' -f1)" != "$3" ]; then
        flock -u 7; exec 7>&-; return 0
    fi
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
    if [ "$mode" = simchange ] && [ "$(printf '%s' "$probe" | jq -r '.query_busy // false')" = true ]; then return 2; fi
    if [ "$mode" = simchange ] && [ "$(printf '%s' "$probe" | jq -r '.login_required // false')" = true ]; then return 3; fi
}

# SIM fingerprints and one-shot state survive service and router restarts.
# Only the local session status is polled; operator usage is fetched once.
calibration_watch_sim()
{
    local section=$1 fields identity fingerprint carrier action response file previous pending temp code revision saved_revision attempts next_at outcome
    qmodem_valid_instance "$section" || return 0
    [ "$(calibration_config "$section" | jq -r '.simchange_enabled != false')" = true ] || return 0
    fields=$(ubus -S call qmodem sim_info "{\"config_section\":\"$section\"}" 2>/dev/null | jq -c '[.modem_info[]? | {key:.key,value:.value}]|from_entries')
    [ "$(printf '%s' "$fields" | jq -r '.["SIM Status"] // empty')" = ready ] || return 0
    identity=$(printf '%s' "$fields" | jq -r '.IMSI // .ICCID // empty')
    printf '%s' "$identity" | grep -Eq '^[0-9]{10,32}$' || return 0
    fingerprint=$(printf '%s' "$identity" | sha256sum | cut -d' ' -f1)
    file="$TRAFFIC_STORE/$section.simwatch.json"
    previous=$(jq -r '.fingerprint // empty' "$file" 2>/dev/null || true)
    if [ "$previous" != "$fingerprint" ]; then
        mkdir -p "$TRAFFIC_STORE"
        temp=$(mktemp "$TRAFFIC_STORE/.simwatch.XXXXXX") || return 1
        jq -nc --arg fingerprint "$fingerprint" '{fingerprint:$fingerprint,pending:true}' > "$temp" && mv "$temp" "$file"
    fi
    pending=$(jq -r '.pending // false' "$file" 2>/dev/null)
    if [ "$pending" != true ]; then
        # Migrate attempts consumed by older releases despite a failed query.
        [ "$(jq -r '.completed // false' "$file")" != true ] || return 0
        outcome=$(jq -r '.status // empty' "$TRAFFIC_STORE/$section.autocalibration.json" 2>/dev/null || true)
        case "$outcome" in skipped|failed) ;; *) return 0;; esac
    fi
    # Do not consume the attempt while traffic sampling is disabled or stale.
    [ "$(uci -q get "qmodem.$section.traffic_enabled")" != 0 ] || return 0
    jq -e --argjson now "$(date +%s)" '.now != null and $now-.now <= 30' "$TRAFFIC_RAM/$section.json" >/dev/null 2>&1 || return 0
    carrier=''
    case "$identity" in
        46001*|46006*|46009*|46010*) carrier=shared; action=status;;
        46000*|46002*|46004*|46007*|46008*|46013*) carrier=mobile; action=status;;
        46003*|46005*|46011*|46012*) carrier=telecom_test; action=shared_status;;
    esac
    [ -n "$carrier" ] || return 0
    response=$(jq -nc --arg section "$section" --arg identity "$identity" --arg action "$action" '{action:$action,_sim:{section:$section,identity:$identity}}' |
        curl --silent --fail --max-time 5 --noproxy '*' -H 'Content-Type: application/json' --data-binary @- "http://127.0.0.1:8788/$carrier/" 2>/dev/null) || return 0
    [ "$(printf '%s' "$response" | jq -r '.logged_in // false')" = true ] || return 0
    revision=$(printf '%s' "$response" | jq -r '.session_revision // 0')
    saved_revision=$(jq -r '.session_revision // ""' "$file")
    attempts=$(jq -r '.attempts // 0' "$file")
    next_at=$(jq -r '.next_at // 0' "$file")
    if [ "$revision" != "$saved_revision" ]; then attempts=0; next_at=0; fi
    # At most three attempts per login, one minute apart. A fresh login resets
    # the budget; only the local session endpoint is polled while waiting.
    [ "$attempts" -lt 3 ] && [ "$(date +%s)" -ge "$next_at" ] || return 0
    # Persist before querying so restart/failure cannot cause repeated requests.
    temp=$(mktemp "$TRAFFIC_STORE/.simwatch.XXXXXX") || return 1
    jq --arg revision "$revision" --argjson attempts "$((attempts+1))" --argjson next_at "$(($(date +%s)+60))" '.pending=false | .session_revision=$revision | .attempts=$attempts | .next_at=$next_at' "$file" > "$temp" && mv "$temp" "$file" || return 1
    code=0
    calibration_tick "$section" simchange "$fingerprint" || code=$?
    outcome=$(jq -r '.status // empty' "$TRAFFIC_STORE/$section.autocalibration.json" 2>/dev/null || true)
    temp=$(mktemp "$TRAFFIC_STORE/.simwatch.XXXXXX") || return 1
    if [ "$code" = 2 ]; then
        jq --argjson next_at "$(($(date +%s)+17))" '.pending=true | .attempts-=1 | .next_at=$next_at' "$file" > "$temp"
    elif [ "$code" = 3 ] || [ "$outcome" != success ]; then
        jq '.pending=true | .completed=false' "$file" > "$temp"
    else
        jq '.pending=false | .completed=true' "$file" > "$temp"
    fi
    mv "$temp" "$file"
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
        config_foreach calibration_watch_sim modem-device
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
