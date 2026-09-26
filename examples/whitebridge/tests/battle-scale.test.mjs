import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {SpatialGrid} from '../modules/pixel-war/public/spatial.mjs';
import {UNITS,POP_CAP,rawDamage} from '../modules/pixel-war/public/catalog.mjs';
import {WIDTH,HEIGHT,CAMPS,passable,COLS} from '../modules/pixel-war/public/terrain.mjs';
import {battleScene,CINEMATIC} from '../modules/pixel-war/public/cinematic.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {supporterGuides,guideSlots} from '../modules/pixel-war/public/supporter-guides.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
import {migrateWorld} from '../modules/pixel-war/migrate.mjs';
const advance=(g,ms)=>{for(let n=0;n<ms;n+=50)g.step(50);};

test('spatial broad phase finds the same neighbours and collision pairs as a full scan',()=>{
 const units=Array.from({length:256},(_,i)=>({id:i,x:400+(i*71)%901,y:300+(i*173)%787,side:i%2?'human':'demon',hp:i%17?100:0})),grid=new SpatialGrid(units);
 for(const p of units.filter((u,i)=>i%17===0))for(const r of [56,215,460])assert.deepEqual(grid.near(p,r,'human').map(u=>u.id).sort((a,b)=>a-b),units.filter(u=>u.hp>0&&u.side==='human'&&(u.x-p.x)**2+(u.y-p.y)**2<r*r).map(u=>u.id));
 const actual=[],expected=[];grid.pairs(56,(a,b)=>actual.push(a.id+':'+b.id));for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){const a=units[i],b=units[j];if(a.hp>0&&b.hp>0&&(a.x-b.x)**2+(a.y-b.y)**2<56**2)expected.push(a.id+':'+b.id);}assert.deepEqual(actual.sort(),expected.sort());
});
test('gift troops materialize beside the moving commander with owner identity, never in a castle or hazard',()=>{
 const g=new LiveGame();try{const w=g.world,h=w.heroes.demon;Object.assign(h,{x:1800,y:1152});g.testGift({side:'demon',reward:'rally',quantity:1,id:'test:near-king'});advance(g,250);const u=w.units.find(u=>u.receipt==='test:near-king');assert(u);assert(Math.hypot(u.x-h.x,u.y-h.y)<=180);assert(Math.hypot(u.x-CAMPS.demon.x,u.y-CAMPS.demon.y)>500);assert(passable(u.x,u.y,w.terrainChanges));assert.equal(u.exitGoal,null);assert.equal(u.source,'test');assert.equal(u.supporter.name,'本机试玩');assert.equal(u.supporter.avatarKey,null);assert.equal(u.summonedAt,w.time);assert(w.events.some(e=>e.type==='summon'&&e.target===u.id&&e.source==='test'));}finally{g.close();}
});
test('system troops leave capacity for audience reinforcements; every new role has distinct combat behaviour',()=>{
 const w=new PixelWorld();w.units=[];while(w.spawn('demon','militia',1,true)){}assert.equal(w.population('demon'),POP_CAP);assert(!w.spawn('demon','militia',1,true));w.units=w.units.slice(0,128);w.deployed.demon=[];assert(!w.spawn('demon','militia'));const viewer={source:'test',receipt:'test:reserve',supporter:{name:'本机试玩',platform:'test'}};assert(w.spawn('demon','militia',1,false,viewer));
 assert.equal(Object.keys(UNITS).length,22);assert(UNITS.ranger.range>UNITS.bow.range);assert(UNITS.berserker.splash&&UNITS.berserker.crit>UNITS.militia.crit);assert.equal(UNITS.sentinel.equipment.offhand,'shield');const target={armor:80,equipment:{}};assert(rawDamage({...UNITS.ranger,kind:'ranger'},target)>rawDamage({...UNITS.ranger,kind:'bow'},target));
});
test('defeat has timed shots, one identity handoff across restore, and gift queue waits until the complete ceremony ends',()=>{
 const g=new LiveGame();try{const w=g.world;w.mode='test_live';w.heroes.demon.hp=0;const old=w.heroes.demon.id,winner=w.heroes.human.id;w.step(50);assert.equal(battleScene(w.snapshot()).phase,'fall');assert.equal(w.resumeSparring(),false);assert.equal(w.mode,'settlement');const start=w.time;advance(g,w.result.timing.fall);assert.equal(battleScene(w.snapshot()).phase,'execution');g.testGift({side:'demon',reward:'longbow',id:'test:after-arrival'});const saved=g.capture();g.restore(saved);advance(g,w.result.timing.handoff-w.result.timing.fall);assert.equal(battleScene(w.snapshot()).phase,'arrival');assert.notEqual(w.heroes.demon.id,old);assert.equal(w.heroes.demon.rank,1);assert.equal(w.heroes.human.id,winner);assert.equal(g.meta.queue[0].remaining,3);const elder=w.heroes.demon.id;g.restore(g.capture());advance(g,w.result.timing.end-w.result.timing.handoff+250);assert.equal(w.heroes.demon.id,elder);assert.equal(w.heroes.demon.rank,1);assert.equal(w.wins.human,1);assert(w.units.some(u=>u.receipt==='test:after-arrival'));assert(w.time>=start+w.result.timing.end);}finally{g.close();}
});
test('expanded map migration shifts aliased objects once and preserves wounds, dynasty and damaged cells',()=>{
 const u={id:'same-persona',x:900,y:896,hp:3210,path:[{x:920,y:896}]},s={heroes:{demon:u},units:[],missiles:[{x:1200,y:896,source:u}],ranks:{demon:4},terrainChanges:{[20*96+40]:{kind:8,original:7}},fieldEpoch:5};migrateWorld(s);assert.equal(u.x,9604);assert.equal(u.y,1152);assert.equal(u.hp,3210);assert.equal(s.ranks.demon,4);assert.equal(s.missiles[0].source,u);assert(s.terrainChanges[(20+8)*COLS+40+16+256]);assert.equal(s.fieldEpoch,7);migrateWorld(s);assert.equal(u.x,9604);assert.equal(WIDTH,20480);assert.equal(HEIGHT,2304);
});
test('compact stream preserves equipment, action timing, viewer avatar and accurate positions',()=>{
 const w=new PixelWorld();w.spawn('demon','ranger',1,false,{source:'test',receipt:'test:wire',supporter:{id:'owner-id',name:'试玩',platform:'test',avatarKey:null}});const s=w.snapshot(),wire=encodeFrame(s),restored=decodeFrame(JSON.parse(JSON.stringify(wire)));assert.equal(restored.units.length,s.units.length);for(let i=0;i<s.units.length;i++){const a=s.units[i],b=restored.units[i];assert(Math.abs(a.x-b.x)<=.051&&Math.abs(a.y-b.y)<=.051);assert.deepEqual(a.equipment,b.equipment);assert.deepEqual(a.action,b.action);assert.equal(a.maxHP,b.maxHP);}const viewer=restored.units.find(u=>u.source==='test');assert.equal(viewer.supporter.id,'owner-id');assert.equal(viewer.supporter.avatarKey,null);assert.equal(viewer.summonedAt,0);assert(JSON.stringify(wire).length<JSON.stringify(s).length*.65);
});
test('offscreen viewer groups retain every unit, show the correct directions and fit a crowded perimeter',()=>{
 const camera=new Camera('demon');camera.x=2048;camera.y=1152;const units=Array.from({length:160},(_,i)=>{const a=i*Math.PI*2/160;return {id:'unit-'+i,side:'demon',hp:100,x:camera.x+Math.cos(a)*1800,y:camera.y+Math.sin(a)*1200,supporter:{id:'viewer-'+i,name:'测试'+i,platform:'test'}};});const groups=supporterGuides(units,camera,'demon');assert.equal(groups.length,160);assert.equal(new Set(groups.flatMap(g=>g.ids)).size,160);for(const g of groups)assert(Math.abs(g.angle-Math.atan2(g.y-camera.y,g.x-camera.x))<.001);const placed=guideSlots(groups,960,540,[{x:0,y:0,w:300,h:130},{x:755,y:385,w:205,h:155}]);assert.equal(placed.length,160);for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i],b=placed[j];assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));}units[0].x=camera.x;units[0].y=camera.y;units[1].hp=0;assert.equal(supporterGuides(units,camera,'demon').length,158);assert.equal(supporterGuides(units,camera,'human').length,0);
});

test('dense labels merge only nearby squads of the same viewer and retain every member identity',async()=>{
 const {viewerSquads}=await import('../modules/pixel-war/public/supporter-guides.mjs');const units=Array.from({length:120},(_,i)=>({id:'u'+i,x:100+(i%10)*10,y:100+Math.floor(i/10)*5,side:'demon',supporter:{id:'viewer'+i%12,name:'fixture',platform:'test'}}));const groups=viewerSquads(units);assert.equal(groups.length,12);assert.equal(new Set(groups.flatMap(g=>g.units.map(u=>u.id))).size,120);for(const g of groups)assert.equal(new Set(g.units.map(u=>u.supporter.id)).size,1);const far={...units[0],id:'far',x:2000};units.push(far);assert.equal(viewerSquads(units).length,13);
});
