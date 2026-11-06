include $(TOPDIR)/rules.mk
include ../../version.mk

LUCI_TITLE:=LuCI QModem traffic monitor and carrier usage
LUCI_DEPENDS:=+luci-app-qmodem-next +qmodem-carrier-service +jq +flock +curl +rpcd-mod-file +rpcd-mod-luci
LUCI_PKGARCH:=all
PKG_VERSION:=$(QMODEM_VERSION)
PKG_RELEASE:=$(QMODEM_RELEASE)
PKG_LICENSE:=GPL-3.0-or-later MIT

define Build/Prepare/luci-app-qmodem-traffic
	chmod 755 $(PKG_BUILD_DIR)/root/etc/init.d/qmodem_traffic
	chmod 755 $(PKG_BUILD_DIR)/root/etc/uci-defaults/92-qmodem-traffic
	chmod 755 $(PKG_BUILD_DIR)/root/usr/libexec/rpcd/qmodem.traffic
endef

include $(TOPDIR)/feeds/luci/luci.mk
