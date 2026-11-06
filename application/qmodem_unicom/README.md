# 固件集成

请优先按 [流量插件说明](../../luci/luci-app-qmodem-traffic/README.md) 编译独立插件和全部运行时依赖。

# 路由器上的联通流量查询

基于 [yatotm/unicomvue](https://github.com/yatotm/unicomvue) 的 `35f564667733fb4a1181e347fa095650bb06f457` 版本改造，保留原 MIT 许可证及作者署名。`web/` 为前端源码，`server/` 为后端源码，`files/` 为 OpenWrt 服务及 LuCI 接口。

当前已在 `192.168.88.1` 的 x86_64 ImmortalWrt 上部署。网页通过 `/qmodem-unicom/` 提供，后端由 `/etc/init.d/qmodem_unicom` 管理，使用 `nobody` 用户，仅监听 `127.0.0.1:8788`，已设置开机启动。电脑上的测试服务已停止。

前端请求 `/cgi-bin/luci/admin/modem/unicom_api/`，入口复用 LuCI 的登录 Cookie 路径和访问权限，拒绝跨站请求、非白名单接口及超过 16 KiB 的请求。入口从实际 SIM 信息建立会话关联，覆盖浏览器传入的关联数据。联通凭证不放入进程命令行；转发正文使用立即解除目录链接的临时文件描述符，请求结束即释放。

首次使用需先登录 LuCI，再通过“登录”打开 LuCI 原生弹框，使用短信验证码或 App 密码登录。需要官方手动验证时，最上层原生弹框显示官方验证页面，完成或取消后恢复原登录表单。真实 Token/Cookie 按模组和 SIM 身份摘要保存到 `/etc/qmodem-unicom/sessions.json`，目录 `700`、文件 `600`，重启后保留；不保存登录密码或短信验证码。其他已登录 LuCI 的浏览器可直接查询，浏览器只获得共享引用，不获得真实凭证。旧浏览器会话可验证后迁移。联通会话过期需重新登录。

原生登录组件为 `luci/luci-app-qmodem-traffic/htdocs/luci-static/resources/qmodem/carrier-login.js`。点击发送验证码后，记录所选 SIM 的既有短信基线和 `system.info.localtime` 秒级时间；仅显示本次操作后新出现、符合运营商来源和时间范围的完整收到短信。短信接口的 PDU 时间按本地日历字段编码，使用相同时间口径比较，避免与 Unix 时间的时区差异。默认每 3 秒读取，最多监听 5 分钟。提供复制验证码或复制短信按钮，由用户粘贴、提交。切换 SIM、关闭弹框或登录成功会清理监听与临时短信显示；不会自动填写验证码或发送登录请求。

LuCI 主页面仅显示原生紧凑表格，列出各流量包及合计的剩余量和总量，并显示签约速率及 QCI；推断的 QCI 保留“（推断）”标记。签约速率不是实时测速。补充网络信息查询失败时仍保留可用的余量数据。表格下方左侧提供登出共享会话按钮，右侧显示更新时间。保留“在新窗口打开”按钮查看详情。后台余量和网络信息请求共用 30 秒缓存，并合并并发请求。

网页路由采用 hash，适用于 uhttpd 静态文件托管；移除导致路由切换停留在旧内容的过渡包装，并以路由名标识内容组件。用量明细、已订业务、设置均已在真实登录会话中逐项验证。

## 构建与部署

前端在开发电脑构建：

```powershell
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
```

将 `web/dist/` 的内容安装到路由器 `/www/qmodem-unicom/`，将 `server/` 安装到 `/usr/share/qmodem-unicom/server/`，将 `files/` 按目录覆盖安装；保留可执行权限。

路由器运行时依赖 `node`、`curl`、`luci-base`。首次安装另需 `node-npm` 下载锁定的纯 JavaScript 依赖：

```sh
apk add node node-npm curl
cd /usr/share/qmodem-unicom/server
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
/etc/init.d/qmodem_unicom enable
/etc/init.d/qmodem_unicom restart
```

前端修改后重新构建并部署，不要部署开发服务器。后端依赖锁在 `server/package-lock.json`。现提供 qmodem-carrier-service 包，由 luci-app-qmodem-traffic 自动依赖。编入固件后不需要首启在线安装 npm 依赖，以下手工流程仅供开发调试。

## 验证与恢复

```sh
cd /usr/share/qmodem-unicom/server
node --test test/*.test.js
/etc/init.d/qmodem_unicom status
curl http://127.0.0.1:8788/healthz
```

`tests/bridge.sh` 应在路由器上运行，创建且自动销毁 60 秒的专用测试会话，验证会话权限、来源、路径、请求方法和请求类型；不会发送验证码或登录真实账号。真实联通会话已保存时，可设置 `REQUIRE_SHARED_SESSION=1`，验证独立 LuCI 会话在不提交任何联通凭证的情况下仍能查询。

前端测试：`node luci/luci-app-qmodem-traffic/tests/test_carrier_login.js`，覆盖短信基线及时间筛选、官方验证消息的来源和窗口校验、取消恢复表单、换卡拦截及清理；`test_traffic_query.js` 覆盖主列表与切卡请求竞态。真实短信发送及验证应由用户手动操作。

路由器 `/root/qmodem-unicom-router-20261106/` 保留了迁移前的 `traffic-query.js`、`qmodem-next.css` 和 `overview.js`。恢复前端时可从这些文件还原；关闭本服务执行 `/etc/init.d/qmodem_unicom disable` 及 `/etc/init.d/qmodem_unicom stop`。


## 流量监控自动校准

流量监控页底部可启用每日自动校准并设置路由器本地执行时间，默认关闭、03:00。`qmodem_traffic` 的独立 procd 实例运行 `traffic_calibration.sh`，无需保持浏览器打开，不阻塞流量采样。每张卡每天在设定分钟最多尝试一次，错过则等待下一天；结果保存在流量数据目录的 `<section>.autocalibration.json`。

校准使用当前 SIM 对应的共享查询会话，将本月已用量作为本地周期基线，同时将套餐总量设为流量阈值。接口 MB 按 1,048,576 字节换算，阈值另存精确字节，LuCI 的流量记录、图表、阈值和手动校准输入统一按 1024 进制显示（1 GB = 1,073,741,824 字节）；底层继续保存字节，旧调用未传 unit_base 时保留原兼容行为。手动保存流量设置会采用所填 GB 阈值；下次自动校准再按套餐总量更新。原始采样和历史记录保留。

本地账期必须为每月 1 日 00:00；登录失效、SIM 变更、采样过期、总量未知或包含不限量流量包时跳过。`calibration_status` 只读检查当前可用状态；`calibration_configure` 保存开关与时间。“立即校准”调用 `calibration_run`，即使每日自动开关关闭也可使用；它刷新查询结果后复用账期、登录与 SIM 校验，同时校准已用量和阈值，并保留当天定时执行标记。

精确字节写入接口 `correct_bytes` 不对 LuCI ACL 开放，仅供路由器后台调用。

隔离验证：`sh luci/luci-app-qmodem-traffic/tests/test_traffic_calibration.sh` 和 `sh luci/luci-app-qmodem-traffic/tests/test_traffic.sh`，只写临时目录，不修改真实统计、阈值或登录信息。



## 电信流量查询

替换此前电信短信与官网导入试验，直接调用 hlhk2017/ChinaTelecomMonitor-Homeassistant-Integration 的 Python Telecom 类，固定 commit a01ab8b85e95ab5a3c42672bd4c4b04d1a9ea134。原文件位于 server/python/vendor，未改动，MIT 许可见 third-party/hlhk-LICENSE。

路由器另需安装：apk add python3 python3-requests python3-cryptodome python3-certifi。部署 server/python 整个目录。无需 Home Assistant。外层 worker 强制证书校验、禁止重定向并限制超时；不允许原版 SSL 异常分支关闭证书校验。请求凭证通过 stdin 传给独立进程，日志不转发到浏览器。

LuCI 临时弹框使用手机号、6 位服务密码及可选的短信授权 DeviceId。DeviceId 必须来自真实短信授权，不能随机生成；3006 提示需要核对授权。不会调用第三方授权网站。密码不保存；查询所需 Token、手机号和省市代码按当前 SIM 保存到 SESSION_STORE + .telecom，会话文件权限 0600、目录 0700。关闭弹框只清除 10 分钟授权和 15 分钟测试会话，正式查询会话保留，供其他已登录 LuCI 的浏览器及服务重启后复用；登出时清除。不自动重登，不参与自动校准。原版查询 qryImportantData 的 KB 按 1024 转 MB，缺失字段报错，不当作零。

用户已验证短信授权 DeviceId 后，原版服务密码登录和 qryImportantData 查询成功（总流量和剩余流量均为 120.60 GB）。持续复用及扩展套餐字段另行实测，不以单次成功推断长期有效。单元检查：cd server/python && python3 test_worker.py。

设备授权补充：弹框内“短信授权 DeviceId”使用 margrop/telecom-phone-device-id-tools 固定版本（详见 vendor/SOURCE.md）的原版 Python 协议，仅用于手动滑块、发送短信和绑定 DeviceId，不使用其查询实现。每步状态由 Node 后端保存，worker 通过 stdin/stdout 传递，不向前端暴露随机密钥；10 分钟过期、发送一次、最多 5 次验证码尝试，并按 SIM 隔离。授权成功后自动填入 DeviceId，用户再以服务密码调用 hlhk 原版登录及 qryImportantData。所有真实验证和短信均由用户手工操作。

运营商识别为 telecom 时，主页面“登录”打开上述引导，“刷新”和“登出”使用电信共享会话，详细信息打开电信官网；联通保持原入口。查询优先使用 qryImportantData 的 totalAmount；分包明细使用上游 to_summary 对 flowList 的单位解析，缺失时仅展示总量与余量。签约速率尚无已验证字段，不依据套餐名或网络制式推断。诊断 inspect 仅返回字段路径和类型，不返回原始响应或账号凭证；扩展接口失败不会删除已可用的基础查询会话。查询失败不重新提交密码；X201 等鉴权失败提示重新登录。

2026-11-06 实测：独立的短期 LuCI 测试会话无运营商凭证可查询；查询服务重启后从磁盘加载同一 Token 查询成功，浏览器刷新、重新打开弹框也能直接读取。多次实时查询返回合计 120.60 GB，以及上月结转 57.60 GB、套餐内 60 GB、附加包 3 GB。分包来自原版 userFluxPackage 的 productOFFRatable.ratableResourcePackages[].productInfos，单位按 1024 解析，使用显式总量，不用显示四舍五入后的分包之和覆盖精确汇总。基础查询与套餐查询并行，套餐接口失败时保留基础合计。已核对两个接口字段，未发现明确签约速率或 QCI；暂不推断。长期 Token 有效期尚未经过跨日验证。
