# Copyright (C) 2024 Tom <fjrcn@outlook.com>
# This is free software, licensed under the GNU General Public License v3.

include $(TOPDIR)/rules.mk

# Include unified version
include ../../version.mk

LUCI_TITLE:=LuCI Modern UI for QModem
LUCI_DESCRIPTION:=LuCI modern (JavaScript) interface for QModem.
LUCI_DEPENDS:=+qmodem +qmodem-smsd +sms-forwarder-next +luci-base +luci-proto-ipv6
LUCI_PKGARCH:=all
LUCI_MAINTAINER:=Tom <fjrcn@outlook.com>

PKG_VERSION:=$(QMODEM_VERSION)
PKG_RELEASE:=$(QMODEM_RELEASE)
PKG_LICENSE:=GPLv3
PKG_PROVIDES:=qmodem-luci-ui

# Match the translation's build mode to the main package without a dependency cycle.
define Package/luci-app-qmodem-next/config
  config PACKAGE_luci-i18n-qmodem-next-zh-cn
    default PACKAGE_luci-app-qmodem-next
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
