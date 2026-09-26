"""Offline, CPU-only role voices. Input is bounded text, never code or paths."""
import base64
import io
import json
import resource
import sys
from pathlib import Path

import sherpa_onnx
import soundfile as sf
from role_audio import role_profile, master_voice

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / '.runtime/models/kokoro-int8-multi-lang-v1_1'
config = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=str(MODEL / 'model.int8.onnx'),
            voices=str(MODEL / 'voices.bin'),
            tokens=str(MODEL / 'tokens.txt'),
            lexicon=','.join(str(MODEL / f) for f in ['lexicon-us-en.txt', 'lexicon-zh.txt']),
            data_dir=str(MODEL / 'espeak-ng-data'),
            dict_dir=str(MODEL / 'dict'),
        ),
        num_threads=2,
        provider='cpu',
    ),
    rule_fsts=','.join(str(MODEL / f) for f in ['date-zh.fst', 'number-zh.fst', 'phone-zh.fst']),
    max_num_sentences=1,
)
if not config.validate():
    raise RuntimeError('invalid_voice_assets')
tts = sherpa_onnx.OfflineTts(config)
print(json.dumps({'type': 'ready'}), flush=True)
for raw in sys.stdin:
    r = None
    try:
        r = json.loads(raw)
        if (set(r) != {'id', 'side', 'text', 'rank'} or r['side'] not in ['demon', 'human']
                or not isinstance(r['text'], str) or not 1 <= len(r['text']) <= 260
                or type(r['rank']) is not int or not 0 <= r['rank'] <= 10000
                or any(ord(c) < 32 for c in r['text'])):
            raise ValueError('invalid_speech')
        # Model's documented Mandarin male speakers, distinct on the two sides.
        profile = role_profile(r['side'], r['rank'], r['text'])
        audio = tts.generate(r['text'], sid=profile['speaker'], speed=profile['speed'])
        data = io.BytesIO()
        sf.write(data, master_voice(audio.samples, audio.sample_rate, r['side']), audio.sample_rate, format='WAV', subtype='PCM_16')
        if data.tell() > 2 * 1024 * 1024:
            raise ValueError('audio_limit')
        print(json.dumps({'id': r['id'], 'ok': True, 'wav': base64.b64encode(data.getvalue()).decode(),
                          'peakBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}), flush=True)
    except Exception:
        print(json.dumps({'id': r.get('id') if isinstance(r, dict) else None,
                          'ok': False, 'reason': 'local_voice_failed'}), flush=True)
