import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {tickAudience,audienceState,audienceModelStarted,audienceModelFailed} from '../modules/live-runtime/audience.mjs';
import {hasRecentAudience,relationshipRecords} from '../modules/live-runtime/relationships.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {connectionLabel,replyReceipt} from '../modules/pixel-war/public/reply-status.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';

const blocked={enabled:true,transport:'codex',authenticated:true,state:'ready',dayCalls:600,dayLimitCalls:600,hourCalls:0,hourLimitCalls:120};
function chat(g,text,side='demon'){const r=g.testChat({side,text});tickAudience(g);return {id:r.id,item:audienceState(g).active[side],receipt:()=>replyReceipt(g.snapshot(),r.id)};}

test('identity and mission questions remain unanswered when Luna is unavailable; no canned impersonation',()=>{
 for(const side of ['demon','human'])for(const text of ['你是谁','你在做什么']){const g=new LiveGame();try{
  g.runtime.modelReason='subscription_call_limit';const q=chat(g,text,side);
  assert.equal(q.item.phase,'unanswered');assert.equal(q.receipt().kind,'unanswered');assert.equal(q.item.reaction,null);assert.equal(g.world.speech.length,0);
 }finally{g.close();}}
});
test('unknown offline chat stays unanswered; later context keeps the real words with no invented reply',()=>{
 const g=new LiveGame();try{g.runtime.modelReason='subscription_call_limit';const count=g.world.speech.length,q=chat(g,'你觉得宇宙有没有边界');assert.equal(q.item.phase,'unanswered');assert.equal(q.receipt().kind,'unanswered');assert.equal(g.world.speech.length,count);
  const r=relationshipRecords(g,'demon')[0];assert.equal(r.replies,0);assert.equal(r.exchanges.at(-1).reply,null);
  g.world.time=q.item.until+1;tickAudience(g);assert.equal(audienceState(g).history.at(-1).status,'unanswered');assert.equal(q.receipt().kind,'unanswered');
 }finally{g.close();}
});
test('actual model success, timeout and stale results have distinct per-message receipts',()=>{
 for(const outcome of ['success','timeout','stale']){const g=new LiveGame();try{
  g.runtime.modelEnabled=true;const q=chat(g,'你是谁'),c=g.context('demon');assert.equal(q.receipt().kind,'waiting');audienceModelStarted(g,'demon',q.id);assert.match(q.receipt().text,/正在读/);
  if(outcome==='success'){assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'索恩。正忙着，你先说。',memory:'',replyTo:q.id,audienceAction:'none'},'gpt-5.6-luna'));assert.equal(q.receipt().kind,'model');assert.equal(q.item.fallbackReason,null);}
  else {if(outcome==='stale')g.meta.epoch++;assert(!g.applyDecision({...c,epoch:-1},{},'gpt-5.6-luna'));audienceModelFailed(g,'demon',q.id,outcome==='stale'?'stale_decision':'timeout_or_cancelled');tickAudience(g);assert.equal(q.receipt().kind,'unanswered');assert.equal(g.world.speech.length,0);}
 }finally{g.close();}}
});
test('logged in and historically successful never labels a blocked model as available',()=>{
 const label=connectionLabel({connections:{models:{...blocked,calls:336}},readiness:{ai:{connected:true,available:false,reason:'subscription_call_limit'}}});assert(label.text.startsWith('AI 暂停'));assert.equal(label.tone,'paused');
});
test('reserving the final call does not replace an inflight Luna reply with local text',()=>{
 const g=new LiveGame();try{g.runtime.modelEnabled=true;const q=chat(g,'你是谁'),c=g.context('demon');audienceModelStarted(g,'demon',q.id);g.runtime.modelEnabled=false;g.runtime.modelReason='subscription_call_limit';g.world.time+=1000;tickAudience(g);assert.equal(q.item.phase,'waiting_model');assert.equal(q.receipt().kind,'waiting');assert(!g.world.speech.some(s=>s.audienceId===q.id));assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'索恩，魔族这边带队的。',memory:'',replyTo:q.id,audienceAction:'none'},'gpt-5.6-luna'));assert.equal(q.receipt().kind,'model');assert.equal(q.item.fallbackReason,null);}finally{g.close();}
});
test('no recent activity spends no background calls; arriving chat wins over an ancient opponent turn',()=>{
 let now=1_000_000;const g=new LiveGame({now:()=>now}),s=new DecisionSchedule();try{
  for(let i=0;i<120;i++)assert.equal(s.take(g.world,now+i*10000,{background:hasRecentAudience(g)}),null);
  g.runtime.modelEnabled=true;chat(g,'你是谁');g.world.audienceWaiting={demon:true,human:false};s.last={demon:now-12000,human:0};assert(hasRecentAudience(g));assert.equal(s.take(g.world,now,{background:true,models:{dayCalls:599,dayLimitCalls:600}}),'demon');
  g.testGift({side:'demon',reward:'rally'});g.drain();assert(g.world.units.some(u=>u.supporter?.id));now+=300001;assert(!hasRecentAudience(g));
 }finally{g.close();}
});
test('background cannot take the half of the allowance reserved for replies; audience cadence remains enforced',()=>{
 const g=new LiveGame();try{const s=new DecisionSchedule(),m={hourCalls:60,hourLimitCalls:120,dayCalls:80,dayLimitCalls:600};assert.equal(s.take(g.world,100000,{background:true,models:m}),null);g.world.audienceWaiting={human:true};assert.equal(s.take(g.world,100000,{background:false,models:m}),'human');assert.equal(s.take(g.world,100001,{background:true,models:m}),null);
 }finally{g.close();}
});
test('HTTP owner chat truthfully acknowledges blocking and never reaches the model broker',async()=>{
 let calls=0;const broker={status:{models:blocked,voice:{enabled:false}},poll:async()=>{},request:async(path)=>{if(path==='/decision')calls++;return {ok:true};}};
 const app=await createPreview({speechMode:'dual',stagePort:19786,controlPort:19787,clock:false,broker});try{
  await new Promise(r=>setTimeout(r,1100));const base='http://127.0.0.1:19787',html=await(await fetch(base)).text(),token=html.match(/name="owner-token" content="([^"]+)"/)[1];
  const response=await fetch(base+'/owner/chat',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify({id:'test:http-identity',side:'demon',text:'你是谁'})});assert.equal(response.status,200);const result=await response.json();assert.equal(result.replyCapability.available,false);assert.equal(result.replyCapability.reason,'subscription_call_limit');app.game.step(50);
  const state=await(await fetch(base+'/state')).json();assert.equal(replyReceipt(state,result.id).kind,'unanswered');assert.equal(state.audience.active.demon.reaction,null);assert.equal(calls,0);assert.equal((await fetch(base+'/reply-status.mjs')).status,200);
 }finally{await app.close();}
});
test('production preloads in the background and replies immediately after actual chat, using a mocked Luna transport',async()=>{
 let calls=[];const broker={status:{models:{...blocked,dayCalls:0},voice:{enabled:false}},poll:async()=>{},request:async(path,c)=>{if(path==='/decision'){calls.push(c);return c.speechRequest?{ok:true,model:'gpt-5.6-luna',decision:{requestId:c.speechRequest.id,lines:c.speechRequest.items.map(i=>({cue:i.cue,text:'测试生成句'}))}}:{ok:true,model:'gpt-5.6-luna',decision:{strategy:'auto',tactic:'hold',lane:1,speech:'索恩，我在这儿。',memory:'',replyTo:c.audience?.selected?.id,audienceAction:'none'}};}return {ok:true};}};
 const app=await createPreview({speechMode:'dual',stagePort:19686,controlPort:19687,clock:false,broker});try{
  await new Promise(r=>setTimeout(r,1250));assert(calls[0].speechRequest);const r=app.game.testChat({side:'demon',text:'你是谁'});app.game.step(50);const at=Date.now();
  while(!app.world.speech.some(s=>s.audienceId===r.id)&&Date.now()-at<1000)await new Promise(r=>setTimeout(r,25));
  assert.equal(calls.length,2);assert.equal(calls[1].audience.selected.text,'你是谁');assert(!calls[1].speechRequest);assert.equal(app.world.speech.at(-1).audienceId,r.id);assert.equal(app.world.speech.at(-1).model,'gpt-5.6-luna');
 }finally{await app.close();}
});
