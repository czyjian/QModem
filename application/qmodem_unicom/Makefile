include $(TOPDIR)/rules.mk
include ../../version.mk

PKG_NAME:=qmodem-carrier-service
PKG_VERSION:=$(QMODEM_VERSION)
PKG_RELEASE:=$(QMODEM_RELEASE)
PKG_LICENSE:=GPL-3.0-or-later MIT
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)
PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared

include $(INCLUDE_DIR)/package.mk
include ./npm-deps.mk

define Package/qmodem-carrier-service
  SECTION:=net
  CATEGORY:=Network
  TITLE:=QModem carrier usage query service
  EXTRA_DEPENDS:=node (>=22.23.2)
  DEPENDS:=+qmodem +node +curl +ca-bundle +ca-certificates +luci-base +ucode +ucode-mod-fs
endef

define Package/qmodem-carrier-service/description
  Router-shared China Unicom, China Telecom and China Mobile usage queries with native
  LuCI login. Credentials stay on the router; no first-boot npm install.
endef

define Package/qmodem-carrier-service/conffiles
/etc/qmodem-unicom/
endef

define Build/Prepare
	$(RM) -r $(PKG_BUILD_DIR)/server
	$(INSTALL_DIR) $(PKG_BUILD_DIR)/server
	$(CP) ./server/src $(PKG_BUILD_DIR)/server/
	$(CP) ./server/package.json $(PKG_BUILD_DIR)/server/
	$(call Build/InstallNodeModules)
endef

define Build/Compile
endef

define Package/qmodem-carrier-service/install
	$(INSTALL_DIR) $(1)/usr/share/qmodem-unicom/server $(1)/usr/share/qmodem-unicom/third-party
	$(CP) $(PKG_BUILD_DIR)/server/. $(1)/usr/share/qmodem-unicom/server/
	$(CP) ./third-party/. $(1)/usr/share/qmodem-unicom/third-party/
	$(CP) ./files/. $(1)/
	$(INSTALL_DIR) $(1)/etc/qmodem-unicom
	chmod 700 $(1)/etc/qmodem-unicom
	$(INSTALL_BIN) ./files/etc/init.d/qmodem_unicom $(1)/etc/init.d/qmodem_unicom
	$(INSTALL_BIN) ./files/etc/uci-defaults/91-qmodem-carrier $(1)/etc/uci-defaults/91-qmodem-carrier
endef

$(eval $(call BuildPackage,qmodem-carrier-service))
