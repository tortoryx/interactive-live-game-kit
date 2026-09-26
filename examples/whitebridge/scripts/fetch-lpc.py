"""Fetch a bounded set of original LPC parts. No image generation or remote executable code."""
import concurrent.futures,csv,hashlib,json,struct,urllib.request,subprocess
from pathlib import Path
REV='d44ea7d6904891aab8627b80ff4de1560d63bdff'
BASE=f'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/{REV}/spritesheets/'
OUT=Path('modules/pixel-war/public/lpc');OUT.mkdir(parents=True,exist_ok=True)
ANIMS=['walk','slash','thrust','shoot','hurt']
PARTS={'body':'body/bodies/male','head':'head/heads/human/male','elder':'head/heads/human/male_elderly','pants':'legs/pants/male','boots':'feet/boots/basic/male','leather':'torso/armour/leather/male','plate':'torso/armour/plate/male','mail':'torso/armour/legion/male','robe':'torso/clothes/longsleeve/longsleeve/male','hair':'hair/messy1/adult','helmet':'hat/helmet/armet/adult','hood':'hat/cloth/hood/adult','horns':'head/horns/curled/adult','beard':'beards/beard/basic','shield':'shield/kite/male'}
JOBS=[(k,a,f'{p}/{a}.png') for k,p in PARTS.items() if k!='shield' for a in ANIMS]
JOBS += [('shield',a,f'shield/kite/male/{a}/kite_gray.png') for a in ['walk','slash','thrust']]
for a in ['walk','hurt','slash']:
 p='attack_slash' if a=='slash' else a
 for weapon in ['sword/longsword','blunt/mace']:
  name=weapon.split('/')[-1];key='sword' if name=='longsword' else 'mace'
  JOBS += [(key+'Fg',a,f'weapon/{weapon}/{p}/{name}.png'),(key+'Bg',a,f'weapon/{weapon}/'+(f'{p}/behind' if a=='slash' else f'universal_behind/{p}')+f'/{name}.png')]
for key,base,anims in [('spear','weapon/polearm/spear',['walk','thrust','hurt']),('staff','weapon/magic/crystal',['walk','thrust','hurt']),('bow','weapon/ranged/bow/normal',['walk','shoot','hurt'])]:
 for a in anims:
  ap=(f'universal/{a}' if key=='staff' and a!='thrust' or key=='bow' and a!='walk' else a)
  for z,long in [('Bg','background'),('Fg','foreground')]:JOBS.append((key+z,a,f'{base}/{ap}/{long}.png'))
for a in ['walk','thrust','hurt']:
 for z,long in [('Bg','background'),('Fg','foreground')]:JOBS.append(('staffWood'+z,a,f'weapon/magic/simple/{long}/{a}/simple.png'))
def fetch(job):
 key,a,source=job;file=OUT/f'{key}-{a}.png'
 try:
  data=file.read_bytes() if file.exists() else subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','40',BASE+source])
  if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('not PNG')
  file.write_bytes(data);w,h=struct.unpack('>II',data[16:24]);return key,a,dict(file=f'/lpc/{file.name}',source=source,width=w,height=h,sha256=hashlib.sha256(data).hexdigest())
 except Exception as e:return key,a,dict(error=str(e),source=source)
result={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for k,a,v in pool.map(fetch,JOBS):
  if 'error'in v:errors.append([k,a,v])
  else:result.setdefault(k,{})[a]=v
(OUT/'manifest.json').write_text(json.dumps(dict(revision=REV,parts=result),indent=2))
Path('.runtime/lpc-source').mkdir(parents=True,exist_ok=True)
Path('.runtime/lpc-source/download-errors.json').write_text(json.dumps(errors,indent=2))
print(json.dumps(dict(downloaded=sum(map(len,result.values())),errors=errors),indent=2))
