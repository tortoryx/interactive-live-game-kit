import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {syncDebate,tickDebate,HOST_ID,recoverDebate} from '../modules/live-runtime/show-debate.mjs';
import {receiveView,visibleBattle,screenSector,prepareObserver,applyObserver,validateObserver} from '../modules/live-runtime/show-observer.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {PlaybackReceipts} from '../modules/live-runtime/playback-receipts.mjs';
function setup(){const g=new LiveGame();g.world.paused=false;const w=g.world,v={side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900};receiveView(w,v);return {g,w,v,s:syncDebate(w)};}
const result=r=>({ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,lines:[{text:'左边这群挤得挺紧，后排还在往前走。',emotion:'focused'},{text:'另一侧倒空出来了，这群人没往那边去。',emotion:'dry'},{text:'这位置再挤下去，前排都快没地方站了。',emotion:'amused'}]}});
const ready=l=>Object.assign(l,{audioMode:'full_read',audioUrl:'/voice/'+l.id+'.wav',audioDuration:5000});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;}play(){this.paused=false;this.onplaying?.();return Promise.resolve();}pause(){this.paused=true;this.onpause?.();}}
const state=()=>({time:100,fieldEpoch:1,paused:false,heroes:{demon:{id:'d',hp:50},human:{id:'h',hp:50}},speech:[]});
const clip=(id,side,other={})=>({id,side,persona:side==='empress'?HOST_ID:side==='demon'?'d':'h',text:'当前战场解说',at:0,until:30000,audioUrl:'/voice/'+id+'.wav',audioDuration:5000,debate:true,...other});
const host=(id,other={})=>clip(id,'empress',{observer:true,observedAt:0,...other});

test('camera facts name actual screen sectors, local formations and combat; they never invent movements',()=>{
 const {g,w,v}=setup();try{w.units=[{id:'a',hp:10,maxHP:10,side:'human',kind:'sword',moving:true,x:v.x-400,y:v.y-300},{id:'b',hp:2,maxHP:10,side:'demon',kind:'bow',action:{kind:'shot'},x:v.x+400,y:v.y+300},{id:'off',hp:1,side:'human',x:v.x+5000,y:v.y}];
 const facts=visibleBattle(w,v);assert.equal(screenSector(v,w.units[0]),'左上方');assert.equal(facts.counts.human,1);assert.equal(facts.clusters.find(g=>g.side==='human').moving,1);assert.equal(facts.clusters.find(g=>g.side==='demon').sector,'右下方');assert.equal(facts.clusters.find(g=>g.side==='demon').wounded,1);assert(!JSON.stringify(facts).includes('off'));
 }finally{g.close();}
});
test('host prepares a whole passage independently and does not accumulate another topic',()=>{
 const {g,w,v,s}=setup();try{const now=Date.now(),r=prepareObserver(w,now);assert(applyObserver(w,r,result(r),now));
 s.nextAt=w.time+100000;w.sceneSpeakingUntil=w.time+100000;tickDebate(w);assert.equal(w.speech.filter(l=>l.observer).length,0);assert.equal(s.observerQueue.length,1);assert.equal(s.observerQueue[0].text,result(r).decision.lines.map(l=>l.text).join(''));
 s.observerQueue.forEach(ready);tickDebate(w);assert.equal(w.speech.at(-1).side,'empress');assert.equal(s.observerQueue.length,0);
 receiveView(w,v,now+60000);assert.equal(prepareObserver(w,now+60000),null,'no second topic while this thought is queued or speaking');
 }finally{g.close();}
});
test('observer output is text-only, bounded, and stale camera batches are discarded',()=>{
 const {g,w,v,s}=setup();try{const now=Date.now(),r=prepareObserver(w,now);assert.throws(()=>validateObserver(JSON.stringify({...result(r).decision,strategy:'attack'}),{speechRequest:r}));assert.throws(()=>validateObserver(JSON.stringify({...result(r).decision,lines:Array(7).fill({text:'看这边',emotion:'dry'})}),{speechRequest:r}));
 receiveView(w,{...v,x:v.x+4000},now+2000);assert(!applyObserver(w,r,result(r),now+2000));assert.equal(s.observerQueue.length,0);
 }finally{g.close();}
});
test('host interrupts a leader immediately, while later leaders continue on their own channel',()=>{
 const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();s.speech=[clip(1,'demon')];p.update(s,{enabled:true});p.current.audio.currentTime=.1;s.speech.push(host(2),clip(3,'human'));p.update(s,{enabled:true});assert.equal(p.active.length,2);assert(p.presentation('empress'));assert(p.presentation('demon'));assert.equal(p.current.audio.volume,.55);
 p.active.find(c=>c.line.side==='demon').audio.onended();assert.deepEqual(p.active.map(c=>c.line.side).sort(),['empress','human']);assert(p.presentation('empress'));p.active.find(c=>c.line.observer).audio.onended();assert.equal(p.current.audio.volume,1);
});
test('the host never overlaps herself and audience response gets the next empty floor',()=>{
 const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();s.speech=[clip(1,'demon'),host(2),host(3)];p.update(s,{enabled:true});assert.equal(p.active.length,2);s.speech.push(clip(4,'human',{debate:false,audienceId:'viewer'}));p.update(s,{enabled:true});
 p.active.find(c=>c.line.side==='demon').audio.onended();assert.equal(p.active.length,1);assert.equal(p.active[0].line.id,2);p.active[0].audio.onended();assert.equal(p.active.length,1);assert.equal(p.current.line.id,4);p.current.audio.onended();assert.equal(p.active[0].line.id,3);
});
test('host playback failure or camera change cannot stop the leader; pause hides every bubble',()=>{
 const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state(),view={x:1000,y:600,w:1000,h:700};p.viewport=view;s.speech=[clip(1,'demon'),host(2,{view})];p.update(s,{enabled:true});p.active.find(c=>c.line.observer).audio.onerror();assert.equal(p.active.length,1);assert(p.presentation('demon'));
 s.speech.push(host(3,{view}));p.update(s,{enabled:true});assert.equal(p.active.length,2);p.viewport={...view,x:5000};p.update(s,{enabled:true});assert.equal(p.active.length,1);assert(p.presentation('demon'));p.update(s,{enabled:true,paused:true});assert(!p.presentation('demon'));assert(!p.presentation('empress'));
});
test('host never creates a third simultaneous voice during a leader interruption',()=>{
 const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();s.speech=[clip(1,'demon')];p.update(s,{enabled:true});p.current.audio.currentTime=4.8;s.speech.push(clip(2,'human',{interrupt:true}),host(3));p.update(s,{enabled:true});assert.equal(p.active.length,2);assert(!p.presentation('empress'));p.active[0].audio.onended();assert.equal(p.active.length,2);assert(p.presentation('empress'));
});
function wav(){const b=Buffer.alloc(8044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(8000,40);return b.toString('base64');}
test('single TTS engine prepares the host without waiting for leader audio; next job is fair to leaders',async()=>{
 const {g,w,s}=setup();try{g.runtime.voiceEnabled=true;const r=prepareObserver(w,Date.now());applyObserver(w,r,result(r),Date.now());s.queue=[{id:1000001,side:'human',persona:w.heroes.human.id,opponents:s.key,text:'给我站住。',audioMode:'synthesizing'}];const pump=new VoicePump(),calls=[],audio=new Map();let resolve;const broker={request:async(_,r)=>{calls.push(r.side);return new Promise(r=>resolve=()=>r({ok:true,wav:wav()}));}};
 const first=pump.pump(g,broker,audio);await pump.pump(g,broker,audio);assert.deepEqual(calls,['empress']);resolve();await first;assert.equal(s.observerQueue[0].audioMode,'full_read');const second=pump.pump(g,broker,audio);await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['empress','human']);resolve();await second;
 }finally{g.close();}
});
test('owner preview records actually played commentary, but cannot override a real broadcast presenter',()=>{
 const {g,w,s}=setup();try{const r=prepareObserver(w,Date.now());applyObserver(w,r,result(r),Date.now());s.observerQueue.forEach(ready);tickDebate(w);const l=w.speech.at(-1),p=new PlaybackReceipts(g),b={id:l.id,field:w.fieldEpoch,persona:HOST_ID,event:'started'};assert(p.ownerPreview(b).ok);assert.equal(s.observerRecent.at(-1),l.text);assert(p.ownerPreview(b).ok);assert.equal(s.observerRecent.length,1);
 assert(p.receive({event:'claim',client:'11111111-1111-4111-8111-111111111111'}).ok);assert(!p.ownerPreview({...b,event:'ended'}).ok);assert(!p.ownerPreview({...b,event:'reset'}).ok);
 }finally{g.close();}
});


test('camera A to B to A cannot revive an old request, including within telemetry throttle',()=>{
 const {g,w,v}=setup();try{const now=Date.now(),r=prepareObserver(w,now);assert(receiveView(w,{...v,x:v.x+4000},now+100));assert(receiveView(w,v,now+200));assert(!applyObserver(w,r,result(r),now+210));}finally{g.close();}
});
test('pause/resume and death invalidate pending host work with unchanged leader IDs',()=>{
 for(const boundary of ['pause','death','inspection']){const {g,w,s}=setup();try{const r=prepareObserver(w,Date.now());if(boundary==='pause')w.paused=true;else if(boundary==='death')w.heroes.human.hp=0;else w.mode='inspection';g.snapshot();w.paused=false;w.heroes.human.hp=100;w.mode='sparring';syncDebate(w);assert(!applyObserver(w,r,result(r),Date.now()));assert.equal(s.observerQueue.length,0);}finally{g.close();}}
});
test('recovery clears observer work and holds uncertain generation, without replay',()=>{
 const {g,w,s}=setup();try{prepareObserver(w,Date.now());recoverDebate(w);assert.equal(s.observerRequest,null);assert.equal(s.observerQueue.length,0);assert(s.observerAt>Date.now()+119000);}finally{g.close();}
});
test('an inaudible ambient reservation cannot block a ready viewer',()=>{
 class Waiting extends Media{play(){this.paused=false;return Promise.resolve();}}
 const p=new SpeechPlayback({createAudio:()=>new Waiting()}),s=state();s.speech=[clip(1,'demon'),host(2)];p.update(s,{enabled:true});assert.equal(p.active.length,2);s.speech.push(clip(3,'human',{debate:false,audienceId:'v'}));p.update(s,{enabled:true});assert.deepEqual(p.active.map(c=>c.line.id),[3]);
});
test('viewer deadline is rechecked at actual media start, not only at reservation',()=>{
 let now=0;class Waiting extends Media{play(){this.paused=false;return Promise.resolve();}}
 const receipts=[],p=new SpeechPlayback({createAudio:()=>new Waiting(),now:()=>now,onPresentation:(_,e)=>receipts.push(e)}),s=state();s.audience={clock:1000,active:{human:{id:'v'}}};s.speech=[clip(1,'human',{debate:false,audienceId:'v',deadline:2000})];p.update(s,{enabled:true});const media=p.current.audio;now=1000;media.onplaying();assert.equal(p.active.length,0);assert(!receipts.includes('started'));
});
test('same-field service replacement drops old active and queued media',()=>{
 const p=new SpeechPlayback({createAudio:()=>new Media()}),s=state();s.mediaSession='old';s.speech=[clip(1,'demon'),host(2)];p.update(s,{enabled:true});assert.equal(p.active.length,2);s.mediaSession='new';s.speech=[];p.update(s,{enabled:true});assert.equal(p.active.length,0);assert.equal(p.pending.length,0);
});
test('host warmup backs off so a leader can use the next TTS admission',async()=>{
 const {g,w,s}=setup();try{g.runtime.voiceEnabled=true;const r=prepareObserver(w,Date.now());applyObserver(w,r,result(r),Date.now());s.queue=[{id:1000001,side:'human',persona:w.heroes.human.id,opponents:s.key,text:'给我站住。',audioMode:'synthesizing'}];const pump=new VoicePump(),calls=[],broker={request:async(_,r)=>{calls.push(r.side);return r.side==='empress'?{ok:false,reason:'voice_warming'}:{ok:true,wav:wav()};}};await pump.pump(g,broker,new Map());await pump.pump(g,broker,new Map());assert.deepEqual(calls,['empress','human']);}finally{g.close();}
});


test('routine leader reactions cannot starve live camera commentary; near-expiry synthesis is skipped',async()=>{
 const {g,w,s}=setup();try{g.runtime.voiceEnabled=true;const r=prepareObserver(w,Date.now());applyObserver(w,r,result(r),Date.now());w.speech.push({id:1000002,side:'human',persona:w.heroes.human.id,model:'chatgpt-web/light',text:'站住。',at:w.time,until:w.time+10000});const calls=[],pump=new VoicePump(),broker={request:async(_,r)=>{calls.push(r.side);return {ok:true,wav:wav()};}};await pump.pump(g,broker,new Map());assert.equal(calls[0],'empress');for(const l of s.observerQueue)l.audioMode='synthesizing';w.time+=39000;await pump.pump(g,broker,new Map());assert.equal(s.observerQueue.length,0);}finally{g.close();}
});
