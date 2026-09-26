import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {WAR_INCANTATIONS,BILI_GIFT_ROSTER,BILI_QUICK_GIFTS} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {quickGiftRows} from '../modules/pixel-war/public/gift-legend.mjs';
import {PLATFORM_GIFTS} from '../modules/live-runtime/gift-catalog.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
import {SummonCamera} from '../modules/pixel-war/public/summon-camera.mjs';

test('four eight-character incantations reach distinct real events, and cooldown expires at exactly 30 seconds after restore',()=>{
 assert.equal(WAR_INCANTATIONS.length,4);
 for(const [i,spell] of WAR_INCANTATIONS.entries()){
  assert.equal([...spell.text].length,8);
  let now=1800000000000;const g=new LiveGame({now:()=>now});try{
   const r=g.testChat({side:'demon',text:spell.text,id:'test:spell'});assert.equal(r.status,'event_queued');assert.equal(g.meta.queue[0].key,spell.key);assert(g.testChat({side:'demon',text:spell.text,id:'test:spell'}).duplicate);
   g.drain();assert.equal(g.meta.queue.length,0);g.restore(g.capture());now+=29999;
   const waiting=g.testChat({side:'human',text:WAR_INCANTATIONS[(i+1)%4].text});assert.equal(waiting.status,'event_cooldown');assert.equal(waiting.interaction.remainingMs,1);
   now++;assert.equal(g.testChat({side:'human',text:spell.text}).status,'event_queued');
   const rules=g.context('demon').interactionRules;assert.match(rules.events.rule,/每人30秒/);assert.match(rules.giftBudget,/30元/);assert.equal(rules.giftTroops.length,6);
  }finally{g.close();}
 }
});
test('shared spell protection still throttles different viewers without claiming a 60-second wait',()=>{
 let now=1800000000000;const g=new LiveGame({now:()=>now});try{
  g.testChat({side:'demon',viewer:'owner-test',text:WAR_INCANTATIONS[0].text});g.drain();now+=1000;
  const r=g.testChat({side:'demon',viewer:'viewer-b',text:WAR_INCANTATIONS[1].text});assert.equal(r.interaction.remainingMs,19000);
  now+=19000;assert.equal(g.testChat({side:'demon',viewer:'viewer-b',text:WAR_INCANTATIONS[1].text}).status,'event_queued');
 }finally{g.close();}
});
test('six-gift guide uses affordable verified replacements if a preferred gift is absent, never inventing room items',()=>{
 const rows=BILI_GIFT_ROSTER.map(r=>PLATFORM_GIFTS.bilibili.find(g=>g.name===r.name&&g.coinType==='gold'));
 const all=quickGiftRows([...rows,...rows]);assert.deepEqual(all.map(g=>g.name),BILI_QUICK_GIFTS);
 const supplied=rows.filter(g=>g.name!=='情书'),partial=quickGiftRows(supplied);assert.equal(partial.length,6);assert(partial.every(g=>supplied.includes(g)&&g.price<=30000));assert.equal(new Set(partial.map(g=>g.name)).size,6);
 assert.equal(quickGiftRows(rows.filter(g=>g.price>30000)).length,0);
});
test('summon plus event from the same receipt receives one highlight, distinct viewers retain theirs',()=>{
 const g=new LiveGame();try{const s=g.snapshot(),c=new SummonCamera('demon');c.update(s,.03);
 s.time=100;s.reinforcementShots=[{id:1,receipt:'gift:one',side:'demon',at:100,x:10000,y:900,units:[]}];
 s.viewerEvents={items:[{id:'gift:one',side:'demon',spotlight:true,supporter:{name:'fixture'}}]};s.warEvents=[{id:99,receipt:'gift:one',x:10300,y:900,at:100,until:20000}];
 assert.equal(c.update(s,.03).receipt,'gift:one');assert.equal(c.queue.length,0);
 s.reinforcementShots.push({id:2,receipt:'gift:two',side:'demon',at:100,x:10200,y:900,units:[]});c.update(s,.03);assert.equal(c.queue.length,1);assert.equal(c.queue[0].receipt,'gift:two');
 }finally{g.close();}
});
test('rapid opposing event targets preserve continuous pan, cap speed and ignore long background-frame gaps',()=>{
 const g=new LiveGame();try{const s=g.snapshot(),c=new Camera('demon');c.follow(s,1/60);const origin={x:c.x,y:c.y};let focus=null;c.summons.update=()=>focus;
 let old={x:c.x,y:c.y,z:c.zoom},vx=0,vy=0,maxStep=0,maxAcceleration=0;
 for(let i=0;i<1080;i++){
  const dt=1/60;s.time+=dt*1000;if(i<600)focus={x:origin.x+(Math.floor(i/90)%2?-3500:3500),y:origin.y+(Math.floor(i/90)%2?500:-500),blend:1};else focus=null;
  c.follow(s,dt);const step=Math.hypot(c.x-old.x,c.y-old.y)*c.zoom;maxStep=Math.max(maxStep,step);assert(step<=190*dt*1.03,`pan step ${step}`);assert(Math.abs(c.zoom-old.z)<.01);
  const nx=(c.x-old.x)*c.zoom/dt,ny=(c.y-old.y)*c.zoom/dt;maxAcceleration=Math.max(maxAcceleration,Math.hypot(nx-vx,ny-vy)/dt);vx=nx;vy=ny;old={x:c.x,y:c.y,z:c.zoom};
 }
 assert(maxStep>1);assert(maxAcceleration<1200,`abrupt acceleration ${maxAcceleration}`);assert(Math.hypot(c.x-origin.x,c.y-origin.y)*c.zoom<4);
 focus={x:origin.x+8000,y:origin.y,blend:1};const before={x:c.x,y:c.y,z:c.zoom};c.follow(s,20);assert(Math.hypot(c.x-before.x,c.y-before.y)*c.zoom<10);assert(Math.abs(c.zoom-before.z)<.01);
 }finally{g.close();}
});
test('real summon and event schedulers do not replay a gift event after its highlight or a preempted shot',()=>{
 const g=new LiveGame();try{const s=g.snapshot(),c=new Camera('demon');c.follow(s,1/30);const origin={x:c.x,y:c.y};
 s.time=100;s.warEvents=[{id:'earlier',kind:'meteor',x:origin.x+200,y:origin.y,at:100,until:40000}];c.follow(s,1/30);assert.equal(c.shot,'event');
 s.time=200;s.reinforcementShots=[{id:1,receipt:'gift:once',side:'demon',at:200,x:origin.x+700,y:origin.y,units:[]}];s.viewerEvents={items:[{id:'gift:once',side:'demon',spotlight:true,supporter:{name:'fixture'}}]};s.warEvents.push({id:'gift-event',receipt:'gift:once',kind:'meteor',x:origin.x+700,y:origin.y,at:200,until:40000});
 let highlights=0,previous='event';for(let i=0;i<720;i++){s.time=200+i*1000/30;c.follow(s,1/30);if(c.shot==='reinforcement'&&previous!=='reinforcement')highlights++;if(i>300)assert.equal(c.shot,'overview');previous=c.shot;}
 assert.equal(highlights,1);assert(Math.abs(c.zoom-.425)<.001);
 }finally{g.close();}
});
