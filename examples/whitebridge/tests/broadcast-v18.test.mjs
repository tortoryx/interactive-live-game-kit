import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {withdrawalPlan} from '../modules/pixel-war/withdrawal.mjs';
import {commanderPlan} from '../modules/pixel-war/strategy.mjs';
import {frontX} from '../modules/pixel-war/campaign.mjs';
import {heroAdvice,heroAdviceStep} from '../modules/pixel-war/viewer-troops.mjs';
import {reinforcementZone,reinforcementPoint} from '../modules/pixel-war/reinforcements.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {SummonCamera} from '../modules/pixel-war/public/summon-camera.mjs';
import {leaderSpeechLayout,summonHighlightLayout} from '../modules/pixel-war/public/leader-speech.mjs';
import {bodyBox,overlaps} from '../modules/pixel-war/public/label-layout.mjs';
import {Camera} from '../modules/pixel-war/public/camera.mjs';
import {eventNoticeLayout} from '../modules/pixel-war/public/field-events.mjs';
import {battleMapBox} from '../modules/pixel-war/public/view-rhythm.mjs';
import {BilibiliNormalizer} from '../modules/connectors/bilibili-events.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function placement(w,side='demon'){w.units=[];const h=w.heroes[side];Object.assign(h,w.ground({x:frontX(w)+(side==='demon'?-100:100),y:896}));Object.assign(w.heroes[side==='demon'?'human':'demon'],{x:h.x+1000,y:h.y});return h;}
test('withdrawal moves to a fixed destination, stops within 4.5 seconds and cannot drag the leader past the home line',()=>{
 const w=new PixelWorld(),h=placement(w),start={x:h.x,y:h.y};h.hp=h.maxHP*.15;const enemy=w.fighter('human','militia',UNITS.militia,h.x+50,h.y);let first=commanderPlan(w,h,[enemy],[]);assert.equal(first.order,'retreat');assert(d(first.goal,start)<=270);
 for(let i=0;i<90;i++){w.time+=50;const p=withdrawalPlan(w,h,[enemy]);if(p){assert.deepEqual(p.goal,first.goal);w.move(h,p.goal,.05);}}
 assert(h.withdrawal.done);assert(d(h,start)>25);assert(d(h,start)<=280);assert.equal(withdrawalPlan(w,h,[enemy]),null);assert.equal(h.withdrawalCooldown>w.time,true);
 Object.assign(h,{x:frontX(w)-1000,withdrawal:null,withdrawalCooldown:0,mission:null,nextPlan:0});assert.equal(withdrawalPlan(w,h,[]),null);const recovery=commanderPlan(w,h,[],[]);assert(recovery.goal.x>h.x,'an already detached leader must return toward the contested front');
});
test('audience retreat is also bounded and a new forward order interrupts it',()=>{
 const w=new PixelWorld(),h=placement(w),x=h.x;heroAdvice(w,'demon','retreat');for(let i=0;i<120;i++){w.time+=50;heroAdviceStep(w,h,null,.05);}assert(x-h.x>20&&x-h.x<=280);assert.equal(h.viewerAdvice,null);heroAdvice(w,'demon','advance');assert.equal(h.withdrawal,null);
});
test('viewer reinforcements use the safe ring, a rear wedge under threat, and a ring when surrounded on both sides',()=>{
 for(const side of ['demon','human']){const w=new PixelWorld(),h=placement(w,side),enemy=side==='demon'?'human':'demon',dir=side==='demon'?1:-1;assert.equal(reinforcementZone(w,side),'safe');let p=reinforcementPoint(w,side,'militia');assert(p&&d(p,h)>=64-1e-6&&d(p,h)<=170);assert(w.open(p.x,p.y));
 w.units=[w.fighter(enemy,'militia',UNITS.militia,h.x+dir*110,h.y)];assert.equal(reinforcementZone(w,side),'rear');p=reinforcementPoint(w,side,'militia');assert(p);assert(dir*(p.x-h.x)<-100);assert(d(p,h)>=180-1e-6&&d(p,h)<=280);
 w.units=Array.from({length:4},(_,i)=>{const a=.3+i*Math.PI/2;return w.fighter(enemy,'militia',UNITS.militia,h.x+Math.cos(a)*160,h.y+Math.sin(a)*160);});assert.equal(reinforcementZone(w,side),'surrounded');p=reinforcementPoint(w,side,'militia');assert(p&&d(p,h)<=170);assert(!w.allAlive().some(u=>d(u,p)<u.radius+21));
 }
});
test('a real gift receipt groups its soldiers into one camera shot; duplicate delivery cannot replay it',()=>{
 const g=new LiveGame();try{placement(g.world);g.meta.liveEnabled=true;g.configureMappings([{platform:'bilibili',giftId:123,reward:'rally',multiplier:1}]);const e={id:'bilibili:fixture:gift',kind:'gift',platform:'bilibili',actor:'test-only-donor',at:Date.now(),giftId:123,giftName:'测试礼物',quantity:1,paid:true,supporter:{name:'测试召唤者'}};g.receive(e);for(let i=0;i<30;i++)g.step(50);const shots=g.snapshot().reinforcementShots;assert.equal(shots.length,1);assert.equal(shots[0].units.length,6);assert.equal(shots[0].supporter.name,'测试召唤者');assert(shots[0].units.every(v=>g.world.units.some(u=>u.id===v.id&&u.supporter.id===shots[0].supporter.id)));g.receive(e);assert.equal(g.snapshot().reinforcementShots.length,1);assert.equal(g.meta.giftNames['bilibili:123'],'测试礼物');assert.equal(playMenu(g,'demon').previewGifts.length,0);}finally{g.close();}
});
test('summon camera eases in, dwells, returns to overview between viewers, and never replays history',()=>{
 const c=new SummonCamera('demon'),s={fieldEpoch:8,time:1000,mode:'live',units:[],reinforcementShots:[{id:1,side:'demon',units:[],x:1,y:2}]};assert.equal(c.update(s,.05),null);
 s.reinforcementShots.push(...[2,3,4].map(id=>({id,side:id===3?'human':'demon',units:[{id:'u'+id,life:1}],x:id*10,y:20})));s.units=[{id:'u2',life:1,hp:100,x:200,y:200}];assert.equal(c.update(s,.05).id,2);
 let held=0;for(let i=0;i<70;i++){const shot=c.update(s,.05);if(shot?.id===2&&shot.blend===1)held++;}assert(held>=35,'viewers get more than 1.7 seconds of full focus');
 const elapsed=c.elapsed;s.mode='settlement';assert.equal(c.update(s,30),null);assert.equal(c.elapsed,elapsed);s.mode='live';for(let i=0;i<30;i++)c.update(s,.05);assert.equal(c.active,null);assert(c.cooldown>0);for(let i=0;i<42;i++)c.update(s,.05);assert.equal(c.active.id,4);
 s.paused=true;const paused=c.elapsed;c.update(s,10);assert.equal(c.elapsed,paused);s.paused=false;for(let i=0;i<100;i++)c.update(s,.05);assert.equal(c.active,null);assert.equal(c.queue.length,0);
 const fresh=new SummonCamera('demon');assert.equal(fresh.update(s,.05),null);assert.equal(fresh.queue.length,0);
});
test('SC uses the official wall clock pin interval, expires while paused and withdraws immediately',()=>{
 let now=1800000000000;const g=new LiveGame({now:()=>now}),n=new BilibiliNormalizer({roomId:42,secret:'test-only-secret-12345678901234567890',now:()=>now});const sc=(id,extra={})=>({cmd:'LIVE_OPEN_PLATFORM_SUPER_CHAT',data:{room_id:42,open_id:'opaque',message_id:id,message:'我在这边守桥',uname:'测试留言者',rmb:30,timestamp:now/1000,start_time:now/1000,end_time:now/1000+60,...extra}});try{
 const e=n.parse(sc(101)).event;assert.equal(e.pinEnd-e.pinStart,60000);g.receive(e);g.world.paused=true;assert.equal(g.snapshot().audience.pinned[0].remainingMs,60000);now+=61000;assert.equal(g.snapshot().audience.pinned.length,0);
 g.receive(n.parse(sc(102)).event);assert.equal(g.snapshot().audience.pinned.length,1);g.receive(n.parse({cmd:'LIVE_OPEN_PLATFORM_SUPER_CHAT_DEL',data:{room_id:42,message_ids:[102]}}).event);assert.equal(g.snapshot().audience.pinned.length,0);
 const untimed=n.parse(sc(103,{start_time:undefined,end_time:undefined})).event;g.receive(untimed);assert.equal(g.snapshot().audience.pinned.length,0);assert.equal(g.meta.audience.pending.some(m=>m.id===untimed.id),true);
 }finally{g.close();}
});
test('platform menus expose only actual bindings and do not pretend Xiaohongshu transport or gift pricing exists',()=>{
 const g=new LiveGame();try{g.configureMappings([{platform:'bilibili',giftId:123,reward:'rally',multiplier:2}]);const d=playMenu(g,'demon',{bilibili:{state:'authenticated'}}),h=playMenu(g,'human');assert.equal(d.connected,true);assert.equal(d.liveEnabled,false);assert.equal(d.previewGifts.length,0);assert.equal(d.catalogScope,'room_unverified');assert.equal(d.gifts.length,0);assert.equal(h.connected,false);assert.equal(h.previewGifts.length,0);assert.equal(h.gifts.length,0);assert(!JSON.stringify([d,h]).includes('¥'));}finally{g.close();}
});
test('leader dialogue wraps above its body and event cards stay within the minimap width on narrow and wide views',()=>{
 const w=new PixelWorld(),h=placement(w),state=w.snapshot();state.speech=[{id:'fixture',side:'demon',persona:h.id,at:state.time,text:'先别冲，我的重炮还没就位。等我把桥边这箱补给拿走，再一起顶上去。'}];const c=new Camera('demon',960,540);c.x=h.x;c.y=h.y;const ctx={measureText:t=>({width:[...t].length*12})};const b=leaderSpeechLayout(ctx,state,'demon',state.heroes.demon,c);assert(b.lines.length<=4);assert(b.w<220);assert(!overlaps(b,bodyBox(state.heroes.demon,c)));const u={...state.heroes.demon,id:'troop',kind:'militia',x:h.x-60,y:h.y+30,life:1},shot={x:u.x,y:u.y,units:[{id:u.id,life:1}]},sb=summonHighlightLayout(shot,[state.heroes.demon,u],c,b);assert(sb);assert(!overlaps(sb,b));assert(!overlaps(sb,bodyBox(state.heroes.demon,c)));
 for(const screenW of [640,960,1440])for(const expansion of [0,1]){const map=battleMapBox({screenW,screenH:540},expansion),events=Array.from({length:3},(_,i)=>({kind:'quake',at:i*100,displayAt:i*100,until:20000,effectUntil:18000}));const notices=eventNoticeLayout(events,6000,screenW,540,map);for(const n of notices){assert(n.w<=map.w+18);assert(n.x+n.w/2<=screenW);assert(n.y+n.h/2<540);}}
});
test('visiting, refreshing and changing viewpoint never resets the world; the owner main page has no reset or fabricated paid chat',async()=>{
 const app=await createPreview({stagePort:19570,controlPort:19571,clock:false});try{const h=app.world.heroes.demon;h.hp=3210;h.x-=40;const before=app.world.snapshot();for(const side of ['demon','human','demon']){const html=await(await fetch('http://127.0.0.1:19571/?side='+side)).text();assert(!html.includes('id="reset"'));assert(!html.includes('id="chatPaid"'));await fetch('http://127.0.0.1:19570/?side='+side);const m=await(await fetch('http://127.0.0.1:19570/play-menu?side='+side)).json();assert.equal(m.platform,side==='demon'?'bilibili':'xiaohongshu');}assert.deepEqual(app.world.snapshot(),before);}finally{await app.close();}
});

test('temporary sortie fallback and stun cannot extend retreat past its deadline',()=>{
 const w=new PixelWorld(),h=placement(w);w.mode='test_live';w.nextSpawn=w.nextHazard=w.nextGiant=w.nextWildlife=w.nextObjective=w.nextSurprise=w.nextPickup=1e12;Object.assign(h,{tactic:'retreat',tacticUntil:30000,sortieUntil:30000});w.step(50);assert(h.withdrawal);const goal={x:h.withdrawal.x,y:h.withdrawal.y},deadline=h.withdrawal.until;for(let i=0;i<8;i++)w.step(50);assert.equal(h.withdrawal.x,goal.x);assert.equal(h.withdrawal.y,goal.y);h.stunnedUntil=deadline+10000;while(w.time<deadline+50)w.step(50);assert(h.withdrawal.done);assert(h.withdrawalCooldown>w.time);
});
