import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {feedbackText} from '../modules/pixel-war/public/interaction-feedback.mjs';
import {tickAmbientBattle,AMBIENT_CAP,battleDamageScale} from '../modules/pixel-war/ambient-battle.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
const event=(id,text)=>({id:'bilibili:feedback:'+id,platform:'bilibili',actor:'viewer',kind:'chat',text,at:1800000000000,supporter:{name:'真实测试者'}});
test('each enlist message recruits one owned soldier without a cooldown, including faction switches',()=>{
 const now=1800000000000,g=new LiveGame({now:()=>now});try{g.configureBroadcast('bilibili-first');g.meta.liveEnabled=true;
 g.receive(event('join','加入魔族'));let f=g.snapshot().feedback;assert.match(feedbackText(f.items.at(-1),now).detail,/已加入魔族/);
 const first=g.receive(event('first','参战'));assert.equal(first.interaction.count,1);g.drain();assert.equal(g.world.units.filter(u=>u.supporter?.id).length,1);
 const owner=g.world.units[0].supporter.id;
 // Old saved cooldown entries must not block the new rule.
 g.meta.cooldowns['enlist:'+owner]=now;g.meta.cooldowns['enlist:'+owner+':human']=now;
 const again=g.receive(event('again','参战'));assert.equal(again.status,'recruited');assert.equal(again.interaction.remainingMs,0);
 const feedback=g.snapshot().feedback.items.at(-1);assert.equal(feedback.readyAt,null);assert.match(feedbackText(feedback,now).detail,/1 名剑士.*可继续/);
 g.receive(event('switch','加入人族'));assert.equal(g.receive(event('third','参战')).status,'recruited');
 g.drain();g.drain();const troops=g.world.units.filter(u=>u.supporter?.id);assert.equal(troops.length,3);assert.equal(troops.filter(u=>u.side==='demon').length,2);assert.equal(troops.filter(u=>u.side==='human').length,1);assert(troops.every(u=>u.supporter.id===owner));
 assert.equal(g.meta.queue.length,0);assert(g.receive(event('third','参战')).duplicate);assert.equal(g.meta.queue.length,0,'duplicate callback does not create extra units');
 }finally{g.close();}
});
test('twenty distinct enlist messages are fulfilled once each, retaining grants while capacity is unavailable',()=>{
 const g=new LiveGame({now:()=>1800000000000});try{g.meta.liveEnabled=true;
 const ids=Array.from({length:20},(_,i)=>'burst-'+i);
 for(const id of ids)assert.equal(g.receive(event(id,'参战')).status,'recruited');
 assert.equal(g.meta.queue.reduce((n,q)=>n+q.remaining,0),20);
 const spawn=g.world.spawn;g.world.spawn=()=>false;g.drain();assert.equal(g.meta.queue.reduce((n,q)=>n+q.remaining,0),20);g.world.spawn=spawn;
 for(let i=0;i<20;i++){g.world.deployed={human:[],demon:[]};g.drain();}
 const troops=g.world.units.filter(u=>u.source==='bilibili');assert.equal(troops.length,20);assert.equal(new Set(troops.map(u=>u.receipt)).size,20);assert.equal(g.meta.queue.length,0);
 for(const id of ids)assert(g.receive(event(id,'参战')).duplicate);
 g.drain();assert.equal(g.world.units.length,20);
 const receipts=g.db.prepare('SELECT status,payload FROM receipts').all();assert.equal(receipts.length,20);assert(receipts.every(r=>r.status==='deployed'&&JSON.parse(r.payload).fulfillment.applied===1));
 }finally{g.close();}
});
test('paid gifts still deploy independently and ordinary chat receives acknowledgement',()=>{const g=new LiveGame();try{g.testChat({side:'demon',text:'参战'});g.drain();g.drain();g.testGift({side:'demon',reward:'rally'});g.drain();g.drain();assert(g.world.units.length>2);g.testChat({side:'demon',text:'啊啊啊'});assert.equal(g.snapshot().feedback.items.at(-1).kind,'reply_waiting');}finally{g.close();}});
test('ambient armies are symmetrical, weak, small, capped and never impersonate viewers or consume player spawn budgets',()=>{const g=new LiveGame();try{const w=g.world;w.time=2000;tickAmbientBattle(w);for(let i=0;i<10;i++){w.time+=8000;tickAmbientBattle(w);}for(const side of ['human','demon']){const units=w.units.filter(u=>u.side===side);assert.equal(units.length,AMBIENT_CAP);assert(units.every(u=>u.kind==='levy'&&u.scale<1&&!u.supporter&&!u.receipt));assert.equal(w.deployed[side].length,0);}assert(UNITS.levy.hp<UNITS.militia.hp&&UNITS.levy.attack<UNITS.militia.attack);assert(g.testGift({side:'human',reward:'rally'}).ok);g.drain();g.drain();assert(w.units.some(u=>u.supporter?.id));}finally{g.close();}});
test('slower commander duels preserve player damage and do not heal existing leaders',()=>{const g=new LiveGame();try{const w=g.world;w.mode='live';const h=w.heroes.human,d=w.heroes.demon;assert.equal(battleDamageScale(d,h),.32);assert.equal(battleDamageScale({kind:'militia',side:'demon',supporter:{id:'real'}},h),1);const before=h.hp;w.resolveHit(d,h,1000);assert(h.hp<before&&h.hp>before-500);assert.equal(h.maxHP,9000);}finally{g.close();}});
