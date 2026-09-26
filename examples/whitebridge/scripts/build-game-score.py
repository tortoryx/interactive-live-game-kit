"""Make synchronized adaptive mixes from HydroGene's CC0 *loop* master.

This is DSP separation of the composer's stereo recording, not original studio
instrument stems. All masks sum to one: full-intensity reconstructs the source.
The separate intro recording is deliberately never used.
"""
import hashlib, json, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import stft, istft
from scipy.ndimage import median_filter
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/audio-source/hydrogene/jrpg_battle_loop.mp3'
OUT=ROOT/'modules/pixel-war/public/audio/score'
REPORT=ROOT/'output/preview/v42'; REPORT.mkdir(parents=True,exist_ok=True)
RATE=24000
PAGE='https://opengameart.org/content/jrpg-epic-rock-battle-theme-1'
URL='https://opengameart.org/sites/default/files/jrpg_battle_loop.mp3'

def build():
    assert hashlib.sha256(SRC.read_bytes()).hexdigest()=='006be3310cb9a2612384b99d8087035904eaad45f285a4f74170ff7ec6ca7f81', 'source checksum changed'
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(SRC),'-ar',str(RATE),'-ac','2','-f','f32le','-'])
    wave=np.frombuffer(raw,np.float32).reshape(-1,2).copy()
    # Decode MP3 gapless metadata, retain the author's exact loop; no added fade.
    wave*=.84/max(.84,float(np.abs(wave).max()))
    # Remove the MP3 endpoint discontinuity over the final 5 ms, preserving
    # the full bar length. Avoid inserting silence or repeating an intro.
    nedge=round(.005*RATE);ramp=np.linspace(0,1,nedge,dtype=np.float32)
    ramp=ramp*ramp*(3-2*ramp)
    wave[-nedge:]+=(wave[0]-wave[-1])*ramp[:,None]
    tracks={k:np.zeros_like(wave) for k in ['theme','drums','drive']}
    f,t,mono=stft(wave.mean(axis=1),RATE,nperseg=1024,noverlap=768,boundary='zeros')
    masks=None
    for ch in range(2):
        _,_,z=stft(wave[:,ch],RATE,nperseg=1024,noverlap=768,boundary='zeros')
        a=np.abs(mono)
        harmonic=median_filter(a,size=(1,25),mode='nearest')**2
        percussive=median_filter(a,size=(25,1),mode='nearest')**2
        p=percussive/np.maximum(1e-12,harmonic+percussive)
        # Theme includes bass and guitar body. Drive opens the guitar bite and
        # cymbal air. Percussive transients share one stereo-preserving mask.
        bite=(f/1750)**4/(1+(f/1750)**4)
        masks={'drums':p,'drive':(1-p)*bite[:,None],'theme':(1-p)*(1-bite[:,None])}
        for k,mask in masks.items():
            _,x=istft(z*mask,RATE,nperseg=1024,noverlap=768,boundary=True)
            tracks[k][:,ch]=x[:len(wave)]
    error=float(np.max(np.abs(sum(tracks.values())-wave)))
    assert error<2e-6, error
    manifest=json.loads((OUT/'manifest.json').read_text())
    for k in ['bed','pulse','brass','human','demon']:
        manifest['assets'].pop(k,None)
        (OUT/(k+'.ogg')).unlink(missing_ok=True)
    for k,x in tracks.items():
        path=OUT/(k+'.ogg');assert np.isfinite(x).all()
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','-','-c:a','libvorbis','-q:a','5',str(path)],input=x.astype('float32').tobytes(),check=True)
        pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-'])
        decoded=np.frombuffer(pcm,np.float32).reshape(-1,2);sr=RATE
        assert len(decoded)==len(wave)
        manifest['assets'][k]=dict(file='/audio/score/'+path.name,frames=len(decoded),sampleRate=sr,channels=2,duration=len(decoded)/sr,peak=round(float(np.abs(decoded).max()),6),rms=round(float(np.sqrt(np.mean(decoded**2))),6),sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    source=dict(title='JRPG Epic Rock Battle Theme #1',author='HydroGene',license='CC0-1.0',page=PAGE,url=URL,sha256=hashlib.sha256(SRC.read_bytes()).hexdigest(),use='loop-only stereo master; harmonic/percussive and frequency masks; no intro')
    manifest.update(version=2,loopFrames=len(wave),sampleRate=RATE,layers=list(tracks),source=source)
    manifest.pop('bpm',None);manifest.pop('bars',None)
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    (SRC.parent/'source.json').write_text(json.dumps(source,indent=2))
    (SRC.parent/'LICENSE.txt').write_text('JRPG Epic Rock Battle Theme #1 by HydroGene\n'+PAGE+'\nReleased by its author under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\nDerived adaptive mixes by this project. Original stereo master is preserved.\n')
    # A gameplay-level audition: starts in battle, rises to full force at 12 s,
    # settles at 28 s. Never starts with isolated pads or an empty intro.
    n=min(len(wave),40*RATE);time=np.arange(n)/RATE
    level=np.interp(time,[0,10,13,26,30,40],[.7,.7,1,1,.65,.65])
    mixed=(tracks['theme'][:n]*.90+tracks['drums'][:n]*level[:,None]+tracks['drive'][:n]*(level*.95)[:,None])*.72
    sf.write(REPORT/'battle-music.wav',mixed,RATE,subtype='PCM_16')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(REPORT/'battle-music.wav'),'-b:a','160k',str(REPORT/'battle-music.mp3')],check=True)
    evidence=dict(duration=len(wave)/RATE,frames=len(wave),reconstructionMaxError=error,decodedMemoryMiB=sum(x.nbytes for x in tracks.values())/1024**2,firstSecondRMS=float(np.sqrt(np.mean(wave[:RATE]**2))),loopBoundaryDelta=float(np.max(np.abs(wave[-1]-wave[0]))),assets=len(manifest['assets']),source=source)
    (REPORT/'music-build.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence,indent=2))

if __name__=='__main__':build()
