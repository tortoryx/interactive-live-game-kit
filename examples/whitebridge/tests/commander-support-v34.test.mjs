import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {applyCommanderSupport,updateCommanderSupport} from '../modules/pixel-war/commander-support.mjs';
import {rawDamage} from '../modules/pixel-war/public/catalog.mjs';
import {beginSettlement} from '../modules/pixel-war/settlement.mjs';
import {ceremonyPerspective,perspectiveHonors} from '../modules/pixel-war/public/ceremony-perspective.mjs';
import {ceremonyTitle,ceremonyActor} from '../modules/pixel-war/public/ceremony.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
import {CINEMATIC} from '../modules/pixel-war/public/cinematic.mjs';
const cast=(g,key,side='demon',id='test:'+key)=>{const r=g.testGift({side,reward:key,id});g.drain();return r;};

test('player healing and full restore bypass passive healer cap, clamp at max HP, record actual credit and deduplicate',()=>{
 for(const side of ['demon','human']){const g=new LiveGame();try{const h=g.world.heroes[side];h.hp=100;h.recentHeals=[{at:0,amount:45}];cast(g,'fieldMedic',side);assert.equal(h.hp,2800);cast(g,'fieldMedic',side);assert.equal(h.hp,2800);cast(g,'royalSpring',side);assert.equal(h.hp,h.maxHP);assert.equal(Object.values(g.world.honors.entries).reduce((n,e)=>n+e.healing,0),8900);const r=cast(g,'royalSpring',side,'test:already-full');assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get(r.id).status,'no_effect');assert.equal(h.lastSupport.owner.platform,'test');assert(g.world.lunaSpeech.pending.some(q=>q.cue==='support'&&q.facts.receipt));}finally{g.close();}}
});

test('support buffs apply to real damage, do not multiply on repeated grants and expire without killing their beneficiary',()=>{
 const g=new LiveGame();try{const w=g.world,h=w.heroes.demon,t=w.heroes.human;w.mode='test_live';const baseline=rawDamage(h,t);
 cast(g,'battleFury');assert(Math.abs(rawDamage(h,t)-baseline*1.4)<1e-9);cast(g,'battleFury','demon','test:power2');assert.equal(h.supportAttack,1.4);
 cast(g,'lifeSurge');assert.equal(h.maxHP,10800);cast(g,'lifeSurge','demon','test:life2');assert.equal(h.maxHP,10800);h.hp=400;
 cast(g,'ironWard');h.shield=0;const hp=h.hp;w.resolveHit(t,h,100);assert.equal(hp-h.hp,65);
 w.time=21000;updateCommanderSupport(w);assert.equal(h.maxHP,9000);assert.equal(h.hp,335);assert.equal(rawDamage(h,t),baseline);assert.deepEqual(h.commanderBuffs,{});
 }finally{g.close();}
});

test('support time survives ceremony and save/restore; effects attach to one persona, never the next ancestor',()=>{
 const g=new LiveGame();try{const w=g.world,h=w.heroes.demon;cast(g,'battleFury');cast(g,'lifeSurge');w.heroes.human.hp=0;beginSettlement(w,['human']);const until=h.commanderBuffs.power.until;g.step(50);assert.equal(h.commanderBuffs.power.until,until+50);const saved=g.capture();g.restore(saved);assert.equal(g.world.heroes.demon.maxHP,10800);assert.equal(g.world.heroes.demon.supportAttack,1.4);g.world.heroes.demon=g.world.makeHero('demon',1);assert.equal(g.world.heroes.demon.commanderBuffs,undefined);}finally{g.close();}
});

test('targeted strike damages enemy commander and nearby troops, leaves allied HP alone, and credits the activating player',()=>{
 for(const side of ['demon','human']){const g=new LiveGame();try{const w=g.world,h=w.heroes[side],enemy=w.heroes[side==='demon'?'human':'demon'];const start=enemy.hp,ours=h.hp;cast(g,'royalStrike',side);assert.equal(start-enemy.hp,Math.round(enemy.maxHP*.25));assert.equal(h.hp,ours);assert.equal(Object.values(w.honors.entries)[0].leaderDamage,2250);assert(w.events.some(e=>e.type==='explosion'&&e.focus?.ownerId));assert(w.snapshot().announcements.some(e=>e.kind==='royal_strike'&&e.actorSide===side));}finally{g.close();}}
});

test('a loss stays with the defeated side: no enemy awards or cheer, red tone, and own elder brings hope',()=>{
 for(const side of ['demon','human']){const winner=side==='demon'?'human':'demon',g=new LiveGame();try{const w=g.world;w.heroes[side].hp=0;w.mode='test_live';beginSettlement(w,[side]);w.result.timing={...CINEMATIC};w.result.honors.board=[{side:winner,name:'敌方功臣',score:999}];w.time=w.result.startedAt+CINEMATIC.awards+3000;
 const v=ceremonyPerspective(w,side);assert(v.lost);assert.equal(v.tone,'defeat');assert(!v.showAwards);assert.equal(v.focus.id,w.result.fallen[0].id);assert.deepEqual(perspectiveHonors(w.result,side),[]);assert(!ceremonyActor(w.heroes[winner],w,side).celebrating);assert.match(ceremonyTitle(w,side).title,/败北/);
 const c=new Camera(side);c.follow(w.snapshot(),.016);assert(Math.abs(c.x-v.focus.x)<1,'loser camera remains on its fallen commander');
 w.time=w.result.startedAt+CINEMATIC.handoff+100;w.result.arrivals=[{side,name:'本方长辈'}];assert.equal(ceremonyPerspective(w,side).tone,'hope');assert.equal(ceremonyPerspective(w,winner).tone,'threat');assert.equal(ceremonyTitle(w,side).title,(side==='demon'?'魔族':'人族')+'长辈赶到了！');assert.equal(ceremonyTitle(w,winner).title,ceremonyTitle(w,side).title);
 }finally{g.close();}}
});
