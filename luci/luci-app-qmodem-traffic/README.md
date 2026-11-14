# QModem 流量插件

独立包为 `luci-app-qmodem-traffic`，依赖 `luci-app-qmodem-next`。菜单仍位于“模组管理 → 流量监控”，包含流量记录、历史图表、手动/自动校准和运营商流量查询。只安装 QModem Next 时不安装本插件的页面、采样服务和查询后端。

## 编译和首次启动

将完整 QModem 仓库作为 feed 加入 OpenWrt，更新并安装 feeds 后，在 LuCI → Applications 选中 `luci-app-qmodem-traffic`。编入固件时选 y，不要只选 m。依赖由包定义自动选择，无需在刷机后运行 npm、pip 或复制额外脚本。

支持前提：目标 feeds 必须提供 Node.js >=22.23.2 和 ucode 版 LuCI。当前实际运行环境为 x86_64 ImmortalWrt 25.12-SNAPSHOT；未验证旧版 23.05、MIPS 或不提供上述运行时的目标。不把不支持的目标声明为可用。

插件依赖 qmodem-carrier-service：包含路由器查询服务、锁定版本的 50 个纯 JavaScript 依赖、纯 Node.js 电信客户端和 HTTPS CA。npm 包走 OpenWrt Download 机制，每个 tarball 有 SHA-256；生成时已与 package-lock 的 SHA-512 核对。首启不下载依赖。三家运营商使用 LuCI 原生登录与流量表格，不安装独立联通面板。联通新窗口按钮打开官方网上营业厅。

首次开机的 uci-defaults 自动启用 qmodem_unicom 和 qmodem_traffic；运行时通过 procd 管理。已有固件安装后，可检查：

```sh
/etc/init.d/qmodem_unicom status
/etc/init.d/qmodem_traffic status
curl -fsS http://127.0.0.1:8788/healthz
ubus list qmodem.traffic
```

首次运营商登录仍需用户操作短信/安全验证；没有预置账号。运营商会话仅在路由器保存，文件权限 0600，目录 0700。正常 sysupgrade 保留流量历史和登录目录；恢复出厂或不保留配置会清除。真实硬件整固件构建和刷机首启尚未在本次环境执行。

## 运营商查询

按当前 SIM 的归属运营商选择登录方式，电信使用 DeviceId 短信授权后服务密码登录，联通使用原生短信登录。没有单独的临时测试按钮。登录成功关闭弹框，在主页面显示套餐总量、剩余量和分包信息。签约速率/QCI 只有查到有效值时显示。

电信短信监听使用短信内容“中国电信”及“验证码”识别，兼容 106598731 等不同地区号段；同时过滤点击发送前的短信 ID、早于发送时间的短信、发送记录及不完整长短信。时间采用路由器 PDU 对应的本地时标，每 3 秒轮询，最多 5 分钟；提供复制按钮，不自动提交验证码。

校准按 1024 进制，电信与联通各自使用对应共享会话。总量未知、不限量、登录失效、换卡、采样过期或本地账期不匹配时跳过，保留手动校准。

## 验证

```sh
python3 luci/luci-app-qmodem-traffic/tests/check_package.py
node luci/luci-app-qmodem-traffic/tests/test_traffic.js
node luci/luci-app-qmodem-traffic/tests/test_traffic_units.js
node luci/luci-app-qmodem-traffic/tests/test_traffic_query.js
node luci/luci-app-qmodem-traffic/tests/test_carrier_login.js
node luci/luci-app-qmodem-traffic/tests/test_telecom_login.js
node luci/luci-app-qmodem-traffic/tests/test_telecom_sms.js
sh luci/luci-app-qmodem-traffic/tests/test_traffic.sh
sh luci/luci-app-qmodem-traffic/tests/test_traffic_carriers.sh
sh luci/luci-app-qmodem-traffic/tests/test_traffic_calibration.sh
sh luci/luci-app-qmodem-traffic/tests/test_carrier_calibration.sh
sh luci/luci-app-qmodem-traffic/tests/test_sim_change_calibration.sh
sh luci/luci-app-qmodem-traffic/tests/test_sim_traffic.sh
```

shell 检查需 Linux/OpenWrt 和 jq，只使用临时目录。查询服务的后端测试位于 application/qmodem_unicom/server/test；固件运行不再需要 Python。本次完成安装配方的隔离落盘、从安装目录运行后端检查、短信/界面回归和流量校准测试；完整 SDK/刷机验证不能由这些检查替代。

移动已验证短信登录、SSO 与官方网上营业厅套餐余量查询。优先使用 shop.10086.cn 的只读套餐余量接口，微信网厅作为回退；两套接口的单位代码分别处理。服务重启和独立 LuCI 会话可复用登录，移动自动校准已加入相同的 SIM/账期校验。定向、校园和结转等流量包均列出并说明合计范围；查询不到签约速率/QCI 时不显示。没有新增 Python 或 npm 依赖。

流量监控显示当前 SIM 运营商、本周期已用量及剩余量。剩余量按阈值减去校准后的已用量计算，最低为零；未设阈值时显示未设置。本周期累计流量按实测上传与下载合计，并持久保存电信、联通、移动各自用量，账期切换后重新累计；不包含校准偏移。运营商来自 QModem 的 SIM 信息缓存，不额外发送 AT 指令。升级前未分类的历史流量及切卡交界处无法确定归属的流量显示为未归属，不追溯猜测运营商。

“换卡时自动校准”默认开启，可独立勾选保存，关闭后不因换卡自动校准，手动校准与每日定时设置不受影响。后台每 15 秒检测 SIM 身份，首次启用及换卡后各触发一次校准。SIM 指纹与待处理状态持久保存，服务或路由器重启不重复触发；未就绪、采样暂停、任务占用或未登录时等待，登录后继续。正常情况下校准成功即结束；查询失败保留任务，间隔至少一分钟、每次登录最多尝试三次，重新登录后恢复尝试。等待期间只轮询路由器本地登录状态。旧版本已消耗的失败换卡任务会自动恢复。校准继续校验 SIM 身份、账号、账期和数据有效性。流量监控页对当前卡未登录或会话过期显示登录入口；查询故障不误报为未登录。

本周期已用量仅显示总量，不展示本地实测下载、上传作为运营商分项。目前三家运营商查询接口的适配均未提供经过确认的下载、上传分项。本地仍按当前 SIM 指纹分别记录实测流量，同运营商的不同卡分别累计，换回原卡继续其记录。旧版本未保存每张卡的下载、上传，升级时不猜测归属，从升级后的采样开始分类；切卡交界处无法可靠归属的增量仍保留在跨卡累计量中。运营商校准提供总用量，不推算历史下载、上传比例。
