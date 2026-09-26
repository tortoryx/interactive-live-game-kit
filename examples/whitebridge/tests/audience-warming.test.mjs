import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {tickAudience,audienceState,nextAudiencePreparation,audienceModelStarted,replyAudience,voiceCompleted} from '../modules/live-runtime/audience.mjs';

function setup(){
 let now=100000;
 const game=new LiveGame({now:()=>now});
 game.world.paused=false;
 game.world.mode='test_live';
 game.runtime={model:'chatgpt-web/light',modelEnabled:false,modelReason:'electron_page_warming',voiceEnabled:false};
 return {game,advance(ms){now+=ms;game.world.time+=ms;tickAudience(game);}};
}
test('unsent viewer turn waits for a warming page, then becomes eligible exactly once',()=>{
 const {game:g,advance}=setup();try{
  const {id}=g.testChat({side:'demon',text:'你现在守哪条线？'});tickAudience(g);
  const item=audienceState(g).active.demon,deadline=item.deadline;
  assert.equal(item.phase,'waiting_model');assert.equal(nextAudiencePreparation(g),null);
  advance(24000);assert.equal(item.phase,'waiting_model');assert.equal(item.deadline,deadline);
  g.runtime.modelEnabled=true;g.runtime.modelReason=null;tickAudience(g);
  const ready=nextAudiencePreparation(g);assert.equal(ready.item.id,id);
  audienceModelStarted(g,ready.side,id);assert.equal(nextAudiencePreparation(g),null);
  assert.equal(item.deadline,g.now()+25000);const admittedDeadline=item.deadline;audienceModelStarted(g,ready.side,id);assert.equal(item.deadline,admittedDeadline);assert.equal(g.world.speech.length,0);
 }finally{g.close();}
});
test('warming never prolongs free or paid narration past its existing TTL',()=>{
 for(const paid of [false,true]){
  const {game:g,advance}=setup();try{
   g.receive({id:'bilibili:warming',kind:'chat',platform:'bilibili',actor:'viewer',side:'demon',text:'你是谁',at:g.now(),amountMilli:paid?100:0,supporter:{name:'测试'}});
   tickAudience(g);assert.equal(audienceState(g).active.demon.phase,'waiting_model');
   advance(paid?89999:29999);assert.equal(audienceState(g).active.demon.phase,'waiting_model');
   advance(2);assert(!audienceState(g).active.demon);assert.equal(audienceState(g).history.at(-1).status,'expired');
   g.runtime.modelEnabled=true;assert.equal(nextAudiencePreparation(g),null);
  }finally{g.close();}
 }
});
test('a real limit replaces transient warming with an honest unanswered receipt',()=>{
 const {game:g}=setup();try{
  g.testChat({side:'demon',text:'你是谁'});tickAudience(g);
  g.runtime.modelReason='subscription_call_limit';tickAudience(g);
  assert.equal(audienceState(g).active.demon.phase,'unanswered');
  assert.equal(audienceState(g).active.demon.fallbackReason,'subscription_call_limit');
  assert.equal(g.world.speech.length,0);
 }finally{g.close();}
});

 test('a fresh answer gets one bounded TTS window without extending unsent messages',()=>{
 const {game:g,advance}=setup();try{
  g.runtime.modelEnabled=true;g.runtime.voiceEnabled=true;g.testChat({side:'demon',text:'现在谁快撑不住了？'});tickAudience(g);
  const item=audienceState(g).active.demon;audienceModelStarted(g,'demon',item.id);const initial=item.deadline;advance(26000);
  assert(replyAudience(g,item.id,'人族前面那队已经残血了。',{model:'chatgpt-web/light'}));
  assert.equal(item.deadline,initial+30000);assert(item.deadline-item.receivedAt<=60000);
  const line=g.world.speech.find(x=>x.audienceId===item.id);advance(12000);
  assert(voiceCompleted(g,line,{audioUrl:'/voice/test.wav',durationMs:4500}));assert.equal(line.audioMode,'full_read');
  const fixed=item.deadline;advance(2000);assert.equal(item.deadline,fixed);
 }finally{g.close();}
});
