# China Mobile protocol sources

Node implementation: server/src/upstream/mobile.js.

- https://github.com/yahooor/cn-carrier-monitor
  - Commit: 941ce8049df597249449369949baa583c60226e2
  - Files: api/mobile.py, const.py, api/crypto.py under custom_components/cn_carrier_monitor
  - MIT license: cn-carrier-monitor-LICENSE
  - Used for RSA public key, web SSO flow, wx AES decoding and flow-unit mapping.
- Official public login page and scripts retrieved 2026-11-09:
  - https://login.10086.cn/login.html
  - https://login.10086.cn/platform/js/login_qr_fun.js
  - Used to confirm captchazh.htm, verifyCaptcha.htm, loadToken.action,
    sendRandomCodeAction.action parameter names and login.htm.

All captcha recognition and SMS entry are performed manually by the user.
No third-party proxy receives login credentials. Python and curl_cffi are not
used. The wx query site's HTTP 403 is classified as blocked access, without
clearing a valid SSO session or resending messages automatically.

2026-11-09 additional official read-only source (working with the saved SSO session):
- https://shop.10086.cn/i/service/model/remain_f01f40b.js
- https://shop.10086.cn/i/apps/serviceapps/remain/js/pack_remain_1cc1975.js
- https://shop.10086.cn/i/pkg/requirepkg_254c111.js (commonutil)

These identify GET /i/v1/fee/planbal/<encrypted phone>, the double-base64
AES-CBC envelope, and shop unit codes 03=KB, 04=MB, 05=GB. Only plan-balance
reads are used; no business changes, purchases or subscriptions are requested.
