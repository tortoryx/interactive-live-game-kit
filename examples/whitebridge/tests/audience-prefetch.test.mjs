import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {tickAudience,audienceState,nextAudiencePreparation,audienceModelStarted,withdrawAudience,voiceCompleted} from '../modules/live-runtime/audience.mjs';
import {replyPacing,viewerTurnKey} from '../modules/live-runtime/audience-pacing.mjs';
import {modelRequest} from '../modules/live-runtime/models.mjs';
import {modelLane} from '../modules/live-runtime/model-lanes.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';

const model='chatgpt-web/light';
function enable(g,voice=false){g.world.paused=false;g.world.mode='test_live';g.runtime={model,modelEnabled:true,voiceEnabled:voice};}
function chat(g,id,text='你是谁',paid=0,side='demon'){g.receive({id:'bilibili:'+id,messageId:'bilibili:message:'+id,kind:'chat',platform:'bilibili',actor:id,side,text,at:g.now(),amountMilli:paid,supporter:{name:id}});}
function decision(c,text='我是索恩，带队守桥的。',continuations=[]){return {strategy:'auto',tactic:'hold',lane:1,speech:text,continuations,memory:'',replyTo:c.audience.selected.id,audienceAction:'none'};}
function begin(g){const p=nextAudiencePreparation(g);assert(p);const c=g.context(p.side,{audience:p.item,prefetch:p.prefetch});audienceModelStarted(g,p.side,p.item.id);return c;}
function activeReply(g){chat(g,'first');tickAudience(g);const c=begin(g);assert(g.applyDecision(c,decision(c),model));return g.meta.audience.active.demon;}
function wav(){const b=Buffer.alloc(44+8000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(8000,40);return b.toString('base64');}

test('same-faction comments generate during prior playback; draft has no speech or false reply memory',()=>{
 const g=new LiveGame();try{enable(g);const first=activeReply(g);chat(g,'second','我家的猫叫芝麻');const c=begin(g);assert(c.audience.prefetch);assert.equal(c.audience.selected.text,'我家的猫叫芝麻');assert.equal(g.meta.audience.active.demon,first);assert(g.applyDecision(c,decision(c,'芝麻先看好，别让它跑上桌。'),model));
  const pending=g.meta.audience.pending[0];assert.equal(pending.phase,'ready');assert(!g.world.speech.some(s=>s.audienceId===pending.id));const history=g.viewerHistory.recall({platform:pending.supporter.platform,viewerId:pending.supporter.id,side:'demon',persona:c.persona,text:'芝麻',now:g.now()});assert.equal(history[0].leaderReplied,null);
  g.world.time=Math.max(first.until+1,g.meta.audience.nextFree.demon);tickAudience(g);assert.equal(g.meta.audience.active.demon.id,pending.id);assert(g.world.speech.some(s=>s.audienceId===pending.id));
 }finally{g.close();}
});
test('paid priority and newest free selection; ready and in-flight buffers stay bounded',()=>{
 const g=new LiveGame();try{enable(g);activeReply(g);for(let i=0;i<100;i++)chat(g,'free'+i);chat(g,'paid-low','来啦',100);chat(g,'paid-high','来啦',1000);
  assert.equal(g.meta.audience.pending.filter(m=>!m.amountMilli).length,64);let c=begin(g);assert.equal(c.audience.selected.id,'bilibili:paid-high');assert(g.applyDecision(c,decision(c),model));c=begin(g);assert.equal(c.audience.selected.id,'bilibili:paid-low');c=begin(g);assert.equal(c.audience.selected.id,'bilibili:free99');assert.equal(nextAudiencePreparation(g),null);assert.equal(g.meta.audience.pending.filter(m=>m.phase).length,3);
 }finally{g.close();}
});
test('busy generation requests one short answer, and runtime trims a previously long draft before playback',()=>{
 const g=new LiveGame();try{enable(g,true);const first=activeReply(g);for(let i=0;i<10;i++)chat(g,'busy'+i);assert.equal(replyPacing(g).mode,'busy');const c=begin(g);const prompt=modelRequest('luna-max',c).input[0].content;assert.match(prompt,/最多24字/);assert.match(prompt,/continuations必须为空数组/);
  assert(g.applyDecision(c,decision(c,'我是索恩，带队守桥的。',['你先站稳，别往河里挤。','等这边清了，我再过去。']),model));voiceCompleted(g,g.world.speech.find(s=>s.audienceId===first.id),{audioUrl:'/voice/first',durationMs:4000});g.world.time=first.until+1;tickAudience(g);assert.equal(g.meta.audience.active.demon.parts.length,1);assert.equal(g.world.speech.at(-1).segments,1);
 }finally{g.close();}
});
test('quiet replies can still speak multiple segments',()=>{
 const g=new LiveGame();try{enable(g,true);chat(g,'quiet');tickAudience(g);const c=begin(g);assert(g.applyDecision(c,decision(c,'我是索恩，带队守桥的。',['你先站稳，别往河里挤。','等这边清了，我再过去。']),model));assert.equal(g.meta.audience.active.demon.parts.length,3);}finally{g.close();}
});
test('wall-clock expiration does not wait for frozen battle time; paid narration is finite too',()=>{
 let now=100000;const g=new LiveGame({now:()=>now});try{enable(g);activeReply(g);chat(g,'old-free');chat(g,'old-paid','来啦',100);now+=30001;const c=begin(g);assert.equal(c.audience.selected.id,'bilibili:old-paid');assert(g.meta.audience.history.some(m=>m.id==='bilibili:old-free'&&m.status==='expired'));now+=60000;assert(!g.applyDecision(c,decision(c),model));nextAudiencePreparation(g);assert.equal(g.meta.audience.pending.length,0);
 }finally{g.close();}
});
test('same viewer is serialized, including a superseded in-flight free message',()=>{
 const g=new LiveGame();try{enable(g);const first=activeReply(g);g.testChat({side:'demon',text:'刚才呢？',viewer:'owner-test'});const other=begin(g),item=g.meta.audience.pending.find(m=>m.id===other.audience.selected.id);const blocked=new Set([viewerTurnKey(item)]);g.testChat({side:'demon',text:'我是说那个皇冠',viewer:'owner-test'});assert.equal(nextAudiencePreparation(g,{blockedViewers:blocked}),null);assert(!g.applyDecision(other,decision(other),model));assert.equal(g.meta.audience.active.demon,first);
 }finally{g.close();}
});
test('withdrawal, reset and persona retirement fence late prepared output',()=>{
 for(const kind of ['withdraw','reset','death']){const g=new LiveGame();try{enable(g);activeReply(g);chat(g,'discard');const c=begin(g);if(kind==='withdraw')withdrawAudience(g,['bilibili:message:discard']);if(kind==='reset')g.resetForLaunch();if(kind==='death')g.world.heroes.demon=g.world.makeHero('demon',1);assert(!g.applyDecision(c,decision(c),model));assert(!g.world.speech.some(s=>s.audienceId==='bilibili:discard'));}finally{g.close();}}
});
test('prepared tactical advice is revalidated when played, not executed while waiting',()=>{
 const g=new LiveGame();try{enable(g);const first=activeReply(g);chat(g,'advice','首领后退');const c=begin(g);assert.equal(c.audience.selected.advice,'retreat');const d={...decision(c,'我先往后撤。'),audienceAction:'retreat'};assert(g.applyDecision(c,d,model));assert(!g.world.heroes.demon.viewerAdvice);g.meta.epoch++;g.world.time=Math.max(first.until+1,g.meta.audience.nextFree.demon);tickAudience(g);assert(!g.world.heroes.demon.viewerAdvice);assert.equal(g.meta.audience.active.demon.phase,'unanswered');
 }finally{g.close();}
});
test('TTS prefetch caches a draft while another reply is playing, without publishing its memory',async()=>{
 const g=new LiveGame();try{enable(g,true);const first=activeReply(g);voiceCompleted(g,g.world.speech.at(-1),{audioUrl:'/voice/first',durationMs:4000});chat(g,'voice-next');const c=begin(g);assert(g.applyDecision(c,decision(c),model));const pump=new VoicePump(),audio=new Map();let calls=0;const broker={request:async()=>{calls++;return {ok:true,wav:wav()};}};
  await pump.pump(g,broker,audio);const pending=g.meta.audience.pending[0];assert(pending.preparedVoice);assert.equal(calls,1);assert(!g.world.speech.some(s=>s.audienceId===pending.id));g.world.time=Math.max(first.until+1,g.meta.audience.nextFree.demon);tickAudience(g);await pump.pump(g,broker,audio);assert.equal(calls,1);assert.equal(g.world.speech.at(-1).audioMode,'full_read');
 }finally{g.close();}
});
test('restart never replays uncertain preparation or stale cached audio',()=>{
 const dir=mkdtempSync(join(tmpdir(),'prefetch-restart-')),path=join(dir,'world.sqlite');let g=new LiveGame({path});try{enable(g);activeReply(g);chat(g,'inflight');begin(g);g.close();g=new LiveGame({path});enable(g);assert(!g.meta.audience.pending.some(m=>m.id==='bilibili:inflight'));assert(g.meta.audience.history.some(m=>m.id==='bilibili:inflight'&&m.status==='unanswered'));}finally{g.close();rmSync(dir,{recursive:true,force:true});}
});
test('production scheduler starts distinct same-side Instant calls before the current voice finishes, max three total',async()=>{
 const calls=[],resolvers=[];const broker={status:{models:{enabled:true,transport:'electron',model,authenticated:true,state:'ready'},voice:{enabled:true,configured:true}},poll:async()=>{},request:async(path,c)=>{if(path!=='/decision')return {ok:false,reason:'probe'};calls.push(c);return new Promise(resolve=>resolvers.push(()=>resolve({ok:true,model,decision:decision(c)})));}};
 const app=await createPreview({stagePort:0,controlPort:0,clock:false,broker});try{enable(app.game);activeReply(app.game);for(let i=0;i<6;i++)chat(app.game,'parallel'+i);await new Promise(r=>setTimeout(r,1250));assert.equal(calls.length,3);assert(calls.every(c=>c.side==='demon'&&c.audience.prefetch));assert.equal(new Set(calls.map(modelLane)).size,3);assert.equal(app.game.meta.audience.active.demon.id,'bilibili:first');}
 finally{app.world.paused=true;for(const resolve of resolvers)resolve();await app.close();}
});

import {PlaybackReceipts} from '../modules/live-runtime/playback-receipts.mjs';
import {audienceReplyParts} from '../modules/live-runtime/audience.mjs';
test('public reply memory commits only on a broadcast playback start, once, never at TTS readiness',()=>{
 const g=new LiveGame();try{enable(g,true);g.presentationRequired=true;activeReply(g);const line=g.world.speech.at(-1),item=g.meta.audience.active.demon;
 assert(voiceCompleted(g,line,{audioUrl:'/voice/ready',durationMs:5000}));assert.equal(item.phase,'awaiting_playback');assert(!line.memoryCommitted);
 const p=new PlaybackReceipts(g),client='12345678-1234-1234-1234-123456789abc',b={client,id:line.id,field:g.world.fieldEpoch,persona:line.persona};assert(p.receive({...b,event:'claim'}).ok);
 assert(!p.receive({...b,client:'00000000-0000-0000-0000-000000000000',event:'started'}).ok);assert(p.receive({...b,event:'started'}).ok);const until=item.until;assert(line.memoryCommitted);
 const memory=()=>g.viewerHistory.recall({platform:item.supporter.platform,viewerId:item.supporter.id,side:item.side,persona:item.persona,text:item.text,now:g.now()})[0].leaderReplied;
 assert.equal(memory(),line.text);assert(p.receive({...b,event:'started'}).ok);assert.equal(item.until,until);assert.equal(memory(),line.text);assert(p.receive({...b,event:'ended'}).ok);tickAudience(g);assert(!g.meta.audience.active.demon);
 }finally{g.close();}
});
test('unplayed audio expires without claiming a reply; paused late voice success/failure cannot publish',async()=>{
 for(const outcome of ['success','failure']){let now=100000;const g=new LiveGame({now:()=>now});try{enable(g,true);g.presentationRequired=true;activeReply(g);const line=g.world.speech.at(-1);let resolve;const pump=new VoicePump(),work=pump.pump(g,{request:()=>new Promise(r=>resolve=r)},new Map());g.world.paused=true;resolve(outcome==='success'?{ok:true,wav:wav()}:{ok:false});await work;assert(!line.memoryCommitted);assert.equal(g.meta.audience.active.demon.phase,'synthesizing');g.world.paused=false;const deadline=g.meta.audience.active.demon.deadline;assert(deadline<=100000+60000);now=deadline+1;tickAudience(g);assert(!g.meta.audience.active.demon);assert(!line.memoryCommitted);}finally{g.close();}}
});
test('an unpublished first segment is dropped on playback-start timeout and cannot be revived',()=>{
 const g=new LiveGame();try{enable(g,true);g.presentationRequired=true;activeReply(g);const line=g.world.speech.at(-1);voiceCompleted(g,line,{audioUrl:'/voice/ready',durationMs:5000});g.world.time+=15001;tickAudience(g);assert(!line.memoryCommitted);assert(!g.meta.audience.active.demon);assert.equal(g.meta.audience.history.at(-1).status,'unanswered');}finally{g.close();}
});
test('busy mode never cuts a clause or a trailing negation into a changed meaning',()=>{
 const g=new LiveGame();try{enable(g,true);for(let i=0;i<8;i++)chat(g,'pressure'+i);assert.deepEqual(audienceReplyParts(g,['先别过桥。等后面的盾兵和骑士全部跟上来了之后，再沿桥头的窄路一起走。']),['先别过桥。']);assert.deepEqual(audienceReplyParts(g,['你让我在前面那个很危险的桥口独自带领队伍去冲锋我绝对不会同意。']),[]);}finally{g.close();}
});
test('ready-audio buffering is global and bounded, while model drafts remain independent',async()=>{
 const g=new LiveGame();try{enable(g,true);activeReply(g);voiceCompleted(g,g.world.speech.at(-1),{audioUrl:'/voice/first',durationMs:10000});for(let i=0;i<3;i++){chat(g,'cache'+i);const c=begin(g);assert(g.applyDecision(c,decision(c),model));}let calls=0;const pump=new VoicePump(),audio=new Map(),broker={request:async()=>{calls++;return {ok:true,wav:wav()};}};await pump.pump(g,broker,audio);await pump.pump(g,broker,audio);assert.equal(calls,1);assert.equal(g.meta.audience.pending.filter(m=>m.preparedVoice).length,1);}finally{g.close();}
});
test('quiet bubbles end at a sentence boundary so new demand never abandons a dangling clause',()=>{
 const g=new LiveGame();try{enable(g,true);const parts=audienceReplyParts(g,['没细数。冬粮追回来后，我就一直守着白桥。']);assert.equal(parts.join(''),'没细数。冬粮追回来后，我就一直守着白桥。');assert(parts.every(s=>s.endsWith('。')));}finally{g.close();}
});
