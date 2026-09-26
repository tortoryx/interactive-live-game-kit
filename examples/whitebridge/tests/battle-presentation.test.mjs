import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {launchSurprise,updateSurprises} from '../modules/pixel-war/surprises.mjs';
import {collectPickup,updateEncounters,launchDisaster} from '../modules/pixel-war/encounters.mjs';
import {eventNoticeLayout,EventNoticeClock} from '../modules/pixel-war/public/field-events.mjs';
import {battleScene,CINEMATIC} from '../modules/pixel-war/public/cinematic.mjs';
import {beginSettlement} from '../modules/pixel-war/settlement.mjs';
import {SimulationClock} from '../modules/live-runtime/simulation-clock.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
const advance=(w,ms)=>{for(let i=0;i<ms;i+=50)w.step(50);};
test('supply drop produces six consumable buffs once; both factions can actually use them',()=>{
 const w=new PixelWorld();assert(launchSurprise(w,'supply'));assert(!launchSurprise(w,'supply'));const start=w.pickups.length;w.time=3100;updateSurprises(w);assert.equal(w.pickups.length,start);w.time=3200;updateSurprises(w);assert.equal(w.pickups.length,start+6);updateSurprises(w);assert.equal(w.pickups.length,start+6);
 for(const side of ['demon','human']){const h=w.heroes[side],p=w.pickups.find(p=>p.kind==='heal'&&!p.used);h.hp-=500;const before=h.hp;collectPickup(w,h,p);assert.equal(h.hp,before+400);assert(p.used);}
});
test('blood moon empowers both sides including late reinforcements, expires and never stacks a second event',()=>{
 const w=new PixelWorld();assert(launchSurprise(w,'bloodmoon'));assert(!launchSurprise(w,'bloodmoon'));for(const h of Object.values(w.heroes))assert.equal(h.furyUntil,18000);
 w.time=1000;w.spawn('human','militia',1,true);updateSurprises(w);assert.equal(w.units.at(-1).furyUntil,18000);w.time=18001;w.nextSurprise=1e9;updateSurprises(w);assert.equal(w.surprises.length,0);assert(w.heroes.demon.furyUntil<w.time);
});
test('storm gives three telegraphed neutral strikes with bounded chains, real damage to both sides and terrain scars',()=>{
 const w=new PixelWorld();w.mode='test_live';assert(launchSurprise(w,'storm'));const strikes=w.hazards.filter(h=>h.eventId);assert.equal(strikes.length,3);assert(strikes.every(h=>!h.side&&!h.sourceId));assert(strikes.every((h,i)=>h.impact===3600+i*4100));
 const h=strikes[0],actors=Object.values(w.heroes);actors.forEach((u,i)=>Object.assign(u,{x:h.x+i*20,y:h.y}));w.time=h.impact;const pending=[];updateEncounters(w,actors,pending);assert.equal(pending.length,2);for(const hit of pending)w.resolveHit(...hit);assert(actors.every(u=>u.hp<u.maxHP));assert(Object.keys(w.terrainChanges).length>0);assert(w.events.some(e=>e.type==='volley'&&e.arcs.length===2));
});
test('event notices survive hit floods and move from centre through flight to a bounded top-right stack',()=>{
 const w=new PixelWorld();launchDisaster(w,'meteor');launchSurprise(w,'supply');for(let i=0;i<500;i++)w.emit('hit',{amount:1});assert.equal(w.announcements.length,2);const e=w.announcements[0];
 const centre=eventNoticeLayout([e],e.displayAt+499,960,540)[0],fly=eventNoticeLayout([e],e.displayAt+650,960,540)[0],dock=eventNoticeLayout([e],e.displayAt+850,960,540)[0];assert.equal(centre.phase,'centre');assert.equal(centre.x,480);assert.equal(fly.phase,'flying');assert(fly.x>centre.x&&fly.x<dock.x);assert.equal(dock.phase,'docked');assert(dock.x>700&&dock.y<230);assert(dock.x+200*dock.scale<=960);assert.equal(eventNoticeLayout([e],e.until,960,540).length,0);
 const s=decodeFrame(JSON.parse(JSON.stringify(encodeFrame(w.snapshot()))));assert.deepEqual(s.announcements,w.announcements);assert.equal(s.surprises.length,1);
});
test('all seven shortened settlement beats hold combat and surprise clocks and preserve the wounded victor',()=>{
 const w=new PixelWorld();w.mode='test_live';launchSurprise(w,'bloodmoon');w.heroes.demon.hp=1100;w.heroes.human.hp=10;const player=w.units[0];player.supporter={id:'award-fixture',name:'测试参战者',platform:'test'};player.source='test';w.resolveHit(player,w.heroes.human,100);const until=w.surprises[0].until,notice=w.announcements[0].until;beginSettlement(w,['human']);const timing=w.result.timing;assert(timing.end<=19200);let elapsed=0;
 for(const [at,phase] of [[0,'fall'],[timing.fall,'celebrate'],[timing.awards,'awards'],[timing.celebrate,'execution'],[timing.handoff,'arrival'],[timing.arrival,'demonstration'],[timing.briefing,'resume']]){advance(w,at-elapsed);elapsed=at;assert.equal(w.mode,'settlement');assert.equal(battleScene(w.snapshot()).phase,phase);assert.equal(w.heroes.demon.hp,1100);}
 advance(w,timing.end-elapsed);assert.equal(w.mode,'test_live');assert.equal(w.surprises[0].until,until+timing.end);assert.equal(w.announcements[0].until,notice+timing.end);assert.equal(w.heroes.demon.hp,1100);assert.equal(w.heroes.human.rank,1);
 const g={world:{speed:4,paused:false,mode:'settlement'},time:0,step(ms){this.time+=ms;}},clock=new SimulationClock(g,0);clock.advance(250);assert.equal(g.time,250);g.world.mode='test_live';clock.advance(500);assert.equal(g.time,1250);
});
test('new event controls are owner-only; invalid, repeated and settlement requests do not create another event',async()=>{
 const a=await createPreview({stagePort:19790,controlPort:19791,clock:false});try{const base='http://127.0.0.1:19791',html=await(await fetch(base)).text(),token=html.match(/name="owner-token" content="([^"]+)/)[1],headers={'Content-Type':'application/json',Origin:base,'X-Owner-Token':token},post=event=>fetch(base+'/action',{method:'POST',headers,body:JSON.stringify({type:'surprise',event})});
 assert.equal((await post('supply')).status,400);assert.equal((await post('supply')).status,400);assert.equal((await post('unknown')).status,400);assert.equal((await fetch('http://127.0.0.1:19790/action',{method:'POST',headers,body:'{}'})).status,405);a.world.mode='settlement';assert.equal((await post('storm')).status,400);assert.equal(a.world.surprises.length,0);
 }finally{await a.close();}
});

test('burst announcements never pile up at the centre and dock within the compact map width',()=>{const events=Array.from({length:12},(_,i)=>({id:i,kind:'storm',at:0,displayAt:0,until:18000,effectUntil:18000})),list=eventNoticeLayout(events,250,960,540);assert.equal(list.filter(e=>e.phase==='centre').length,1);assert(list.filter(e=>e.phase==='docked').every(e=>e.w<=144&&e.h===32));assert.equal(eventNoticeLayout([events[0]],500,960,540)[0].phase,'flying');assert.equal(eventNoticeLayout([events[0]],850,960,540)[0].phase,'docked');});

test('event flyout finishes on viewing time while battle is paused and old notices do not replay on reload',()=>{const e={id:1,kind:'storm',at:0,displayAt:0,until:18000,effectUntil:18000},clock=new EventNoticeClock();const frame=now=>eventNoticeLayout(clock.update([e],0,now),0,960,540)[0];assert.equal(frame(100).phase,'centre');assert.equal(frame(599).phase,'centre');assert.equal(frame(600).phase,'flying');assert.equal(frame(950).phase,'docked');clock.reset();assert.equal(eventNoticeLayout(clock.update([e],5000,1000),5000,960,540)[0].phase,'docked');clock.update([],6000,1100);assert.equal(clock.starts.size,0);});
