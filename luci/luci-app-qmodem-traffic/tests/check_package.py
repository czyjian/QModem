"""Checks package ownership, runtime closure, immutable npm sources and boot files."""
from pathlib import Path
import hashlib, json, re
root=Path(__file__).resolve().parents[3]
plugin=root/"luci/luci-app-qmodem-traffic"
base=root/"luci/luci-app-qmodem-next"
runtime=root/"application/qmodem_unicom"
load=lambda p:json.loads(p.read_text(encoding="utf-8-sig"))
menu=load(plugin/"root/usr/share/luci/menu.d/luci-app-qmodem-traffic.json")
assert "admin/modem/qmodem/traffic" in menu
assert "admin/modem/qmodem/traffic" not in load(base/"root/usr/share/luci/menu.d/luci-app-qmodem-next.json")
assert not (base/"htdocs/luci-static/resources/view/qmodem/traffic.js").exists()
overview=(base/"htdocs/luci-static/resources/view/qmodem/overview.js").read_text(encoding="utf-8-sig")
assert "require qmodem.traffic as traffic" not in overview
assert "if(!traffic)" in overview
assert "+luci-app-qmodem-next" in (plugin/"Makefile").read_text()
assert "+qmodem-carrier-service" in (plugin/"Makefile").read_text()
make=(runtime/"Makefile").read_text()
for dependency in ("node","curl","ca-bundle","ca-certificates","python3","python3-requests","python3-cryptodome","python3-certifi","luci-base","ucode","ucode-mod-fs"):
    assert "+"+dependency in make,dependency
assert ">=22.23.2" in make
lock=load(runtime/"server/package-lock.json")
sources=(runtime/"npm-deps.mk").read_text()
packages=[p for p in lock["packages"] if p]
assert sources.count("define Download/npm-")==len(packages)
assert len(re.findall(r"HASH:=[0-9a-f]{64}",sources))==len(packages)
for name,value in lock["packages"].items():
    if not name:continue
    assert not value.get("hasInstallScript"),name
    assert "$(PKG_BUILD_DIR)/server/"+name in sources,name
    folder,filename=value["resolved"].rsplit("/",1)
    assert "URL:="+folder in sources and "URL_FILE:="+filename in sources,name
for filename,digest in load(runtime/"web-assets.json").items():
    assert hashlib.sha256((runtime/"www"/filename).read_bytes()).hexdigest()==digest,filename
for folder in (plugin/"root",runtime/"files"):
    for p in folder.rglob("*"):
        if p.is_file():
            raw=p.read_bytes()
            assert not raw.startswith(b"\xef\xbb\xbf"),p
            assert b"\r\n" not in raw,p
for filename in ("etc/init.d/qmodem_traffic","usr/libexec/rpcd/qmodem.traffic","etc/uci-defaults/92-qmodem-traffic"):
    assert "chmod 755 $(PKG_BUILD_DIR)/root/"+filename in (plugin/"Makefile").read_text(),filename
assert "enable" in (runtime/"files/etc/uci-defaults/91-qmodem-carrier").read_text()
assert "enable" in (plugin/"root/etc/uci-defaults/92-qmodem-traffic").read_text()
acl=load(plugin/"root/usr/share/rpcd/acl.d/luci-app-qmodem-traffic.json")["luci-app-qmodem-traffic"]
assert "info" in acl["read"]["ubus"]["system"]
assert "sync" in acl["write"]["ubus"]["qmodem.sms"]
assert "correct_bytes" not in str(acl)
print("PASS: independent package ownership, declared runtime, 50 pinned npm dependencies, web hashes, POSIX text, boot permissions and least-privilege ACL")
