"""Fetch only the CC0 instrument recordings used by the reproducible score."""
import hashlib, json, urllib.parse, subprocess, zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/audio-source/vsco'; OUT.mkdir(parents=True,exist_ok=True)
REV='440300901dfe9275fd84e0b7763af1f8443ae62e'
SAMPLES={
 'violin':'Strings/Violin Section/susVib/VlnEns_susVib_D3_v1.wav',
 'spiccato':'Strings/Violin Section/Spic/VlnEns_Spic_D3_v2_rr1.wav',
 'cello':'Strings/Cello Section/susvib/susvib_D2_v1_1.wav',
 'cello_short':'Strings/Cello Section/spic/spic_C3_v2_RR1.wav',
 'horn':'Brass/F Horn/sus/MOHorn_sus_C3_v3_1.wav',
 'horn_short':'Brass/F Horn/stac/MOHorn_stac_C3_v2_rr1.wav',
 'trumpet':'Brass/Trumpet/sus/Sum_SHTrumpet_sus_D4_v1_rr1.wav',
 'timpani':'Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav',
 'bass_drum':'VSCO 1 Percussion/drums/bass/bdrum_ff_1.wav',
 'snare':'VSCO 1 Percussion/drums/snare/drum3_marching/snare3_f_1.wav',
 'cymbal':'VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_ff_tight.wav',
}
def get(item):
 key,path=item; url='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+REV+'/'+urllib.parse.quote(path)
 target=OUT/(key+'.wav')
 if not target.exists():
  pending=target.with_suffix('.download');subprocess.run(['curl','-fsSL','--retry','2',url,'-o',str(pending)],check=True)
  if pending.read_bytes()[:4]!=b'RIFF':raise ValueError('invalid WAV source')
  pending.replace(target)
 return dict(key=key,path=path,url=url,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size,license='CC0-1.0')
if __name__=='__main__':
 packs=[('impact','https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip','029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'),('rpg','https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip','6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b')]
 for name,url,sha in packs:
  archive=OUT.parent/('kenney-'+name+'.zip')
  if not archive.exists():subprocess.run(['curl','-fsSL','--retry','2',url,'-o',str(archive)],check=True)
  if hashlib.sha256(archive.read_bytes()).hexdigest()!=sha:raise ValueError('source archive checksum mismatch')
  with zipfile.ZipFile(archive) as z:
   if any(Path(p).is_absolute() or '..' in Path(p).parts for p in z.namelist()):raise ValueError('archive path escape')
   z.extractall(OUT.parent/('kenney-'+name))
 with ThreadPoolExecutor(max_workers=3) as pool: rows=list(pool.map(get,SAMPLES.items()))
 (OUT/'sources.json').write_text(json.dumps(rows,indent=2))
 subprocess.run(['curl','-fsSL','https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+REV+'/LICENSE','-o',str(OUT/'LICENSE')],check=True)
 score=OUT.parent/'hydrogene';score.mkdir(exist_ok=True)
 loop=score/'jrpg_battle_loop.mp3'
 if not loop.exists():subprocess.run(['curl','-fsSL','--retry','2','https://opengameart.org/sites/default/files/jrpg_battle_loop.mp3','-o',str(loop)],check=True)
 if hashlib.sha256(loop.read_bytes()).hexdigest()!='006be3310cb9a2612384b99d8087035904eaad45f285a4f74170ff7ec6ca7f81':raise ValueError('battle music checksum mismatch')
 print('Downloaded',len(rows),'selected recordings and HydroGene loop')
