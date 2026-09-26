import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {CombatEffects} from '../modules/pixel-war/public/effects.mjs';
import {TroopLifeEffects,LIFE_DETAIL_LIMIT} from '../modules/pixel-war/public/troop-life-fx.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {soundCue,soundPriority} from '../modules/pixel-war/public/audio-director.mjs';
import {CombatAudio} from '../modules/pixel-war/public/combat-audio.mjs';
const camera={zoom:.65,side:'demon',visible:()=>true};
function canvas(){const calls=[];return {calls,c:new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true})};}
function fixture(){const g=new LiveGame();g.world.paused=false;g.world.mode='test_live';g.testGift({side:'demon',reward:'scouts'});g.drain();return {g,w:g.world,u:g.world.units[0]};}
function event(i=1,type='death'){return {id:i,type,at:1000,kind:'shield',life:1,target:'u'+i,x:i%20*130,y:Math.floor(i/20)*130,side:'demon',scale:1,focus:{unitId:'u'+i,life:1,ownerId:'p'+i,side:'demon',color:'#89e3dc'}};}

test('actual death keeps victim owner and life through SSE; duplicate hits/frames do not create another blast',()=>{
 const {g,w,u}=fixture();try{w.time=1000;w.resolveHit(w.heroes.human,u,1e9);w.resolveHit(w.heroes.human,u,1e9);
 const snapshot=decodeFrame(encodeFrame(g.snapshot())),deaths=snapshot.events.filter(e=>e.type==='death');assert.equal(deaths.length,1);const e=deaths[0];assert.equal(e.focus.ownerId,u.supporter.id);assert.equal(e.focus.unitId,u.id);assert.equal(e.life,1);assert.equal(e.kind,u.kind);
 const fx=new CombatEffects();fx.consume(snapshot);fx.consume(snapshot);assert.equal(fx.life.events.length,1);assert.equal(fx.player.events.filter(e=>e.type==='death').length,0);
 const before=JSON.stringify(g.capture()),{c,calls}=canvas();for(const age of [80,250,600,1200])fx.life.draw(c,snapshot.units,1000+age,camera);assert(calls.some(c=>c[0]==='fillRect'));assert.equal(fx.life.stats.deaths,1);assert.equal(JSON.stringify(g.capture()),before,'drawing adds no damage, RNG or terrain changes');
 }finally{g.close();}
});
test('paid rescue only emits after deployment; restored identity, new life and machinery reach the renderer',()=>{
 const {g,w,u}=fixture();try{Object.assign(u,{kind:'dreadnought',machine:true,scale:3.2});w.time=1000;w.resolveHit(w.heroes.human,u,1e9);g.testGift({side:'demon',reward:'revive',quantity:2});
 const pop=w.population;w.population=()=>99999;g.drain();assert.equal(w.events.filter(e=>e.type==='revive').length,0);w.population=pop;w.deployed={human:[],demon:[]};w.time=3000;g.drain();
 const frame=decodeFrame(encodeFrame(g.snapshot())),es=frame.events.filter(e=>e.type==='revive');assert.equal(es.length,1);const e=es[0];assert.equal(e.target,u.id);assert.equal(e.life,2);assert.equal(e.focus.life,2);assert.equal(e.focus.ownerId,u.supporter.id);assert(e.machine);assert.equal(e.scale,3.2);assert.equal(e.kind,'dreadnought');
 assert.equal(soundCue(w.events.find(e=>e.type==='summon'&&e.revived)),null,'ordinary summon audio is not doubled');g.drain();assert.equal(w.events.filter(e=>e.type==='revive').length,1);
 }finally{g.close();}
});
test('moving resurrected troop carries its halo; another life with the same ID does not steal it',()=>{
 const fx=new TroopLifeEffects(),e=event(1,'revive');e.life=2;fx.add(e);const {c,calls}=canvas();fx.draw(c,[{id:e.target,life:2,hp:100,x:650,y:540}],1400,camera);assert.deepEqual(calls.find(c=>c[0]==='translate').slice(1),[650,540]);
 calls.length=0;fx.draw(c,[{id:e.target,life:3,hp:100,x:800,y:900}],1400,camera);assert.deepEqual(calls.find(c=>c[0]==='translate').slice(1),[e.x,e.y]);
});
test('dense deaths retain every viewer marker with bounded detail; offscreen and old effects do no drawing',()=>{
 const fx=new TroopLifeEffects();for(let i=0;i<400;i++)fx.add(event(i));for(let i=400;i<800;i++)fx.add({...event(i),focus:null});fx.prune(1200);const {c,calls}=canvas();fx.draw(c,[],1250,camera);
 assert.equal(fx.stats.owners.length,400);assert.equal(fx.stats.deaths,424);assert(fx.stats.detailed<=LIFE_DETAIL_LIMIT);assert(calls.length<13000,'crowd uses simple rings instead of hundreds of smoke emitters');
 calls.length=0;fx.draw(c,[],1250,{...camera,visible:()=>false});assert.equal(calls.length,0);fx.prune(4000);assert.equal(fx.events.length,0);fx.draw(c,[],4000,camera);assert.equal(fx.stats.visible,0);
});
test('revival charge, release and tail are distinct, future events and commander ceremonies stay untouched',()=>{
 const fx=new TroopLifeEffects(),e=event(1,'revive');fx.add(e);fx.add({...event(2),kind:'hero'});fx.add({...event(3),kind:'barracks'});assert.equal(fx.events.length,1);const {c,calls}=canvas();fx.draw(c,[],999,camera);assert.equal(calls.length,0);
 const phases=[];for(const t of [1100,1380,2100]){calls.length=0;fx.draw(c,[],t,camera);phases.push(JSON.stringify(calls));assert.equal(fx.stats.revives,1);}assert.equal(new Set(phases).size,3);fx.reset();assert.equal(fx.events.length,0);
});
function audioContext(){const starts=[],param=()=>({value:0}),node=()=>({gain:param(),pan:param(),playbackRate:param(),connect(){},disconnect(){},start(at){starts.push(at);},stop(){this.onended?.();}});return {currentTime:5,starts,destination:{},createBufferSource:node,createGain:node,createStereoPanner:node,decodeAudioData:async()=>({})};}
test('mass death/rescue gets one layered sound per type, steals ambient slots and cannot replay on repeated frames',async()=>{
 const previous=global.fetch;global.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});const ac=audioContext(),audio=new CombatAudio(ac,ac.destination);try{await audio.loads;
 for(let i=0;i<16;i++)audio.play('steel',{id:i,priority:0});const before=audio.played;const es=Array.from({length:80},(_,i)=>event(i,i%2?'death':'revive'));
 audio.effects(es,1000);assert.equal(audio.played-before,5);assert.equal(audio.active.length,16);assert(ac.starts.includes(5.3),'revive accent coincides with light release');assert(ac.starts.includes(5.025),'one delayed low body layer reinforces the impact without multiplying by crowd size');audio.effects(es,1001);assert.equal(audio.played-before,5);
 assert.equal(soundCue(event()),'crush');assert.equal(soundCue({...event(),machine:true}),'explosion');assert.equal(soundCue(event(1,'revive')),'summon');assert.equal(soundPriority(event()),4);
 audio.reset();const played=audio.played;audio.effects(es,2000);assert.equal(audio.played,played,'old events stay silent');
 }finally{audio.close();global.fetch=previous;}
});
