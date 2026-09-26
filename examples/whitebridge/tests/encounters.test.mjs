import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {UNITS,rawDamage} from '../modules/pixel-war/public/catalog.mjs';
import {combatSkill,launchDisaster,updateEncounters,collectPickup} from '../modules/pixel-war/encounters.mjs';
import {Camera,nearestBattle} from '../modules/pixel-war/public/camera.mjs';
import {DatabaseSync} from 'node:sqlite';
import {AvatarStore, imageDimensions} from '../modules/live-runtime/avatars.mjs';
import {avatarSource,displayName} from '../modules/live-runtime/public-profile.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {readFile} from 'node:fs/promises';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {SimulationClock} from '../modules/live-runtime/simulation-clock.mjs';
import {nearestGround} from '../modules/pixel-war/public/terrain.mjs';

test('delayed timers preserve elapsed battle time; pauses and system sleep cannot replay a battle',()=>{
 const game={world:{speed:1,paused:false},time:0,step(ms){this.time+=ms;}},clock=new SimulationClock(game,0);
 for(const at of [25,51,78,160,210,281,350,403,500])clock.advance(at);
 assert.equal(game.time,500);game.world.paused=true;clock.advance(1000);assert.equal(game.time,500);
 game.world.paused=false;clock.advance(1050);assert.equal(game.time,550);clock.advance(100000);assert.equal(game.time,800);
 game.world.speed=2;clock.advance(100050);assert.equal(game.time,900);
});
test('navigation destinations contain coordinates only, never copy another unit and its path graph',()=>{
 const unit={x:1200,y:896,path:[]};unit.path.push(unit);assert.deepEqual(nearestGround(unit),{x:1200,y:896});
 const w=new PixelWorld();w.move(w.heroes.demon,unit,.1);assert.doesNotThrow(()=>JSON.stringify(w.heroes.demon.path));assert(w.heroes.demon.path.every(p=>Object.keys(p).sort().join(',')==='x,y'));
});

test('giant telegraphs one cooldown-bound slam; impact hits a group and stuns only opponents',()=>{
 const w=new PixelWorld();w.mode='test_live';const giant=w.fighter('demon','colossus',UNITS.colossus,1250,896),a=w.fighter('human','shield',UNITS.shield,1310,896),b=w.fighter('human','pike',UNITS.pike,1320,940),friend=w.fighter('demon','militia',UNITS.militia,1300,900);w.units=[giant,a,b,friend];assert(combatSkill(w,giant,[a,b]));assert(!combatSkill(w,giant,[a,b]));assert.equal(giant.scale,3.1);w.time=849;let hits=[];updateEncounters(w,w.allAlive(),hits);assert.equal(hits.length,0);w.time=850;updateEncounters(w,w.allAlive(),hits);assert.equal(hits.length,2);for(const hit of hits)w.resolveHit(...hit);assert(a.hp<a.maxHP&&b.hp<b.maxHP);assert(a.stunnedUntil>w.time);assert.equal(friend.hp,friend.maxHP);const before=a.hp;hits=[];updateEncounters(w,w.allAlive(),hits);assert.equal(hits.length,0);assert.equal(a.hp,before);
});
test('remaining disasters warn and deal real damage; quake interrupts',()=>{
 for(const kind of ['meteor','quake']){const w=new PixelWorld();w.mode='test_live';w.hazards=[];const h=w.heroes.demon;Object.assign(h,{x:1250,y:896});assert(launchDisaster(w,kind,h));w.time=2599;let hits=[];updateEncounters(w,[h],hits);assert.equal(hits.length,0);w.time=2600;updateEncounters(w,[h],hits);assert.equal(hits.length,1);for(const hit of hits)w.resolveHit(...hit);assert(h.hp<h.maxHP);if(kind==='quake')assert(h.stunnedUntil>w.time);}
});
test('field buffs alter movement, shields and damage; sparring shows wounds without killing a personality',()=>{
 const w=new PixelWorld(),a=w.heroes.demon,b=w.heroes.human;const id=a.id;a.hp-=600;collectPickup(w,a,{kind:'heal'});assert.equal(a.hp,a.maxHP-200);collectPickup(w,a,{kind:'shield'});assert.equal(a.shield,240);collectPickup(w,a,{kind:'haste'});assert.equal(a.hasteUntil,12000);const plain=new PixelWorld().heroes.demon;const goal={x:a.x+300,y:a.y};w.move(a,goal,.5);w.move(plain,goal,.5);assert(a.x>plain.x+10);collectPickup(w,a,{kind:'fury'});w.step(50);assert(a.empowered);assert(rawDamage(a,b)>rawDamage({...a,empowered:false},b));w.resolveHit(b,a,999999);assert.equal(a.hp,a.maxHP*.35);assert.equal(a.id,id);assert.equal(a.deadAt,null);
});
test('camera cannot be panned and automatically frames commander plus nearest skirmish',()=>{
 const w=new PixelWorld();for(let i=0;i<130;i++)w.step(50);const s=w.snapshot(),camera=new Camera('human');assert.equal(camera.pan,undefined);assert(nearestBattle(s,'human'));for(let i=0;i<40;i++)camera.follow(s,.05);const p=camera.project(s.heroes.human);assert(p.x>50&&p.x<camera.screenW-50&&p.y>80&&p.y<camera.screenH-50);assert(camera.w>camera.screenW);assert(camera.zoom<1);assert.equal(camera.manual,undefined);
});
test('avatar proxy admits only known Bili face images, checks dimensions, caches and never sends credentials',async()=>{
 const db=new DatabaseSync(':memory:');
 const valid=await readFile(new URL('../modules/pixel-war/public/lpc/body-walk.png',import.meta.url));let calls=0;
 const a=new AvatarStore({db,fetcher:async(url,options)=>{calls++;assert(url.startsWith('https://i0.hdslb.com/bfs/face/'));assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return new Response(valid);}});
 try{const url='http://i0.hdslb.com/bfs/face/'+'a'.repeat(40)+'.png',key=a.register(url);assert(key);assert.equal(a.register('https://127.0.0.1/private'),null);assert.equal(avatarSource('https://i0.hdslb.com.evil.test/bfs/face/'+'a'.repeat(40)+'.png'),null);assert.equal(avatarSource('https://i0.hdslb.com/bfs/face/'+'a'.repeat(40)+'.png?url=http://localhost'),null);assert.equal(await a.get('f'.repeat(40)),null);assert.equal((await a.get(key)).type,'image/png');await a.get(key);assert.equal(calls,1);assert.equal(displayName('<b>测试\u202e用户</b>').includes('<'),false);const bad=new AvatarStore({db,fetcher:async()=>{const x=Buffer.from(valid);x.writeUInt32BE(30000,16);return new Response(x);}});assert.equal(await bad.get(key),null);assert.throws(()=>imageDimensions(Buffer.from('<svg onload=evil/>')));}finally{db.close();}
});
test('public summoner label survives receipt queue and restart data; local tests cannot impersonate a paid user',()=>{
 const g=new LiveGame();try{g.configureMappings([{platform:'bilibili',giftId:7,reward:'rally',multiplier:1}]);g.meta.liveEnabled=true;g.receive({id:'bilibili:42:name-fixture',platform:'bilibili',at:Date.now(),actor:'anonymous-actor',kind:'gift',giftId:7,quantity:1,paid:true,supporter:{name:'桃桃',avatarKey:'a'.repeat(40),platform:'bilibili',cookie:'secret'}});for(let i=0;i<10;i++)g.step(50);const u=g.snapshot().units.find(u=>u.source==='bilibili');assert.equal(u.supporter.name,'桃桃');assert.equal(u.supporter.avatarKey,'a'.repeat(40));assert.equal(u.supporter.cookie,undefined);const data=g.capture();g.restore(data);assert.equal(g.snapshot().units.find(u=>u.source==='bilibili').supporter.name,'桃桃');g.testGift({side:'human',reward:'rally',name:'冒充真实用户',avatarKey:'a'.repeat(40)});for(let i=0;i<10;i++)g.step(50);assert(g.snapshot().units.some(u=>u.source==='test'&&u.supporter.name==='本机试玩'&&!u.supporter.avatarKey));}finally{g.close();}
});
test('stream starts with a public snapshot and closes cleanly; owner disaster action stays private',async()=>{
 const app=await createPreview({stagePort:20490,controlPort:20491,clock:false}),controller=new AbortController();try{const r=await fetch('http://127.0.0.1:20490/stream',{signal:controller.signal});assert.equal(r.headers.get('content-type'),'text/event-stream');const {value}=await r.body.getReader().read(),body=new TextDecoder().decode(value);assert(body.startsWith('data: '));assert(!body.includes('owner-token'));assert(body.includes('fieldEpoch'));assert.equal((await fetch('http://127.0.0.1:20490/action',{method:'POST',body:'{"type":"disaster","disaster":"flood"}'})).status,405);}finally{controller.abort();await app.close();}
});
