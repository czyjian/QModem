include $(TOPDIR)/rules.mk

PKG_NAME:=qmodem-rm500u-ndppd
PKG_VERSION:=0.2.6
PKG_RELEASE:=1
PKG_SOURCE:=ndppd-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/DanielAdolfsson/ndppd/tar.gz/$(PKG_VERSION)?
PKG_HASH:=969d438462e0c65a8c9060d8d263c5c47ba8145fb9aaa663864bbad11ad7eb7a
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/qmodem-rm500u-ndppd
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Private NDP proxy for QModem RM500U-CN
  DEPENDS:=@IPV6 +libstdcpp
endef

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	tar -xzf $(DL_DIR)/$(PKG_SOURCE) -C $(PKG_BUILD_DIR) --strip-components=1
	$(Build/Patch)
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR) \
		CXX="$(TARGET_CXX)" \
		CXXFLAGS="$(TARGET_CXXFLAGS) -std=c++0x -fno-rtti" \
		LDFLAGS="$(TARGET_LDFLAGS)" LIBS="-lc" ndppd
endef

define Package/qmodem-rm500u-ndppd/install
	$(INSTALL_DIR) $(1)/usr/share/qmodem
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/ndppd $(1)/usr/share/qmodem/rm500u-ndppd
endef

$(eval $(call BuildPackage,qmodem-rm500u-ndppd))
