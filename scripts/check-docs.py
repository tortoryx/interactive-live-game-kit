#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check locale coverage and local documentation links, not translation quality."""
import json,re,sys
from pathlib import Path
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parent.parent
manifest=json.loads((ROOT/'docs/languages.json').read_text())
failures=[];pages=set()
for code,locale in manifest['languages'].items():
 required=[locale['readme'],locale['exampleReadme']]+['docs/'+code+'/'+name for name in manifest['requiredGuides']]
 for name in required:
  p=ROOT/name
  if not p.is_file() or len(p.read_text(encoding='utf-8').strip())<150:
   if locale['status']=='complete':failures.append(name+': incomplete or missing')
   continue
  pages.add(p)
 for other in manifest['languages']:
  if other!=code and locale['status']=='complete':
   for name in manifest['requiredGuides']:
    p=ROOT/'docs'/code/name
    if p.exists() and '../'+other+'/'+name not in p.read_text(encoding='utf-8'):failures.append(str(p.relative_to(ROOT))+': missing language switch')
pages.update(ROOT.glob('*.md'));pages.add(ROOT/'docs/LANGUAGES.md')
for p in sorted(pages):
 text=p.read_text(encoding='utf-8')
 for raw in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text):
  target=raw.split(' "',1)[0].strip('<>')
  if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target) or target.startswith('#'):continue
  target=unquote(target.split('#',1)[0].split('?',1)[0]);resolved=(p.parent/target).resolve()
  if ROOT not in resolved.parents and resolved!=ROOT or not resolved.exists():failures.append(str(p.relative_to(ROOT))+': broken or external file link '+target)
if failures:
 for failure in failures:print('FAIL',failure)
 sys.exit(1)
print('Documentation passed:',len(manifest['requiredGuides']),'matched guides per complete locale;',len(pages),'pages checked. Translation quality and runtime localization are separate.')
