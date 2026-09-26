import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {UNITS,rawDamage} from '../modules/pixel-war/public/catalog.mjs';
import {awardKill,refreshProgress} from '../modules/pixel-war/progression.mjs';
import {rememberFallen,reviveIdentity} from '../modules/pixel-war/viewer-troops.mjs';
import {SpatialGrid} from '../modules/pixel-war/public/spatial.mjs';
import {releaseProjectiles,projectileImpact} from '../modules/pixel-war/ordnance.mjs';
import {ensureFieldProps,lightBarrels,updateFieldProps} from '../modules/pixel-war/field-props.mjs';
import {collectPickup,usefulPickup} from '../modules/pixel-war/encounters.mjs';
import {BARRIERS} from '../modules/pixel-war/public/terrain.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {ViewRhythm,battleMapBox} from '../modules/pixel-war/public/view-rhythm.mjs';
import {tileColor} from '../modules/pixel-war/public/terrain-renderer.mjs';
import {bodyBox,adjacentSlot,overlaps} from '../modules/pixel-war/public/label-layout.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
const fighter=(w,side,kind,x=10000,y=1152)=>w.fighter(side,kind,UNITS[kind],x,y);
test('kill XP has one reward per life; max level never heals and survives save, wire and paid revival',()=>{
 const g=new LiveGame();try{const w=g.world,u=fighter(w,'demon','musketeer');w.units=[u];u.hp=90;refreshProgress(u);const base=u.attack;
 const target=fighter(w,'human','colossus');target.hp=0;assert(awardKill(w,{...u},target));const xp=u.xp;assert(!awardKill(w,u,target));assert.equal(u.xp,xp);
 for(let i=0;i<20;i++){const v=fighter(w,'human','shield');v.hp=0;assert(awardKill(w,u,v));}assert.equal(u.level,5);assert.equal(u.hp,90);assert.equal(u.attack,Math.round(base*1.4));assert.equal(u.kills,21);
 const wrongLife={...u,life:77},v=fighter(w,'human','shield');v.hp=0;assert(!awardKill(w,wrongLife,v));assert.equal(u.kills,21);
 const saved=g.capture();g.restore(saved);const restored=g.world.units.find(v=>v.id===u.id);assert.equal(restored.xp,u.xp);const wire=decodeFrame(encodeFrame(w.snapshot())).units.find(v=>v.id===u.id);assert.equal(wire.level,5);assert.equal(wire.attack,u.attack);
 u.supporter={id:'owner',platform:'test'};u.source='test';u.hp=0;rememberFallen(w,u);const fresh=fighter(w,'demon','musketeer');assert(reviveIdentity(w,fresh,{supporter:u.supporter,reviveId:u.id}));assert.equal(fresh.level,5);assert.equal(fresh.kills,21);assert.equal(fresh.life,2);assert.equal(fresh.hp,fresh.maxHP);
 }finally{g.close();}
});
test('weapon roles have real salvo cadence, penetration, distinct reach and slow giant machines',()=>{
 const w=new PixelWorld(),u=fighter(w,'demon','repeater'),v=fighter(w,'human','shield',10200);w.units=[u,v];releaseProjectiles(w,u,v,{critical:false,angle:0},new SpatialGrid(w.units),'bolt');assert.equal(w.missiles.length,3);assert.deepEqual(w.missiles.map(m=>m.born),[0,95,190]);assert.equal(v.hp,v.maxHP);assert(w.missiles.every(m=>m.kind==='bullet'));
 const cross=fighter(w,'demon','crossbow');assert(rawDamage(cross,v)>rawDamage({...cross,armorPen:0},v));assert(UNITS.shortbow.interval<UNITS.ranger.interval);assert(UNITS.cannon.range>UNITS.bow.range);assert(UNITS.scout.speed>UNITS.rider.speed);assert(UNITS.scout.scale<1);assert(UNITS.dreadnought.scale*105>UNITS.colossus.scale*60*1.5);assert(UNITS.dreadnought.speed<UNITS.cannon.speed);
});
test('shell splash hits enemies, spares allies and breaks real obstacles',()=>{
 const w=new PixelWorld(),p=BARRIERS[0],u=fighter(w,'demon','cannon',p.x-250,p.y),a=fighter(w,'human','shield',p.x,p.y),b=fighter(w,'human','shield',p.x+60,p.y),ally=fighter(w,'demon','shield',p.x+30,p.y),pending=[];w.units=[u,a,b,ally];assert(!w.open(p.x,p.y));projectileImpact(w,{source:u,kind:'shell',critical:false},a,new SpatialGrid(w.units),pending);assert.equal(pending.length,2);assert(pending.every(hit=>hit[1].side==='human'));for(const hit of pending)w.resolveHit(...hit);assert(a.hp<a.maxHP&&b.hp<b.maxHP);assert.equal(ally.hp,ally.maxHP);assert(w.open(p.x,p.y));assert(w.events.some(e=>e.type==='explosion'));assert(Object.keys(w.terrainChanges).length>0);
});
test('barrels warn then explode once, hurt either side; watchtowers and ammunition grant expiring stats',()=>{
 const w=new PixelWorld();w.units=[];const props=ensureFieldProps(w),barrel=props.items.find(p=>p.kind==='barrel'),u=fighter(w,'demon','musketeer',barrel.x+20,barrel.y),v=fighter(w,'human','shield',barrel.x-20,barrel.y);w.units=[u,v];lightBarrels(w,barrel,u,20);updateFieldProps(w);assert(!barrel.used);assert.equal(u.hp,u.maxHP);w.time=1000;updateFieldProps(w);assert(barrel.used);assert(u.hp<u.maxHP&&v.hp<v.maxHP);const count=w.events.filter(e=>e.type==='explosion').length;updateFieldProps(w);assert.equal(w.events.filter(e=>e.type==='explosion').length,count);
 u.hp=u.maxHP;const tower=props.items.find(p=>p.kind==='tower');Object.assign(u,{x:tower.x,y:tower.y});updateFieldProps(w);refreshProgress(u,w.time);assert.equal(u.range,UNITS.musketeer.range*1.18);w.time+=2000;refreshProgress(u,w.time);assert.equal(u.range,UNITS.musketeer.range);
 const ammo={id:999,x:u.x,y:u.y,kind:'ammo',until:99999};assert(usefulPickup(ammo,u,w.time));assert(!usefulPickup(ammo,fighter(w,'human','militia'),w.time));const damage=rawDamage({...u,battleTime:w.time},v);collectPickup(w,u,ammo);assert(ammo.used);assert.equal(rawDamage({...u,battleTime:w.time},v),damage*1.2);assert(!usefulPickup(ammo,u,w.time));w.time+=25001;assert.equal(rawDamage({...u,battleTime:w.time},v),damage);
});
test('calm map grows then returns, combat retracts it, and allegiance board is intermittent',()=>{
 const r=new ViewRhythm(),camera={side:'demon',visible:()=>true,screenW:960,screenH:540},s={time:0,campaign:{front:0},events:[],heroes:{demon:{}}};let p;for(let i=0;i<220;i++)p=r.update(s,camera,.1);assert(!p.board);assert(p.expansion>.95);assert(battleMapBox(camera,p.expansion).w>180);assert(battleMapBox(camera,p.expansion).w<=camera.screenW*.26);s.events=Array.from({length:9},()=>({type:'hit',at:0}));for(let i=0;i<20;i++)p=r.update(s,camera,.1);assert(p.expansion<.01);s.campaign.front++;p=r.update(s,camera,.1);assert(p.board);s.events=[];for(let i=0;i<100;i++)p=r.update(s,camera,.1);assert(!p.board);assert(p.expansion<.01);
});
test('terrain color changes gradually across region boundaries and labels never detach from their actor',()=>{
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));for(let x=256;x<20000;x+=32){const a=rgb(tileColor(x,900,0)),b=rgb(tileColor(x+32,900,0));assert(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<=4);}
 const camera=new Camera('demon');camera.x=10000;camera.y=1152;const w=new PixelWorld(),u=fighter(w,'demon','cannon'),body=bodyBox(u,camera),slot=adjacentSlot(u,110,25,[body],camera);assert(slot);assert(!overlaps(body,slot));assert(Math.abs(slot.x-(body.x+body.w))<=6);assert.equal(adjacentSlot(u,110,25,[{x:0,y:0,w:960,h:540}],camera),null);
});
