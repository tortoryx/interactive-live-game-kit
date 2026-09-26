import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {beginSettlement} from '../modules/pixel-war/settlement.mjs';
import {CINEMATIC,battleScene} from '../modules/pixel-war/public/cinematic.mjs';
import {combatIdentity} from '../modules/pixel-war/honors.mjs';
import {launchWildlife,updateWildlife} from '../modules/pixel-war/wildlife.mjs';
import {damageObject,igniteObjects,updateObjects,nearbyObjects,tryChop} from '../modules/pixel-war/objects.mjs';
import {CELL,COLS,TERRAIN,gridTerrain,scenery} from '../modules/pixel-war/public/terrain.mjs';
import {visibleScenery} from '../modules/pixel-war/public/destructible-view.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {battlefieldThreats} from '../modules/pixel-war/public/threats.mjs';
const step=(g,ms)=>{for(let t=0;t<ms;t+=50)g.step(50);};
const owner=(id)=>({source:'test',receipt:'test:'+id,supporter:{id,name:'模拟'+id,platform:'test',avatarKey:null}});

test('elder handoff preserves winner wounds, shield, army, terrain and remaining attack timers across restore',()=>{
 const g=new LiveGame();try{const w=g.world;w.mode='test_live';const winner=w.heroes.demon,old=w.heroes.human;winner.hp=2345;winner.shield=79;winner.readyAt=w.time+1600;const missile={id:'pending',x:1600,y:1100,born:w.time,until:w.time+3500,source:winner,target:old.id};w.missiles.push(missile);const originalUnits=w.units.map(u=>u.id),epoch=w.fieldEpoch;w.breakGround({x:1808,y:1072},120,300);const damage=JSON.stringify(w.terrainChanges);old.hp=0;beginSettlement(w,['human']);const health=winner.hp;step(g,1500);g.restore(g.capture());step(g,w.result.timing.handoff-1500);
 assert.equal(w.mode,'settlement');assert.equal(w.heroes.demon.id,winner.id);assert.equal(w.heroes.demon.hp,health);assert.equal(w.heroes.demon.shield,79);assert.equal(w.heroes.demon.readyAt-w.time,1600);assert.equal(w.missiles[0].until-w.time,3500);assert.equal(w.fieldEpoch,epoch);assert.equal(JSON.stringify(w.terrainChanges),damage);assert.deepEqual(w.units.map(u=>u.id),originalUnits);assert.notEqual(w.heroes.human.id,old.id);assert.equal(w.heroes.human.rank,1);assert.equal(w.heroes.human.hp,w.heroes.human.maxHP);assert(Math.hypot(w.heroes.human.x-old.x,w.heroes.human.y-old.y)<220);assert.equal(battleScene(w.snapshot()).phase,'arrival');
 const elder=w.heroes.human.id;g.restore(g.capture());step(g,50);assert.equal(w.heroes.human.id,elder);assert.equal(w.wins.demon,1);step(g,w.result.timing.end-w.result.timing.handoff-50);assert.equal(w.mode,'test_live');assert.equal(w.heroes.demon.hp,health);w.resolveHit(null,w.heroes.demon,999999);assert.equal(w.heroes.demon.hp,0,'winner remains mortal below the old training floor');
 }finally{g.close();}
});
test('awards aggregate actual damage across a viewer squad, ignore overkill and identify the authoritative finisher',()=>{
 const w=new PixelWorld();w.mode='test_live';w.spawn('demon','militia',1,true,owner('甲'));w.spawn('demon','bow',1,true,owner('甲'));w.spawn('demon','mage',1,true,owner('乙'));const [a,b,c]=w.units.slice(-3),victim=w.heroes.human;victim.hp=1000;
 w.resolveHit(a,victim,400);w.resolveHit(b,victim,300);w.resolveHit(c,victim,5000);w.resolveHit(c,victim,5000);beginSettlement(w,['human']);const h=w.result.honors;assert.equal(h.leaders.length,2);assert.equal(h.leaders[0].name,'模拟甲');assert.equal(h.leaders[0].damage,700);assert.equal(h.leaders[1].damage,300);assert.equal(h.finisher.name,'模拟乙');assert.equal(h.finisher.unitId,c.id);assert.equal(h.leaders[1].kills,1);assert.equal(h.participants,2);
});
test('neutral or system killing blow is credited honestly without inventing audience MVPs',()=>{
 for(const style of ['meteor','fire']){const w=new PixelWorld();w.mode='live';w.heroes.demon.hp=8;w.resolveHit(null,w.heroes.demon,100,false,style);beginSettlement(w,['demon']);assert.equal(w.result.honors.leaders.length,0);assert.equal(w.result.honors.finisher,null);}
 const w=new PixelWorld();assert.equal(combatIdentity(w.units[0]).viewer,false);
});
test('neutral beasts select both factions by proximity, deal real area damage, and are bounded and visible on both maps',()=>{
 const w=new PixelWorld();w.units=[];assert(launchWildlife(w));assert(launchWildlife(w));assert(!launchWildlife(w));assert.equal(w.wildlife.length,6);const u=w.wildlife[0];w.heroes.demon.x=u.x-50;w.heroes.demon.y=u.y;w.heroes.human.x=u.x+90;w.heroes.human.y=u.y;u.nextRoar=1e9;u.readyAt=1e9;updateWildlife(w,u,Object.values(w.heroes),.05);assert.equal(u.targetId,w.heroes.demon.id);w.heroes.demon.x=u.x-250;updateWildlife(w,u,Object.values(w.heroes),.05);assert.equal(u.targetId,w.heroes.human.id);
 for(const h of Object.values(w.heroes)){h.hp=h.maxHP;const hp=h.hp;w.resolveHit(u,h,120);assert(h.hp<hp);}assert.deepEqual(Object.keys(w.damageTotals).sort(),['demon','human']);assert(Object.values(w.damageTotals).every(Number.isFinite));
 const wire=decodeFrame(JSON.parse(JSON.stringify(encodeFrame(w.snapshot()))));assert.equal(wire.wildlife.length,6);assert(wire.wildlife.every(x=>x.side==='neutral'));for(const s of ['demon','human'])assert(battlefieldThreats(w.snapshot(),s).some(t=>t.kind==='beast'));
});
test('trees take several weapon hits then fall, leave a persistent stump and open their collision cell',()=>{
 const w=new PixelWorld(),o=scenery().find(o=>o.type==='tree'),key=Math.floor(o.y/CELL)*COLS+Math.floor(o.x/CELL),actor=w.units.find(u=>u.kind==='militia');assert.equal(w.open(o.x,o.y),false);assert(damageObject(w,key,60,actor));assert.equal(w.objectDamage[key].hp,120);assert.equal(w.open(o.x,o.y),false);damageObject(w,key,120,actor);assert.equal(w.terrainChanges[key].cause,'chop');assert.equal(w.open(o.x,o.y),true);const land={changes:w.terrainChanges};assert(visibleScenery(land,{...o,kind:'tree'},w.time+800));assert(!visibleScenery(land,{...o,kind:'tree'},w.time+2400));assert(w.terrainChanges[key]);
});
test('fire telegraphs on intact wood, burns both armies, spreads once and leaves charred collision-free remains',()=>{
 const w=new PixelWorld(),o=scenery().find(o=>o.type==='tree'),key=Math.floor(o.y/CELL)*COLS+Math.floor(o.x/CELL);assert(igniteObjects(w,o,20));assert.equal(w.open(o.x,o.y),false);const fire=w.objectDamage[key];const targets=Object.values(w.heroes);for(const h of targets){h.x=o.x+8;h.y=o.y;}
 w.time=900;const hits=[];updateObjects(w,targets,hits);assert.equal(hits.length,2);assert(hits.every(h=>h[4]==='fire'));w.time=4900;updateObjects(w,targets,[]);assert.equal(w.terrainChanges[key].cause,'burn');assert.equal(w.open(o.x,o.y),true);assert(Object.values(w.objectDamage).filter(o=>o.burnUntil>w.time).length<=24);
});
test('ordinary infantry clear an obstructing tree using the attack contact clock',()=>{
 const w=new PixelWorld(),o=scenery().find(o=>o.type==='tree'&&w.open(o.x-55,o.y)),u=w.units.find(u=>u.kind==='militia');Object.assign(u,{x:o.x-55,y:o.y,readyAt:0});assert(tryChop(w,u,{x:o.x+100,y:o.y}));const key=u.action.sceneryKey;assert.equal(w.objectDamage[key],undefined);w.time=u.action.contactAt;w.tickActions([u]);assert(w.objectDamage[key]?.hp<180);
});
