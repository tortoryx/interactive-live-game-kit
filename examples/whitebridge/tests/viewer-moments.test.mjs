import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {ViewerEvents,viewerFocus} from '../modules/pixel-war/public/viewer-events.mjs';
import {SummonCamera} from '../modules/pixel-war/public/summon-camera.mjs';
import {InteractionAudio} from '../modules/pixel-war/public/interaction-audio.mjs';
import {battleReading} from '../modules/live-runtime/battle-reading.mjs';

test('consecutive enlist and gift receipts are visible, deduplicated and tied to actual arrival',()=>{
 let now=100000;const g=new LiveGame({now:()=>now});try{const v=new ViewerEvents(),camera=new SummonCamera('human');v.update(g.snapshot(),0);camera.update(g.snapshot(),.05);
 const a=g.testChat({side:'demon',text:'参战',id:'test:notice-enlist-1'});let s=g.snapshot();assert.equal(s.viewerEvents.items.at(-1).kind,'recruit');assert.equal(v.update(s,1).length,1);assert.equal(v.update(s,2).length,0);assert.equal(camera.update(s,.05),null);
 g.drain();s=g.snapshot();assert.equal(camera.update(s,.05).receipt,a.id,'opposite-side viewer also receives camera focus');
 g.testChat({side:'demon',text:'参战',id:'test:notice-enlist-2'});const next=g.snapshot().viewerEvents.items.at(-1);assert.equal(next.kind,'recruit');assert.equal(next.spotlight,true);assert.equal(next.readyAt,null);assert.equal(next.detail,'1 名剑士 · 正在入场');
 g.testGift({side:'human',reward:'sentinel',id:'test:notice-gift-1'});g.testGift({side:'human',reward:'sentinel',id:'test:notice-gift-1'});assert.equal(g.snapshot().viewerEvents.items.filter(r=>r.id==='test:notice-gift-1').length,1);
 now+=21000;assert.equal(g.snapshot().viewerEvents.items.length,0);
 }finally{g.close();}
});
test('page bootstrap does not replay historical viewer sounds or camera; bursts remain bounded',()=>{
 const receipts=Array.from({length:40},(_,i)=>({id:'r'+i,at:100,until:20100,spotlight:true}));const s={fieldEpoch:1,time:100,viewerEvents:{clock:100,items:receipts},reinforcementShots:[],units:[],heroes:{}};const v=new ViewerEvents(),c=new SummonCamera('demon');assert.deepEqual(v.update(s,0),[]);assert.equal(c.update(s,.1),null);
 s.viewerEvents.items=receipts.map((r,i)=>({...r,id:'new'+i}));assert.equal(v.update(s,1).length,40);assert.equal(v.rows.length,3);v.update(s,6600);assert.equal(v.rows.length,0);
 s.reinforcementShots=Array.from({length:40},(_,i)=>({id:i+1,at:100,side:'human',x:100,y:100,units:[]}));c.update(s,.1);assert(c.queue.length<=4);s.time=20000;c.update(s,.1);assert.equal(c.queue.length,0);
});
test('paid event waits for real effect coordinates and queued receipt does not fake a focus',()=>{
 const g=new LiveGame();try{g.world.paused=true;const res=g.testGift({side:'demon',reward:'meteorstorm'}),row=g.snapshot().viewerEvents.items.at(-1);assert.equal(viewerFocus(g.snapshot(),row),null);g.world.paused=false;g.drain();const focus=viewerFocus(g.snapshot(),row);assert.equal(focus.receipt,res.id);assert.equal(focus.kind,'event');assert.equal(focus.units.length,0);}finally{g.close();}
});
test('commentary analysis describes objective stakes and exposed ranged units without using offscreen armies',()=>{
 const w={time:10000,heroes:{demon:{id:'d',side:'demon',x:0,y:0,hp:20,maxHP:100}},units:[{id:'r',side:'demon',kind:'cannon',x:30,y:0,hp:20,range:500},{id:'e',side:'human',x:60,y:0,hp:20,range:30},{id:'off',side:'human',x:9000,y:0,hp:50,range:30}],campaign:{sites:[{id:'grain',kind:'grain',controller:'demon',x:0,y:0,progress:9000,contested:true,presence:{human:4,demon:2}}]},reinforcementShots:[]};
 const r=battleReading(w,{x:0,y:0,w:1000,h:800},()=> '中央');assert(r.readings.some(x=>x.kind==='objective'&&x.advantage===2&&x.stakes.includes('援军')));assert(r.readings.some(x=>x.kind==='exposed_ranged'));assert.equal(r.readings.find(x=>x.kind==='leader_risk').enemiesNear,1);assert(!JSON.stringify(r).includes('off'));
});

test('queued cinematic targets cannot survive their real effect',()=>{
 const c=new SummonCamera('demon');const s={fieldEpoch:1,time:100,viewerEvents:{items:[]},reinforcementShots:[],units:[],heroes:{},warEvents:[]};c.update(s,.05);
 c.cooldown=2;s.viewerEvents.items=[{id:'spell',spotlight:true,side:'demon',supporter:{name:'viewer'}}];s.warEvents=[{receipt:'spell',x:300,y:300,until:200}];c.update(s,.05);assert.equal(c.queue.length,1);
 s.time=201;c.update(s,3);assert.equal(c.active,null);assert.equal(c.queue.length,0);
});
test('a gift cue preempts a recent quiet cue without allowing a major sound pile-up',()=>{
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}),node=()=>({gain:param(),frequency:param(),connect(){},disconnect(){},start(){},stop(){}});
 const ac={currentTime:1,createGain:node,createOscillator:node},s=new InteractionAudio(ac,node());assert(s.play('cooldown'));ac.currentTime=1.1;assert(s.play('gift'));ac.currentTime=1.2;assert(!s.play('gift'));assert(!s.play('chat'));assert.equal(s.played,2);s.close();
});
