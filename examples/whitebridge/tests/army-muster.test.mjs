import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {tickMuster,musterStep} from '../modules/pixel-war/muster.mjs';
import {holdBattleClocks} from '../modules/pixel-war/settlement.mjs';
import {MUSTER_FORMATIONS,formationSlots,formationSet,MUSTER_INTERVAL,MUSTER_LEAD,MUSTER_NPC_CAP} from '../modules/pixel-war/public/muster-catalog.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {musterPresentation} from '../modules/pixel-war/public/muster-view.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {soundCue,soundPriority} from '../modules/pixel-war/public/audio-director.mjs';
const fresh=()=>{const w=new PixelWorld(37,{audienceDriven:true});w.mode='live';return w;};
function muster(w){tickMuster(w);w.time=w.nextMuster;tickMuster(w);w.time+=MUSTER_LEAD;tickMuster(w);return w.muster;}
test('eight faction-exclusive formations have forty-eight distinct spaced slots; one rotates each cycle',()=>{
 const keys=Object.values(MUSTER_FORMATIONS).flat().map(f=>f.id);assert.equal(new Set(keys).size,8);
 for(const side of ['human','demon']){const seen=new Set();for(let cycle=1;cycle<=4;cycle++){const set=formationSet(side,cycle);assert.equal(set.length,1);assert.equal(new Set(set.map(f=>f.id)).size,1);for(const f of set){seen.add(f.id);assert(MUSTER_FORMATIONS[side].includes(f));const slots=formationSlots(f.id);assert.equal(slots.length,48);for(let i=0;i<48;i++)for(let j=i+1;j<48;j++)assert(Math.hypot(slots[i].x-slots[j].x,slots[i].y-slots[j].y)>=20);}}assert.equal(seen.size,4);}
});
test('minute timer opens wide shot first, deploys paired weak armies later, and never bursts missed waves',()=>{
 const w=fresh();tickMuster(w);assert.equal(w.nextMuster,60000);w.time=59999;tickMuster(w);assert(!w.muster);w.time++;tickMuster(w);assert(w.muster);assert.equal(w.units.length,0);
 w.time+=MUSTER_LEAD;tickMuster(w);const m=w.muster;assert(m.count>=36&&m.count<=48,'real terrain still provides multiple ranks');assert.equal(w.units.length,m.count*2);
 for(const s of ['human','demon']){assert.equal(w.units.filter(u=>u.side===s).length,m.count);assert.equal(m.groups.filter(g=>g.side===s).length,1);assert.equal(m.groups.find(g=>g.side===s).units.length,m.count);}
 assert(w.units.every(u=>u.kind==='levy'&&u.attack===UNITS.levy.attack&&u.hp===UNITS.levy.hp&&!u.supporter?.id&&!u.receipt&&w.open(u.x,u.y)));
 assert.equal(w.allAlive().filter(u=>u.kind==='levy').length,0,'airborne soldiers are not targetable');w.time=m.landAt;tickMuster(w);assert.equal(w.allAlive().filter(u=>u.kind==='levy').length,m.count*2);assert.equal(w.events.filter(e=>e.type==='muster_land').length,1);tickMuster(w);assert.equal(w.events.filter(e=>e.type==='muster_land').length,1);
 const n=w.units.length;tickMuster(w);assert.equal(w.units.length,n);w.time+=600000;tickMuster(w);assert.equal(w.musterCycle,2);assert.equal(w.nextMuster,w.time+MUSTER_INTERVAL);assert.equal(w.units.length,n);
 assert.equal(soundCue(w.events.find(e=>e.type==='muster')),'march');assert.equal(soundPriority({type:'muster'}),2);
});
test('population admission grants equal counts and reserves player room without replacing anyone',()=>{
 const w=fresh();w.open=()=>true;w.ground=p=>p;
 for(const side of ['human','demon'])for(let i=0;i<(side==='demon'?100:60);i++)w.units.push({...w.fighter(side,'levy',UNITS.levy,10240+(side==='demon'?-1:1)*(750+(i%10)*20),600+Math.floor(i/10)*24),ambient:true,source:'system'});
 const viewer={...w.fighter('human','militia',UNITS.militia,9000,1100),hp:43,supporter:{id:'paid-viewer'},receipt:'paid-1'};w.units.push(viewer);const before=JSON.stringify(viewer),m=muster(w);assert.equal(m.addedCount,8);assert.equal(m.count,48);assert.equal(w.units.filter(u=>u.side==='demon').length,MUSTER_NPC_CAP);assert.equal(JSON.stringify(viewer),before);
 w.time=w.nextMuster;tickMuster(w);w.time+=MUSTER_LEAD;tickMuster(w);assert.equal(w.muster.addedCount,0);assert.equal(w.muster.count,48);assert(w.units.includes(viewer));
});
test('march uses navigation and releases immediately on enemy contact, expiry or field change',()=>{
 const w=fresh(),m=muster(w),u=w.units[0];const start={x:u.x,y:u.y},calls=[];w.move=(unit,p,dt)=>calls.push({p,dt});
 assert(musterStep(w,u,null,.05));assert.equal(calls.length,0,'airborne troops do not navigate');w.time=m.landAt;assert(musterStep(w,u,null,.05));assert.equal(calls.length,1);assert.deepEqual(calls[0].p,u.musterSlot);w.time=m.marchAt+1000;assert(musterStep(w,u,null,.05));assert.equal(calls.length,2);assert.equal(calls[1].p.x,start.x+60);assert.equal(u.x,start.x);
 const enemy={x:u.x+55,y:u.y,range:30,radius:10};assert(!musterStep(w,u,enemy,.05));assert(!u.musterSlot);
 const v=w.units[1];w.fieldEpoch++;assert(!musterStep(w,v,null,.05));tickMuster(w);assert.equal(w.muster,null);
});
test('pause and ceremonies hold muster clocks, snapshot transport and checkpoints retain event once',()=>{
 const w=fresh(),m=muster(w),due=w.nextMuster;w.paused=true;const count=w.units.length;w.step(50);assert.equal(w.nextMuster,due);tickMuster(w);assert.equal(w.units.length,count);
 const at=m.at;holdBattleClocks(w,5000);assert.equal(m.at,at+5000);assert.equal(w.nextMuster,due+5000);
 const snapshot=w.snapshot(),wire=decodeFrame(encodeFrame(snapshot));assert.deepEqual(wire.muster,snapshot.muster);assert.equal(wire.units[0].musterArrivalAt,snapshot.units[0].musterArrivalAt);assert.equal(wire.units[0].musterLandAt,snapshot.units[0].musterLandAt);
 const game=new LiveGame();try{Object.assign(game.world,w);const saved=game.capture();game.restore(saved);assert.equal(game.world.muster.id,m.id);assert.equal(game.world.nextMuster,due+5000);game.world.paused=false;tickMuster(game.world);assert.equal(game.world.units.length,count);}finally{game.close();}
});
test('camera smoothly widens for two large armies then returns; simulation positions are unchanged',()=>{
 const w=fresh(),m=muster(w),s=w.snapshot(),cam=new Camera('demon');cam.follow({...s,muster:null},.05);const normal=cam.zoom,positions=JSON.stringify(s.units);
 for(let i=0;i<100;i++){const previous=cam.zoom;cam.follow(s,.05);assert(Math.abs(cam.zoom-previous)<.016);}
 assert.equal(cam.shot,'muster');assert(cam.zoom<normal*.85);for(const g of m.groups){const p=cam.project(g);assert(p.x>80&&p.x<880&&p.y>70&&p.y<470);}
 assert.equal(JSON.stringify(s.units),positions);const done={...s,time:m.cameraUntil+1};for(let i=0;i<130;i++)cam.follow(done,.05);assert.equal(cam.shot,'overview');assert(Math.abs(cam.zoom-normal)<.005);
});

test('entry sequence finishes camera lead before landing, then holds readable title exactly two seconds',()=>{
 const w=fresh(),m=muster(w);
 assert.equal(musterPresentation(m,m.at).phase,'camera');
 assert.equal(musterPresentation(m,m.deployAt).phase,'descent');
 assert.equal(musterPresentation(m,m.landAt).phase,'title-impact');
 assert.equal(musterPresentation(m,m.titleHoldAt).phase,'title-hold');
 assert.equal(m.marchAt-m.titleHoldAt,2000);
 assert(musterPresentation(m,m.landAt).titleScale>2.5);
 assert.equal(musterPresentation(m,m.titleHoldAt).titleScale,1);
 assert(musterPresentation(m,m.marchAt-1).titleVisible);
 assert(!musterPresentation(m,m.marchAt).titleVisible);
 assert.equal(musterPresentation(m,m.marchAt).phase,'combat');
});
test('surviving rear troops move into the one formation without being dropped or healed',()=>{
 const w=fresh(),m=muster(w),u=w.units[0];delete u.musterArrivalAt;delete u.musterLandAt;u.hp=7;u.x-=200;
 const calls=[];w.move=(unit,p)=>calls.push(p);assert(musterStep(w,u,null,.05));assert.equal(calls.length,1);assert.equal(u.hp,7);
});
test('camera zoom starts before panning, arrives before deployment and releases after titles',()=>{
 const w=fresh();tickMuster(w);w.time=w.nextMuster;tickMuster(w);const m=w.muster,cam=new Camera('demon'),s=w.snapshot();
 cam.follow({...s,muster:null},.05);cam.x-=3500;const origin={x:cam.x,y:cam.y},normal=cam.zoom;
 for(let i=0;i<=17;i++)cam.follow({...s,time:m.at+i*50},.05);
 assert(Math.hypot(cam.x-origin.x,cam.y-origin.y)<1);assert(cam.zoom<normal);
 for(let t=900;t<=3400;t+=50)cam.follow({...s,time:m.at+t},.05);
 assert(Math.hypot(cam.x-m.x,cam.y-m.y)<140,'camera frames the landing before soldiers appear');
});
