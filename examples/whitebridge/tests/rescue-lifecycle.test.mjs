import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {rescueCost,rescueQuote,rescueSnapshot} from '../modules/live-runtime/rescue.mjs';
import {eligibleFallen,retireTroops} from '../modules/pixel-war/service-life.mjs';
import {beginSettlement,advanceSettlement} from '../modules/pixel-war/settlement.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {rescueCards,rescueLines} from '../modules/pixel-war/public/rescue-status.mjs';
import {trainViewerTroop} from '../modules/pixel-war/viewer-training.mjs';
import roster from './fixtures/bili-priced-roster.json' with {type:'json'};

const gift=name=>roster.find(g=>g.name===name);
let serial=0;
function event(name='小花花',actor='alice',extra={}){const g=gift(name);return {id:'bilibili:rescue-'+(++serial),platform:'bilibili',actor,at:1800000000000,kind:'gift',giftId:g.giftId,quantity:1,paid:true,amountMilli:g.price,supporter:{name:actor},...extra};}
function ready(g){Object.assign(g.world,{mode:'live',paused:false});g.meta.liveEnabled=true;}
function deploy(g,name='私人飞机',actor='alice'){const e=event(name,actor);g.receive(e);g.drain();const u=g.world.units.find(u=>u.receipt===e.id);assert(u);return u;}
function kill(g,u){g.world.resolveHit(g.world.heroes.human,u,1e9);return g.world.fallenTroops.find(f=>f.id===u.id);}
function quote(g,u){return rescueQuote(g,u.supporter.id,u.side);}
function complete(g){for(let i=0;i<20;i++){g.world.deployed={human:[],demon:[]};g.drain();}}
function query(g,actor='alice'){return g.receive({id:'bilibili:q-'+(++serial),platform:'bilibili',actor,at:1800000000000,kind:'chat',text:'复活',supporter:{name:actor}});}

test('survivors, wounds, XP and pending grants survive ten generations, including old three-round checkpoint leases',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);u.hp=123;u.level=4;u.xp=210;const id=u.id;u.service.expiresAtDeath=3;g.meta.queue[0].service={joinedAtDeath:0,expiresAtDeath:3};
 for(let i=0;i<10;i++){const side=i%2?'demon':'human';g.world.heroes[side].hp=0;beginSettlement(g.world,[side]);g.world.time=g.world.result.startedAt+g.world.result.timing.end;advanceSettlement(g.world,0);assert.equal(u.hp,123);assert(g.world.units.includes(u));}
 g.restore(JSON.parse(JSON.stringify(g.capture())));const v=g.world.units.find(v=>v.id===id);assert.equal(v.hp,123);assert.equal(v.xp,210);assert.equal(v.service.expiresAtDeath,null);assert.equal(g.meta.queue[0].service.expiresAtDeath,null);assert.equal(retireTroops(g.world),0);
 const frame=decodeFrame(encodeFrame(g.snapshot()));assert.equal(frame.units.find(v=>v.id===id).remainingBattles,null);
 trainViewerTroop(g.world,v);assert.equal(v.hp,123,'explicit training cannot heal survivors');
 }finally{g.close();}
});
test('price divides by all delivered formation copies; veterans and repeat resurrection cost more, cheap troops remain cheap',()=>{
 const low={giftQuality:{power:{version:1,priceMilli:100,count:5}},level:1,life:1};
 const high={giftQuality:{power:{version:1,priceMilli:200000,count:1}},level:1,life:1};
 assert.equal(rescueCost(low),10);assert.equal(rescueCost(high),12500);
 assert.equal(rescueCost({...high,level:5}),17500);assert.equal(rescueCost({...high,life:2}),15630);
});
test('one cheap flower cannot resurrect heavy troops; gifts still dispatch, partial points and exact deficits are visible',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g),f=kill(g,u);assert.equal(quote(g,u).creditMilli,0,'initial purchase did not prepay rescue');
 const e=event(),r=g.receive(e);assert.equal(r.status,'queued');complete(g);const q=quote(g,u);
 assert.equal(q.count,1);assert.equal(q.creditMilli,100);assert.equal(q.costMilli,rescueCost(f));assert.equal(q.missingMilli,q.costMilli-100);
 assert(g.world.units.some(v=>v.receipt===e.id&&v.kind==='healer'));assert(!g.world.units.some(v=>v.id===u.id&&v.hp>0));
 assert.equal(query(g).interaction.missingMilli,q.missingMilli);const s=decodeFrame(encodeFrame(g.snapshot()));assert(s.rescues.find(v=>v.ownerId===u.supporter.id).count===1);
 }finally{g.close();}
});
test('real paid receipts can finish progress exactly once; resurrection preserves ID, level, weapon and owner',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);Object.assign(u,{level:4,xp:190,shots:3,interval:6.2});const f=kill(g,u),cost=rescueCost(f);
 const e=event('星愿水晶球','alice',{amountMilli:cost}),out=g.receive(e);assert.equal(out.status,'queued');const q=quote(g,u);assert.equal(q.pending,1);assert.equal(q.creditMilli,0);assert.equal(g.receive(e).duplicate,true);
 complete(g);const v=g.world.units.find(v=>v.id===u.id);assert(v.hp>0);assert.equal(v.life,2);assert.equal(v.level,4);assert.equal(v.shots,3);assert.equal(v.interval,6.2);assert.equal(v.supporter.id,u.supporter.id);
 const receipt=JSON.parse(g.db.prepare('SELECT payload FROM receipts WHERE id=?').get(e.id).payload);assert.equal(receipt.rescue.spentMilli,cost);assert.equal(receipt.rescue.reserved,1);
 assert.equal(g.meta.queue.filter(q=>q.receipt===e.id&&q.key==='revive').length,0);
 }finally{g.close();}
});
test('free/bag gifts, forged chat amounts, other viewers, wrong sides and unverified values cannot fund resurrection',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);kill(g,u);const bad=[event('私人飞机','alice',{paid:false,amountMilli:100000}),event('私人飞机','alice',{paid:true,amountMilli:1.2}),event('小花花','bob'),event('私人飞机','alice',{paid:undefined,amountMilli:100000})];
 // Fractional gift prices are invalid independently of rescue; use a custom mapping for this validation case.
 bad.splice(1,1);
 for(const e of bad)g.receive(e);
 g.receive({id:'bilibili:forged-query',platform:'bilibili',actor:'alice',at:1800000000000,kind:'chat',text:'复活',amountMilli:1000000,supporter:{name:'alice'}});
 assert.equal(quote(g,u).creditMilli,0);assert.equal(quote(g,u).count,1);assert.equal(rescueQuote(g,u.supporter.id,'human').count,0);
 }finally{g.close();}
});
test('partial rescue prioritizes affordable troops, holds surplus for this owner and does not revive newly dead units from an old receipt',()=>{
 const g=new LiveGame();try{ready(g);const heavy=deploy(g),light=deploy(g,'人气票');kill(g,heavy);const lightF=kill(g,light),cost=rescueCost(lightF);
 const e=event('小花花','alice',{amountMilli:100});g.receive(e);const q=quote(g,heavy);assert.equal(q.pending,1);assert.equal(q.count,1);assert.equal(q.creditMilli,100-cost);
 complete(g);const revived=g.world.units.find(u=>u.id===light.id);assert(revived.hp>0);kill(g,revived);g.receive(e);assert.equal(quote(g,heavy).count,2);
 }finally{g.close();}
});
test('reserved resurrection survives full population, 60 seconds, many commander deaths and a disk restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'duel-rescue-')),path=join(dir,'state.sqlite');let g=new LiveGame({path});try{ready(g);const u=deploy(g);kill(g,u);const cost=quote(g,u).costMilli;
 const e=event('小花花','alice',{amountMilli:cost});g.receive(e);const pop=g.world.population;g.world.population=()=>9999;g.drain();g.world.time+=70000;g.world.leaderDeaths=99;retireTroops(g.world);g.world.population=pop;
 const id=u.id,ownerId=u.supporter.id;g.close();g=new LiveGame({path});ready(g);assert.equal(rescueQuote(g,ownerId,'demon').pending,1);assert(g.receive(e).duplicate);complete(g);const v=g.world.units.find(v=>v.id===id);assert.equal(v.life,2);assert(v.hp>0);
 }finally{g.close();rmSync(dir,{recursive:true,force:true});}
});
test('deadline is battle time; ceremonies do not consume it, expired unreserved troops cannot be recovered and progress stays',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);kill(g,u);g.receive(event());const credit=quote(g,u).creditMilli;
 g.world.heroes.human.hp=0;beginSettlement(g.world,['human']);for(let i=0;i<20;i++){g.world.time+=50;advanceSettlement(g.world,50);}assert.equal(quote(g,u).remainingMs,60000);
 g.world.time+=60001;retireTroops(g.world);assert.equal(eligibleFallen(g.world,u.supporter.id,u.side).length,0);assert.equal(quote(g,u).creditMilli,credit);assert.equal(query(g).interaction.count,0);
 }finally{g.close();}
});
test('receipt rollback cannot consume progress or reserve corpses when the queue is full',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);kill(g,u);const cost=quote(g,u).costMilli,prior=g.capture();g.meta.queue=Array.from({length:4096},()=>({...g.meta.queue[0]}));const e=event('小花花','alice',{amountMilli:cost});assert.throws(()=>g.receive(e),/queue_capacity/);
 assert.equal(quote(g,u).creditMilli,0);assert.equal(quote(g,u).pending,0);assert.equal(g.db.prepare('SELECT id FROM receipts WHERE id=?').get(e.id),undefined);g.restore(prior);g.receive(e);assert.equal(quote(g,u).pending,1);
 }finally{g.close();}
});
test('query after total loss anchors a short owner-named card; old costs do not form a permanent wall of text',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);kill(g,u);query(g);g.world.units=[];const r=rescueSnapshot(g)[0];assert.equal(r.supporter.name,'alice');assert(Number.isFinite(r.anchor.x));
 const camera={screenW:960,screenH:540,project:()=>({x:900,y:300})},cards=rescueCards([r],camera,[],g.world.time);assert.equal(cards.length,1);assert(rescueLines(r)[1].includes('/'));assert.equal(rescueCards([r],camera,[],g.world.time+8001).length,0);
 camera.project=()=>({x:-1000,y:300});const off=rescueCards([r],camera,[],g.world.time);assert(off[0].offscreen);assert(off[0].x>=0);assert(off[0].x+off[0].w<=960);
 }finally{g.close();}
});

test('unmapped receipt waits without spending rescue points and late mapping grants rescue only once',()=>{
 const g=new LiveGame();try{ready(g);const u=deploy(g);kill(g,u);const cost=quote(g,u).costMilli,e=event('小花花','alice',{giftId:987654321,amountMilli:cost});
 assert.equal(g.receive(e).status,'unmapped');assert.equal(quote(g,u).creditMilli,0);assert.equal(quote(g,u).pending,0);
 g.configureMappings([{platform:'bilibili',giftId:e.giftId,reward:'scouts',multiplier:1}]);assert.equal(quote(g,u).pending,1);g.retryUnmapped();assert.equal(quote(g,u).creditMilli,0);assert.equal(g.meta.queue.filter(q=>q.receipt===e.id&&q.key==='revive').length,1);
 }finally{g.close();}
});
test('snapshot quote agrees with the authoritative quote for multiple owners; no currency is pooled between them',()=>{
 const g=new LiveGame();try{ready(g);const a=deploy(g,'私人飞机','alice'),b=deploy(g,'人气票','bob');kill(g,a);kill(g,b);g.receive(event('小花花','alice'));query(g,'bob');
 const snap=rescueSnapshot(g);for(const u of [a,b]){const r=snap.find(r=>r.ownerId===u.supporter.id),q=quote(g,u);for(const k of ['count','pending','costMilli','creditMilli','missingMilli','nextCostMilli','remainingMs'])assert.equal(r[k],q[k]);}
 assert.equal(quote(g,b).creditMilli,0);
 }finally{g.close();}
});

test('50 simultaneous quote requests are rotated compactly without old quotes or permanent cards',async()=>{
 const {RescuePresentationQueue}=await import('../modules/pixel-war/public/rescue-status.mjs'),q=new RescuePresentationQueue(),seen=new Set(),rows=Array.from({length:50},(_,i)=>({side:'demon',ownerId:String(i),count:1,pending:0,shownAt:0,queriedAt:0,remainingMs:60000}));
 for(let t=0;t<60000;t+=500){const cards=q.update(rows.map(r=>({...r,remainingMs:60000-t})),t);assert(cards.length<=2);for(const r of cards){seen.add(r.ownerId);assert.equal(r.remainingMs,60000-t);}}
 assert.equal(seen.size,50);assert.equal(q.update(rows,65000).length,0);assert.equal(q.update([],70000).length,0);
});
