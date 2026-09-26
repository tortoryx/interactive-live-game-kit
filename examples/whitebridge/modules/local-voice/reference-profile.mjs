import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// Owner-installed, fixed profile. Viewer input cannot choose a file or actor.
export function referenceProfile(root){
 const folder=join(root,'.runtime/local-voice-profile'),manifest=join(folder,'profile.json');
 if(!existsSync(manifest))return null;
 const p=JSON.parse(readFileSync(manifest,'utf8'));
 if(p.version!==1||p.engine!=='qwen3-base'||!/^witch-[a-z0-9-]{1,48}$/.test(p.id)||typeof p.text!=='string'||p.text.length<3||p.text.length>180||/[\u0000-\u001f]/.test(p.text)||p.sampleRate!==24000||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('invalid_voice_profile');
 const audio=join(folder,'reference.wav'),bytes=readFileSync(audio);
 if(bytes.length>2*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error('invalid_voice_reference');
 return {...p,folder,audio};
}
