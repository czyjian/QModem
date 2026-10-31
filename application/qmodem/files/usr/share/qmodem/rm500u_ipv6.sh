#!/bin/sh
# These helpers never change UCI or global network settings.
rm500u_matches() {
    case "$1" in ''|*[!A-Za-z0-9_]*) return 1;; esac
    [ "$(uci -q get "qmodem.$1.name")" = rm500u-cn ] &&
    [ "$(uci -q get "qmodem.$1.manufacturer")" = quectel ] &&
    [ "$(uci -q get "qmodem.$1.platform")" = unisoc ]
}

rm500u_needs_proxy() {
    rm500u_matches "$1" || return 1
    [ "$(uci -q get "qmodem.$1.extend_prefix")" = 1 ] || return 1
    [ "$(uci -q get "qmodem.$1.en_bridge")" != 1 ] || return 1
    [ "$(uci -q get "qmodem.$1.ra_master")" != 1 ] || return 1
    case "$(uci -q get "qmodem.$1.pdp_type")" in
        ipv6|ipv4v6|IPV6|IPV4V6) return 0;;
        *) return 1;;
    esac
}

rm500u_normalize_ra() {
    awk '{ for (i=1;i<=NF;i++) {
        n=split($i,a,",");
        if (n>=3 && a[2] ~ /^[0-9]+$/ && a[3] ~ /^[0-9]+$/) {
            if (a[3]+0>7200) a[3]=7200;
            if (a[2]+0>a[3]+0) a[2]=a[3];
            s=a[1]; for (j=2;j<=n;j++) s=s "," a[j];
            printf "%s%s",sep,s;
        } else printf "%s%s",sep,$i;
        sep=" ";
    }} END { if (sep!="") print "" }'
}
