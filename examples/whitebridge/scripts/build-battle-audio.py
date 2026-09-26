"""Reproducible sampled score and layered combat Foley. No runtime synthesis.

Run with .runtime/voice-venv/bin/python after fetch-audio-sources.py.
Instrument recordings: VSCO 2 CE (CC0); impact/Foley: Kenney (CC0).
Foley, stingers, envelopes and mastering are locally arranged. The old score
is replaced by build-game-score.py at the end; do not ship the legacy loop.
"""
import json, hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt, fftconvolve
from functools import lru_cache
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/audio-source'; OUT=ROOT/'modules/pixel-war/public/audio/score'
OUT.mkdir(parents=True,exist_ok=True)
RATE=32000; BPM=120; BEAT=60/BPM; BARS=16; LOOP=BARS*4*BEAT; N=round(LOOP*RATE)
rng=np.random.default_rng(4107); manifest={}

def read(path):
    x,sr=sf.read(path,always_2d=True,dtype='float32')
    if x.shape[1]>2:x=x[:,:2]
    if x.shape[1]==1:x=np.repeat(x,2,axis=1)
    if sr!=RATE:
        from math import gcd
        g=gcd(sr,RATE);x=resample_poly(x,RATE//g,sr//g,axis=0)
    return x

@lru_cache(None)
def sample(key):
    x=read(SRC/'vsco'/f'{key}.wav')
    # Preserve the attacks and stereo image, trim recording lead-in only.
    env=np.max(np.abs(x),axis=1);hits=np.where(env>max(.002,env.max()*.025))[0]
    if len(hits):x=x[max(0,hits[0]-int(.008*RATE)):]
    return x/max(.06,np.max(np.abs(x)))*.65

def pitch(x,semitones):
    ratio=2**(semitones/12);p=np.arange(0,len(x)-1,ratio)
    return np.column_stack([np.interp(p,np.arange(len(x)),x[:,ch]) for ch in range(2)]).astype('float32')

def taper(x,attack=.008,release=.12):
    x=x.copy();a=min(len(x)//2,int(attack*RATE));r=min(len(x)//2,int(release*RATE))
    if a:x[:a]*=np.linspace(0,1,a)[:,None]
    if r:x[-r:]*=np.linspace(1,0,r)[:,None]
    return x

def reverb(x,wet=.17):
    y=x.copy()
    # Distributed early reflections and filtered late tail; not a rhythmic echo.
    for delay,gain in [(.031,.44),(.047,.35),(.071,.28),(.103,.22),(.149,.18),(.211,.13),(.293,.10),(.401,.075),(.557,.05)]:
        n=int(delay*RATE)
        if n<len(x):y[n:]+=x[:-n,::-1]*(gain*wet)
    return y

def save(name,x,loop=False):
    x=sosfilt(butter(2,32,'highpass',fs=RATE,output='sos'),x,axis=0)
    if loop:
        # Fold tails into the loop's beginning, retaining the exact common grid.
        if len(x)>N:x[:len(x)-N]+=x[N:]
        x=x[:N]
    peak=float(np.max(np.abs(x)));x*=min(1,.88/max(peak,.001))
    file=OUT/(name+'.ogg');sf.write(file,x,RATE,format='OGG',subtype='VORBIS')
    decoded=read(file)
    manifest[name]=dict(file='/audio/score/'+file.name,frames=len(decoded),sampleRate=RATE,channels=2,
                        duration=len(decoded)/RATE,peak=round(float(np.max(np.abs(decoded))),5),
                        rms=round(float(np.sqrt(np.mean(decoded**2))),5),sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    return x

# VSCO octave labels use C3 = middle C (MIDI 60), verified by sustained F0.
ROOT_NOTES={'violin':62,'spiccato':62,'cello':50,'cello_short':60,'horn':60,'horn_short':60,'trumpet':74}
@lru_cache(maxsize=160)
def note(key,midi,duration):
    x=pitch(sample(key),midi-ROOT_NOTES[key]);length=int(duration*RATE)
    # All held notes fit the source; sustain excess with a short smooth crossfade.
    if len(x)<length:
        fill=x[int(len(x)*.25):int(len(x)*.8)]
        while len(x)<length:
            blend=min(int(.06*RATE),len(fill)//3);tail=x[-blend:];head=fill[:blend]
            cross=np.linspace(0,1,blend)[:,None];x=np.concatenate([x[:-blend],tail*(1-cross)+head*cross,fill[blend:]])
    return taper(x[:length],.025 if key in ['horn','trumpet','violin','cello'] else .003,.13 if duration>.5 else .045)

def add(track,x,seconds,gain=1,pan=0):
    at=int(seconds*RATE);end=min(len(track),at+len(x));length=end-at
    if length<=0:return
    track[at:end]+=x[:length]*gain*np.array([1-max(0,pan)*.45,1+min(0,pan)*.45])

def orchestra():
    tracks={k:np.zeros((N+RATE*2,2),np.float32) for k in ['bed','pulse','drums','brass','human','demon']}
    roots=[50,50,46,46,53,53,48,45,50,50,43,43,46,48,45,45]
    motif=[(0,0,1),(1.5,7,.5),(2,12,1),(3,10,.85)]
    for bar,root in enumerate(roots):
        at=bar*2;third=4 if bar in [2,3,4,5,6,7,12,13,14,15] else 3
        for interval,g in [(0,.16),(7,.10),(12+third,.07)]:
            add(tracks['bed'],note('cello' if interval==0 else 'violin',root+interval,2.15),at,g, -.25 if interval else .15)
        # Humanized articulations: eighth notes build motion without changing BPM.
        pattern=[0,7,12,7,third+12,7,12,7] if bar%2==0 else [0,12,7,12,third+12,12,7,12]
        for i,interval in enumerate(pattern):
            t=at+i*.25+(0 if i==0 else float(rng.uniform(-.006,.006)))
            add(tracks['pulse'],note('spiccato',root+12+interval,.24),t,.135 if i%2==0 else .105,-.35)
            if i%2==0:add(tracks['pulse'],note('cello_short',root,.36),t,.16,.3)
        for beat in [0,2]:add(tracks['drums'],sample('bass_drum'),at+beat*.5,.32 if beat==0 else .22)
        for beat in [1,3]:
            add(tracks['drums'],sample('snare'),at+beat*.5,.13,-.16)
            if bar%4==3:
                for off in [.25,.375]:add(tracks['drums'],sample('snare'),at+beat*.5+off,.055,-.16)
        if bar%2==0:add(tracks['drums'],sample('timpani'),at+.75,.14,.25)
        if bar%4==0:add(tracks['brass'],sample('cymbal'),at,.075)
        for offset,interval,length in motif:
            m=root+12+interval
            add(tracks['brass'],note('horn',m,length),at+offset*.5,.16,.2)
        # Both faction accents share the same harmony and clock.
        for i in range(16):
            interval=[0,7,12,third+12][i%4]
            add(tracks['human'],note('spiccato',root+24+interval,.15),at+i*.125,.055,-.25)
        for offset,interval,length in [(0,12,.8),(2,19,.8)]:
            add(tracks['human'],note('trumpet',root+interval,length),at+offset*.5,.115,.12)
        for beat in [0,1.5,2.5,3]:
            add(tracks['demon'],note('horn_short',root+7,.38),at+beat*.5,.20,-.15)
            add(tracks['demon'],pitch(sample('bass_drum'),-4),at+beat*.5,.12)
        if bar%4==3:
            for beat in [3,3.5,3.75]:add(tracks['human'],sample('snare'),at+beat*.5,.12)
            add(tracks['demon'],sample('cymbal'),at+1.5,.09)
    rendered={k:save(k,reverb(v*3.2,.24 if k=='bed' else .18),True) for k,v in tracks.items()}
    # Listening proof: four eight-second phrases, adding instruments each time.
    for side in ['human','demon']:
        mix=rendered['bed'].copy()
        for start,key in [(8,'pulse'),(16,'drums'),(16,'brass'),(24,side)]:
            env=np.clip((np.arange(N)/RATE-start)/1.1,0,1)[:,None];mix+=rendered[key]*env
        sf.write(ROOT/f'output/preview/v41/{side}-music-build.wav',taper(mix*.74,.03,.8),RATE)
    for name,notes in [('victory',[62,66,69,74]),('defeat',[62,60,58,57]),('arrival',[50,57,62,69])]:
        x=np.zeros((RATE*3,2),np.float32)
        for i,midi in enumerate(notes):add(x,note('horn' if name!='victory' else 'trumpet',midi,.9),i*.34,.3)
        add(x,sample('bass_drum'),0,.28);save(name,reverb(taper(x),.3))

def foley(name,pack='impact'):
    return read(SRC/f'kenney-{pack}'/'Audio'/(name+'.ogg'))

def shaped_noise(seconds,low,high,decay):
    n=int(seconds*RATE);x=rng.normal(0,.5,(n,2));x=sosfilt(butter(2,[low,high],'bandpass',fs=RATE,output='sos'),x,axis=0)
    x*=np.exp(-np.arange(n)/RATE/decay)[:,None];return taper(x,.002,.1)

def effects():
    for variant in range(3):
        metal=foley(f'impactMetal_heavy_00{variant}');wood=foley(f'impactWood_heavy_00{variant}')
        stone=foley(f'impactGeneric_heavy_00{variant}') if (SRC/'kenney-impact/Audio'/f'impactGeneric_heavy_00{variant}.ogg').exists() else wood
        swish=foley('knifeSlice' if variant==0 else 'knifeSlice2','rpg')
        def fx(name,layers,duration=1.7,room=.12):
            x=np.zeros((int(duration*RATE),2),np.float32)
            for clip,t,g in layers:add(x,clip,t,g)
            save(name+'-'+str(variant),reverb(taper(x,.002,.12),room))
        fx('swing',[(swish,0,.65),(shaped_noise(.25,350,7000,.06),.015,.16)],.45)
        fx('steel',[(metal,0,.8),(wood,.015,.25)],1.1)
        fx('critical',[(metal,0,.9),(pitch(metal,-4),.025,.40),(sample('bass_drum'),.01,.30)],1.6)
        fx('thunder',[(shaped_noise(.14,900,13000,.024),0,.9),(shaped_noise(2.1,70,1600,.65),.025,.65),(pitch(metal,-7),.08,.4)],2.5,.3)
        fx('stampede',[(pitch(sample('bass_drum'),-3),0,.35)]+[(foley('footstep0'+str((i+variant)%9),'rpg'),i*.16,.65-i*.025) for i in range(15)],3.2,.2)
        fx('arrow',[(pitch(swish,5),0,.42),(foley('cloth1','rpg'),0,.18)],.48)
        fx('arrow-hit',[(wood,0,.55),(metal,.025,.12)],.65)
        # Close crack + mechanical transient + pressure body + debris/tail.
        crack=shaped_noise(.16,500,13000,.022);body=shaped_noise(.7,45,650,.17)
        fx('rifle',[(crack,0,1.05),(metal,0,.17),(body,.012,.50)],1)
        fx('shotgun',[(crack,0,1.1),(pitch(crack,-3),.014,.7),(body,.01,.8),(metal,.04,.2)],1.3)
        fx('cannon',[(pitch(sample('bass_drum'),-5),0,.75),(crack,0,.9),(shaped_noise(1.7,40,2100,.42),.02,.8),(stone,.10,.3)],2.2,.25)
        fx('explosion',[(crack,0,.65),(body,0,.9),(pitch(stone,-5),.03,.7),(shaped_noise(2.3,45,3200,.48),.045,.9),(metal,.12,.18)],2.8,.25)
        fx('meteor',[(shaped_noise(.5,140,3000,.3)[::-1],0,.38),(pitch(sample('bass_drum'),-7),.28,.8),(crack,.28,.8),(shaped_noise(2.8,35,1800,.8),.3,1),(stone,.42,.5)],3.5,.27)
        fx('quake',[(pitch(sample('bass_drum'),-7),0,.5),(shaped_noise(3,30,700,.95),0,1),(pitch(stone,-5),.12,.8),(pitch(stone,-7),.51,.55),(wood,.9,.45)],3.4,.16)
        fx('flame',[(shaped_noise(1.4,180,8000,.42),0,.6),(pitch(wood,3),.1,.35)],1.7)
        fx('crush',[(pitch(stone,-6),0,.8),(pitch(sample('bass_drum'),-3),.01,.6),(body,.05,.4)],1.6)
        fx('march',[(foley('footstep0'+str(variant),'rpg'),0,.6),(foley('cloth1','rpg'),.01,.2)],.6)
        fx('crown',[(foley('handleCoins','rpg'),0,.55),(metal,.03,.25)],1.5)
    for name,notes in [('heal',[74,77,81]),('shield',[62,69,74]),('summon',[50,57,62])]:
        x=np.zeros((RATE*2,2),np.float32)
        for i,midi in enumerate(notes):add(x,note('horn' if name=='summon' else 'spiccato',midi,.65),i*.12,.35)
        add(x,foley('handleCoins','rpg'),.015,.10);save(name,reverb(taper(x),.3))

if __name__=='__main__':
    orchestra();effects()
    (OUT/'manifest.json').write_text(json.dumps(dict(version=1,bpm=BPM,bars=BARS,loopFrames=N,sampleRate=RATE,assets=manifest),indent=2))
    import runpy
    runpy.run_path(str(ROOT/'scripts/build-game-score.py'),run_name='__main__')
