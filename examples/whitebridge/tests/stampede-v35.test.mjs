import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {launchOwnedEvent,updateOwnedEvents} from '../modules/pixel-war/owned-events.mjs';
import {STAMPEDE} from '../modules/pixel-war/stampede.mjs';
import {eventTone} from '../modules/pixel-war/public/tactical-style.mjs';
import {battlefieldThreats} from '../modules/pixel-war/public/threats.mjs';
import {holdBattleClocks} from '../modules/pixel-war/settlement.mjs';
import {PLATFORM_GIFTS} from '../modules/live-runtime/gift-catalog.mjs';
import {giftEntitlement} from '../modules/pixel-war/public/gift-tiers.mjs';
const grant=side=>({side,receipt:'test:stampede',source:'test',supporter:{id:'sponsor',name:'召唤者',platform:'test'}});
function march(w,to){for(;w.time<to;){w.time=Math.min(to,w.time+50);updateOwnedEvents(w);}}

test('one visible downward stampede hits each side once, keeps at most two stragglers, and survives real save/restore',()=>{
 for(const side of ['demon','human']){const g=new LiveGame();try{let w=g.world;w.mode='test_live';assert(launchOwnedEvent(w,grant(side),'beastRaid'));let e=w.warEvents[0];assert.equal(w.wildlife.length,0);for(const [i,h]of Object.values(w.heroes).entries())Object.assign(h,{x:e.x+(i?140:-140),y:e.y,shield:0});
  march(w,e.impact);assert.equal(w.wildlife.length,12);const ids=w.wildlife.map(u=>u.id),positions=w.wildlife.map(u=>u.y);assert(w.wildlife.every(u=>u.side==='neutral'&&u.stampede&&u.targetId===null));march(w,w.time+500);assert(w.wildlife.every((u,i)=>u.y>positions[i]&&u.face===Math.PI/2));
  march(w,e.impact+2200);assert(w.heroes.demon.hp<9000&&w.heroes.human.hp<9000);assert.equal(e.stampede.hitIds.length,2);const hp=Object.values(w.heroes).map(h=>h.hp);g.restore(g.capture());w=g.world;e=w.warEvents[0];assert.deepEqual(w.wildlife.map(u=>u.id),ids);
  march(w,e.until-1200);march(w,w.time+100);assert(e.stampede.finished);assert.equal(w.wildlife.length,2);assert(w.wildlife.every(u=>u.straggler&&!u.stampede&&u.sponsorSide===side));assert.deepEqual(Object.values(w.heroes).map(h=>h.hp),hp);assert.equal(w.events.filter(e=>e.type==='hit'&&e.style==='stampede').length,2);
  const honors=Object.values(w.honors.entries);assert.equal(honors.length,1);assert.equal(honors[0].side,side);assert.equal(honors[0].damage,9000-w.heroes[side==='demon'?'human':'demon'].hp);
  for(const h of Object.values(w.heroes))h.stunnedUntil=1e12;w.time=Math.max(...w.wildlife.map(u=>u.expiresAt));g.step(50);assert.equal(w.wildlife.length,0);
 }finally{g.close();}}
});

test('warnings precede charge, settlement holds its clocks, killed charge animals cannot become fresh stragglers',()=>{const g=new LiveGame();try{const w=g.world;launchOwnedEvent(w,grant('demon'),'beastRaid');const e=w.warEvents[0],due=e.impact;holdBattleClocks(w,5000);assert.equal(e.impact,due+5000);w.time=e.impact-1;updateOwnedEvents(w);assert.equal(w.wildlife.length,0);w.time=e.impact;updateOwnedEvents(w);const leave=w.wildlife.filter(u=>u.stampede.linger);for(const u of leave)w.resolveHit(w.heroes.human,u,1e8);march(w,e.until-100);assert.equal(w.wildlife.filter(u=>u.hp>0).length,0);assert(!w.fallenTroops.some(u=>leave.some(v=>v.id===u.id)));}finally{g.close();}});

test('all friendly-fire events are red for both viewpoints; charging herd has one readable threat marker',()=>{const g=new LiveGame();try{const w=g.world;launchOwnedEvent(w,grant('demon'),'beastRaid');const e=w.warEvents[0];w.time=e.impact+100;updateOwnedEvents(w);for(const side of ['demon','human']){for(const kind of ['wildlife','meteor','quake','storm'])assert.equal(eventTone({kind,actorSide:side},side,w.snapshot()),'danger');const beasts=battlefieldThreats(w.snapshot(),side).filter(t=>t.kind==='beast');assert.equal(beasts.length,1);assert.match(beasts[0].label,/伤及双方/);assert.equal(eventTone({kind:'royal_heal',actorSide:side},side,w.snapshot()),'success');}}finally{g.close();}});

// Single-step event commands and additive gifts are covered by bili-twelve-gifts.test.mjs.
