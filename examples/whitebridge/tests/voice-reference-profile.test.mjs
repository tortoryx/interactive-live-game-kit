import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {referenceProfile} from '../modules/local-voice/reference-profile.mjs';
test('only a fixed verified local reference can be loaded; corrupt or altered reference fails closed',()=>{
 const root=mkdtempSync(join(tmpdir(),'voice-profile-'));try{
  assert.equal(referenceProfile(root),null);const dir=join(root,'.runtime/local-voice-profile');mkdirSync(dir,{recursive:true});
  const audio=Buffer.alloc(64);audio.write('RIFF');const p={version:1,engine:'qwen3-base',id:'witch-conversation-v1',text:'我们先看看他们怎么打。',sampleRate:24000,sha256:createHash('sha256').update(audio).digest('hex')};
  writeFileSync(join(dir,'reference.wav'),audio);writeFileSync(join(dir,'profile.json'),JSON.stringify(p));assert.equal(referenceProfile(root).id,p.id);
  audio[20]=1;writeFileSync(join(dir,'reference.wav'),audio);assert.throws(()=>referenceProfile(root),/invalid_voice_reference/);
  writeFileSync(join(dir,'profile.json'),JSON.stringify({...p,id:'../../private'}));assert.throws(()=>referenceProfile(root),/invalid_voice_profile/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
