#!/bin/sh
# Run with the installed updater or a staged copy; no real network requests.
set -eu
UPDATER=${1:-/usr/libexec/rpcd/qmodem.update}
fixture=$(mktemp)
trap 'rm -f "$fixture"' EXIT
sed -n '/^legacy_package_version()/,/^remote_component()/p' "$UPDATER" | sed '$d' >"$fixture"
. "$fixture"
scenario=normal
curl() {
 for argument do url=$argument; done
 case "$url" in
  */version.mk) printf '%s\n' 'QMODEM_VERSION:=3.4.0_rc3' 'QMODEM_RELEASE:=$(QMODEM_AUTORELEASE)';;
  *page=1)
   if [ "$scenario" = fail ]; then return 1; fi
   if [ "$scenario" = bump ]; then printf '%s\n' '[{"commit":{"message":"fix"}},{"commit":{"message":"qmodem: Bump to 3.4"}}]'
   else jq -cn '[range(0;100)|{commit:{message:"change"}}]'; fi;;
  *page=2)
   if [ "$scenario" = exact ]; then echo '[]'; else echo '[{"commit":{"message":"change"}},{"commit":{"message":"change"}}]'; fi;;
  *) return 1;;
 esac
}
[ "$(legacy_package_version czyjian/QModem deadbeef)" = 3.4.0_rc3-r102 ]
scenario=bump
[ "$(legacy_package_version czyjian/QModem deadbeef)" = 3.4.0_rc3-r2 ]
scenario=exact
[ "$(legacy_package_version czyjian/QModem deadbeef)" = 3.4.0_rc3-r100 ]
scenario=fail
if legacy_package_version czyjian/QModem deadbeef >/dev/null; then echo 'network failure misclassified' >&2; exit 1; fi
[ "$(compare_package_versions 3.4.0_rc3-r278 3.4.0_rc3-r279)" = ahead ]
[ "$(compare_package_versions 3.4.0_rc3-r278 3.4.0_rc3-r278)" = identical ]
[ "$(compare_package_versions 3.4.0_rc3-r279 3.4.0_rc3-r278)" = behind ]
printf '%s\n' 'Update fallback pagination, bump, failure and version comparisons passed'
