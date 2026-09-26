import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {chooseObserverTopic,observerSpoken} from '../modules/live-runtime/observer-topics.mjs';
import {receiveView,prepareObserver,applyObserver,tickObserver} from '../modules/live-runtime/show-observer.mjs';
import {debatePresentation,HOST_ID} from '../modules/live-runtime/show-debate.mjs';
import {audienceState,tickAudience,voiceCompleted,audiencePresentation,receiveChat,withdrawAudience} from '../modules/live-runtime/audience.mjs';
import {collectSummonerReactions} from '../modules/live-runtime/summoner-reactions.mjs';
import {modelRequest} from '../modules/live-runtime/models.mjs';

const risk=hp=>({analysis:{arrivals:[],readings:[{id:'demon-1',kind:'leader_risk',hpPercent:hp,guardsNear:1,enemiesNear:2,shield:0}]}});
const view=w=>({side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900});
const decision=(id,speech)=>({strategy:'auto',tactic:'hold',lane:1,speech,continuations:[],memory:'',replyTo:id,audienceAction:'none'});

test('half an hour of unchanged low health never restarts the same report; tiny health jitter is ignored',()=>{
 const w={fieldEpoch:1};assert.equal(chooseObserverTopic(w,risk(30),100000).kind,'battle');
 for(let n=1;n<=120;n++)assert.notEqual(chooseObserverTopic(w,risk(n%2?29:31),100000+n*18000)?.kind,'battle');
 // The baseline survives a JSON checkpoint, rather than depending on a timer.
 const restored=JSON.parse(JSON.stringify(w));
 assert.notEqual(chooseObserverTopic(restored,risk(30),2400000)?.kind,'battle');
 const critical=chooseObserverTopic(restored,risk(7),2420000);assert.equal(critical.kind,'battle');
 assert.equal(critical.previousReading.hpPercent,30);assert.equal(critical.reading.hpPercent,7);
 assert.equal(chooseObserverTopic(restored,risk(22),2440000).kind,'battle','real recovery is also new information');
});

test('a stationary objective is not news again after cooldown; changing hands is news',()=>{
 const w={fieldEpoch:1},scene={analysis:{arrivals:[],readings:[{id:'forge',kind:'objective',controller:'human',attacker:'demon',capturePercent:20,advantage:1}]}};
 assert.equal(chooseObserverTopic(w,scene,0).kind,'battle');
 assert.notEqual(chooseObserverTopic(w,scene,1000000)?.kind,'battle');
 Object.assign(scene.analysis.readings[0],{controller:'demon',attacker:'human',capturePercent:0,advantage:-1});
 assert.equal(chooseObserverTopic(w,scene,1020000).kind,'battle');
});

test('idle subject rotation changes the angle and never manufactures a viewer message',()=>{
 const w={},scene={analysis:{arrivals:[],readings:[]}},seen=new Map();
 for(let n=0;n<22;n++){
  const topic=chooseObserverTopic(w,scene,n*18000);if(!topic)continue;
  if(seen.has(topic.key))assert.notEqual(topic.angle,seen.get(topic.key));
  seen.set(topic.key,topic.angle);assert.equal(topic.arrival,undefined);
 }
 assert.equal(seen.size,6);
});

test('an actual enlisted army gets visual feedback without either form of arrival narration',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;g.runtime.modelEnabled=true;
  g.testChat({side:'demon',text:'参战',id:'test:single-arrival'});g.drain();w.time+=1000;
  collectSummonerReactions(g,receiveChat);assert.equal(audienceState(g).pending.filter(m=>m.eventNotice==='arrival').length,0);
  const shot=w.reinforcementShots.at(-1),now=Date.now();
  receiveView(w,{...view(w),x:shot.x,y:shot.y},now);const request=prepareObserver(w,now);
  assert(request);assert.notEqual(request.topic.kind,'arrival');assert.deepEqual(request.scene.analysis.arrivals,[]);
 }finally{g.close();}
});

test('viewer text is remembered across commentary only after publication, and enters the next real reply prompt',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;g.runtime.modelEnabled=true;g.runtime.voiceEnabled=true;g.presentationRequired=true;
  const chat=g.testChat({side:'demon',text:'你怎么一直念血量'});tickAudience(g);const c=g.context('demon');
  audienceState(g).active.demon.messageId='test:message-to-withdraw';
  assert(g.applyDecision(c,decision(chat.id,'行，刚才那几句确实念叨过头了。'),'deepseek-flash'));
  const line=w.speech.at(-1);assert.deepEqual(observerSpoken(w),[]);
  voiceCompleted(g,line,{audioUrl:'/voice/fixture.wav',durationMs:5000});assert.deepEqual(observerSpoken(w),[]);
  const receipt={id:line.id,field:w.fieldEpoch,persona:line.persona,event:'started'};
  assert(audiencePresentation(g,receipt));assert(audiencePresentation(g,receipt));assert.deepEqual(observerSpoken(w),[line.text]);
  const now=Date.now();receiveView(w,view(w),now);const request=prepareObserver(w,now);assert(request.previous.includes(line.text));
  assert.equal(applyObserver(w,request,{ok:true,model:'deepseek-flash',decision:{requestId:request.id,lines:[{text:line.text,emotion:'dry'}]}},now),false,'ambient must not parrot its just-published answer');
  const body=modelRequest('deepseek-flash',g.context('demon'));
  assert(JSON.parse(body.messages[1].content).commentator.recentSpoken.includes(line.text));
  withdrawAudience(g,['test:message-to-withdraw']);assert.deepEqual(observerSpoken(w),[],'withdrawn audience replies cannot remain in the host continuity cache');
 }finally{g.close();}
});

test('ambient generation alone is not spoken memory; actual playback is remembered once across leader changes',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;const now=Date.now();receiveView(w,view(w),now);const request=prepareObserver(w,now);
  const text='这两家收粮倒是挺有默契。';
  assert(applyObserver(w,request,{ok:true,model:'deepseek-flash',decision:{requestId:request.id,lines:[{text,emotion:'dry'}]}},now));
  assert.deepEqual(observerSpoken(w),[]);
  Object.assign(w.showDebate.observerQueue[0],{audioMode:'full_read',audioDuration:4000});tickObserver(w);
  const line=w.speech.at(-1),receipt={id:line.id,field:w.fieldEpoch,persona:HOST_ID,event:'started'};
  assert(debatePresentation(g,receipt));assert(debatePresentation(g,receipt));assert.deepEqual(observerSpoken(w),[text]);
  w.heroes.demon.id+='next';assert.deepEqual(g.context('demon').commentator.recentSpoken,[text]);
 }finally{g.close();}
});
