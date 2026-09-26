import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {encounterTargets,launchDisaster,updateEncounters} from '../modules/pixel-war/encounters.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {BARRIERS,TERRAIN,CELL,COLS,gridTerrain} from '../modules/pixel-war/public/terrain.mjs';
import {battlefieldLabels,labelSlot,overlaps} from '../modules/pixel-war/public/label-layout.mjs';
import {CombatEffects} from '../modules/pixel-war/public/effects.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';

test('protected demonstration hits produce no damage labels or impact particles; large impacts survive ordinary hit floods',()=>{
 const fx=new CombatEffects();fx.consume({time:0,events:[{id:1,type:'hit',at:0,protected:true,target:'hero',amount:0},{id:2,type:'meteor',at:0,x:0,y:0,radius:185}]});assert.equal(fx.numbers.length,0);assert.equal(fx.particles.length,0);assert.equal(fx.heavy.length,1);
 fx.consume({time:1200,events:Array.from({length:180},(_,i)=>({id:i+3,type:'hit',amount:10,at:1200,target:'unit'+i}))});assert.equal(fx.heavy.length,1);assert(fx.numbers.length<=40);assert(fx.particles.length<=90);fx.consume({time:2301,events:[]});assert.equal(fx.heavy.length,0);
});
test('dense actor silhouettes never overlap placed name cards, including commanders',()=>{
 const w=new PixelWorld(),camera=new Camera('demon');camera.x=2048;camera.y=1152;const units=[];
 for(let i=0;i<180;i++)units.push({...w.heroes.demon,id:'body'+i,kind:i%29===0?'colossus':'militia',rank:0,scale:i%29===0?2.5:1,x:1740+i%18*32,y:1040+Math.floor(i/18)*30});
 Object.assign(w.heroes.demon,{x:1900,y:1120});Object.assign(w.heroes.human,{x:2240,y:1120});units.push(...Object.values(w.heroes));const layout=battlefieldLabels(units,camera);
 for(const box of layout.commanders.values())assert(!layout.bodies.some(body=>overlaps(box,body)));
 for(const u of units){const p=camera.project(u),slot=labelSlot({x:p.x,y:p.y-55},90,18,layout.occupied,camera.screenW,camera.screenH);if(slot){assert(!layout.bodies.some(body=>overlaps(slot,body)));layout.occupied.push(slot);}}
 // A fully packed formation has no safe adjacent card slot; compact on-actor HP remains.
 const sparse=battlefieldLabels(Object.values(w.heroes),camera);assert.equal(sparse.commanders.size,2);
});
test('blast destroys solid barricades and scars roads without turning water into land; changes persist',()=>{
 const g=new LiveGame();try{const w=g.world,p=BARRIERS[0];assert(!w.open(p.x,p.y));const cells=w.breakGround(p,185,600,'demon');assert(cells.some(c=>c.original===TERRAIN.BARRIER));assert(w.open(p.x,p.y));const saved=g.capture();g.restore(saved);assert(g.world.open(p.x,p.y));
 const road={x:1776,y:1168};assert.equal(gridTerrain(Math.floor(road.x/CELL),Math.floor(road.y/CELL)),TERRAIN.ROAD);const keys=w.breakGround(road,185,600,'demon');const crater=keys.find(c=>c.original===TERRAIN.ROAD);assert(crater);assert.equal(w.terrainChanges[crater.key].kind,TERRAIN.ROAD);assert(w.terrainChanges[crater.key].blast.r>100);assert(w.open(road.x,road.y));
 assert(!w.open(2048,956));w.breakGround({x:2048,y:956},185,600);assert(!w.open(2048,956));assert(Object.keys(w.terrainChanges).length<=512);
 }finally{g.close();}
});
test('lightning chains to distinct enemies beyond the first circle, bounded to eight and never to allies',()=>{
 const w=new PixelWorld(),units=Array.from({length:12},(_,i)=>w.fighter('human','shield',UNITS.shield,1400+i*100,1152)),friend=w.fighter('demon','shield',UNITS.shield,1450,1152),h={id:100,kind:'volley',side:'demon',x:1400,y:1152,radius:135,impact:0,until:2000};w.hazards=[h];w.mode='test_live';
 const chosen=encounterTargets(h,[...units,friend]);assert.equal(chosen.length,8);assert.equal(new Set(chosen.map(u=>u.id)).size,8);assert(chosen.at(-1).x>h.x+h.radius);const hits=[];updateEncounters(w,[...units,friend],hits);assert.equal(hits.length,8);assert.equal(w.events.find(e=>e.type==='volley').arcs.length,8);for(const hit of hits)w.resolveHit(...hit);assert.equal(friend.hp,friend.maxHP);const again=[];updateEncounters(w,[...units,friend],again);assert.equal(again.length,0);
});
test('meteor telegraph causes a substantial real impact and corresponding persistent ground change',()=>{
 const w=new PixelWorld();w.mode='test_live';const hero=w.heroes.demon;Object.assign(hero,{x:1776,y:1168});launchDisaster(w,'meteor',hero);w.time=2600;const hits=[];updateEncounters(w,[hero],hits);for(const hit of hits)w.resolveHit(...hit);assert(hero.maxHP-hero.hp>400);assert(w.events.some(e=>e.type==='meteor'&&e.radius===185));assert(Object.keys(w.terrainChanges).length>10);
});
test('event-driven planning is fair, waits through transitions, and does not reuse twenty-second-old orders',()=>{
 const g=new LiveGame();try{const w=g.world,s=new DecisionSchedule();assert.equal(s.take(w,100000),'demon');assert.equal(s.take(w,109999),null);assert.equal(s.take(w,110000),'human');assert.equal(s.take(w,120000),null);w.heroes.demon.hp-=2000;assert.equal(s.take(w,120001),null);assert.equal(s.take(w,145001),'demon');w.mode='settlement';assert.equal(s.take(w,200000),null);w.mode='sparring';const c=g.context('demon');w.time+=20001;assert(!g.applyDecision(c,{tactic:'advance',lane:1,speech:'上！',memory:''},'fixture'));}finally{g.close();}
});
test('hundreds of soldiers are summarized within the model context byte limit',()=>{
 const g=new LiveGame({audienceDriven:false});try{const w=g.world;for(let i=0;i<320;i++)w.units.push({...w.units[i%10],id:'crowd'+i});const c=g.context('demon');assert(Buffer.byteLength(JSON.stringify(c))<6500);assert(c.units.length<70);assert.equal(c.units.reduce((n,g)=>n+g.count,0),w.units.filter(u=>u.hp>0).length);assert('distance' in c.enemy);}finally{g.close();}
});

test('long-running demonstrations recycle cosmetic scars without resurrecting broken obstacles',()=>{
 const w=new PixelWorld();w.breakGround(BARRIERS[0],185,600);const barrierKey=Math.floor(BARRIERS[0].y/CELL)*COLS+Math.floor(BARRIERS[0].x/CELL),saved=w.terrainChanges[barrierKey];
 for(let key=0;Object.keys(w.terrainChanges).length<512;key++)if(!w.terrainChanges[key])w.terrainChanges[key]={kind:TERRAIN.ROAD,original:TERRAIN.ROAD,at:0};
 w.time=50000;const hit=w.breakGround({x:2500,y:1680},185,600);assert(hit.length>0);assert(Object.keys(w.terrainChanges).length<=512);assert.deepEqual(w.terrainChanges[barrierKey],saved);assert(w.open(BARRIERS[0].x,BARRIERS[0].y));
});

test('short stalls are caught up in bounded batches instead of permanently slowing the battle',async()=>{
 const {SimulationClock}=await import('../modules/live-runtime/simulation-clock.mjs'),g={world:{speed:1,paused:false},time:0,step(ms){this.time+=ms;}},clock=new SimulationClock(g,0);
 clock.advance(350);assert.equal(g.time,250);clock.advance(375);clock.advance(400);assert.equal(g.time,400);
 clock.advance(1400);assert.equal(g.time,650);for(const t of [1425,1450,1475,1500])clock.advance(t);assert.equal(g.time,1500);
 clock.advance(300000);assert.equal(g.time,1750);assert.equal(clock.pending,0);g.world.paused=true;clock.advance(300400);g.world.paused=false;clock.advance(300450);assert.equal(g.time,1800);
});

test('commander range migration removes the free range advantage without resetting wounds or lineage',()=>{
 const g=new LiveGame();try{const saved=g.capture();delete saved.world.heroStatsRevision;saved.world.heroes.human.range=310;saved.world.heroes.demon.range=235;saved.world.heroes.demon.hp-=500;saved.world.heroes.human.rank=10;const id=saved.world.heroes.human.id,points=saved.meta.points;g.restore(saved);assert.equal(g.world.heroes.human.range,275);assert.equal(g.world.heroes.demon.range,275);assert.equal(g.world.heroes.demon.hp,g.world.heroes.demon.maxHP-500);assert.equal(g.world.heroes.human.rank,10);assert.equal(g.world.heroes.human.id,id);assert.deepEqual(g.meta.points,points);}finally{g.close();}
});
