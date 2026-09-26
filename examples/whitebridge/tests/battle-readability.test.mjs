import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {CELL,COLS,ROWS,TERRAIN,gridTerrain,passable,clearSegment} from '../modules/pixel-war/public/terrain.mjs';
import {battlefieldThreats} from '../modules/pixel-war/public/threats.mjs';
import {launchDisaster,updateEncounters} from '../modules/pixel-war/encounters.mjs';
import {frontX} from '../modules/pixel-war/campaign.mjs';
import {commanderPlan,escortGoal} from '../modules/pixel-war/strategy.mjs';
import {readFile} from 'node:fs/promises';
import {LINES} from '../modules/pixel-war/narration.mjs';

test('three minutes of the audience opening keeps commanders trading blows with bounded weak background armies',()=>{
 const g=new LiveGame(),w=g.world,counts={demon:0,human:0};try{for(let i=0;i<3600;i++){g.step(50);for(const side of ['demon','human']){const h=w.heroes[side],enemy=w.heroes[side==='human'?'demon':'human'];if(h.action?.started===w.time&&h.action.target===enemy.id)counts[side]++;}}
 assert(counts.demon>=25&&counts.human>=25,JSON.stringify(counts));assert(w.heroes.human.hp<9000&&w.heroes.demon.hp<9000);assert(w.units.some(u=>u.kind==='levy'));assert(w.units.every(u=>u.kind==='levy'&&!u.supporter?.id));assert(w.units.filter(u=>u.hp>0).length<=120);
 }finally{g.close();}
});
test('a healthy commander accepts combat; a critically wounded commander still retreats',()=>{
 const w=new PixelWorld(),h=w.heroes.demon,r=w.heroes.human;Object.assign(h,w.ground({x:frontX(w)-100,y:896}));Object.assign(r,{x:h.x+200,y:h.y});const enemies=[r,...Array.from({length:4},()=>w.fighter('human','militia',UNITS.militia,h.x+50,h.y))];assert.equal(commanderPlan(w,h,enemies,[]).order,'duel');h.hp=h.maxHP*.15;assert.equal(commanderPlan(w,h,enemies,[]).order,'retreat');
});
test('only clustered enemy forces get army threats; giants have an independent icon and dead units vanish',()=>{
 const w=new PixelWorld();w.units=Array.from({length:7},(_,i)=>w.fighter('human','shield',UNITS.shield,1800+i*17,896));w.units.push(w.fighter('human','colossus',UNITS.colossus,2400,420));let t=battlefieldThreats(w.snapshot(),'demon');assert(t.some(v=>v.kind==='army'&&v.count===7&&v.label==='重装集群'));assert(t.some(v=>v.kind==='giant'));assert.equal(battlefieldThreats(w.snapshot(),'human').length,0);for(const u of w.units)u.hp=0;assert.equal(battlefieldThreats(w.snapshot(),'demon').length,0);
});
test('meteor removes an actual blocked tile; navigation, persistence and reset agree on the new terrain',()=>{
 const g=new LiveGame(),w=g.world,other=new PixelWorld();try{let tile;for(let row=5;row<ROWS-5&&!tile;row++)for(let col=5;col<COLS-5;col++)if(gridTerrain(col,row)===TERRAIN.TREE&&passable((col-1)*CELL+16,row*CELL+16)&&passable((col+1)*CELL+16,row*CELL+16)){tile={x:col*CELL+16,y:row*CELL+16};break;}assert(tile);assert(!w.open(tile.x,tile.y));assert(launchDisaster(w,'meteor',tile));const hazard=w.hazards.at(-1);Object.assign(hazard,tile);w.time=2600;updateEncounters(w,[],[]);assert(w.open(tile.x,tile.y));assert(!other.open(tile.x,tile.y));const start={x:tile.x-32,y:tile.y},end={x:tile.x+32,y:tile.y};assert(!clearSegment(start,end));assert(clearSegment(start,end,w.terrainChanges));const path=w.nav.plan(start,end);assert.deepEqual(path,[end]);const saved=g.capture();w.resumeSparring();assert(!w.open(tile.x,tile.y));g.restore(saved);assert(w.open(tile.x,tile.y));assert.deepEqual(w.nav.plan(start,end),[end]);assert(Object.keys(w.snapshot().terrainChanges).length>0);const n=Object.keys(w.terrainChanges).length;w.breakGround({x:2048,y:956},60,500);assert.equal(w.open(2048,956),false);assert(Object.keys(w.terrainChanges).length>=n);}finally{g.close();}
});
test('free audience orders change troop goals, expire, and cannot spam or mutate outside gameplay',()=>{
 const w=new PixelWorld(),u=w.units.find(u=>u.side==='human');assert(w.audienceCommand('human','challenge'));assert(!w.audienceCommand('human','guard'));const goal=escortGoal(w,u);assert(Math.abs(goal.x-w.heroes.demon.x)<120);w.time+=12001;assert(w.audienceCommand('human','guard'));assert(Math.abs(escortGoal(w,u).x-w.heroes.human.x)<100);assert(!w.audienceCommand('human','exec'));w.paused=true;w.time+=12001;assert(!w.audienceCommand('human','challenge'));
});
test('battle voice manifest matches every event line; reactions are contextual and rate limited',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../modules/pixel-war/public/audio/battle-manifest.json',import.meta.url)));for(const [key,line] of Object.entries(LINES)){assert.equal(manifest[key].text,line.text);assert(manifest[key].duration>(key.endsWith('TroopAttack')?.25:1)&&manifest[key].duration<(key.endsWith('TroopAttack')?2:12));const wav=await readFile(new URL('../modules/pixel-war/public/audio/'+key+'.wav',import.meta.url));assert.equal(wav.toString('ascii',0,4),'RIFF');}const w=new PixelWorld();assert(w.react('human','Support'));assert(!w.react('human','Support'));assert.equal(w.speech.at(-1).event,'Support');w.time+=25000;assert(w.react('human','Support'));
});
