import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
import {applySpeechPack,cueSpeech,tickLunaSpeech} from '../modules/pixel-war/luna-speech.mjs';
import {selectedLeaderSpeech} from '../modules/pixel-war/public/leader-speech.mjs';
import {mockPack} from './fixtures/luna-pack.mjs';
const budget={hourCalls:2,hourLimitCalls:120,dayCalls:326,dayLimitCalls:600};
function older(g){for(const side of ['demon','human'])g.world.heroes[side].rank=4;g.world.lunaSpeech.pending=[];}
test('watched battle fills a bounded duet buffer, keeps viewer reserve and does no unwatched generation',()=>{
 const g=new LiveGame();try{older(g);const schedule=new DecisionSchedule();assert.equal(nextModelWork(g,schedule,100000,budget,{watching:false}),null);
 const work=nextModelWork(g,schedule,100000,budget,{watching:true});assert(work?.pack?.duet);assert.equal(work.pack.items[0].cue,'banter');
 const lines=Array.from({length:work.pack.lineCount},(_,i)=>({side:i%2?'human':'demon',text:'测试生成的战场台词',interrupt:false}));
 assert(applySpeechPack(g.world,work.pack,{ok:true,model:'gpt-5.6-luna',decision:{requestId:work.pack.id,lines}},108000));
 assert.equal(g.world.showDebate.queue.length,12);assert.equal(g.world.speech.length,0,'prefetch alone is never a delivered sentence');
 const limited=nextModelWork(g,schedule,250000,{...budget,dayCalls:570},{watching:true});assert.equal(limited,null,'keep final allowance for real viewer messages');
 }finally{g.close();}
});
test('later deployment reacts too, while a repeated receipt does not manufacture more reactions',()=>{
 const g=new LiveGame();try{older(g);g.testGift({side:'demon',reward:'rally',id:'test:speech-first'});g.drain();g.world.lunaSpeech.pending=[];g.world.time+=22000;
 g.testGift({side:'demon',reward:'sentinel',id:'test:speech-second'});g.drain();const q=g.world.lunaSpeech.pending.find(q=>q.side==='demon'&&q.facts?.receipt==='test:speech-second');assert(q,'second deployment must queue a current reaction');assert.equal(q.cue,'reinforcement');
 const n=g.world.lunaSpeech.pending.length;g.testGift({side:'demon',reward:'sentinel',id:'test:speech-second'});g.drain();assert.equal(g.world.lunaSpeech.pending.length,n);
 const work=nextModelWork(g,new DecisionSchedule(),200000,budget,{watching:true});assert(work?.pack);assert(work.pack.items.some(i=>i.cue==='reinforcement'));
 }finally{g.close();}
});
test('ready generated combat reaction is not blocked by an ungenerated low-priority cue',()=>{
 const g=new LiveGame();try{older(g);cueSpeech(g.world,'human','resource');mockPack(g.world,'demon',{hurt:'测试已经生成的受伤反应'});cueSpeech(g.world,'demon','hurt');tickLunaSpeech(g.world);assert.equal(selectedLeaderSpeech(g.snapshot(),'demon')?.text,'测试已经生成的受伤反应');}finally{g.close();}
});
test('idle continuation survives waiting behind voice playback; no canned speech when cache empty',()=>{
 const g=new LiveGame();try{older(g);mockPack(g.world,'demon',{monologue:'测试尚未播放的独白'});g.world.time=25000;tickLunaSpeech(g.world);assert.equal(selectedLeaderSpeech(g.snapshot(),'demon')?.text,'测试尚未播放的独白');assert.equal(g.world.speech.at(-1).model,'gpt-5.6-luna');}finally{g.close();}
});

test('updating the speech service cannot heal or rescale living troops across a later generation',()=>{
 const g=new LiveGame();try{g.testGift({side:'demon',reward:'rally'});g.drain();const u=g.world.units[0];u.hp=Math.round(u.maxHP*.4);g.world.heroes.human.rank+=1;const before={hp:u.hp,maxHP:u.maxHP,attack:u.attack,training:structuredClone(u.viewerTraining)};g.restore(g.capture());const after=g.world.units.find(v=>v.id===u.id);assert.deepEqual({hp:after.hp,maxHP:after.maxHP,attack:after.attack,training:after.viewerTraining},before);}finally{g.close();}
});

for(const transient of ['voice_warming','busy'])test('preloaded speech recovers from '+transient+' beyond twelve seconds and publishes real audio',async()=>{
 const {VoicePump}=await import('../modules/live-runtime/voice-pump.mjs');const g=new LiveGame(),pump=new VoicePump(),audio=new Map();try{older(g);g.runtime.voiceEnabled=true;mockPack(g.world,'demon',{hurt:'测试冷启动语音'});cueSpeech(g.world,'demon','hurt');tickLunaSpeech(g.world,{voice:true});const line=g.world.speech.at(-1);let requests=0;
 const bytes=Buffer.alloc(48044);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(24000,24);bytes.writeUInt32LE(48000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(48000,40);
 const broker={request:async()=>++requests===1?{ok:false,reason:transient}:{ok:true,wav:bytes.toString('base64')}};
 await pump.pump(g,broker,audio);assert(line.voiceWaitStartedAt);g.world.time+=15000;await pump.pump(g,broker,audio);assert.equal(requests,2,'warm-up must keep polling after the original 12-second freshness window');assert.equal(line.audioMode,'full_read');assert(audio.has(line.audioUrl));
 }finally{g.close();}
});

test('80 percent allowance paces real show batches instead of permanently silencing the host and leaders',()=>{
 const g=new LiveGame();try{older(g);const schedule=new DecisionSchedule(),m={...budget,dayCalls:480};
 const first=nextModelWork(g,schedule,100000,m,{watching:true});assert(first?.pack?.duet);
 assert.equal(nextModelWork(g,schedule,130000,m,{watching:true}),null);
 g.world.showDebate.request=null;g.world.showDebate.retryAt=0;
 assert(nextModelWork(g,schedule,160001,m,{watching:true})?.pack);
 g.world.audienceWaiting={demon:true};assert.equal(nextModelWork(g,schedule,160500,m,{watching:true})?.side,'demon');
 }finally{g.close();}
});
