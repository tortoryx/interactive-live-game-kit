import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
import {giftEntitlement} from '../modules/pixel-war/public/gift-tiers.mjs';
import {retireTroops} from '../modules/pixel-war/service-life.mjs';
import {GIFTS} from '../modules/pixel-war/public/gifts.mjs';
import {withinBiliGiftBudget} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {priceStrength,reinforcementCopies} from '../modules/pixel-war/public/gift-strength.mjs';
import roster from './fixtures/bili-priced-roster.json' with {type:'json'};

const item=name=>roster.find(g=>g.name===name);
const packet=(gift,id,quantity=1,paid=true)=>({id:'bilibili:'+id,platform:'bilibili',kind:'gift',actor:'viewer',at:1800000000000,giftId:gift.giftId,quantity,paid,amountMilli:paid?gift.price*quantity:0,supporter:{name:'测试观众'}});
function ready(g){g.world.paused=false;g.world.mode='live';g.meta.liveEnabled=true;}
// Fixtures march deployed troops away so this isolates scheduling/population,
// rather than permanently blocking the commander's finite spawn ring.
function march(g){for(const side of ['demon','human']){const h=g.world.heroes[side];g.world.units.filter(u=>u.side===side).forEach((u,i)=>Object.assign(u,g.world.ground({x:h.x+(side==='demon'?-1:1)*(500+i*130),y:h.y+250})));}}
function drain(g,ms=45000){for(let t=0;t<ms&&g.meta.queue.length;t+=250){g.drain();march(g);g.world.time+=250;}}

test('paid copies strengthen the complete formation without diluting any soldier or increasing per-hit damage',()=>{
 const low=priceStrength(100);
 assert.equal(reinforcementCopies(100),1);
 assert.equal(reinforcementCopies(10000),2);
 assert.equal(reinforcementCopies(100000),6);
 assert.equal(reinforcementCopies(199000),8);
 assert.equal(reinforcementCopies(200000),8);
 assert.equal(reinforcementCopies(Number.MAX_SAFE_INTEGER),8);
 assert(priceStrength(10000)*reinforcementCopies(10000)/low>8);
 assert(priceStrength(200000)*reinforcementCopies(200000)/(priceStrength(10000)*reinforcementCopies(10000))>6);
 for(const value of [-1,NaN,Infinity,1.5])assert.throws(()=>reinforcementCopies(value));
 for(const gift of roster){const plan=giftEntitlement(gift);assert.equal(plan.quality.power.count,GIFTS[plan.reward].count,'budget remains per original formation');}
});

test('advertised quantities match dispatch; all legacy gift entitlements retain population bounds and owner identity',()=>{
 for(const gift of roster){const g=new LiveGame();try{
  ready(g);const plan=giftEntitlement(gift),expected=GIFTS[plan.reward].count*plan.multiplier;
  const connections={bilibili:{state:'authenticated',roomId:42},giftPanels:{bilibili:{state:'ready',roomId:42,expiresAt:g.now()+1000,gifts:roster}}};
  for(const side of ['demon','human']){g.configureBroadcast('bilibili-first');const row=playMenu(g,side,connections).gifts.find(v=>v.giftId===gift.giftId);if(withinBiliGiftBudget(gift))assert(row.label.includes(expected+' × '),row.label);else assert.equal(row,undefined);}
  const event=packet(gift,'one-'+gift.giftId),result=g.receive(event);drain(g);
  const units=g.world.units.filter(u=>u.receipt===result.id);
  assert.equal(units.length,expected,gift.name);assert.equal(new Set(units.map(u=>u.id)).size,expected);
  assert(units.every(u=>u.kind===GIFTS[plan.reward].unit&&u.supporter.platform==='bilibili'));
  assert.equal(new Set(units.map(u=>u.supporter.id)).size,1);
  assert(g.world.population(units[0].side)<=g.world.audienceBattle.populationCap);
  assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get(result.id).status,'deployed');
  assert(g.receive(event).duplicate);assert.equal(g.world.units.length,expected);
 }finally{g.close();}}
});

test('large reinforcements arrive over time, survive restart and capacity pressure, and keep unlimited service from entry',()=>{
 const g=new LiveGame();try{ready(g);const gift=item('爱的乐章'),r=g.receive(packet(gift,'restore'));
  g.drain();g.world.time+=250;g.drain();assert.equal(g.world.units.length,1,'no immediate second formation');g.world.time=4000;g.drain();assert.equal(g.world.units.length,2);
  const saved=g.capture();assert.equal(saved.meta.queue.find(q=>q.receipt===r.id).remaining,6);
  const lease=structuredClone(saved.world.units[0].service);g.restore(saved);
  const population=g.world.population;g.world.population=()=>160;g.world.time+=12000;g.drain();assert.equal(g.meta.queue[0].remaining,6);
  assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get(r.id).status,'queued');
  g.world.population=population;drain(g);
  assert.equal(g.world.units.length,8);assert(g.world.units.every(u=>JSON.stringify(u.service)===JSON.stringify(lease)));
  assert(Math.max(...g.world.units.map(u=>u.summonedAt))-Math.min(...g.world.units.map(u=>u.summonedAt))>=30000);
  assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get(r.id).status,'deployed');
 }finally{g.close();}
});

test('quantity, freebies, changed receipt prices, local gift tests and previously queued grants keep exact entitlements',()=>{
 const gift=item('爱的乐章');const g=new LiveGame();try{ready(g);
  g.receive(packet(gift,'bulk',2));assert.equal(g.meta.queue[0].remaining,16);
  g.receive(packet(gift,'one-a'));g.receive(packet(gift,'one-b'));assert.equal(g.meta.queue[1].remaining+g.meta.queue[2].remaining,16);
  g.receive(packet(gift,'free',1,false));assert.equal(g.meta.queue.at(-1).remaining,1);assert.equal(g.meta.queue.at(-1).quality.power.priceMilli,0);
  g.receive({...packet(gift,'discount',2),amountMilli:2000});assert.equal(g.meta.queue.at(-1).remaining,2);assert.equal(g.meta.queue.at(-1).quality.power.priceMilli,1000);
  const r=g.testGift({side:'demon',giftId:gift.giftId});assert.equal(g.meta.queue.find(q=>q.receipt===r.id).remaining,8);
  const saved=g.capture(),q=saved.meta.queue[0];q.remaining=1;g.restore(saved);assert.equal(g.meta.queue[0].remaining,1,'restore never reprices accepted grants');
 }finally{g.close();}
});


test('both unentered waves and living reinforcements survive arbitrary commander deaths',()=>{
 const g=new LiveGame();try{ready(g);const r=g.receive(packet(item('爱的乐章'),'waiting-eras'));g.drain();const first=g.world.units[0];
 assert.deepEqual(first.service,{joinedAtDeath:0,expiresAtDeath:null});first.hp=100;
 g.world.leaderDeaths=30;retireTroops(g.world);assert(g.world.units.some(u=>u.id===first.id));
 g.world.time=12000;g.restore(g.capture());drain(g);
 assert.equal(g.world.units.length,8);assert(g.world.units.every(u=>u.service.expiresAtDeath===null));assert.equal(g.world.units.find(u=>u.id===first.id).hp,100);
 assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get(r.id).status,'deployed');
 g.world.leaderDeaths=60;retireTroops(g.world);assert.equal(g.world.units.length,8);
 }finally{g.close();}
});
