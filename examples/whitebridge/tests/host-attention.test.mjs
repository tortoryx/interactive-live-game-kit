import test from 'node:test';import assert from 'node:assert/strict';
import {hostAttention} from '../modules/pixel-war/public/empress/attention.mjs';
import {HostPerformance} from '../modules/pixel-war/public/empress/performance.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {receiveView,prepareObserver,applyObserver,validateObserver} from '../modules/live-runtime/show-observer.mjs';
const camera={x:1000,y:500,w:1000,h:600};
test('viewer replies override battle gaze; invalid and offscreen focus do not point at invented targets',()=>{
 assert.equal(hostAttention({id:1,audienceId:'viewer',attention:{kind:'battle',x:600,y:400}},camera).kind,'viewer');
 const battle=hostAttention({id:2,attention:{kind:'battle',x:600,y:400}},camera);assert.equal(battle.kind,'battle');assert(battle.gaze.x<-.5);
 for(const x of [Infinity,NaN,9000])assert.equal(hostAttention({id:2,attention:{kind:'battle',x,y:400}},camera).kind,'idle');
});
test('short reactions and full natural sentences reach one voice passage with authoritative target focus',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;const h=w.heroes.demon;
  receiveView(w,{side:'demon',field:w.fieldEpoch,x:h.x,y:h.y,w:1400,h:900});const r=prepareObserver(w,Date.now());
  r.topic={kind:'battle',reading:{kind:'leader_risk',id:h.id}};
  const text='后面那几个总算跟上来了，我刚才还以为前面这队要白挨一顿，这下至少有人能接住他们。';
  assert(text.length>32);assert(applyObserver(w,r,{ok:true,model:'deepseek-flash',decision:{requestId:r.id,lines:[{text,emotion:'focused'}]}},Date.now()));
  const l=w.showDebate.observerQueue[0];assert.equal(l.text,text);assert.deepEqual(l.attention,{kind:'battle',x:h.x,y:h.y});
  assert.doesNotThrow(()=>validateObserver(JSON.stringify({requestId:r.id,lines:[{text:'真敢啊。',emotion:'amused'}]}),{speechRequest:r}));
 }finally{g.close();}
});
test('stopped audio closes the mouth and steady sound does not cause periodic nodding',()=>{
 const h=new HostPerformance({random:()=>.5});let accents=new Set();
 for(let t=0;t<5000;t+=33){h.frame(t,{talking:true,level:.08,attention:'viewer',turnKey:'same'});accents.add(h.accentAt);}
 assert.equal(accents.size,1);
 for(let t=5000;t<6000;t+=33)h.frame(t,{talking:false,level:.08,attention:'viewer',turnKey:'same'});
 assert(h.pose.mouth<.01);assert.equal(h.gesture,'observe');
});

test('actual avatar wiring uses audible media only, and points viewer replies at the viewer',async()=>{
 const {Empress}=await import('../modules/pixel-war/public/empress/empress.mjs');
 const host=Object.create(Empress.prototype),written={};host.performance=new HostPerformance({random:()=>.5});host.root={dataset:{}};host.camera=camera;
 host.model={internalModel:{coreModel:{setParameterValueById:(id,value)=>{written[id]=value;}}}};
 const current={show:true,line:{id:3,performer:'empress',audienceId:'viewer'},audio:{subtitle:false,paused:false,ended:false},node:{level:()=>.1}};
 host.sound={playback:{active:[current]}};host.pose();assert.equal(host.talking,true);assert.equal(host.attention,'viewer');assert(written.ParamMouthOpenY>0);
 current.audio.paused=true;host.pose();assert.equal(host.talking,false);
 current.audio.paused=false;current.audio.subtitle=true;host.pose();assert.equal(host.talking,false);
});
