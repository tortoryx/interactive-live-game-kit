import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {beginSettlement,advanceSettlement} from '../modules/pixel-war/settlement.mjs';
import {recordContribution} from '../modules/pixel-war/honors.mjs';
import {settlementTiming,awardRevealAt,awardRevealCount,ceremonyTiming,PREVIOUS_CINEMATIC,battleScene,DEMO_CYCLE} from '../modules/pixel-war/public/cinematic.mjs';
import {legacyPresentation} from '../modules/pixel-war/public/legacy-presentation.mjs';
import {legacyAvailability} from '../modules/pixel-war/public/legacy-catalog.mjs';
import {retinueActors} from '../modules/pixel-war/public/legacy-view.mjs';
import {ceremonyActor} from '../modules/pixel-war/public/ceremony.mjs';

function fixture(loser='demon',count=2){const g=new LiveGame(),w=g.world,winner=loser==='demon'?'human':'demon';w.mode='test_live';w.units=[];
 for(let i=0;i<count;i++)recordContribution(w,{id:'unit-'+i,side:winner,source:'test',kind:'militia',supporter:{id:'viewer-'+i,platform:'test',name:'节奏测试'+i}},{side:loser,kind:'hero'},10+i,0);
 w.heroes[winner].hp=1234;w.heroes[loser].hp=0;beginSettlement(w,[loser]);return {g,w,winner,loser};}
function at(w,age){const next=w.result.startedAt+age,dt=next-w.time;assert(dt>=0);w.time=next;advanceSettlement(w,dt);return w.snapshot();}
test('award length follows real winner count, reveals all fifty with readable final hold, and no ceremony exceeds 20 seconds',()=>{
 for(const n of [0,1,2,3,10,50]){const t=settlementTiming({board:Array(n).fill({})});assert(t.end<=20000);assert.equal(t.briefing-t.arrival,DEMO_CYCLE*2);assert.equal(t.end-t.briefing,500);if(n){assert.equal(awardRevealCount(t.celebrate-t.awards-1500,n),n);assert(t.celebrate-t.awards<=6400);}else assert.equal(t.awards,t.celebrate);}
 assert.equal(settlementTiming({board:[{},{}]}).celebrate-settlementTiming({board:[{},{}]}).awards,2600);assert(awardRevealAt(49)<5000);
});
test('loser previews one pass during enemy awards, both views total exactly two passes, and previews grant no early troops or unlock',()=>{
 for(const side of ['demon','human']){const {g,w,winner}=fixture(side);try{const r=w.result,t=r.timing,old=w.heroes[side].id;let s=at(w,t.awards+100),p=legacyPresentation(s,side);assert.equal(p.pass,1);assert(p.early&&!p.unlocked);assert.equal(legacyPresentation(s,winner),null);assert.equal(w.heroes[side].id,old);assert.equal(legacyAvailability(w,side),null);assert.equal(w.legacyReserve?.[side]?.length||0,0);
 s=at(w,t.celebrate);assert.equal(legacyPresentation(s,side),null,'crown cut remains unobstructed');s=at(w,t.handoff);assert.notEqual(w.heroes[side].id,old);const ids=r.retinues[0].units.map(u=>u.id);s=at(w,t.arrival+100);assert.equal(legacyPresentation(s,side).pass,2);assert.equal(legacyPresentation(s,winner).pass,1);
 s=at(w,t.arrival+DEMO_CYCLE+100);assert.equal(legacyPresentation(s,side).phase,'march');assert.equal(legacyPresentation(s,winner).pass,2);const marching=retinueActors(s);assert(marching.length);assert(marching.every(u=>ceremonyActor(u,s,side).moving));
 g.restore(g.capture());s=at(w,t.end);assert.equal(battleScene(s),null);assert.equal(w.heroes[winner].hp,1234);g.step(50);assert(ids.every(id=>w.units.some(u=>u.id===id)));}finally{g.close();}}
});
test('no-contribution and simultaneous deaths use two accelerated late passes, with immutable historic timing',()=>{
 const {g,w,loser}=fixture('demon',0);try{const t=w.result.timing;assert.equal(t.awards,t.celebrate);let s=at(w,t.arrival+100);assert.equal(legacyPresentation(s,loser).pass,1);s=at(w,t.arrival+DEMO_CYCLE+100);assert.equal(legacyPresentation(s,loser).pass,2);assert.equal(ceremonyTiming({ceremonyVersion:2}),PREVIOUS_CINEMATIC);const old={...PREVIOUS_CINEMATIC};assert.equal(ceremonyTiming({ceremonyVersion:2,timing:old}),old);}finally{g.close();}
 const both=new LiveGame();try{for(const h of Object.values(both.world.heroes))h.hp=0;beginSettlement(both.world,['demon','human']);const s=at(both.world,both.world.result.timing.arrival+50);for(const side of ['demon','human'])assert.equal(legacyPresentation(s,side).entry.package.side,side);}finally{both.close();}
});
