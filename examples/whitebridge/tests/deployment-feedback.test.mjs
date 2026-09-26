import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {deploymentFeedback,battleModeLabel,sparringProtected} from '../modules/pixel-war/public/deployment-feedback.mjs';
import {prepareSpeechRequest,applySpeechPack,tickLunaSpeech} from '../modules/pixel-war/luna-speech.mjs';
import {backgroundBudgetAvailable} from '../modules/live-runtime/decision-schedule.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';

test('three sentinels acknowledge actual arrival by receipt and retain the summoner identity',()=>{
 const g=new LiveGame();try{
  g.world.paused=true;
  const result=g.testGift({id:'test:deploy-confirm-0001',side:'demon',reward:'sentinel'});
  const request={id:result.id,count:3,label:'禁卫枪盾'};
  assert.equal(deploymentFeedback(g.snapshot(),request).done,false);
  assert.match(deploymentFeedback(g.snapshot(),request).text,/已暂停/);
  g.world.paused=false;
  g.drain();assert.equal(deploymentFeedback(g.snapshot(),request).done,false);
  for(let i=0;i<12;i++)g.step(50);
  const units=g.world.units.filter(u=>u.receipt===request.id);
  assert.equal(units.length,3);assert(units.every(u=>u.supporter?.id&&u.source==='test'));
  assert.match(deploymentFeedback(g.snapshot(),request).text,/已到场 3\/3/);
  assert.equal(deploymentFeedback(g.snapshot(),{...request,id:'test:another-receipt'}).done,false);
  assert.equal(g.world.mode,'test_live');
 }finally{g.close();}
});

test('sparring damage floor is visible; a player summon removes it without healing either leader',()=>{
 const g=new LiveGame();try{
  const w=g.world,h=w.heroes.human,d=w.heroes.demon;h.shield=0;
  w.resolveHit(d,h,1e6);assert.equal(h.hp,h.maxHP*.35);
  assert(sparringProtected(w,h));assert.match(battleModeLabel(w),/切磋/);
  const hp=h.hp;w.resolveHit(d,h,100);assert.equal(h.hp,hp);
  g.testGift({side:'demon',reward:'sentinel'});g.drain();
  assert.equal(h.hp,hp);assert(!sparringProtected(w,h));
  w.resolveHit(d,h,100);assert(h.hp<hp);assert.match(battleModeLabel(w),/正常伤害/);
  w.mode='settlement';assert.match(battleModeLabel(w),/暂停伤害/);
 }finally{g.close();}
});

test('receipt-backed first reinforcement reaction survives the reserved background ceiling',()=>{
 const g=new LiveGame();try{
  const w=g.world;for(const side of ['demon','human'])w.heroes[side].rank=1;
  w.lunaSpeech.pending=[];w.lunaSpeech.cache=[];
  const budget={dayCalls:300,dayLimitCalls:600};assert(!backgroundBudgetAvailable(budget));
  assert.equal(prepareSpeechRequest(w,100000,{openingOnly:true}),null);
  g.testGift({id:'test:urgent-help-00001',side:'demon',reward:'sentinel'});g.drain();
  const r=prepareSpeechRequest(w,110000,{openingOnly:true});assert(r);
  assert(r.items.every(i=>['help_accuse','help_boast'].includes(i.cue)));
  assert.equal(r.facts[0].facts.receipt,'test:urgent-help-00001');
  assert(applySpeechPack(w,r,{ok:true,model:'gpt-5.6-luna',decision:{requestId:r.id,lines:r.items.map(i=>({cue:i.cue,text:'测试：援军来了'}))}},110000));
  tickLunaSpeech(w);assert.equal(w.speech.at(-1).evidence.facts.receipt,'test:urgent-help-00001');
  assert.equal(w.speech.at(-1).model,'gpt-5.6-luna');
 }finally{g.close();}
});

test('deployment feedback module is available to the real control page',async()=>{
 const app=await createPreview({stagePort:19650,controlPort:19651,clock:false});
 try{const r=await fetch('http://127.0.0.1:19651/deployment-feedback.mjs');assert.equal(r.status,200);assert.match(await r.text(),/export function deploymentFeedback/);}finally{await app.close();}
});
