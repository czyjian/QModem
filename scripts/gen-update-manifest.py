#!/usr/bin/env python3
"""Write provenance and hashes for an installed QModem package staging tree."""
import argparse, hashlib, json, pathlib, subprocess
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('component');p.add_argument('version');a=p.parse_args()
root=pathlib.Path(a.root).resolve(); repo=pathlib.Path(__file__).resolve().parents[1]
def git(*args):
    try:return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL,text=True).strip()
    except (OSError,subprocess.CalledProcessError):return ''
files={}
for base in ('usr/share/qmodem','usr/libexec/rpcd'):
    for f in sorted((root/base).rglob('*')) if (root/base).exists() else []:
        if f.is_file() and not f.is_symlink() and 'versions' not in f.relative_to(root).parts and f.suffix not in ('.conf',):
            files['/'+f.relative_to(root).as_posix()]=hashlib.sha256(f.read_bytes()).hexdigest()
out=root/'usr/share/qmodem/versions'/f'{a.component}.json';out.parent.mkdir(parents=True,exist_ok=True)
value={'schema':1,'component':a.component,'version':a.version,'repository':'czyjian/QModem','revision':git('rev-parse','HEAD'),'modified':bool(git('status','--porcelain','--untracked-files=all','--','application','luci','version.mk','scripts/gen-update-manifest.py')),'files':files}
out.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
