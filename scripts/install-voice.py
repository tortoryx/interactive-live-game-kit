#!/usr/bin/env python3
"""Optional Apple Silicon host voice. Downloads public weights, never account state."""
import argparse,platform,shutil,subprocess,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--plan',action='store_true');a=p.parse_args()
root=Path(__file__).resolve().parents[1]/'examples/whitebridge';work=root/'.runtime'
model='mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit'
steps={'platform':'Apple Silicon macOS','model':model,'free_memory':'At least 6.5 GiB at cold start','disk':'Reserve 8 GiB for environment, weights and cache','license':'Review the model card and dependency licenses before download','profile':'Original synthetic adult female, one fixed reference for every turn'}
print(json.dumps(steps,indent=2))
if a.plan:raise SystemExit()
if platform.system()!='Darwin' or platform.machine()!='arm64':raise SystemExit('Local MLX voice requires Apple Silicon macOS; use the cloud voice adapter on other platforms.')
if not shutil.which('uv'):raise SystemExit('Install uv first: https://docs.astral.sh/uv/getting-started/installation/')
if shutil.disk_usage(root).free<8*1024**3:raise SystemExit('Less than 8 GiB free: installation stopped.')
work.mkdir(exist_ok=True);venv=work/'voice-venv';subprocess.run(['uv','venv','--python','3.11',str(venv)],check=True)
python=str(venv/'bin/python');subprocess.run(['uv','pip','install','--python',python,'mlx-audio==0.5.1','mlx==0.32.2','soundfile==0.14.0','huggingface-hub==1.30.0'],check=True)
subprocess.run([python,'-c','from huggingface_hub import snapshot_download; import sys; snapshot_download(repo_id=sys.argv[1],local_dir=sys.argv[2])',model,str(work/'models/qwen3-base')],check=True)
shutil.copytree(root/'assets/host-voice',work/'local-voice-profile',dirs_exist_ok=True)
print('Voice installed. Restart the local app, open Settings, select local voice and enable it. The first synthesis needs a warm-up.')
