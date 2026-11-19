#!/bin/sh
# Copyright (C) 2025 x-shark
_Vendor="foxconn"
_Author="x-shark"
_Maintainer="x-shark <unknown>"
source "${QMODEM_HOME:-/usr/share/qmodem}/generic.sh"
source "${QMODEM_HOME:-/usr/share/qmodem}/cmds/foxconn.sh"
debug_subject="foxconn_ctrl"

name=$(uci -q get qmodem.$config_section.name)
case "$name" in
    "t99w640")
        at_pre="AT+"
    ;;
    "t99w368")
        at_pre="AT+"
    ;;
    *)
        at_pre="AT^"
    ;;
esac

get_imei(){
    imei=$(cmd_ati "$at_port" | awk -F': ' '/^IMEI:/ {print $2}' | xargs)
    json_add_string imei $imei
}

set_imei(){
    imei=$1
    # 添加 80A 前缀
    extended="80A${imei}"
    swapped=""
    len=${#extended}
    i=0
    while [ $i -lt $len ]; do
        pair=$(echo "$extended" | cut -c$((i+1))-$((i+2)))
        if [ ${#pair} -eq 2 ]; then
            swapped="${swapped}${pair:1:1}${pair:0:1}"
        elif [ ${#pair} -eq 1 ]; then
            swapped="${swapped}${pair:0:1}"
        fi
        i=$((i+2))
    done

    # 两位分组加逗号，并转小写
    formatted=$(echo "$swapped" | sed 's/../&,/g' | sed 's/,$//' | tr 'A-Z' 'a-z')

    cmd_nv_550_clear "$at_port" "$at_pre"
    res=$(cmd_nv_550_set "$at_port" "$at_pre" "$formatted")
    json_select "result"
    json_add_string "set_imei" "$res"
    json_close_object
    get_imei
}

get_mode(){
    local mode_num
    local mode
    local data_interface=$(uci -q get qmodem.$config_section.data_interface)
    cfg=$(cmd_pciemode_query "$at_port" "$at_pre")
    config_type=`echo -e "$cfg" | grep -o '[0-9]'`
    if [ "$config_type" = "1" ] || [ "$data_interface" = "pcie" ]; then
        mode_num="0"
        json_add_int disable_mode_btn 1
    else
          ucfg=$(cmd_usbswitch_query "$at_port" "$at_pre")
          config_type=$(echo "$ucfg" | grep USBSWITCH: |cut -d':' -f2|xargs)
          if [ "$config_type" = "9025" ]; then
             mode_num="1"
          elif [ "$config_type" = "90D5" ]; then
             mode_num="0"
        fi
    fi
    case "$platform" in
        "qualcomm")
            case "$mode_num" in
                "0") mode="mbim" ;;
                "1") mode="rmnet" ;;
                *) mode="${mode_num}" ;;
            esac
        ;;
        *)
            mode="${mode_num}"
        ;;
    esac
    available_modes=$(uci -q get qmodem.$config_section.modes)
    json_add_object "mode"
    for available_mode in $available_modes; do
        if [ "$mode" = "$available_mode" ]; then
            json_add_string "$available_mode" "1"
        else
            json_add_string "$available_mode" "0"
        fi
    done
    json_close_object

}

set_mode(){
    local mode=$1
    case "$platform" in
        "qualcomm")
            case "$mode" in
                "mbim") mode_num="90d5" ;;
                "rmnet") mode_num="9025" ;;
                *) mode="90d5" ;;
            esac
        ;;
        *)
            mode_num="90d5"
        ;;
    esac
    #设置模组
    res=$(cmd_usbswitch_set "$at_port" "$at_pre" "$mode_num")
    json_select "result"
    json_add_string "set_mode" "$res"
    json_close_object
}

get_network_prefer(){
    res=$(cmd_slmode_query "$at_port" "$at_pre"| grep -o '[0-9]\+' | tr -d '\n' | tr -d ' ')
# (RAT index): 
# 0 Automatically 
# 1 WCDMA Only
# 2 LTE Only 
# 3 WCDMA And LTE 
# 4 NR5G Only 
# 5 WCDMA And NR5G 
# 6 LTE And NR5G 
# 7 WCDMA And LTE And NR5G
    local network_prefer_3g="0"
    local network_prefer_4g="0"
    local network_prefer_5g="0"
   case $res in
        "10")
            network_prefer_3g="1"
            network_prefer_4g="1"
            network_prefer_5g="1"
            ;;
        "11")
            network_prefer_3g="1"
            ;;
        "12")
            network_prefer_4g="1"
            ;;
        "13")
            network_prefer_3g="1"
            network_prefer_4g="1"
            ;;
        "14")
            network_prefer_5g="1"
            ;;
        "15")
            network_prefer_3g="1"
            network_prefer_5g="1"
            ;;
        "16")
            network_prefer_4g="1"
            network_prefer_5g="1"
            ;;
        "17")
            network_prefer_3g="1"
            network_prefer_4g="1"
            network_prefer_5g="1"
            ;;
        *)
            network_prefer_3g="0"
            network_prefer_4g="0"
            network_prefer_5g="0"
            ;;
    esac
    json_add_object network_prefer
    json_add_string 3G $network_prefer_3g
    json_add_string 4G $network_prefer_4g
    json_add_string 5G $network_prefer_5g
    json_close_array
}

set_network_prefer(){
    local network_prefer_3g=$(echo $1 |jq -r 'contains(["3G"])')
    local network_prefer_4g=$(echo $1 |jq -r 'contains(["4G"])')
    local network_prefer_5g=$(echo $1 |jq -r 'contains(["5G"])')
    count=$(echo $1 | jq -r 'length')
    case "$count" in
        "1")
            if [ "$network_prefer_3g" = "true" ]; then
                code="11"
            elif [ "$network_prefer_4g" = "true" ]; then
                code="12"
            elif [ "$network_prefer_5g" = "true" ]; then
                code="14"
            fi
            ;;
        "2")
            if [ "$network_prefer_3g" = "true" ] && [ "$network_prefer_4g" = "true" ]; then
                code="13"
            elif [ "$network_prefer_4g" = "true" ] && [ "$network_prefer_5g" = "true" ]; then
                code="16"
            elif [ "$network_prefer_3g" = "true" ] && [ "$network_prefer_5g" = "true" ]; then
                code="15"
            fi
            ;;
        "3")
            code="17"
            ;;
        *)
            code="10"
            ;;
    esac
    res=$(cmd_slmode_set "$at_port" "$at_pre" "$(echo "$code" | awk '{print substr($0,1,1) "," substr($0,2,1)}')")
    json_add_string "code" "$code"
    json_add_string "result" "$res"
}



get_lockband(){
    json_add_object "lockband"
    case $platform in
        "qualcomm")
            get_lockband_nr
            ;;
    esac
    json_close_object
}

# Decode EF_MSISDN (3GPP TS 31.102 6F40) 28-byte record from AT+CRSM=178,28480,1,4,28.
# The trailing 14 bytes (28 hex chars) are: BCD byte count, TON/NPI, 10-byte swapped BCD number, CCP2, Ext1.
foxconn_decode_crsm_msisdn()
{
    printf '%s\n' "$1" | tr -d '\r' | awk -F'"' '
        /^\+CRSM:[[:space:]]*(144|145),/ && NF >= 2 {
            hex = toupper($2)
            gsub(/[^0-9A-F]/, "", hex)
            n = length(hex)
            if (n < 28) next
            tail = substr(hex, n - 27, 28)
            bcd_len = substr(tail, 1, 2)
            ton_npi = substr(tail, 3, 2)
            bcd = substr(tail, 5, 20)
            if (bcd_len == "FF" || bcd_len == "00" || ton_npi == "FF") next
            num = ""
            for (i = 1; i <= 20; i += 2) {
                d1 = substr(bcd, i + 1, 1)
                d2 = substr(bcd, i, 1)
                if (d1 ~ /^[0-9]$/) num = num d1
                else if (d1 == "F") break
                else { num = ""; break }
                if (d2 ~ /^[0-9]$/) num = num d2
                else if (d2 == "F") break
                else { num = ""; break }
            }
            if (length(num) >= 5) {
                if (ton_npi == "91") num = "+" num
                print num
                exit
            }
        }
    '
}

foxconn_get_sim_slot_value()
{
    cmd_switch_slot_query "$at_port" "$at_pre" | tr -d '\r' | awk '/ENABLE/ {
        if (match($0, /SIM[0-9]+/)) {
            print substr($0, RSTART + 3, RLENGTH - 3)
            exit
        }
    }'
}

sim_switch_capabilities()
{
    case "$name" in
        "t99w640")
            json_add_string "supportSwitch" "1"
            json_add_array "simSlots"
            json_add_string "" "1"
            json_add_string "" "2"
            json_close_array
            ;;
        *)
            json_add_string "supportSwitch" "0"
            ;;
    esac
}

get_sim_switch_capabilities()
{
    sim_switch_capabilities
}

get_sim_slot()
{
    local sim_slot
    sim_slot=$(foxconn_get_sim_slot_value)
    json_add_string "sim_slot" "$sim_slot"
}

set_sim_slot()
{
    local sim_slot_param="$1"
    local mode response
    if [ "$name" != "t99w640" ]; then
        json_add_string "result" "SIM slot switch is not supported on this model"
        return 1
    fi
    case "$sim_slot_param" in
        1) mode="0" ;;
        2) mode="1" ;;
        *)
            json_add_string "result" "Invalid SIM slot: $sim_slot_param"
            return 1
            ;;
    esac
    response=$(cmd_switch_slot_set "$at_port" "$at_pre" "$mode")
    json_add_string "result" "$response"
    printf '%s\n' "$response" | tr -d '\r' | grep -Eq '^[[:space:]]*OK[[:space:]]*$' || return 1
    rm -f "/tmp/cache_sim_info_$config_section" "/tmp/cache_info_$config_section"
    return 0
}

sim_info()
{
    class="SIM Information"

    #IMEI（国际移动设备识别码）
    imei=$(cmd_ati "$at_port" | awk -F': ' '/^IMEI:/ {print $2}' | xargs)
    
    sim_slot=$(foxconn_get_sim_slot_value)

    #SIM Status（SIM状态）
    sim_status=$(cmd_cpin_query "$at_port" | grep "+CPIN:")
    sim_status=${sim_status:7:-1}
    #lowercase
    sim_status=$(echo $sim_status | tr  A-Z a-z)

    if [ "$sim_status" != "ready" ]; then
        return
    fi
    
    # T99W368 and T99W640 return unreadable text operator names ("????"); force numeric COPS
    # format just for those models so existing Foxconn models keep their current
    # behaviour.
    case "$name" in
        "t99w368"|"t99w640")
            cmd_cops_numeric "$at_port" > /dev/null 2>&1
            ;;
    esac
    isp=$(cmd_cops_query "$at_port" | sed -n '2p' | awk -F'"' '{print $2}')
    if [ "$isp" = "CHN-CMCC" ] || [ "$isp" = "CMCC" ]|| [ "$isp" = "46000" ]; then
         isp="中国移动"
    # # elif [ "$isp" = "CHN-UNICOM" ] || [ "$isp" = "UNICOM" ] || [ "$isp" = "46001" ]; then
    elif [ "$isp" = "CHN-UNICOM" ] || [ "$isp" = "CUCC" ] || [ "$isp" = "46001" ]; then
         isp="中国联通"
    elif [ "$isp" = "CHN-CT" ] || [ "$isp" = "CT" ] || [ "$isp" = "46011" ]; then
    # elif [ "$isp" = "CHN-TELECOM" ] || [ "$isp" = "CTCC" ] || [ "$isp" = "46011" ]; then
         isp="中国电信"
    fi

    cnum_res=$(cmd_cnum "$at_port" | tr -d '\r')
    sim_number=$(printf '%s\n' "$cnum_res" | awk -F'"' '/^\+CNUM:/ { if ($4 != "") print $4; else print $2; exit }' | xargs)
    if [ -z "$sim_number" ]; then
        sim_number=$(foxconn_decode_crsm_msisdn "$(cmd_crsm_msisdn "$at_port")")
    fi

    #IMSI（国际移动用户识别码）
    imsi=$(cmd_cimi "$at_port" | sed -n '2p' | sed 's/\r//g')

    #ICCID（集成电路卡识别码）
    iccid=$(cmd_iccid "$at_port" | sed -n '2p' | sed 's/\r//g'|sed 's/[^0-9]*//g')
    case "$sim_status" in
        "ready")
            add_plain_info_entry "SIM Status" "$sim_status" "SIM Status" 
            add_plain_info_entry "ISP" "$isp" "Internet Service Provider"
            add_plain_info_entry "SIM Slot" "$sim_slot" "SIM Slot"
            add_plain_info_entry "SIM Number" "$sim_number" "SIM Number"
            add_plain_info_entry "IMEI" "$imei" "International Mobile Equipment Identity" 
            add_plain_info_entry "IMSI" "$imsi" "International Mobile Subscriber Identity" 
            add_plain_info_entry "ICCID" "$iccid" "Integrate Circuit Card Identity" 
        ;;
        "miss")
            add_plain_info_entry "SIM Status" "$sim_status" "SIM Status" 
            add_plain_info_entry "IMEI" "$imei" "International Mobile Equipment Identity" 
        ;;
        "unknown")
            add_plain_info_entry "SIM Status" "$sim_status" "SIM Status" 
        ;;
        *)
            add_plain_info_entry "SIM Status" "$sim_status" "SIM Status" 
            add_plain_info_entry "SIM Slot" "$sim_slot" "SIM Slot" 
            add_plain_info_entry "IMEI" "$imei" "International Mobile Equipment Identity" 
            add_plain_info_entry "IMSI" "$imsi" "International Mobile Subscriber Identity" 
            add_plain_info_entry "ICCID" "$iccid" "Integrate Circuit Card Identity" 
        ;;
    esac
}

base_info(){
        #Name（名称）
    baseinfos=$(cmd_ati "$at_port")
    name=$(echo "$baseinfos"| awk -F': ' '/^Manufacturer:/ {print $2}' |xargs)
    #Manufacturer（制造商）
    manufacturer=$(echo "$baseinfos"|awk -F': ' '/^Manufacturer:/ {print $2}' |xargs)
    #Revision（固件版本）
    revision=$(echo "$baseinfos"|awk -F': ' '/^Revision:/ {print $2}' | xargs)
    class="Base Information"
    add_plain_info_entry "manufacturer" "$manufacturer" "Manufacturer"
    add_plain_info_entry "revision" "$revision" "Revision"
    add_plain_info_entry "at_port" "$at_port" "AT Port"
    get_connect_status
    _get_temperature
    _get_voltage
}

network_info() {
    class="Network Information"
    [ -z "$network_type" ] && {
        local rat_num=$(cmd_cops_query "$at_port" | grep "+COPS:" | awk -F',' '{print $4}' | sed 's/\r//g')
        network_type=$(get_rat ${rat_num})
    }
    #at_command='AT+debug?'
    #response=$(at $at_port $at_command)
    #lte_sinr=$(echo "$response"|awk -F'lte_snr:' '{print $2}'|awk '{print $1}|xargs)
    add_plain_info_entry "Network Type" "$network_type" "Network Type"
}

vendor_get_disabled_features(){
    json_add_string "" "NeighborCell"
}

get_lockband_nr()
{
    m_debug  "Quectel sdx55 get lockband info"
    get_lockbans=$(cmd_band_pref_query "$at_port" "$at_pre")

    # WCDMA
    wcdma_enable=$(echo "$get_lockbans" | grep "WCDMA,Enable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    wcdma_disable=$(echo "$get_lockbans" | grep "WCDMA,Disable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    wcdma_enable=$(echo "$wcdma_enable" | tr ' ' '\n' | grep -v '^$')
    wcdma_disable=$(echo "$wcdma_disable" | tr ' ' '\n' | grep -v '^$')
    wcdma_all=$(echo "$wcdma_enable $wcdma_disable" | tr ' ' '\n' | grep -v '^$' | sort -n | uniq)

    # LTE
    lte_enable=$(echo "$get_lockbans" | grep "LTE,Enable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    lte_disable=$(echo "$get_lockbans" | grep "LTE,Disable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    lte_enable=$(echo "$lte_enable" | tr ' ' '\n' | grep -v '^$')
    lte_disable=$(echo "$lte_disable" | tr ' ' '\n' | grep -v '^$')
    lte_all=$(echo "$lte_enable $lte_disable" | tr ' ' '\n' | grep -v '^$' | sort -n | uniq)

    # NR5G_NSA
    nr_nsa_enable=$(echo "$get_lockbans" | grep "NR5G_NSA,Enable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    nr_nsa_disable=$(echo "$get_lockbans" | grep "NR5G_NSA,Disable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    nr_nsa_enable=$(echo "$nr_nsa_enable" | tr ' ' '\n' | grep -v '^$')
    nr_nsa_disable=$(echo "$nr_nsa_disable" | tr ' ' '\n' | grep -v '^$')
    nr_nsa_all=$(echo "$nr_nsa_enable $nr_nsa_disable" | tr ' ' '\n' | grep -v '^$' | sort -n | uniq)

    # NR5G_SA
    nr_sa_enable=$(echo "$get_lockbans" | grep "NR5G_SA,Enable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    nr_sa_disable=$(echo "$get_lockbans" | grep "NR5G_SA,Disable Bands" | cut -d':' -f2 | tr -d ' ' | tr ',' ' ')
    nr_sa_enable=$(echo "$nr_sa_enable" | tr ' ' '\n' | grep -v '^$')
    nr_sa_disable=$(echo "$nr_sa_disable" | tr ' ' '\n' | grep -v '^$')
    nr_sa_all=$(echo "$nr_sa_enable $nr_sa_disable" | tr ' ' '\n' | grep -v '^$' | sort -n | uniq)

    # UMTS
    json_add_object "UMTS"
    json_add_array "available_band"
    for i in $wcdma_all; do
        echo "$i" | grep -Eq '^[0-9]+$' && add_avalible_band_entry "$i" "UMTS_$i"
    done
    json_close_array
    json_add_array "lock_band"
    for i in $wcdma_enable; do
        echo "$i" | grep -Eq '^[0-9]+$' && json_add_string "" "$i"
    done
    json_close_array
    json_close_object

    # LTE
    json_add_object "LTE"
    json_add_array "available_band"
    for i in $lte_all; do
        echo "$i" | grep -Eq '^[0-9]+$' && add_avalible_band_entry "$i" "LTE_B$i"
    done
    json_close_array
    json_add_array "lock_band"
    for i in $lte_enable; do
        echo "$i" | grep -Eq '^[0-9]+$' && json_add_string "" "$i"
    done
    json_close_array
    json_close_object

    # NR_NSA
    json_add_object "NR_NSA"
    json_add_array "available_band"
    for i in $nr_nsa_all; do
        echo "$i" | grep -Eq '^[0-9]+$' && add_avalible_band_entry "$i" "NR_NSA_N$i"
    done
    json_close_array
    json_add_array "lock_band"
    for i in $nr_nsa_enable; do
        echo "$i" | grep -Eq '^[0-9]+$' && json_add_string "" "$i"
    done
    json_close_array
    json_close_object

    # NR_SA
    json_add_object "NR_SA"
    json_add_array "available_band"
    for i in $nr_sa_all; do
        echo "$i" | grep -Eq '^[0-9]+$' && add_avalible_band_entry "$i" "NR_SA_N$i"
    done
    json_close_array
    json_add_array "lock_band"
    for i in $nr_sa_enable; do
        echo "$i" | grep -Eq '^[0-9]+$' && json_add_string "" "$i"
    done
    json_close_array
    json_close_object
}

# This T99W640 firmware expects a colon-separated replacement band list.
set_lockband_t99w640() {
    local rat current available selected enabled band reply bands
    case "$band_class" in
        UMTS) rat=WCDMA;;
        LTE) rat=LTE;;
        NR_SA) rat=NR5G_SA;;
        NR_NSA) rat=NR5G_NSA;;
        *) res="ERROR: Unsupported T99W640 band class"; return;;
    esac
    if ! printf '%s\n' "$lock_band" | grep -Eq '^[0-9]+(,[0-9]+)*$'; then
        res="ERROR: Select at least one valid band"; return
    fi
    current=$(cmd_band_pref_query "$at_port" "$at_pre" | tr -d '\r')
    available=$(printf '%s\n' "$current" | awk -F: -v rat="$rat" '$1 ~ "^[[:space:]]*" rat ",(Enable|Disable) Bands[[:space:]]*$" { print $2 }' | tr ', ' '  ')
    for band in $(printf '%s' "$lock_band" | tr ',' ' '); do
        case " $(echo $available) " in *" $band "*) ;; *) res="ERROR: Unsupported band $band"; return;; esac
    done
    bands=$(printf '%s' "$lock_band" | tr ',' ':')
    reply=$(at "$at_port" "${at_pre}BAND_PREF=$rat,2,$bands")
    if ! printf '%s\n' "$reply" | tr -d '\r' | grep -Eq '^[[:space:]]*OK[[:space:]]*$'; then
        res="ERROR: Failed to apply bands
$reply"; return
    fi
    current=$(cmd_band_pref_query "$at_port" "$at_pre" | tr -d '\r')
    enabled=$(printf '%s\n' "$current" | awk -F: -v rat="$rat" '$1 ~ "^[[:space:]]*" rat ",Enable Bands[[:space:]]*$" { print $2 }' | tr ', ' '\n\n' | grep -E '^[0-9]+$' | sort -nu)
    selected=$(printf '%s\n' "$lock_band" | tr ',' '\n' | sort -nu)
    if [ "$enabled" != "$selected" ]; then
        res="ERROR: Band configuration readback mismatch"; return
    fi
    res=OK
}

set_lockband_nr(){
    if [ "$name" = "t99w640" ]; then set_lockband_t99w640; return; fi
    #lock_band=$(echo $lock_band | tr ',' ':')
    case "$band_class" in
        "UMTS") 
        lock_band=$(echo $lock_band)
            res=$(cmd_band_pref_lock "$at_port" "$at_pre" WCDMA "$lock_band")
            ;;
        "LTE") 
            res=$(cmd_band_pref_lock "$at_port" "$at_pre" LTE "$lock_band")
            ;;
        "NR")
            res=$(cmd_band_pref_lock "$at_port" "$at_pre" NR5G "$lock_band")
            ;;
    esac
}

set_lockband()
{
    m_debug  "quectel set lockband info"
    config=$1
    #{"band_class":"NR","lock_band":"41,78,79"}
    band_class=$(echo $config | jq -r '.band_class')
    lock_band=$(echo $config | jq -r '.lock_band')
    case "$platform" in
        *)
            set_lockband_nr
        ;;
    esac
    json_select "result"
    json_add_string "set_lockband" "$res"
    json_add_string "config" "$config"
    json_add_string "band_class" "$band_class"
    json_add_string "lock_band" "$lock_band"
    json_close_object
}

_get_voltage(){
    voltage=$(cmd_pcvolt_query "$at_port" | grep -o 'Power supply voltage: [0-9]* mV'|grep -o '[0-9]*' )
    [ -n "$voltage" ] && {
        add_plain_info_entry "voltage" "$voltage mV" "Voltage" 
    }
}

_get_temperature(){
    temperature=$(cmd_temp_query "$at_port" "$at_pre" | sed -n 's/.*TSENS:[[:space:]]*\([-0-9.]\+\)[[:space:]]*C.*/\1/p' | head -n 1)
    [ -n "$temperature" ] && {
        add_plain_info_entry "temperature" "${temperature}℃" "Temperature" 
    }
}

_add_avalible_band(){
    add_avalible_band_entry $1 $1
}

_add_lock_band(){
    json_add_string "" $1
}

_mask_to_band()
{
    func=$1
    low_band=$2
    high_band=$3
    low_band=$(echo "obase=2; ibase=16; $low_band" | bc)
    low_band=$(printf "%064s" $low_band)
    for i in $(seq 1 64); do
        if [ "${low_band: -$i:1}" = "1" ]; then
            band=$i
            $func $band
        fi
    done
    [ -z "$high_band" ] && return
    high_band=$(echo "obase=2; ibase=16; $high_band" | bc)
    high_band=$(printf "%064s" $high_band)
    for i in $(seq 1 64); do
        if [ "${high_band: -$i:1}" = "1" ]; then
            band=$((64+i))
            $func $band
        fi
    done

}

_band_list_to_mask()
{
    local band_list=$1
    local low=0
    local high=0
    #以逗号分隔
    IFS=","
    for band in $band_list;do
        if [ "$band" -le 64 ]; then
            #使用bc计算2的band次方
            res=$(echo "2^($band-1)" | bc)
            low=$(echo "$low+$res" | bc)

        else
            tmp_band=$((band-64))
            res=$(echo "2^($tmp_band-1)" | bc)
            high=$(echo "$high+$res" | bc)
        fi
    done
    #十六进制输出，padding到16位
    low=$(printf "%016x" $low)
    high=$(printf "%016x" $high)
    echo "$low,$high"
}

process_signal_value() {
    local value="$1"
    local numbers=$(echo "$value" | grep -oE '[-+]?[0-9]+(\.[0-9]+)?')
    local count=0
    local total=0

    for num in $numbers; do
        total=$(echo "$total + $num" | bc -l)
        count=$((count+1))
    done

    if [ $count -gt 0 ]; then
        echo "scale=2; $total / $count" | bc -l | sed 's/^\./0./' | sed 's/^-\./-0./'
    else
        echo ""
    fi
}

foxconn_format_bandwidth()
{
    printf '%s' "$1" | tr -d '\r ' | sed -E 's/\.0+MHz$/M/; s/MHz$/M/'
}

foxconn_format_band()
{
    printf '%s' "$1" | tr -d '\r ' | sed -E 's/^[nNbB]//'
}

foxconn_append_ca_value()
{
    local current="$1"
    local next_val="$2"
    [ -n "$next_val" ] || return
    if [ -z "$current" ]; then
        printf '%s' "$next_val"
    else
        printf '%s / %s' "$current" "$next_val"
    fi
}

# Flatten each (nr|lte)_sccN block (whether single-line or multi-line) into one line per SCC.
foxconn_extract_scc_blocks()
{
    local prefix="$1"
    printf '%s\n' "$2" | awk -v pfx="$prefix" '
        /^[[:space:]]*(nr|lte)_scc[0-9]*:/ {
            if (block != "") { print block; block = "" }
            line = $0
            sub(/^[[:space:]]+/, "", line)
            if (index(line, pfx "_scc") == 1) {
                block = line
                in_scc = 1
            } else {
                in_scc = 0
            }
            next
        }
        /^[[:space:]]*OK[[:space:]]*$/ {
            if (block != "") { print block; block = "" }
            in_scc = 0
            next
        }
        in_scc && NF > 0 {
            block = block " " $0
        }
        END {
            if (block != "") print block
        }
    '
}

cell_info(){
    class="Cell Information"
    response=$(cmd_debug_query "$at_port" "$at_pre" | tr -d '\r')
    network_mode=$(printf '%s\n' "$response" | awk -F'RAT:' '/RAT:/ {print $2; exit}' | xargs)
    pcc_section=$(printf '%s\n' "$response" | awk '/^(nr|lte)_scc[0-9]*:/ {exit} {print}')

    case "$network_mode" in
    "LTE")
        local ca_count=1 scc_line scc_pci="" scc_earfcn="" scc_band="" scc_dl_bandwidth=""
        local scc_pci_new scc_earfcn_new scc_band_new scc_bw_new
        lte_mcc=$(printf '%s\n' "$pcc_section" | awk -F'mcc:' '/mcc:/ {print $2; exit}' | awk -F',' '{print $1}' | xargs)
        lte_mnc=$(printf '%s\n' "$pcc_section" | awk -F'mnc:' '/mnc:/ {print $2; exit}' | xargs)
        lte_earfcn=$(printf '%s\n' "$pcc_section" | awk -F'channel:' '/channel:/ {print $2; exit}' | awk '{print $1}' | xargs)
        lte_physical_cell_id=$(printf '%s\n' "$pcc_section" | awk -F'pci:' '/pci:/ {print $2; exit}' | awk '{print $1}' | xargs)
        lte_cell_id=$(printf '%s\n' "$pcc_section" | awk -F'lte_cell_id:' '/lte_cell_id:/ {print $2; exit}' | xargs)
        lte_band=$(foxconn_format_band "$(printf '%s\n' "$pcc_section" | awk -F'lte_band:' '/lte_band:/ {print $2; exit}' | awk -F'[, ]' '{print $1}' | xargs)")
        lte_dl_bandwidth=$(foxconn_format_bandwidth "$(printf '%s\n' "$pcc_section" | awk -F'lte_band_width:' '/lte_band_width:/ {print $2; exit}' | awk '{print $1}' | xargs)")
        lte_ul_bandwidth="$lte_dl_bandwidth"
        lte_sinr=$(printf '%s\n' "$pcc_section" | awk -F'lte_snr:' '/lte_snr:/ {print $2; exit}' | awk '{print $1}' | xargs)
        lte_sinr=$(process_signal_value "$lte_sinr")
        lte_rsrp=$(printf '%s\n' "$pcc_section" | awk -F'rsrp:' '/rsrp:/ {print $2; exit}' | awk '{print $1}' | xargs)
        lte_rsrp=$(process_signal_value "$lte_rsrp")
        lte_rsrq=$(printf '%s\n' "$pcc_section" | awk -F'rsrq:' '/rsrq:/ {print $2; exit}' | awk '{print $1}' | xargs)
        lte_rsrq=$(process_signal_value "$lte_rsrq")
        lte_rssi=$(printf '%s\n' "$pcc_section" | awk -F'lte_rssi:' '/lte_rssi:/ {print $2; exit}' | awk -F',' '{print $1}' | xargs)
        lte_rssi=$(process_signal_value "$lte_rssi")
        lte_tac=$(printf '%s\n' "$pcc_section" | awk -F'lte_tac:' '/lte_tac:/ {print $2; exit}' | xargs)
        lte_tx_power=$(printf '%s\n' "$pcc_section" | awk -F'lte_tx_pwr:' '/lte_tx_pwr:/ {print $2; exit}' | xargs)

        while IFS= read -r scc_line; do
            [ -n "$scc_line" ] || continue
            ca_count=$((ca_count + 1))
            scc_band_new=$(foxconn_format_band "$(printf '%s\n' "$scc_line" | awk -F'lte_band:' '{print $2}' | awk -F'[, ]' '{print $1}' | xargs)")
            scc_bw_new=$(foxconn_format_bandwidth "$(printf '%s\n' "$scc_line" | awk -F'lte_band_width:' '{print $2}' | awk '{print $1}' | xargs)")
            scc_earfcn_new=$(printf '%s\n' "$scc_line" | awk -F'channel:' '{print $2}' | awk '{print $1}' | xargs)
            scc_pci_new=$(printf '%s\n' "$scc_line" | awk -F'pci:' '{print $2}' | awk '{print $1}' | xargs)
            scc_band=$(foxconn_append_ca_value "$scc_band" "$scc_band_new")
            scc_dl_bandwidth=$(foxconn_append_ca_value "$scc_dl_bandwidth" "$scc_bw_new")
            scc_earfcn=$(foxconn_append_ca_value "$scc_earfcn" "$scc_earfcn_new")
            scc_pci=$(foxconn_append_ca_value "$scc_pci" "$scc_pci_new")
        done <<EOF
$(foxconn_extract_scc_blocks "lte" "$response")
EOF

        lte_display_mode="LTE Mode"
        [ "$ca_count" -gt 1 ] && lte_display_mode="$lte_display_mode with $ca_count CA"
        add_plain_info_entry "network_mode" "$lte_display_mode" "Network Mode"
        extra_info="LTE"
        set_4g_cell_info "$lte_mcc" "$lte_mnc" "$lte_tac" "$lte_cell_id" "$lte_earfcn" \
            "$lte_physical_cell_id" "$lte_band" "$lte_ul_bandwidth" "$lte_dl_bandwidth" \
            "$lte_rsrp" "$lte_rsrq" "$lte_sinr" "$lte_rssnr" "$lte_rxlev"
        add_bar_info_entry "RSSI" "$lte_rssi" "Received Signal Strength Indicator" -120 -20 dBm
        add_plain_info_entry "TX Power" "$lte_tx_power" "TX Power"
        if [ "$ca_count" -gt 1 ]; then
            add_ca_info "4G" "$scc_earfcn" "$scc_pci" "$scc_band" "" "$scc_dl_bandwidth"
        fi
        ;;
    "NR5G_SA"|"NR5G-SA")
        local ca_count=1 scc_line scc_pci="" scc_arfcn="" scc_band="" scc_dl_bandwidth="" scc_ul_bandwidth=""
        local scc_pci_new scc_arfcn_new scc_band_new scc_bw_new
        nr_mcc=$(printf '%s\n' "$pcc_section" | awk -F'mcc:' '/mcc:/ {print $2; exit}' | awk -F',' '{print $1}' | xargs)
        nr_mnc=$(printf '%s\n' "$pcc_section" | awk -F'mnc:' '/mnc:/ {print $2; exit}' | xargs)
        nr_arfcn=$(printf '%s\n' "$pcc_section" | awk -F'channel:' '/channel:/ {print $2; exit}' | awk '{print $1}' | xargs)
        nr_physical_cell_id=$(printf '%s\n' "$pcc_section" | awk -F'pci:' '/pci:/ {print $2; exit}' | awk '{print $1}' | xargs)
        nr_cell_id=$(printf '%s\n' "$pcc_section" | awk -F'nr_cell_id:' '/nr_cell_id:/ {print $2; exit}' | xargs)
        nr_band=$(foxconn_format_band "$(printf '%s\n' "$pcc_section" | awk -F'nr_band:' '/nr_band:/ {print $2; exit}' | awk -F'[, ]' '{print $1}' | xargs)")
        nr_dl_bandwidth=$(foxconn_format_bandwidth "$(printf '%s\n' "$pcc_section" | awk -F'nr_band_width:' '/nr_band_width:/ {print $2; exit}' | awk '{print $1}' | xargs)")
        nr_ul_bandwidth="$nr_dl_bandwidth"
        nr_sinr=$(printf '%s\n' "$pcc_section" | awk -F'nr_snr:' '/nr_snr:/ {print $2; exit}' | awk '{print $1}' | xargs)
        nr_sinr=$(process_signal_value "$nr_sinr")
        nr_rsrq=$(printf '%s\n' "$pcc_section" | awk -F'rsrq:' '/rsrq:/ {print $2; exit}' | awk '{print $1}' | xargs)
        nr_rsrq=$(process_signal_value "$nr_rsrq")
        nr_rsrp=$(printf '%s\n' "$pcc_section" | awk -F'rsrp:' '/rsrp:/ {print $2; exit}' | awk '{print $1}' | xargs)
        nr_rsrp=$(process_signal_value "$nr_rsrp")
        nr_rssi=$(printf '%s\n' "$pcc_section" | awk -F'nr_rssi:' '/nr_rssi:/ {print $2; exit}' | awk -F',' '{print $1}' | xargs)
        nr_rssi=$(process_signal_value "$nr_rssi")
        nr_tac=$(printf '%s\n' "$pcc_section" | awk -F'nr_tac:' '/nr_tac:/ {print $2; exit}' | xargs)
        nr_tx_power=$(printf '%s\n' "$pcc_section" | awk -F'nr_tx_pwr:' '/nr_tx_pwr:/ {print $2; exit}' | xargs)

        while IFS= read -r scc_line; do
            [ -n "$scc_line" ] || continue
            ca_count=$((ca_count + 1))
            scc_band_new=$(foxconn_format_band "$(printf '%s\n' "$scc_line" | awk -F'nr_band:' '{print $2}' | awk -F'[, ]' '{print $1}' | xargs)")
            scc_bw_new=$(foxconn_format_bandwidth "$(printf '%s\n' "$scc_line" | awk -F'nr_band_width:' '{print $2}' | awk '{print $1}' | xargs)")
            scc_arfcn_new=$(printf '%s\n' "$scc_line" | awk -F'channel:' '{print $2}' | awk '{print $1}' | xargs)
            scc_pci_new=$(printf '%s\n' "$scc_line" | awk -F'pci:' '{print $2}' | awk '{print $1}' | xargs)
            scc_band=$(foxconn_append_ca_value "$scc_band" "$scc_band_new")
            scc_dl_bandwidth=$(foxconn_append_ca_value "$scc_dl_bandwidth" "$scc_bw_new")
            scc_arfcn=$(foxconn_append_ca_value "$scc_arfcn" "$scc_arfcn_new")
            scc_pci=$(foxconn_append_ca_value "$scc_pci" "$scc_pci_new")
        done <<EOF
$(foxconn_extract_scc_blocks "nr" "$response")
EOF

        nr_display_mode="NR5G-SA Mode"
        [ "$ca_count" -gt 1 ] && nr_display_mode="$nr_display_mode with $ca_count CA"
        add_plain_info_entry "network_mode" "$nr_display_mode" "Network Mode"
        extra_info="NR5G-SA"
        set_5g_cell_info "$nr_mcc" "$nr_mnc" "$nr_tac" "$nr_cell_id" "$nr_arfcn" \
            "$nr_physical_cell_id" "$nr_band" "$nr_ul_bandwidth" "$nr_dl_bandwidth" \
            "$nr_rsrp" "$nr_rsrq" "$nr_sinr" "" "$nr_rxlev"
        add_plain_info_entry "TX Power" "$nr_tx_power" "TX Power"
        if [ "$ca_count" -gt 1 ]; then
            add_ca_info "5G" "$scc_arfcn" "$scc_pci" "$scc_band" "$scc_ul_bandwidth" "$scc_dl_bandwidth"
        fi
        ;;
    esac
}
