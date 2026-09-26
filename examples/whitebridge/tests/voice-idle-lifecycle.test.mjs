import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalVoice} from '../modules/local-voice/service.mjs';
test('periodic warming during speech cannot leave a stale timer that stops an active stream',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const voice=new LocalVoice({memoryProbe:()=>true});voice.available=true;voice.workerReady=true;voice.audioWarm=true;let resolveAudio;
 voice.child={stdin:{write(){resolveAudio=()=>voice.pending.resolve({ok:true,wav:'audio'});}}};let stops=0;voice.stop=()=>{stops++;};
 const speaking=voice.speak({side:'empress',text:'试玩乙，这队先护住后排。',rank:0});t.mock.timers.tick(10000);voice.warm();resolveAudio();await speaking;
 t.mock.timers.tick(60000);voice.warm();t.mock.timers.tick(60000);assert.equal(stops,0,'old warm timer must not stop the recently-used worker');
 t.mock.timers.tick(60000);assert.equal(stops,1,'the actual final idle deadline still releases the worker');t.mock.timers.reset();
});
