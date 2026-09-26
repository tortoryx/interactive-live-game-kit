import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
import {prepareDebate,tickDebate,syncDebate} from '../modules/live-runtime/show-debate.mjs';
import {prepareSpeechRequest,cueSpeech} from '../modules/pixel-war/luna-speech.mjs';
import {receiveView,applyObserver} from '../modules/live-runtime/show-observer.mjs';
import {modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
import {tickAudience,audienceState} from '../modules/live-runtime/audience.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
import {campaignGoal} from '../modules/pixel-war/campaign.mjs';
function setup(){const g=new LiveGame({speechMode:'observer'});g.world.paused=false;g.runtime.modelEnabled=true;return g;}
function wav(){const b=Buffer.alloc(8044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(8000,40);return b.toString('base64');}
test('host-only mode admits commentary, no leader dialogue or tactical model calls, and survives a reset',()=>{
 const g=setup(),w=g.world,now=Date.now();try{
 receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900},now);
 assert.equal(prepareDebate(w,now),null);assert.equal(prepareSpeechRequest(w,now),null);cueSpeech(w,'demon','reinforcement',{}, {priority:3});assert.equal(w.lunaSpeech.pending.length,0);
 const work=nextModelWork(g,new DecisionSchedule(),now,{});assert(work.pack.commentary);assert.equal(work.side,null);
 assert(applyObserver(w,work.pack,{ok:true,model:'chatgpt-web/light',decision:{requestId:work.pack.id,lines:[{text:'左边几个人挤到一起了。',emotion:'focused'}]}},now));
 Object.assign(syncDebate(w).observerQueue[0],{audioMode:'full_read',audioUrl:'/voice/test.wav',audioDuration:5000});tickDebate(w);assert.equal(w.speech.at(-1).side,'empress');assert.equal(syncDebate(w).queue.length,0);
 g.resetForLaunch();assert.equal(g.world.speechMode,'observer');assert.equal(g.world.lunaSpeech.pending.length,0);
 }finally{g.close();}
});
test('viewer reply uses host identity, host voice and host bubble; leader tactics remain untouched',async()=>{
 const g=setup(),w=g.world;try{
 g.runtime.voiceEnabled=true;const r=g.testChat({side:'demon',text:'你是谁'});tickAudience(g);const c=g.context('demon');assert.equal(c.performer,'empress');
 const req=modelRequest('luna-max',c);assert.match(req.input[0].content,/魔女解说/);assert.deepEqual(req.text.format.schema.properties.audienceAction.enum,['none']);
 const d={strategy:'auto',tactic:'hold',lane:1,speech:'我在这儿看两边打架呢。',continuations:[],memory:'',replyTo:r.id,audienceAction:'none'};
 assert(g.applyDecision(c,validateDecision(JSON.stringify(d),c),'chatgpt-web/light'));const line=w.speech.at(-1);assert.equal(line.performer,'empress');assert.equal(line.side,'demon');
 let actor;await new VoicePump().pump(g,{request:async(path,body)=>{actor=body.side;return {ok:true,wav:wav()};}},new Map());assert.equal(actor,'empress');assert.equal(line.audioMode,'full_read');
 class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;}play(){this.paused=false;this.onplaying?.();return Promise.resolve();}pause(){this.paused=true;}}
 const playback=new SpeechPlayback({createAudio:()=>new Media()});playback.update(g.snapshot(),{enabled:true});assert.equal(playback.presentation('empress').id,line.id);assert.equal(playback.presentation('demon'),null);
 const forged={...line,id:line.id+1,performer:undefined};assert.equal(playback.valid(forged,g.snapshot()),false);
 assert.equal(g.meta.lastCommand?.demon,undefined);
 }finally{g.close();}
});
test('staggered troop IDs do not all become guards or share the same five formation points',()=>{
 const g=setup(),w=g.world;try{const units=Array.from({length:100},(_,i)=>({id:'demon-levy-'+(10000+i*5),kind:'levy',side:'demon',lane:2,x:9600,y:1600,radius:9,hp:20}));w.units.push(...units);const goals=units.map(u=>campaignGoal(w,u));const defenders=goals.filter(g=>g.defending);assert(defenders.length>=8&&defenders.length<=35,defenders.length);assert(new Set(goals.map(g=>Math.round(g.x)+':'+Math.round(g.y))).size>30);
 }finally{g.close();}
});
test('exactly overlapping soldiers separate without teleporting or altering their health',()=>{
 const g=setup(),w=g.world;try{w.mode='sparring';w.spawn('demon','militia',1,false,{source:'test',supporter:{id:'test',name:'测试'}});w.spawn('demon','militia',1,false,{source:'test',supporter:{id:'test',name:'测试'}});const [a,b]=w.units.slice(-2),p=w.ground({x:10150,y:1150});Object.assign(a,p,{stunnedUntil:w.time+5000});Object.assign(b,p,{stunnedUntil:w.time+5000});const hp=[a.hp,b.hp];w.step(50);const d=Math.hypot(a.x-b.x,a.y-b.y);assert(d>0&&d<30,d);assert.deepEqual([a.hp,b.hp],hp);
 }finally{g.close();}
});

test('local battle bubbles survive the live snapshot while remaining inaudible and absent from model work',async()=>{
 const {troopShout}=await import('../modules/pixel-war/viewer-troops.mjs');
 const {tickLocalBubbles}=await import('../modules/pixel-war/local-bubbles.mjs');
 const {presentedLeaderSpeech}=await import('../modules/pixel-war/public/leader-speech.mjs');
 const g=setup(),w=g.world;try{
  g.runtime.voiceEnabled=true;tickLocalBubbles(w);
  w.spawn('demon','militia',1,false,{source:'test',supporter:{id:'owner',name:'玩家'}});
  troopShout(w,w.units.at(-1),'attack',true);
  const snapshot=g.snapshot();assert(snapshot.chatter.some(l=>l.origin==='battle-rule'));
  for(const side of ['demon','human']){const line=presentedLeaderSpeech(snapshot,side,null);assert(line);assert.equal(line.audioMode,'silent');assert.equal(new SpeechPlayback().valid(line,snapshot),false);}
  const calls=[];await new VoicePump().pump(g,{request:async(p,b)=>{calls.push(b.side);return {ok:false};}},new Map());
  assert.deepEqual(calls,[]);assert.equal(w.lunaSpeech.pending.length,0);assert.equal(prepareSpeechRequest(w,Date.now()),null);
  w.time+=6000;const hurt=cueSpeech(w,'demon','hurt');assert(hurt);assert.equal(w.speech.at(-1).cue,'hurt');
 }finally{g.close();}
});

test('stale leader prefetch cannot enter TTS after switching to observer mode',async()=>{
 const g=setup(),w=g.world;try{
  const s=syncDebate(w);s.queue.push({id:9,side:'demon',persona:w.heroes.demon.id,text:'过期首领对白',audioMode:'synthesizing',until:60000});
  const calls=[];await new VoicePump().prepareDebate(g,{request:async(p,b)=>{calls.push(b);return {ok:false};}},new Map(),{closing:()=>false});assert.deepEqual(calls,[]);
 }finally{g.close();}
});

test('a single Electron page keeps new viewer work queued until background generation releases it',async()=>{
 const {modelAdmission}=await import('../modules/live-runtime/model-work.mjs');
 assert.equal(modelAdmission({transport:'electron',parallelism:1,pages:{ready:0,busy:1}},1),false);
 assert.equal(modelAdmission({transport:'electron',parallelism:1,pages:{ready:0,preparing:1}},0),false);
 assert.equal(modelAdmission({transport:'electron',parallelism:1,pages:{ready:1}},0),true);
 assert.equal(modelAdmission({transport:'electron',parallelism:3,pages:{ready:1,busy:1}},1),true);
});
