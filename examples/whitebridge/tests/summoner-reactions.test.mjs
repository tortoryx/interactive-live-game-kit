import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {collectSummonerReactions,arrivalContext} from '../modules/live-runtime/summoner-reactions.mjs';
import {audienceState,receiveChat,nextAudiencePreparation,selectedAudience,storePreparedReply,tickAudience} from '../modules/live-runtime/audience.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
const setup=(options={})=>{const g=new LiveGame({speechMode:'observer',...options});g.world.paused=false;g.runtime.modelEnabled=true;return g;};
const collect=g=>collectSummonerReactions(g,receiveChat);
const arrive=(g,id='test:arrival-1')=>{g.testGift({side:'demon',reward:'sentinel',id});g.drain();g.world.time+=1000;collect(g);return audienceState(g).pending.find(m=>m.eventNotice==='arrival');};

test('free enlist still deploys every message with visual feedback, but never queues narration',()=>{
 const g=setup();try{
  for(let n=0;n<12;n++){g.testChat({side:'demon',text:'参战',id:'test:enlist-'+n});g.drain();g.world.time+=1000;collect(g);}
  assert.equal(g.world.units.filter(u=>u.supporter).length,12);
  assert(g.snapshot().viewerEvents.items.length>0);
  assert.equal(audienceState(g).pending.length,0);assert.equal(nextAudiencePreparation(g),null);
  g.testChat({side:'demon',text:'这次该先退吗',id:'test:real-chat'});
  assert.equal(nextAudiencePreparation(g).item.id,'test:real-chat');
 }finally{g.close();}
});
test('normal viewer chat cannot invent arrival facts and is not coalesced with an arrival',()=>{
 for(const chatFirst of [true,false]){const g=setup();try{if(chatFirst)g.testChat({side:'demon',text:'我的军队到了，你看到了吗',id:'test:words'});const arrival=arrive(g);if(!chatFirst)g.testChat({side:'demon',text:'我的军队到了，你看到了吗',id:'test:words'});
 assert.equal(audienceState(g).pending.length,2);const first=nextAudiencePreparation(g);assert.equal(first.item.id,'test:words');assert.equal(selectedAudience(g,'demon',first.item).arrival,undefined);assert(arrival);
 }finally{g.close();}}
});
test('rapid repeated gift arrivals stay bounded without repeating each wave',()=>{
 const g=setup();try{for(let n=0;n<8;n++){g.testGift({side:'demon',reward:'sentinel',id:'test:gift-'+n});g.drain();g.world.time+=1000;collect(g);}
 assert.equal(audienceState(g).pending.filter(m=>m.eventNotice==='arrival').length,1);const last=audienceState(g).pending[0];assert.equal(last.id,'arrival:'+g.world.reinforcementShots.at(-1).receipt);assert.equal(last.arrival.paid,false);const count=audienceState(g).history.length;collect(g);assert.equal(audienceState(g).history.length,count);
 }finally{g.close();}
});
test('process recovery never renarrates historical arrivals, and field changes drop stale ones',()=>{
 const dir=mkdtempSync(join(tmpdir(),'stage-arrival-')),path=join(dir,'game.sqlite');let g=setup({path});try{arrive(g);g.meta.audience.pending=[];g.checkpoint();g.close();g=setup({path});collect(g);assert.equal(audienceState(g).pending.length,0);
 g.testGift({side:'demon',reward:'sentinel',id:'test:next-field'});g.drain();g.world.time+=1000;collect(g);const m=audienceState(g).pending[0];assert(m);g.world.fieldEpoch++;assert.equal(arrivalContext(g,m),null);nextAudiencePreparation(g);assert.equal(audienceState(g).pending.length,0);
 }finally{g.close();rmSync(dir,{recursive:true,force:true});}
});
test('arrival reply uses witch performer, no fabricated gift prefix, at most two speech parts',()=>{
 const g=setup({generatedSpeechOnly:false});try{arrive(g);const p=nextAudiencePreparation(g),c=g.context(p.side,{audience:p.item,prefetch:true});
 const request=modelRequest('luna-max',c);assert.match(request.input[0].content,/魔女解说/);assert.match(request.input[0].content,/免费参战不能谢礼/);assert.deepEqual(request.text.format.schema.properties.audienceAction.enum,['none']);
 const reply={strategy:'auto',tactic:'hold',lane:1,speech:'测试玩家，这队先别急着冲。',continuations:['让盾兵顶在他们前面。','别让他们白挨打。'],memory:'',replyTo:p.item.id,audienceAction:'none'};
 const decision=validateDecision(JSON.stringify(reply),c);assert(storePreparedReply(g,c,decision,'chatgpt-web/light'));tickAudience(g);const line=g.world.speech.at(-1);assert.equal(line.performer,'empress');assert.equal(line.spokenText,reply.speech);assert.equal(line.eventNotice,'arrival');assert.equal(line.segments,2);assert.equal(g.meta.lastCommand?.demon,undefined);
 }finally{g.close();}
});

test('arrival can wait behind one ambient turn but expires before becoming historical narration',()=>{
 let now=100000;const g=setup({now:()=>now});try{const m=arrive(g);now+=35000;g.world.time+=35000;assert.equal(nextAudiencePreparation(g).item.id,m.id);now+=11000;g.world.time+=11000;assert.equal(nextAudiencePreparation(g),null);assert.equal(audienceState(g).pending.length,0);}finally{g.close();}
});

test('repeated free enlist cannot reserve the commentator or starve ambient generation',async()=>{
 const {receiveView}=await import('../modules/live-runtime/show-observer.mjs');
 const g=setup();try{
  const w=g.world,now=Date.now();g.testChat({side:'demon',text:'参战'});
  receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900},now);
  assert(nextModelWork(g,new DecisionSchedule(),now,{}).pack.commentary);
 }finally{g.close();}
});

test('healers are described as support, never frontline fighters',()=>{
 const g=setup();try{const m=arrive(g);m.arrival.kind='healer';assert.equal(arrivalContext(g,m).role,'治疗支援');}finally{g.close();}
});

test('an admitted chat near queue expiry can finish generation, without renewing on retries',async()=>{
 const {audienceModelStarted}=await import('../modules/live-runtime/audience.mjs');let now=100000;const g=setup({now:()=>now});try{
 g.testChat({side:'demon',text:'我的盾兵先护住后排吗',id:'test:late-start'});tickAudience(g);now+=26000;g.world.time+=26000;
 const item=audienceState(g).active.demon,c=g.context('demon');audienceModelStarted(g,'demon',item.id);const deadline=item.deadline;
 now+=12000;g.world.time+=12000;assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'先护住后排，别让他们贴到弓手。',continuations:[],memory:'',replyTo:item.id,audienceAction:'none'},'chatgpt-web/light'));
 audienceModelStarted(g,'demon',item.id);assert.equal(item.deadline,deadline);assert(item.deadline-item.receivedAt<=60000);
 }finally{g.close();}
});

test('saved free arrival backlog is dropped, while gift reactions and real questions survive',async()=>{
 const {pruneAudienceQueue}=await import('../modules/live-runtime/audience.mjs');const g=setup();try{
  const gift=arrive(g),a=audienceState(g),old={...gift,id:'arrival:old-free',arrival:{...gift.arrival,trigger:undefined,gift:null,paid:false}};
  a.pending.push(old);a.active.human={...old,id:'arrival:old-active',side:'human'};
  g.world.speech.push({id:99,audienceId:'arrival:old-active'});
  g.testChat({side:'demon',text:'你觉得这队应该撤吗',id:'test:question'});pruneAudienceQueue(g);
  assert.deepEqual(a.pending.map(m=>m.id),[gift.id,'test:question']);assert.equal(a.active.human,undefined);
  assert(!g.world.speech.some(l=>l.audienceId==='arrival:old-active'));
 }finally{g.close();}
});
