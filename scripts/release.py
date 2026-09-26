#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Allowlisted export. Never bundles runtime state, history, or local credentials."""
import hashlib,json,os,re,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
MANIFEST=ROOT/'release-files.json'
ROOT_FILES={'README.md','README.zh-CN.md','LICENSE','SECURITY.md','CONTRIBUTING.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','.gitignore','.gitattributes','.env.example'}
DIRECTORIES={'examples','scripts','tests','docs','licenses','.github'}
EXTENSIONS={'.mjs','.js','.py','.html','.css','.json','.md','.csv','.png','.ogg','.wav','.svg','.yml','.yaml'}
EXCLUDED={'.env','.local','.runtime','node_modules','output','dist','.git','__pycache__','.playwright-cli','browser-profile','browser-profiles'}
def allowed(p):
 r=p.relative_to(ROOT)
 return not any(x in EXCLUDED for x in r.parts) and not any('/'+x+'/' in '/'+str(r)+'/' for x in ['empress/custom','empress/vendor']) and (str(r) in ROOT_FILES or r.parts[0] in DIRECTORIES and (p.suffix in EXTENSIONS or p.name.endswith('LICENSE')))
def read_list():
 rows=json.loads(MANIFEST.read_text())['files']
 for r in rows:
  p=ROOT/r
  linked=any(q.is_symlink() for q in [p,*p.parents] if q!=ROOT and ROOT in q.parents)
  if Path(r).is_absolute() or '..' in Path(r).parts or ROOT not in p.resolve().parents or not allowed(p) or linked or not p.is_file():raise ValueError('Unsafe/missing export entry: '+r)
 return rows
def tracked_files():
 """Inspect this checkout, never an unrelated ancestor repository."""
 if not (ROOT/'.git').exists():return []
 top=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','--show-toplevel'],text=True).strip()
 if Path(top).resolve()!=ROOT.resolve():raise ValueError('Unexpected Git root')
 raw=subprocess.check_output(['git','-C',str(ROOT),'ls-files','-z','--cached'])
 return sorted(set(os.fsdecode(r) for r in raw.split(b'\0') if r))
def check(rows):
 failures=[]
 scan_rows=sorted(set(rows)|set(tracked_files())|{'release-files.json'})
 # Keep private lookup values outside the checkout and release archive.
 denyfile=os.environ.get('PRIVACY_DENYLIST_FILE')
 denied=[]
 if denyfile:
  path=Path(denyfile).resolve()
  if path==ROOT.resolve() or ROOT.resolve() in path.parents:raise ValueError('Privacy denylist must be outside the repository')
  denied=[line.encode('utf-8').lower() for line in path.read_text().splitlines() if line.strip()]
 # Patterns report the file and category, not the secret itself.
 patterns={
  'personal filesystem path':rb'(?:/Users/|/home/)[A-Za-z0-9_.-]+/',
  'private key':rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
  'provider secret':rb'\b(?:sk-proj-|sk-|ghp_|gho_|github_pat_)[A-Za-z0-9_-]{20,}',
  'specific live room URL':rb'live\.bilibili\.com/[0-9]{5,}',
  'browser cookie export':rb'(?i)(?:SESSDATA|bili_jct|session-token)\s*[=:]\s*["\x27]?[A-Za-z0-9%._-]{16,}',
 }
 for r in scan_rows:
  p=ROOT/r
  if Path(r).is_absolute() or '..' in Path(r).parts or ROOT.resolve() not in p.resolve().parents:
   failures.append((r,'unsafe path'));continue
  if any(q.is_symlink() for q in [p,*p.parents] if q!=ROOT and ROOT in q.parents):failures.append((r,'symlink'));continue
  if r!='release-files.json' and not allowed(p):failures.append((r,'runtime or unsupported tracked file'));continue
  if not p.is_file():failures.append((r,'missing tracked file'));continue
  b=p.read_bytes()
  if any(value in b.lower() for value in denied):failures.append((r,'private identity match'))
  for label,pattern in patterns.items():
   if re.search(pattern,b):failures.append((r,label))
 if failures:
  for r,label in failures:print('REJECT:',r,'—',label)
  raise SystemExit(1)
 print('Privacy pattern scan passed for',len(scan_rows),'release and tracked files. Git history and media content require separate review.')
 return rows
def main():
 mode=sys.argv[1] if len(sys.argv)>1 else 'check'
 if mode=='manifest':
  rows=sorted(str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and allowed(p))
  check(rows);MANIFEST.write_text(json.dumps({'format':1,'files':rows},ensure_ascii=False,indent=2)+'\n');return
 rows=check(read_list())
 if mode=='check':return
 if mode!='build':raise ValueError('Expected manifest, check, or build')
 out=ROOT/'dist';out.mkdir(exist_ok=True);meta=json.loads((ROOT/'package.json').read_text());name=meta['name'];version=meta['version'];target=out/(name+'-'+version+'.zip')
 checks={r:hashlib.sha256((ROOT/r).read_bytes()).hexdigest() for r in rows}
 with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for r in rows+['release-files.json']:
   info=zipfile.ZipInfo(name+'/'+r,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,(ROOT/r).read_bytes())
  info=zipfile.ZipInfo(name+'/SHA256SUMS.json',date_time=(2026,1,1,0,0,0));info.external_attr=0o100644<<16;z.writestr(info,json.dumps(checks,indent=2)+'\n')
 digest=hashlib.sha256(target.read_bytes()).hexdigest();(out/(target.name+'.sha256')).write_text(digest+'  '+target.name+'\n');print('Built',target.name,'—',target.stat().st_size,'bytes');print('SHA256',digest)
if __name__=='__main__':main()
