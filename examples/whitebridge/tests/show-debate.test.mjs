import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {prepareDebate,applyDebate,tickDebate,debatePresentation,syncDebate,validateDebate,recoverDebate,HOST_ID} from '../modules/live-runtime/show-debate.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
const text=['你躲那么远，弓倒是举得挺稳。','你盔甲那么厚，还怕这一箭？','你先射准了，再替我担心。','别动，我看你嘴能硬到什么时候。','你管瞄准叫本事？','总比站着摆架子强。'];
function pack(g,observer=false){g.world.paused=false;syncDebate(g.world).cycle=observer?2:0;const r=prepareDebate(g.world,Date.now()),c=g.context(r.side);r.observer=observer;c.speechRequest=r;const lines=Array.from({length:observer?6:r.lineCount},(_,i)=>({side:i%2?'human':'demon',text:text[i%text.length],interrupt:i===1||i===3}));if(observer)lines.push({side:'empress',text:'两位，打到现在都没忘了照顾嘴。',interrupt:false});return {r,c,result:{ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,lines}}};}
function wav(){const b=Buffer.alloc(44+16000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(16000,40);return b.toString('base64');}
test('paired generation has strict speaker order and no game action fields; rejects extra instructions and wrong identity',()=>{const g=new LiveGame();try{const {r,c,result}=pack(g,true),request=modelRequest('luna-max',c);assert.equal(request.text.format.name,'battle_debate');assert.equal(validateDecision(JSON.stringify(result.decision),c).lines.length,7);assert.throws(()=>validateDebate(JSON.stringify({...result.decision,strategy:'raid'}),c));const bad=structuredClone(result.decision);bad.lines[1].side='demon';assert.throws(()=>validateDebate(JSON.stringify(bad),c));g.world.heroes.human.id+='retired';assert.equal(applyDebate(g.world,r,result,Date.now()),false);assert.equal(g.world.showDebate.queue.length,0);}finally{g.close();}});
test('all speech stays unpublished until voice ready; viewer priority pauses handoff; only actual playback adds history',async()=>{const g=new LiveGame();try{const {r,result}=pack(g);g.runtime.voiceEnabled=true;assert(applyDebate(g.world,r,result,Date.now()));const count=g.world.speech.length;tickDebate(g.world);assert.equal(g.world.speech.length,count);const audio=new Map(),pump=new VoicePump();await pump.pump(g,{request:async()=>({ok:true,wav:wav()})},audio);assert.equal(g.world.speech.length,count);const next=g.world.showDebate.queue[0];assert.equal(next.audioMode,'full_read');await pump.pump(g,{request:async()=>({ok:true,wav:wav()})},audio);g.world.audienceWaiting={demon:true};tickDebate(g.world);assert.equal(g.world.speech.length,count);g.world.audienceWaiting={};tickDebate(g.world);assert.equal(g.world.speech.at(-1).id,next.id);assert.equal(g.world.showDebate.recent.length,0);assert(debatePresentation(g,{id:next.id,persona:next.persona,field:g.world.fieldEpoch,event:'started'}));assert.equal(g.world.showDebate.recent.length,1);}finally{g.close();}});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;}play(){this.paused=false;this.onplaying?.();return Promise.resolve();}pause(){this.paused=true;this.onpause?.();}}
function state(){return {time:100,fieldEpoch:1,paused:false,heroes:{demon:{id:'d',hp:50},human:{id:'h',hp:50}},speech:[]};}
const line=(id,side,extra={})=>({id,side,persona:side==='demon'?'d':'h',text:'测试配音',at:0,until:20000,audioUrl:'/voice/'+id+'.wav',audioDuration:4000,debate:true,...extra});
test('a tagged interruption overlaps only opposite leader in the last half second; both boxes follow actual audio',()=>{const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();s.speech=[line(1,'demon'),line(2,'human',{interrupt:true})];p.update(s,{enabled:true});assert.equal(p.active.length,1);p.current.audio.currentTime=3.1;p.update(s,{enabled:true});assert.equal(p.active.length,1);p.current.audio.currentTime=3.6;p.update(s,{enabled:true});assert.equal(p.active.length,2);assert(p.presentation('demon'));assert(p.presentation('human'));p.current.audio.onended();assert.equal(p.active.length,1);assert.equal(p.current.line.side,'human');p.update({...s,paused:true},{enabled:true});assert(!p.presentation('human'));});
test('audience owns the next turn, never overlaps; a defeated leader cancels both stale debate sides',()=>{const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();const opponents='d|h:1';s.speech=[line(1,'demon',{opponents})];p.update(s,{enabled:true});p.current.audio.currentTime=3.8;s.speech.push(line(2,'human',{interrupt:true,opponents}),line(3,'human',{debate:false,audienceId:'v'}));p.update(s,{enabled:true});assert.equal(p.active.length,1);p.current.audio.onended();assert.equal(p.current.line.id,3);p.current.audio.onended();assert.equal(p.current.line.id,2);s.heroes.demon.id='replacement';p.update(s,{enabled:true});assert.equal(p.active.length,0);});
test('restart keeps generated text but invalidates process-local audio and interrupted request ownership',()=>{const g=new LiveGame();try{const {r,result}=pack(g);applyDebate(g.world,r,result,Date.now());const s=g.world.showDebate,text=s.queue[0].text;s.queue[0].audioUrl='/voice/old.wav';s.queue[0].audioMode='full_read';s.request='interrupted';s.started=true;recoverDebate(g.world);assert.equal(s.queue[0].text,text);assert.equal(s.queue[0].audioUrl,undefined);assert.equal(s.queue[0].audioMode,'synthesizing');assert.equal(s.request,null);assert.equal(s.interruptedRequest,'interrupted');assert(s.retryAt>Date.now());assert.equal(s.started,false);}finally{g.close();}});
test('owner preload prepares a complete paired audio buffer while paused, without publishing or hearing it',async t=>{
 const status={models:{enabled:false},voice:{enabled:true,configured:true}};
 const broker={status,poll:async()=>{},request:async(path,c)=>path==='/decision'?{ok:true,model:'chatgpt-web/light',decision:{requestId:c.speechRequest.id,lines:Array.from({length:c.speechRequest.lineCount},(_,i)=>({side:i%2?'human':'demon',text:text[i%text.length],interrupt:false}))}}:path==='/voice'?{ok:true,wav:wav()}:{} };
 const app=await createPreview({stagePort:44890,controlPort:44891,clock:false,broker});t.after(()=>app.close());app.world.paused=true;
 const url='http://127.0.0.1:44891',html=await(await fetch(url)).text(),token=html.match(/content="([a-f0-9]{64})"/)[1];
 const response=await fetch(url+'/owner/preload',{method:'POST',headers:{Origin:url,'Content-Type':'application/json','X-Owner-Token':token},body:'{}'}),result=await response.json();
 assert.equal(result.ok,true);assert.equal(result.ready,12);assert.equal(app.world.time,0);assert.equal(app.world.paused,true);assert.equal(app.world.showDebate.recent.length,0);assert(!app.world.speech.some(l=>l.debate));
 for(const l of app.world.showDebate.queue)assert.equal((await fetch('http://127.0.0.1:44890'+l.audioUrl)).status,200);
});

test('pausing during a real server request releases its slot and permits fresh dialogue after resume',async t=>{
 let arrived,finish;const started=new Promise(resolve=>{arrived=resolve;});
 const status={models:{enabled:true,transport:'electron',authenticated:true,state:'ready',model:'chatgpt-web/light'},voice:{enabled:false}};
 const broker={status,poll:async()=>{},request:async(path,c)=>{
  if(path==='/decision'){arrived(c);return new Promise(resolve=>{finish=resolve;});}return {};
 }};
 const app=await createPreview({stagePort:44892,controlPort:44893,clock:false,broker});
 const streamAbort=new AbortController();t.after(async()=>{status.models.enabled=false;finish?.({ok:false,reason:'cancelled'});streamAbort.abort();await app.close();});
 app.world.paused=false;
 const stream=await fetch('http://127.0.0.1:44892/stream',{signal:streamAbort.signal});assert(stream.ok);
 const c=await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('no dialogue request')),5000).unref())]);
 assert(c.speechRequest.duet);assert.equal(app.world.showDebate.request,c.speechRequest.id);
 const url='http://127.0.0.1:44893',html=await(await fetch(url)).text(),token=html.match(/content="([a-f0-9]{64})"/)[1];
 const action=()=>fetch(url+'/action',{method:'POST',headers:{Origin:url,'Content-Type':'application/json','X-Owner-Token':token},body:'{"type":"pause"}'});
 assert.equal((await action()).status,200);assert(app.world.paused);
 finish({ok:true,model:'chatgpt-web/light',decision:{requestId:c.speechRequest.id,lines:Array.from({length:12},(_,i)=>({side:i%2?'human':'demon',text:text[i%text.length],interrupt:false}))}});
 for(let i=0;i<30&&app.world.showDebate.request;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(app.world.showDebate.request,null);assert.equal(app.world.showDebate.queue.length,0);
 status.models.enabled=false;assert.equal((await action()).status,200);app.world.showDebate.retryAt=0;
 const next=prepareDebate(app.world,Date.now());assert(next);assert.notEqual(next.id,c.speechRequest.id);
});
