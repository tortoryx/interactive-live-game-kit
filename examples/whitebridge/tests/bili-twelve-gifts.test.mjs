import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {PLATFORM_GIFTS,resolveGiftMapping} from '../modules/live-runtime/gift-catalog.mjs';
import {BILI_GIFT_ROSTER,WAR_INCANTATIONS} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {giftEntitlement} from '../modules/pixel-war/public/gift-tiers.mjs';
import {quickGiftRows} from '../modules/pixel-war/public/gift-legend.mjs';
import {GIFTS} from '../modules/pixel-war/public/gifts.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
import {launchOwnedEvent} from '../modules/pixel-war/owned-events.mjs';
import {visibleEventAnnouncements,eventNoticeLayout,EventNoticeClock} from '../modules/pixel-war/public/field-events.mjs';
const gift=name=>PLATFORM_GIFTS.bilibili.find(g=>g.name===name&&g.coinType==='gold');
const packet=(kind,id,extra={})=>({id:'bilibili:'+id,platform:'bilibili',actor:'viewer',at:Date.now(),kind,supporter:{name:'测试观众'},...extra});
const receipt=(g,id)=>{const r=g.db.prepare('SELECT status,payload FROM receipts WHERE id=?').get(id);return {...r,data:JSON.parse(r.payload)};};
const drain=g=>{for(let i=0;i<15;i++){g.world.deployed={human:[],demon:[]};g.drain();}};
test('twelve current-panel gifts have twelve distinct troop types and override stale tier mappings consistently',()=>{
 const g=new LiveGame();try{const roles=BILI_GIFT_ROSTER.map(r=>{const item=gift(r.name);assert(item,r.name);g.meta.mappings[item.id]={reward:'pike',multiplier:1};const plan=resolveGiftMapping(g,{platform:'bilibili',giftId:item.giftId,quantity:1,paid:true});assert.equal(plan.reward,r.reward);assert(GIFTS[plan.reward].unit);assert.deepEqual(giftEntitlement(item),plan);return GIFTS[plan.reward].unit;});assert.equal(new Set(roles).size,12);assert.equal(quickGiftRows(BILI_GIFT_ROSTER.map(r=>gift(r.name))).length,6);
 const plane=giftEntitlement(gift('私人飞机')),small=giftEntitlement(gift('人气票'));assert(plane.quality.hpFloor>small.quality.hpFloor);assert(plane.quality.attackFloor>small.quality.attackFloor);
 for(const role of BILI_GIFT_ROSTER){const r=g.testGift({side:'demon',giftId:gift(role.name).giftId});assert.equal(g.meta.queue.find(q=>q.receipt===r.id).key,role.reward);}
 }finally{g.close();}
});
test('full incantation alone queues an owned event once; arbitrary prose and old short commands do not cast',()=>{
 const g=new LiveGame();try{g.meta.liveEnabled=true;const e=packet('chat','spell',{text:WAR_INCANTATIONS[0].text});assert.equal(g.receive(e).status,'event_queued');assert(g.receive(e).duplicate);assert.equal(g.meta.queue.length,1);drain(g);assert.equal(g.world.warEvents.length,1);assert.equal(g.world.warEvents[0].kind,'meteor');assert.equal(receipt(g,e.id).status,'deployed');assert.equal(g.receive(packet('chat','again',{text:WAR_INCANTATIONS[1].text})).status,'event_cooldown');const count=g.meta.queue.length;g.receive(packet('chat','old',{text:'陨石'}));g.receive(packet('chat','prose',{text:'我想说'+WAR_INCANTATIONS[0].text}));assert.equal(g.meta.queue.length,count);
 }finally{g.close();}
});
test('free spell cooldown survives restore and faction switching; paid gifts still grant troops plus their event',()=>{
 let now=1800000000000;const g=new LiveGame({now:()=>now});try{g.configureBroadcast('bilibili-first');g.testChat({side:'demon',text:WAR_INCANTATIONS[1].text});g.restore(g.capture());assert.equal(g.testChat({side:'human',text:WAR_INCANTATIONS[2].text}).status,'event_cooldown');const small=gift('牛哇牛哇');const r=g.receive(packet('gift','gift-alone',{giftId:small.giftId,quantity:2,paid:true,amountMilli:small.price*2}));const grants=g.meta.queue.filter(q=>q.receipt===r.id);assert.deepEqual(grants.map(q=>q.key),['pike','beastRaid']);assert.equal(grants[0].remaining,8);assert.equal(grants[1].remaining,1);assert(g.receive(packet('gift','gift-alone',{giftId:small.giftId,quantity:2,paid:true})).duplicate);
 now+=61000;g.meta.queue=[];assert.equal(g.testChat({side:'human',text:WAR_INCANTATIONS[2].text}).status,'event_queued');
 }finally{g.close();}
});
test('bag gifts keep distinct troop role without paid stats or paid bonus; old choices cannot consume premium units',()=>{
 const g=new LiveGame();try{g.meta.eventChoices={anything:{key:'meteorstorm',until:Infinity}};g.restore(g.capture());assert.equal(g.meta.eventChoices,undefined);const small=gift('人气票');const r=g.receive(packet('gift','bag',{giftId:small.giftId,quantity:1,paid:false}));const grants=g.meta.queue.filter(q=>q.receipt===r.id);assert.equal(grants.length,1);assert.equal(grants[0].key,'scouts');assert.equal(grants[0].quality.tier,0);
 const large=gift('私人飞机');g.receive(packet('gift','premium',{giftId:large.giftId,quantity:1,paid:true,amountMilli:large.price}));assert.equal(g.meta.queue.at(-1).key,'cannons');
 }finally{g.close();}
});
test('a delayed gift bonus never marks its receipt completed early or repeats deployed troops after restore',()=>{
 const g=new LiveGame();try{g.meta.liveEnabled=true;g.world.mode='live';const blocker={side:'demon',source:'test',receipt:'test:block',supporter:{id:'blocker',name:'预占事件'}};for(let i=0;i<3;i++)assert(launchOwnedEvent(g.world,blocker,'rift'));const small=gift('人气票'),e=packet('gift','delayed',{giftId:small.giftId,quantity:1,paid:true,amountMilli:small.price});const r=g.receive(e);drain(g);assert.equal(g.world.units.filter(u=>u.receipt===r.id).length,5);assert.equal(receipt(g,r.id).status,'queued');assert.equal(receipt(g,r.id).data.fulfillment.applied,5);g.restore(g.capture());assert(g.receive(e).duplicate);g.world.warEvents=[];drain(g);assert.equal(g.world.units.filter(u=>u.receipt===r.id).length,5);assert.equal(g.world.warEvents.length,1);assert.equal(receipt(g,r.id).status,'deployed');assert.equal(receipt(g,r.id).data.fulfillment.applied,6);
 }finally{g.close();}
});
test('small flower summons a healer AND revives owned fallen troops; no fallen troops still receives healer',()=>{
 const g=new LiveGame();try{const first=g.testGift({side:'demon',giftId:gift('小花花').giftId});drain(g);assert.equal(receipt(g,first.id).status,'deployed');let healer=g.world.units.find(u=>u.receipt===first.id);assert.equal(healer.kind,'healer');g.world.resolveHit(g.world.heroes.human,healer,1e9);const second=g.testGift({side:'demon',giftId:gift('小花花').giftId});drain(g);assert(g.world.units.find(u=>u.id===healer.id&&u.hp>0));assert(g.world.units.find(u=>u.receipt===second.id&&u.kind==='healer'));assert.equal(receipt(g,second.id).data.fulfillment.applied,2);
 }finally{g.close();}
});
test('grant overflow rolls back complete gift including bonus, so retry remains possible',()=>{
 const g=new LiveGame();try{g.meta.queue=Array.from({length:4095},(_,i)=>({receipt:'existing:'+i,remaining:1}));const e=packet('gift','full',{giftId:gift('人气票').giftId,quantity:1,paid:true});assert.throws(()=>g.receive(e),/queue_capacity/);assert.equal(g.meta.queue.length,4095);assert.equal(g.db.prepare('SELECT id FROM receipts WHERE id=?').get(e.id),undefined);g.meta.queue=[];assert.equal(g.receive(e).status,'queued');assert.equal(g.meta.queue.length,2);
 }finally{g.close();}
});
test('active events recover their right-hand notice; centre dwell is 0.5s then docking within minimap width',()=>{
 const s={time:1000,announcements:[],warEvents:[{id:1,kind:'meteor',at:0,until:19000,actorSide:'demon',owner:{name:'玩家'}}]};const events=visibleEventAnnouncements(s);assert.equal(events.length,1);const clock=new EventNoticeClock(),notices=clock.update(events,1000,1000),map={x:840,y:500,w:120,h:80};const layout=eventNoticeLayout(notices,1000,980,640,map);assert.equal(layout[0].phase,'docked');assert(layout[0].w<=map.w);assert.equal(visibleEventAnnouncements({...s,announcements:[{...events[0],giftEvent:1}]}).length,1);
});
test('Luna receives the same authoritative faction and event rules the audience sees',()=>{
 const g=new LiveGame();try{g.configureBroadcast('bilibili-first');const rules=g.context('demon').interactionRules;assert.match(rules.factions,/加入人族或加入魔族即可/);assert.deepEqual(rules.events.incantations,WAR_INCANTATIONS);assert.equal(rules.giftTroops.length,6);assert.match(rules.events.rule,/不需要再送礼/);
 }finally{g.close();}
});
test('production gift IDs spawn the twelve advertised units and preserve receipt-time faction',()=>{
 const fixtures=[[33988,'scout'],[31164,'shield'],[31039,'pike'],[31036,'healer'],[35534,'bow'],[35520,'rider'],[34500,'musketeer'],[35545,'grenadier'],[31122,'mage'],[35535,'cannon'],[35566,'colossus'],[32228,'dreadnought']];
 for(const [id,kind] of fixtures){const g=new LiveGame();try{g.configureBroadcast('bilibili-first');g.meta.liveEnabled=true;g.receive(packet('chat','choose-human',{text:'加入人族'}));const r=g.receive(packet('gift','actual-id-'+id,{giftId:id,quantity:1,paid:true}));g.receive(packet('chat','choose-demon',{text:'加入魔族'}));drain(g);const units=g.world.units.filter(u=>u.receipt===r.id);assert(units.length>0,kind);assert(units.every(u=>u.kind===kind&&u.side==='human'));assert(g.world.warEvents.every(e=>e.actorSide==='human'));}finally{g.close();}}
});
test('bonus and free events do not double support points; receipt retains distinct component counts',()=>{
 const g=new LiveGame();try{g.meta.liveEnabled=true;const item=gift('人气票'),e=packet('gift','score',{giftId:item.giftId,quantity:1,paid:true});g.receive(e);drain(g);assert.equal(g.meta.points.demon,GIFTS.scouts.points);const c=receipt(g,e.id).data.fulfillment.components;assert.equal(c.scouts.applied,5);assert.equal(c.meteorstorm.applied,1);const before=g.meta.points.demon;g.testChat({side:'demon',text:WAR_INCANTATIONS[2].text});drain(g);assert.equal(g.meta.points.demon,before);
 }finally{g.close();}
});
test('changed authenticated per-item price changes troop strength without changing primary kind or multiplying price twice',()=>{
 const g=new LiveGame();try{const item=gift('私人飞机'),e={platform:'bilibili',giftId:item.giftId,quantity:2,paid:true,amountMilli:2000};const plan=resolveGiftMapping(g,e),expected=giftEntitlement({...item,price:1000},2);assert.equal(plan.reward,'cannons');assert.deepEqual(plan.quality,expected.quality);assert.equal(plan.quality.tier,2);
 }finally{g.close();}
});
test('unplaceable bombardment remains queued without false announcement or fulfillment',()=>{
 const g=new LiveGame();try{g.meta.liveEnabled=true;const old=g.world.ground;const r=g.testChat({side:'demon',text:WAR_INCANTATIONS[0].text});g.world.ground=()=>null;drain(g);assert.equal(g.world.warEvents.length,0);assert.equal(g.world.announcements.length,0);assert.equal(receipt(g,r.id).status,'event_queued');g.world.ground=old;drain(g);assert.equal(g.world.warEvents.length,1);assert(g.world.hazards.length>0);assert.equal(receipt(g,r.id).status,'deployed');
 }finally{g.close();}
});
