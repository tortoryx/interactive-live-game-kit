"""Bounded offline authoring of approved battle lines; exits after the manifest."""
import json, os, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
os.environ['HF_HOME'] = str(ROOT / '.runtime/huggingface')
os.environ['HF_HUB_OFFLINE'] = '1'
import mlx.core as mx
import soundfile as sf
from mlx_audio.tts.utils import load_model
mx.set_memory_limit(6 * 1024**3)
mx.set_cache_limit(256 * 1024**2)
mx.random.seed(43)
model = load_model(str(ROOT / '.runtime/models/qwen3-tts'))
lines = json.loads((ROOT / 'modules/duel-preview/battle-lines.json').read_text())
out = ROOT / 'modules/pixel-war/public/audio'
manifest_path = out / 'battle-manifest.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
for key,line in lines.items():
    if manifest.get(key, {}).get('text') == line['text'] and (out / f'{key}.wav').exists():
        continue
    started = time.monotonic()
    chunks = list(model.generate_custom_voice(text=line['text'], speaker=line['speaker'], language='Chinese', instruct=line['emotion']+'。普通话，不模仿任何真人。', max_tokens=160, temperature=.75, top_p=.9, verbose=False))
    wave = mx.concatenate([r.audio for r in chunks]); mx.eval(wave)
    sr = chunks[0].sample_rate
    sf.write(str(out/f'{key}.wav'), wave, sr, subtype='PCM_16')
    manifest[key] = {'text':line['text'],'speaker':line['speaker'],'engine':'Qwen3-TTS-CustomVoice-6bit','duration':wave.size/sr,'renderSeconds':round(time.monotonic()-started,2)}
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'key':key,**manifest[key]},ensure_ascii=False),flush=True)
    mx.clear_cache()
