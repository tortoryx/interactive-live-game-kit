"""Fixed offline TTS worker. Stdin is text data, never commands or file paths."""
import os, sys, json, io, base64, time
# Model libraries write progress bars and loading messages to stdout. Reserve
# the original stream for newline-delimited protocol records; otherwise a
# progress line can swallow the ready record and leave a warm worker waiting.
protocol_stdout = sys.stdout
sys.stdout = sys.stderr
def boot_progress(stage):
    print(json.dumps({'type':'warming','stage':stage}),file=protocol_stdout,flush=True)
boot_progress('import_performance')
from performance import character_performance, level_character_wave, synthesis_profile
from role_audio import master_voice
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
os.environ['HF_HOME']=str(ROOT/'.runtime/huggingface')
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
boot_progress('import_mlx')
import mlx.core as mx
boot_progress('import_soundfile')
import soundfile as sf
boot_progress('import_tts')
from mlx_audio.tts.utils import load_model
mx.set_memory_limit(4*1024**3)
mx.set_cache_limit(128*1024**2)
boot_progress('load_model')
reference_mode=os.environ.get('LOCAL_VOICE_REFERENCE')=='1'
profile_dir=ROOT/'.runtime/local-voice-profile'
reference=json.loads((profile_dir/'profile.json').read_text()) if reference_mode else None
model=load_model(str(ROOT/('.runtime/models/qwen3-base' if reference_mode else '.runtime/models/qwen3-tts')))
# The same complete reference utterance anchors every turn. Never roll newly
# generated clips into the reference: synthesis errors must not accumulate.
def generate(text,side,rank,max_tokens):
    speaker,direction=character_performance(side,rank)
    profile=synthesis_profile(side)
    if profile['seed'] is not None: mx.random.seed(profile['seed'])
    if reference_mode:
        if side!='empress': raise ValueError('voice_role_disabled')
        return model.generate(text=text,ref_audio=str(profile_dir/'reference.wav'),ref_text=reference['text'],lang_code='Chinese',max_tokens=max_tokens,temperature=.65,top_p=.9,split_pattern=None,verbose=False)
    return model.generate_custom_voice(text=text,speaker=speaker,language='Chinese',instruct=direction,max_tokens=max_tokens,temperature=profile['temperature'],top_p=profile['top_p'],verbose=False)
# Loading weights does not compile Metal kernels. Finish that work before
# advertising readiness so a viewer's first real sentence has the warm budget.
# This private warm-up clip is discarded and never leaves the worker.
speaker, direction = character_performance('empress', 0)
boot_progress('compile_voice')
profile=synthesis_profile('empress');mx.random.seed(profile['seed'])
for chunk in generate('嗯。','empress',0,16):
    mx.eval(chunk.audio)
mx.clear_cache()
print(json.dumps({'type':'ready','primed':True}),file=protocol_stdout,flush=True)
for raw in sys.stdin:
    r=None
    try:
        r=json.loads(raw)
        if set(r)!={'id','side','text','rank'} or r['side'] not in ['demon','human','empress'] or not isinstance(r['text'],str) or not 1<=len(r['text'])<=260: raise ValueError()
        if any(ord(c)<32 for c in r['text']): raise ValueError()
        speaker, direction = character_performance(r['side'], r['rank'])
        profile = synthesis_profile(r['side'])
        if profile['seed'] is not None: mx.random.seed(profile['seed'])
        began = time.monotonic()
        chunks=list(generate(r['text'],r['side'],r['rank'],min(650,max(160,len(r['text'])*8))))
        if reference_mode: speaker=reference['id']
        wave=mx.concatenate([c.audio for c in chunks]);mx.eval(wave)
        data=io.BytesIO();sf.write(data,master_voice(level_character_wave(wave),chunks[0].sample_rate,r['side']),chunks[0].sample_rate,format='WAV',subtype='PCM_16')
        if data.tell()>2*1024*1024: raise ValueError()
        print(json.dumps({'id':r['id'],'ok':True,'wav':base64.b64encode(data.getvalue()).decode(),'speaker':speaker,'peakBytes':mx.get_peak_memory(),'synthesisMs':round((time.monotonic()-began)*1000)}),file=protocol_stdout,flush=True)
        mx.clear_cache()
    except Exception:
        print(json.dumps({'id':r.get('id') if isinstance(r,dict) else None,'ok':False,'reason':'local_voice_failed'}),file=protocol_stdout,flush=True)
