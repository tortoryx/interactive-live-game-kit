import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {tickAudience} from '../modules/live-runtime/audience.mjs';
import {commandCampaign,updateCampaign} from '../modules/pixel-war/campaign.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {voiceSegments} from '../modules/live-runtime/speech-turn.mjs';
import {selectedLeaderSpeech} from '../modules/pixel-war/public/leader-speech.mjs';
import {voiceMemoryAdmission} from '../modules/local-voice/service.mjs';
const model='gpt-5.6-luna';
const models={enabled:true,authenticated:true,transport:'codex',hourCalls:0,hourLimitCalls:120,dayCalls:0,dayLimitCalls:600};

test('checkpoint serialization preserves the rollback image without a second full clone',()=>{
 const g=new LiveGame();try{
  g.testGift({side:'demon',reward:'rally'});g.drain();const before=g.capture();
  g.checkpoint();const disk=JSON.parse(g.db.prepare("SELECT value FROM kv WHERE key='checkpoint'").get().value);
  assert.deepEqual(disk,JSON.parse(JSON.stringify(before)));
  assert.throws(()=>g.atomic(()=>{g.world.heroes.demon.hp=1;g.meta.queue=[];throw Error('simulated_write_failure');}));
  assert.deepEqual(g.capture(),before);assert.deepEqual(JSON.parse(g.db.prepare("SELECT value FROM kv WHERE key='checkpoint'").get().value),disk);
 }finally{g.close();}
});

test('settlement keeps gifts queued without entering no-op deployment transactions',()=>{
 const g=new LiveGame();try{
  g.testGift({side:'demon',reward:'rally'});const before=structuredClone(g.meta.queue);
  g.world.mode='settlement';g.world.time=200;g.world.step=ms=>{g.world.time+=ms;};
  g.atomic=()=>assert.fail('settlement must not clone or start deployment transactions');
  g.step(50);assert.deepEqual(g.meta.queue,before);
 }finally{g.close();}
});

test('preloading never starves due strategy and waiting viewers retain first priority',()=>{
 const g=new LiveGame(),schedule=new DecisionSchedule();
 try{
  // Idle room still uses only preload; there is no invented audience.
  assert(nextModelWork(g,schedule,100000,models).pack);
  g.testGift({side:'demon',reward:'rally'});
  const work=nextModelWork(g,schedule,115000,models);
  assert.equal(work.pack,null);assert(work.side);
  g.runtime.modelEnabled=true;g.testChat({side:'human',text:'你是谁'});tickAudience(g);g.world.audienceWaiting={human:true};
  const reply=nextModelWork(g,schedule,116000,models);
  assert.equal(reply.side,'human');assert.equal(reply.pack,null);
 }finally{g.close();}
});

function wav(){const b=Buffer.alloc(44+48000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(48000,40);return b.toString('base64');}
test('voice warm-up retains the current reply and late audio after viewer withdrawal is discarded',async()=>{
 const g=new LiveGame(),pump=new VoicePump(),audio=new Map();
 try{
  g.runtime={modelEnabled:true,voiceEnabled:true};g.testChat({side:'demon',text:'你是谁'});tickAudience(g);const c=g.context('demon');
  assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'我是索恩，魔族这边由我来带队。你先看着，等我挡住他这一剑。',continuations:[],memory:'',replyTo:c.audience.selected.id,audienceAction:'none'},model));
  const line=g.world.speech.at(-1),parts=g.meta.audience.active.demon.parts;
  assert.equal(parts.join(''),'我是索恩，魔族这边由我来带队。你先看着，等我挡住他这一剑。');assert(parts.length>1);
  await pump.pump(g,{request:async()=>({ok:false,reason:'voice_warming'})},audio);
  assert.equal(line.audioMode,'synthesizing');assert(!pump.attempted.has(line.id));
  await pump.pump(g,{request:async()=>({ok:true,wav:wav()})},audio);
  assert.equal(line.audioMode,'full_read');assert(audio.has(line.audioUrl));
  g.world.time=line.until+1;tickAudience(g);const second=g.world.speech.at(-1);assert.notEqual(second.id,line.id);
  let resolve;const held=pump.pump(g,{request:()=>new Promise(r=>resolve=r)},audio);
  g.world.speech=g.world.speech.filter(s=>s!==second);delete g.meta.audience.active.demon;
  resolve({ok:true,wav:wav()});await held;assert.equal(audio.size,1);assert(!second.audioUrl);
 }finally{g.close();}
});

test('explicit leader defense advice executes through Luna and preserves a viewer troop command',()=>{
 const g=new LiveGame();try{g.runtime.modelEnabled=true;g.testGift({side:'demon',reward:'rally'});g.drain();
  const troop=g.world.units[0];troop.viewerOrder={kind:'attack',ownerId:troop.supporter.id,until:100000};
  g.testChat({side:'demon',text:'首领守粮仓'});tickAudience(g);const c=g.context('demon');assert.equal(c.audience.selected.advice,'defend_grain');
  assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'好，先守粮仓。',memory:'',replyTo:c.audience.selected.id,audienceAction:'defend_grain'},model));
  assert.equal(g.world.campaign.orders.demon.kind,'defend_grain');assert.equal(g.meta.lastCommand.demon.strategy,'defend_grain');updateCampaign(g.world,50);assert(!troop.defense);
 }finally{g.close();}
});

test('a long spoken line remains visible until audio ends, and current non-audience speech is selected',()=>{
 const g=new LiveGame();try{const h=g.world.heroes.demon;
  g.world.time=10000;g.world.speech=[{id:1,side:'demon',persona:h.id,model,text:'旧句',at:0,until:50000},{id:2,side:'demon',persona:h.id,model,text:'正在说的新句',at:500,until:18000}];
  assert.equal(selectedLeaderSpeech(g.snapshot(),'demon').id,2);
  assert.deepEqual(voiceSegments(['这是没有必要修改措辞的一句角色台词。另一句保留原文。']).join(''),'这是没有必要修改措辞的一句角色台词。另一句保留原文。');
 }finally{g.close();}
 assert(voiceMemoryAdmission(2,128*1024**2,true));assert(!voiceMemoryAdmission(2,128*1024**2,false));assert(!voiceMemoryAdmission(4,1024**3,true));assert(!voiceMemoryAdmission(1,32*1024**2,true));
});

test('real server pump applies commander strategy with an unfilled speech cache',async()=>{
 const calls=[];
 const broker={status:{models,voice:{enabled:false}},poll:async()=>{},request:async(path,c)=>{
  if(path!=='/decision')return {ok:true};calls.push(c);
  if(c.speechRequest)return {ok:true,model,decision:{requestId:c.speechRequest.id,lines:c.speechRequest.items.map(i=>({cue:i.cue,text:'测试台词',continuations:[]}))}};
  return {ok:true,model,decision:{strategy:'defend_grain',tactic:'hold',lane:0,speech:'',continuations:[],memory:''}};
 }};
 const app=await createPreview({stagePort:21930,controlPort:21931,clock:false,broker});
 try{
  app.game.testGift({side:'demon',reward:'rally'});app.game.drain();
  const own=app.world.units.find(u=>u.side==='demon');
  own.viewerOrder={kind:'attack',ownerId:own.supporter.id,until:100000};
  const deadline=Date.now()+3000;
  while(!app.game.meta.lastDecision.demon&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
  assert(calls[0]&&!calls[0].speechRequest,'strategy must precede the never-filled cache');
  assert.equal(app.world.campaign.orders.demon.kind,'defend_grain');
  assert.equal(app.world.campaign.orders.demon.source,'model');
  updateCampaign(app.world,50);
  assert(!own.defense,'a viewer-issued order remains authoritative');
  assert.equal(app.game.meta.modelActivity.sides.demon.state,'applied');
  assert.equal(app.game.meta.modelActivity.sides.demon.kind,'strategy');
 }finally{await app.close();}
});
