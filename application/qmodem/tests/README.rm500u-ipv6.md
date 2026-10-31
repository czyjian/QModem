# RM500U-CN 扩展前缀回归检查

适用条件为 `name=rm500u-cn`、`manufacturer=quectel`、`platform=unisoc`、IPv6/双栈拨号，并启用 `extend_prefix=1`。网卡桥接模式不启用此修复。

- 专用 `qmodem_rm500u6` 协议复用系统 DHCPv6 配置项，只替换自身客户端的回调；不修改系统 DHCPv6 文件。
- 回调限制 RA 地址的有效期上限为 7200 秒，保留零值撤销、前缀、附加字段和真实 DHCPv6-PD 数据；非目标型号或关闭扩展前缀时原样转交系统回调。
- 私有 NDP 代理只监听该模组的上联网卡，代理当前扩展 /64 到 LAN；不使用 NAT6，不修改 LAN 的 RA/DHCP 配置。前缀改变时重建代理，取消勾选、停止拨号或切换型号时退出。
- 原有“RA 主设备”已启用时不重复启动 NDP 代理。
- 私有 `qmodem-rm500u-ndppd` 包不安装全局 ndppd 服务或配置。
- 同一个 USB 插槽换回 RW350R-GL 时恢复标准 `dhcpv6` 协议，其余配置不由此修复改写。

离线验证：

```sh
sh application/qmodem/tests/test_rm500u_ipv6.sh
sh application/qmodem/tests/test_rm500u_ipv6_watch.sh
bash application/qmodem/tests/test_ipv6_sourcefilter.sh
sh application/qmodem/tests/test_network_service.sh
```

实机验证应覆盖 LAN 终端访问 IPv6、前缀更新、拨号重启、开关切换。不要仅用 LAN 的 `::1` 判断回程：该地址可能与模组 PDP 地址重合。若临时向路由器添加测试 IPv6 地址，应在代理启动前添加，或等待 ndppd 的本机地址缓存刷新（默认 30 秒）；测试后移除地址。
