"""Finite owner-side asset authoring; no service, microphone or audience input."""
import json, os, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
os.environ['HF_HOME'] = str(ROOT / '.runtime/huggingface')
os.environ['HF_HUB_OFFLINE'] = '1'
import mlx.core as mx
import soundfile as sf
from mlx_audio.tts.utils import load_model
mx.set_memory_limit(6 * 1024**3)
mx.set_cache_limit(512 * 1024**2)
mx.random.seed(19)
model = load_model(str(ROOT / '.runtime/models/qwen3-tts'))
lines = json.loads((ROOT / 'modules/duel-preview/voices.json').read_text())
speakers = [s.lower() for s in model.get_supported_speakers()]
assert all(v['speaker'].lower() in speakers for v in lines.values()), speakers
out = ROOT / 'modules/duel-preview/public/audio'
out.mkdir(exist_ok=True)
manifest_path = out / 'manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
for key,line in lines.items():
    if key in manifest and (out / f'{key}.wav').exists():
        continue
    begin = time.monotonic()
    result = list(model.generate_custom_voice(text=line['text'], speaker=line['speaker'], language='Chinese', instruct=line['emotion']+'。普通话，自然表演，不模仿任何真人。', max_tokens=230, temperature=.8, top_p=.95, verbose=False))
    wave = mx.concatenate([r.audio for r in result]); mx.eval(wave)
    sr = result[0].sample_rate
    sf.write(str(out/f'{key}.wav'), wave, sr, subtype='PCM_16')
    manifest[key] = {'text':line['text'],'speaker':line['speaker'],'engine':'Qwen3-TTS-1.7B-CustomVoice-6bit','duration':wave.size/sr,'seconds':round(time.monotonic()-begin,2)}
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'id':key,**manifest[key]},ensure_ascii=False),flush=True)
    mx.clear_cache()
