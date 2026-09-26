"""Lightweight voice direction/mastering; never inserts or changes dialogue."""
import numpy as np
from scipy.signal import butter, sosfilt, lfilter

def role_profile(side, rank, text):
    # Age is capped: the hundredth elder must remain intelligible and brisk.
    age=min(1,max(0,rank)/8)
    force=any(c in text for c in '!！')
    return dict(speaker=58 if side=='demon' else 60,
                speed=(1.04 if side=='demon' else 1.10)-age*.025+(0.035 if force else 0),
                side=side, revision=2)

def master_voice(samples, rate, side):
    x=np.asarray(samples,dtype=np.float64)
    if not len(x):return x.astype(np.float32)
    if side=='empress':
        # Preserve the speaker's within-phrase loudness and consonant attacks.
        # A single gain for the whole passage prevents the old 25 ms envelope
        # compressor from flattening conversational emphasis. No added room,
        # presence boost, gating, stretching, or pitch processing.
        if not np.isfinite(x).all():raise ValueError('invalid character audio')
        x=sosfilt(butter(2,65,'highpass',fs=rate,output='sos'),x)
        peak=float(np.max(np.abs(x)))
        rms=float(np.sqrt(np.mean(x*x)))
        if rms<1e-5:return np.zeros_like(x,dtype=np.float32)
        x*=min(2.5,.12/rms,.88/max(peak,1e-9))
        fade=min(int(rate*.004),len(x)//2)
        if fade:
            x[:fade]*=np.linspace(0,1,fade);x[-fade:]*=np.linspace(1,0,fade)
        return x.astype(np.float32)
    x=sosfilt(butter(2,75 if side=='demon' else 95,'highpass',fs=rate,output='sos'),x)
    body=sosfilt(butter(2,330,'lowpass',fs=rate,output='sos'),x)
    presence=sosfilt(butter(2,[1400,4200],'bandpass',fs=rate,output='sos'),x)
    # Close, dry demon; clear projected human. No pitch-shift caricature.
    x=x+body*(.30 if side=='demon' else 0 if side=='empress' else .08)+presence*(.08 if side=='demon' else .06 if side=='empress' else .24)
    envelope=np.sqrt(lfilter([1-np.exp(-1/(rate*.025))],[1,-np.exp(-1/(rate*.025))],x*x)+1e-9)
    target=np.minimum(1,(.13/np.maximum(envelope,.001))**.42)
    x*=target
    if side=='demon':x=np.tanh(x*1.12)/1.12
    peak=max(.001,float(np.max(np.abs(x))))
    rms=max(.001,float(np.sqrt(np.mean(x*x))))
    x*=min(.88/peak,.145/rms,3)
    # Very short room reflections establish projection without echoing words.
    wet=np.zeros_like(x)
    reflections=[] if side=='empress' else [(.019,.035),(.033,.022)] if side=='demon' else [(.027,.045),(.043,.027)]
    for delay,level in reflections:
        n=int(delay*rate)
        if n<len(x):wet[n:]+=x[:-n]*level
    x+=wet
    x*=min(1,.91/max(.001,float(np.max(np.abs(x)))))
    fade=min(int(rate*.006),len(x)//2)
    x[:fade]*=np.linspace(0,1,fade);x[-fade:]*=np.linspace(1,0,fade)
    return x.astype(np.float32)
