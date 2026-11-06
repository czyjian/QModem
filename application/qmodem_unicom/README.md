# 路由器上的联通流量查询

基于 [yatotm/unicomvue](https://github.com/yatotm/unicomvue) 的 `35f564667733fb4a1181e347fa095650bb06f457` 版本改造，保留原 MIT 许可证及作者署名。`web/` 为前端源码，`server/` 为后端源码，`files/` 为 OpenWrt 服务及 LuCI 接口。

当前已在 `192.168.88.1` 的 x86_64 ImmortalWrt 上部署。网页通过 `/qmodem-unicom/` 提供，后端由 `/etc/init.d/qmodem_unicom` 管理，使用 `nobody` 用户，仅监听 `127.0.0.1:8788`，已设置开机启动。电脑上的测试服务已停止。

前端请求 `/cgi-bin/luci/admin/modem/unicom_api/`，入口复用 LuCI 的登录 Cookie 路径和访问权限，拒绝跨站请求、非白名单接口及超过 16 KiB 的请求。入口从实际 SIM 信息建立会话关联，覆盖浏览器传入的关联数据。联通凭证不放入进程命令行；转发正文使用立即解除目录链接的临时文件描述符，请求结束即释放。

首次使用需先登录 LuCI，再通过“登录联通”打开的独立登录页完成联通登录和手动验证。真实 Token/Cookie 按模组和 SIM 身份摘要保存到 `/etc/qmodem-unicom/sessions.json`，目录 `700`、文件 `600`，重启后保留；不保存登录密码或短信验证码。其他已登录 LuCI 的浏览器可直接查询，浏览器只获得共享引用，不获得真实凭证。旧浏览器会话可验证后迁移。联通会话过期需重新登录。

LuCI 主页面仅显示原生紧凑表格，列出各流量包及合计的剩余量和总量，不再内嵌完整网页。保留“在新窗口打开查询页面”按钮查看详情。后台余量请求共用 30 秒缓存，并合并并发请求。

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

前端修改后重新构建并部署，不要部署开发服务器。后端依赖锁在 `server/package-lock.json`。目前采用文件部署，尚未制作独立 APK 安装包。

## 验证与恢复

```sh
cd /usr/share/qmodem-unicom/server
node --test test/*.test.js
/etc/init.d/qmodem_unicom status
curl http://127.0.0.1:8788/healthz
```

`tests/bridge.sh` 应在路由器上运行，创建且自动销毁 60 秒的专用测试会话，验证会话权限、来源、路径、请求方法和请求类型；不会发送验证码或登录真实账号。真实联通会话已保存时，可设置 `REQUIRE_SHARED_SESSION=1`，验证独立 LuCI 会话在不提交任何联通凭证的情况下仍能查询。

路由器 `/root/qmodem-unicom-router-20261106/` 保留了迁移前的 `traffic-query.js`、`qmodem-next.css` 和 `overview.js`。恢复前端时可从这些文件还原；关闭本服务执行 `/etc/init.d/qmodem_unicom disable` 及 `/etc/init.d/qmodem_unicom stop`。
