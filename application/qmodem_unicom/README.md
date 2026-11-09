# QModem 运营商查询服务

本服务由独立插件 `luci-app-qmodem-traffic` 自动依赖，使用 Node.js 完成联通和电信登录、授权及流量查询。固件运行不需要 Python、pip、requests 或 cryptodome。

## 安装与启动

完整固件编译及支持范围见 [插件说明](../../luci/luci-app-qmodem-traffic/README.md)。运行依赖为 qmodem、Node.js >=22.23.2、curl、CA 证书、luci-base、ucode 和 ucode-mod-fs。50 个锁定的纯 JavaScript 依赖通过 OpenWrt Download 下载、校验后安装；无需在路由器首次开机运行 npm install。构建目录会在 Prepare 时清理，防止从旧构建带入解释器 worker。

`files/etc/uci-defaults/91-qmodem-carrier` 启用查询服务，`/etc/init.d/qmodem_unicom` 以 nobody 用户运行在 127.0.0.1:8788。LuCI 的鉴权代理检查来源、请求格式和真实 SIM 上下文，再转发请求；不对局域网暴露裸后端接口。

```
/etc/init.d/qmodem_unicom status
curl -fsS http://127.0.0.1:8788/healthz
```

`www` 是 `web` 源码构建的联通详情页面，哈希记录在 `web-assets.json`；修改 web 后需要重新构建并同步发布资源与清单。日常查询使用 LuCI 原生界面，详情按钮可手动打开详情页。

## 电信纯 Node.js 实现

- `server/src/upstream/telecom-node.js`：短信预检、手动滑块验证、发送短信、短信授权 DeviceId、RSA PKCS#1 v1.5 服务密码登录。
- `server/src/upstream/telecom-node-query.js`：固定官方 HTTPS 端点、压缩与大小限制、超时、基础用量和独立流量包查询。使用 Node 内置 https、zlib、crypto，无子进程或解释器。
- `third-party/TELECOM-SOURCES.md`：协议来源、固定上游版本及 MIT 许可。测试向量从原版代码在模拟网络环境下生成，只含固定的合成测试数据。

请求参数保持已验证协议，包括分钟时间戳、固定设备身份、DeviceId 的 androidId 编码、省市代码及两个不同的查询操作码。部分兼容请求头保留历史 User-Agent 字符串，该字符串不表示调用解释器。严格验证 HTTPS 证书、不跟随重定向，不在日志输出凭证、短信或原始响应。

授权预检可能返回要求安全验证的非成功业务码，仍继续获取官方滑块，与原版流程一致；网络错误不继续。只有用户手动完成验证才发送短信。授权状态保存在后端内存、按实际 SIM 绑定、10 分钟过期；每次挑战只发一次短信，验证码最多尝试 5 次。

服务密码不保存。共享查询会话仅保存 Token、手机号和查询所需省市代码，位于 `SESSION_STORE + .telecom`；联通仍使用 `SESSION_STORE`。文件权限 0600，目录 0700。其他已登录 LuCI 的浏览器以及服务重启后可复用；登出清除，查询鉴权失败不自动重新提交密码。临时授权状态不持久化。

合计优先使用 qryImportantData 的显式 total/used/balance（KB），分包使用 userFluxPackage 的独立 productInfos。单位按 1024 换算，不把未知、不限量当成零；分包接口失败时保留合计结果。没有明确的签约速率/QCI 字段时不推断、不显示。

## 联通与自动校准

联通继续使用原生登录弹框、手动官方安全验证、发送之后的短信监听及共享会话。电信短信来源通过内容“中国电信”和“验证码”等关键词识别，兼容不同地区的 106 号段，排除旧 ID、早于发送时间、不完整及已发送短信；提供复制按钮，不自动提交。

流量插件后台每日校准按 SIM 运营商选择对应共享会话。账期需为每月 1 日 00:00；登录失效、换卡、样本过期、总量未知或不限量时跳过。校准已用量及阈值，保留手动校准和实测历史，统一采用 1024 进制。

## 验证

```
cd application/qmodem_unicom/server
node --test test/*.test.js
```

从仓库根目录运行 `python3 luci/luci-app-qmodem-traffic/tests/check_package.py` 只做开发机上的打包静态检查，不安装到固件，也不引入 Python 运行依赖。界面及短信测试位于该插件 tests 目录。

纯 Node 查询已与原版在同一真实会话上对照一致，并在无法查找到解释器命令的 PATH 下重复成功；2026-11-06 已由用户手动完成纯 Node.js 的全新滑块验证、短信授权 DeviceId、服务密码登录及分包查询，全链路成功；总量及余量 120.60 GB，分包为 57.60 GB、60 GB、3 GB。安装目录不含 Python worker，并在 PATH=/nonexistent 下通过全部 108 项后端测试。完整 SDK 编译及刷机首启验证不能由本地单元检查替代。

## 中国移动接入（2026-11-09）

移动使用纯 Node.js 实现（无新增 npm/Python 依赖）：官方图片验证码 → 手动识别 → 短信随机码 → RSA 登录 → 官方 SSO 跳转。已对照当日官方 login_qr_fun.js 核对发码参数，图片从官方 captchazh.htm 取得，验证使用 verifyCaptcha.htm，随后 loadToken.action 和 sendRandomCodeAction.action；不进行 OCR 或自动识别。

登录页对应 native LuCI 组件 mobile-login.js；短信监控复用现有组件，新增 mobile 分支，按 10086/中国移动及验证码/随机码关键词识别本次收到的短信。识别移动 SIM 后，主页面“登录”“刷新”“登出”和详情按钮使用移动链路。登录成功关闭弹框并更新主表格。

Cookie 按 domain/path/到期时间隔离，SSO 仅允许 HTTPS 的 login.10086.cn、shop.10086.cn、wx.10086.cn，不跟随任意跳转。正式会话保存到 SESSION_STORE + .mobile，权限 0600，目录 0700，按真实 SIM 绑定；不保存短信验证码、图片验证码或密码。临时验证 10 分钟过期、单次发码、最多 5 次登录尝试，关闭清理。

查询优先使用官方网上营业厅的 GET /i/v1/fee/planbal/<加密号码>，基于官网 public commonutil 的双 Base64/AES-CBC 解包。只读取 type=1 的有效套餐资源和 resCode=04 的移动数据流量，排除语音、WLAN、失效套餐及套餐外收费记录。未知单位或资源限制不当作零；合计包含定向、校园、结转等流量包，显示范围说明。网上营业厅单位 03=KB、04=MB、05=GB，与微信网厅不同，分开解析，统一输出 MB，再按 1024 进制显示。

网上营业厅不可用时再尝试 wx 的 getNewMarginInfo。403/412 或维护公告保留会话，不自动发码。两条链路均明确鉴权失效时才清除登录，避免把某个站点维护误判为账号退出。请求总预算 22 秒，固定官方 HTTPS 域名，并限制响应大小。

2026-11-09 实测：补齐官网 loadSendflag.htm 初始化和 chkNumberAction.action 号码检查后，用户完成图片与短信登录；保存的 SSO 会话可查询网上营业厅余量，服务重启与独立 LuCI 会话查询均成功。微信站点当时返回系统升级公告，网上营业厅正常。该账号返回 7 个流量包，合计总量 275119 MB、已用 36345 MB、剩余 238774 MB（约 268.67 / 35.49 / 233.18 GB）。后台自动校准已加入移动归属运营商和 /mobile/usage 路由；继续校验当前 SIM、号码、账期、采样和总量，定向/校园等资源范围会在查询页说明。

发送成功或失败都保留官方图片及用户输入，只有手动刷新图片或关闭弹框才清除。SMS_1/SMS_3 按官网提示冷却至少 60 秒后允许人工重试，服务端同样检查冷却；确认已发送后禁止重复发送。网络不确定等错误不自动重试。

协议来源与 MIT 许可见 third-party/MOBILE-SOURCES.md 和 cn-carrier-monitor-LICENSE。未使用第三方登录代理。
