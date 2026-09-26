import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {beginSettlement,advanceSettlement} from '../modules/pixel-war/settlement.mjs';
import {crownCount,crownStack,crownRite} from '../modules/pixel-war/public/crowns.mjs';
import {ceremonyActor} from '../modules/pixel-war/public/ceremony.mjs';
const world=()=>{const w=new PixelWorld(37,{audienceDriven:true});w.mode='test_live';w.units=[];return w;};
function at(w,t){const elapsed=t-w.time;assert(elapsed>=0);w.time=t;advanceSettlement(w,elapsed);}
function arrive(w,fraction){const r=w.result;at(w,r.startedAt+r.timing.handoff+(r.timing.arrival-r.timing.handoff)*fraction);}

test('both families drop every crown and inherit one more across three defeats without healing the winner',()=>{
 for(const side of ['demon','human']){const w=world(),other=side==='demon'?'human':'demon',winner=w.heroes[other];winner.hp=1234;
  for(let generation=0;generation<3;generation++){
   w.heroes[side].hp=0;const fallen=w.heroes[side].id;beginSettlement(w,[side]);const e=w.result.crowns[0];assert.equal(e.count,generation+1);assert.equal(e.fromId,fallen);
   arrive(w,0);assert.notEqual(w.heroes[side].id,fallen);const id=w.heroes[side].id;
   assert.equal(ceremonyActor(w.heroes[side],w.snapshot(),side).wornCrowns,1);
   arrive(w,1);assert(e.collected);assert.equal(crownCount(w.heroes[side]),generation+2);assert.equal(e.count+1,crownCount(w.heroes[side]));
   at(w,w.result.startedAt+w.result.timing.end);assert.equal(w.mode,'test_live');assert.equal(w.heroes[side].id,id);assert.equal(w.heroes[other],winner);assert.equal(winner.hp,1234);
  }
 }
});
test('arrival visibly walks, bends, lifts the ground crowns, then wears them before combat resumes',()=>{
 const w=world();w.heroes.demon.hp=0;beginSettlement(w,['demon']);arrive(w,0);const e=w.result.crowns[0],hero=w.heroes.demon,start={x:hero.x,y:hero.y};
 arrive(w,.2);assert(hero.moving);assert(Math.hypot(hero.x-start.x,hero.y-start.y)>0);assert(Math.hypot(hero.x-e.drop.x,hero.y-e.drop.y)>0);
 arrive(w,.43);assert.deepEqual({x:hero.x,y:hero.y},e.drop);const actor=ceremonyActor(hero,w.snapshot(),'demon');assert(actor.crownPicking&&actor.crownBend>.4);assert.equal(actor.wornCrowns,1);assert(!e.collected);
 arrive(w,.65);assert(crownRite(w.result,'demon',w.time).lift>0);assert(!e.collected);
 arrive(w,.85);assert(e.collected);assert.equal(ceremonyActor(hero,w.snapshot(),'human').wornCrowns,2);assert.equal(w.mode,'settlement');
 arrive(w,1);assert(!hero.moving&&e.complete);
});
test('a disk reopen midway through pickup preserves the pile, successor and one-time collection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'duel-crowns-'));let g=new LiveGame({path:join(dir,'save.sqlite')});
 try{g.world.mode='test_live';g.world.heroes.human.hp=0;beginSettlement(g.world,['human']);arrive(g.world,.64);const before=structuredClone(g.world.result.crowns),id=g.world.heroes.human.id;g.close();g=new LiveGame({path:join(dir,'save.sqlite')});assert.deepEqual(g.world.result.crowns,before);arrive(g.world,.85);assert.equal(g.world.heroes.human.id,id);const collectedAt=g.world.result.crowns[0].collectedAt;g.close();g=new LiveGame({path:join(dir,'save.sqlite')});arrive(g.world,1);assert.equal(g.world.result.crowns[0].collectedAt,collectedAt);assert.equal(crownCount(g.world.heroes.human),2);assert.equal(g.world.heroes.human.id,id);}finally{g.close();await rm(dir,{recursive:true,force:true});}
});
test('simultaneous defeats keep two independent crown piles and old settlements remain compatible',()=>{
 const w=world();for(const [side,rank]of[['demon',2],['human',6]]){w.ranks[side]=rank;w.heroes[side]=w.makeHero(side,rank);w.heroes[side].hp=0;}beginSettlement(w,['demon','human']);assert.deepEqual(w.result.crowns.map(e=>e.count),[3,7]);arrive(w,1);assert.deepEqual(w.result.crowns.map(e=>e.collected),[true,true]);assert.equal(crownCount(w.heroes.demon),4);assert.equal(crownCount(w.heroes.human),8);
 const old=world();old.heroes.demon.hp=0;beginSettlement(old,['demon']);delete old.result.crowns;arrive(old,1);at(old,old.result.startedAt+old.result.timing.end);assert.equal(old.mode,'test_live');assert.equal(old.heroes.demon.rank,1);
});
test('large crown counts remain exact while rendering work and stack height stay bounded',()=>{
 assert.equal(crownCount({rank:10000}),10001);assert.equal(crownStack(10001).visible,32);assert(crownStack(10001).height<=82);assert(crownStack(3).height>crownStack(2).height);assert.equal(crownCount({rank:200,wornCrowns:1}),1);
});
test('Luna receives grounded arrival facts and the current pickup status',()=>{
 const g=new LiveGame();try{const w=g.world;w.mode='test_live';w.heroes.demon.hp=0;beginSettlement(w,['demon']);arrive(w,.4);const pending=w.lunaSpeech.pending.find(p=>p.cue==='arrival'&&p.persona===w.heroes.demon.id);assert.equal(pending.facts.crownsOnGround,1);assert.equal(pending.facts.totalAfterPickup,2);assert.equal(g.context('demon').interactionRules.crowns.worn,1);arrive(w,.85);assert.equal(g.context('demon').interactionRules.crowns.worn,2);assert.equal(g.context('demon').interactionRules.crowns.onGround,0);}finally{g.close();}
});
