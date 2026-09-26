"""Layered impact accents, locally synthesized, reusable CC0 source recipe."""
import numpy as np, subprocess,json,hashlib
from pathlib import Path
from scipy.signal import butter,sosfilt
out=Path(__file__).resolve().parents[1]/'modules/pixel-war/public/audio/score';rate=32000;rng=np.random.default_rng(982)
for i in range(3):
 n=round(rate*1.5);t=np.arange(n)/rate
 low=np.sin(2*np.pi*np.cumsum(42+88*np.exp(-t*20))/rate)*np.exp(-t*5)*.42
 noise=rng.normal(0,1,n);crack=sosfilt(butter(2,[250,3800],fs=rate,btype='bandpass',output='sos'),noise)*np.exp(-t*26)*.3
 grit=sosfilt(butter(2,[70,1200],fs=rate,btype='bandpass',output='sos'),noise)*np.exp(-t*5)*.19
 x=np.tanh((low+crack+grit)*1.4)*.7;x[:100]*=np.linspace(0,1,100);x[-400:]*=np.linspace(1,0,400)
 stereo=np.column_stack([x,np.roll(x,7+i*3)]).astype('float32');path=out/f'impact-body-{i}.ogg'
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(rate),'-ac','2','-i','-','-c:a','libvorbis','-q:a','5',str(path)],input=stereo.tobytes(),check=True)
print('Built three bounded low impact / crack / debris accents')
