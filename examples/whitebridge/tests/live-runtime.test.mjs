import {CINEMATIC} from '../modules/pixel-war/public/cinematic.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {ModelDirector,modelRequest} from '../modules/live-runtime/models.mjs';
import {createBroker} from '../modules/live-runtime/broker.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {rawDamage} from '../modules/pixel-war/public/catalog.mjs';
import {allowedSocket,signedRequest,packet,BiliConnection} from '../modules/live-runtime/bilibili.mjs';
const tick=(g,n)=>{for(let i=0;i<n;i++)g.step(50);};
const fixtureGift={id:'bilibili:123:message001',platform:'bilibili',at:Date.now(),actor:'fixture-anonymous',kind:'gift',giftId:98765,quantity:1,paid:true};

test('gift receipt survives restart, duplicate never doubles troops, population pressure queues the remainder',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'duel-ledger-'));let g=new LiveGame({path:join(dir,'world.sqlite')});
 try{const id='test:receipt001';g.testGift({id,side:'human',reward:'rally',quantity:10});tick(g,30);const emitted=g.world.units.filter(u=>u.receipt===id).length;assert(emitted>0);assert(g.meta.queue[0].remaining>0);const remaining=g.meta.queue[0].remaining;const persona=g.world.heroes.human.id;g.close();g=new LiveGame({path:join(dir,'world.sqlite')});assert.equal(g.world.heroes.human.id,persona);assert.equal(g.meta.queue[0].remaining,remaining);assert.equal(g.world.units.filter(u=>u.receipt===id).length,emitted);assert.equal(g.testGift({id,side:'human',reward:'rally',quantity:10}).duplicate,true);assert.equal(g.meta.queue.length,1);}finally{g.close();await rm(dir,{recursive:true});}
});
test('unmapped authenticated gifts are retained and replayed exactly once after mapping, side fixed to demon',()=>{
 const g=new LiveGame();try{assert.equal(g.receive({...fixtureGift,side:'human'}).status,'unmapped');assert.equal(g.meta.queue.length,0);g.configureMappings([{platform:'bilibili',giftId:98765,reward:'breaker',multiplier:1}]);assert.equal(g.meta.queue[0].side,'demon');tick(g,10);assert.equal(g.world.mode,'sparring');assert.equal(g.meta.queue[0].remaining,1);g.meta.liveEnabled=true;tick(g,10);assert.equal(g.world.mode,'live');assert(g.world.units.some(u=>u.receipt===fixtureGift.id));assert(g.receive(fixtureGift).duplicate);assert.throws(()=>g.receive({...fixtureGift,id:'xiaohongshu:123:1',platform:'xiaohongshu'}),/unverified/);}finally{g.close();}
});
test('failed durable mutation rolls back receipt and battlefield together',()=>{
 const g=new LiveGame();try{const original=g.checkpoint.bind(g);g.checkpoint=()=>{throw Error('disk_full');};assert.throws(()=>g.testGift({side:'human',reward:'rally'}),/disk_full/);assert.equal(g.meta.queue.length,0);assert.equal(g.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,0);g.checkpoint=original;}finally{g.close();}
});
test('gift queue waits through pause and settlement, only defeated persona retires, stale decisions rejected',()=>{
 const g=new LiveGame();try{g.world.paused=true;g.testGift({side:'human',reward:'breaker'});tick(g,10);assert.equal(g.meta.queue[0].remaining,1);g.world.paused=false;tick(g,5);const c=g.context('human'),old=g.world.heroes.human.id,winner=g.world.heroes.demon.id;g.world.heroes.human.hp=0;tick(g,1);assert.equal(g.world.mode,'settlement');g.testGift({side:'human',reward:'pike'});tick(g,CINEMATIC.end/50+1);assert.notEqual(g.world.heroes.human.id,old);assert.equal(g.world.heroes.demon.id,winner);assert(!g.applyDecision(c,{tactic:'advance',lane:0,speech:'继续战斗',memory:'旧角色'},'fixture'));assert(g.world.units.some(u=>u.source==='test'));}finally{g.close();}
});
test('pike counters raiders and shields protect only their front from projectiles',()=>{
 const source={kind:'bow',attack:100,projectile:true,x:100,y:0},target={kind:'shield',armor:0,x:0,y:0,face:0,equipment:{offhand:'shield'}};assert.equal(Math.round(rawDamage(source,target)),55);source.x=-100;assert.equal(rawDamage(source,target),100);assert.equal(rawDamage({kind:'pike',attack:100},{...target,kind:'rider',equipment:{}}),150);
});
test('heavy strike applies actual area hits',()=>{
 const g=new LiveGame({audienceDriven:false});try{const w=g.world;w.units=[];w.nextSpawn=1e9;w.spawn('demon','siege',1,true);w.spawn('human','militia',1,true);w.spawn('human','militia',1,true);const [a,b,c]=w.units;Object.assign(a,{x:1300,y:896});Object.assign(b,{x:1360,y:896});Object.assign(c,{x:1360,y:928});a.crit=0;w.attack(a,b,'crush');w.time=a.action.contactAt;for(const hit of w.tickActions(w.allAlive()))w.resolveHit(...hit);assert(b.hp<b.maxHP);assert(c.hp<c.maxHP);assert(b.maxHP-b.hp>c.maxHP-c.hp);}finally{g.close();}
});
const decision={strategy:'auto',continuations:[],tactic:'north',lane:0,speech:'我是来接班的，先守住渡口！',memory:'北路需要援军'};
test('Luna Max request has no tools or stored chat, valid decision bills all output including reasoning',async()=>{
 const db=new DatabaseSync(':memory:'),g=new LiveGame();let now=100000,request;const cfg={enabled:true,profile:'luna-max',keys:{'luna-max':'fake-test-key'},hourUSD:1,dayUSD:5};
 const d=new ModelDirector({db,now:()=>now,config:()=>cfg,fetcher:async(url,options)=>{request={url,...JSON.parse(options.body)};return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(decision)}]}],usage:{input_tokens:500,output_tokens:1500}});}});
 try{const c=g.context('demon'),r=await d.decide(c);assert(r.ok);assert.equal(request.reasoning.effort,'max');assert.equal(request.store,false);assert.equal(request.tools,undefined);assert.equal(request.model,'gpt-5.6-luna');assert.equal(request.service_tier,'fast');assert.equal(d.totals().hourUSD,.0038);assert(g.applyDecision(c,r.decision,r.model));assert.equal(g.world.heroes.demon.tactic,'north');g.action(w=>w.paused=true);assert(!g.applyDecision(c,decision,r.model));}finally{db.close();g.close();}
});
test('uncertain API cost stays reserved across director restart; budgets stop network; Muse requires price confirmation',async()=>{
 const db=new DatabaseSync(':memory:'),g=new LiveGame();let now=100000,calls=0;const cfg={enabled:true,profile:'luna-max',keys:{'luna-max':'fake-test-key','muse-spark':'fake-test-key'},hourUSD:.1,dayUSD:.1};const fetcher=async()=>{calls++;throw Error('network_uncertain');};let d=new ModelDirector({db,now:()=>now,config:()=>cfg,fetcher});
 try{assert(!(await d.decide(g.context('demon'))).ok);const cost=d.totals().hourUSD;assert(cost>0);d=new ModelDirector({db,now:()=>now,config:()=>cfg,fetcher});assert.equal(d.totals().hourUSD,cost);now+=12000;cfg.hourUSD=cost;assert.equal((await d.decide(g.context('human'))).reason,'budget_limit');assert.equal(calls,1);cfg.profile='muse-spark';assert.equal((await d.decide(g.context('human'))).reason,'muse_pricing_unconfirmed');assert.equal(calls,1);}finally{db.close();g.close();}
});
test('private broker redacts secrets, denies absent credentials and startup never self-enables paid work',async()=>{
 const token='test-private-token-long',b=await createBroker({port:19492,token});try{
 const plain=await fetch('http://127.0.0.1:19492/status');assert.equal(plain.status,403);await b.configure({section:'models',values:{profile:'luna-max',apiKey:'secret-fixture-only-12345678',enabled:false}});const status=JSON.stringify(b.status());assert(!status.includes('secret-fixture'));assert.equal(b.status().models.keys['luna-max'],true);assert.equal(b.status().models.enabled,false);assert.equal(b.status().xiaohongshu.state,'official_gift_transport_unverified');assert.throws(()=>allowedSocket('wss://127.0.0.1:4390/'));assert.throws(()=>allowedSocket('wss://evilbilibili.com/'));assert.equal(new URL(allowedSocket('wss://broadcastlv.chat.bilibili.com/sub')).protocol,'wss:');}finally{await b.close();}
});
test('owner gift route is playable through HTTP, broadcast cannot mutate or obtain secrets',async()=>{
 const app=await createPreview({stagePort:19490,controlPort:19491,clock:false});try{const html=await(await fetch('http://127.0.0.1:19491/')).text(),token=html.match(/name="owner-token" content="([^"]+)/)[1],headers={'Content-Type':'application/json','X-Owner-Token':token,Origin:'http://127.0.0.1:19491'};const data={side:'human',reward:'arrows',lane:2,id:'test:http-gift'};let r=await fetch('http://127.0.0.1:19491/owner/gift',{method:'POST',headers,body:JSON.stringify(data)});assert.equal(r.status,200);tick(app.game,10);assert(app.world.units.some(u=>u.receipt===data.id));r=await fetch('http://127.0.0.1:19490/owner/gift',{method:'POST',headers,body:JSON.stringify(data)});assert.equal(r.status,405);r=await fetch('http://127.0.0.1:19491/owner/status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);const state=await(await fetch('http://127.0.0.1:19490/state')).text();assert(!state.includes(token));assert(!state.includes('apiKey'));}finally{await app.close();}
});
test('Bili official signing and binary envelope are deterministic in shape',()=>{const a=signedRequest({accessKeyId:'id',accessKeySecret:'secret'},{app_id:123},1000);assert.equal(a.headers['x-bili-timestamp'],'1');assert.equal(a.headers.Authorization.length,64);assert.equal(a.headers.Accept,'application/json');assert.equal(a.headers['Content-Type'],'application/json');const bytes=packet(7,'{}');assert.equal(bytes.readUInt32BE(8),7);assert.equal(bytes.readUInt16BE(4),16);assert.equal(bytes.length,18);});

test('authenticated Bili binary events reach durable inbox, pre-auth and wrong-room events do not',async()=>{
 class Socket extends EventTarget {static instance;readyState=0;constructor(){super();Socket.instance=this;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}message(bytes){this.dispatchEvent(new MessageEvent('message',{data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));}}
 const cfg={enabled:true,appId:5,roomId:123,accessKeyId:'fixture',accessKeySecret:'fixture-secret',anchorCode:'fixture-code'};const events=[];
 const c=new BiliConnection({config:()=>cfg,secret:'fixture-secret-at-least-thirty-two-characters',WebSocketClass:Socket,onEvent:e=>events.push(e),fetcher:async url=>Response.json({code:0,data:url.endsWith('/start')?{game_info:{game_id:'fixture-game'},anchor_info:{room_id:123},websocket_info:{wss_link:['wss://broadcastlv.chat.bilibili.com/sub'],auth_body:'{}'}}:{}})});
 try{await c.start();const wire=room=>{const b=packet(5,JSON.stringify({cmd:'LIVE_OPEN_PLATFORM_SEND_GIFT',data:{room_id:room,msg_id:'fixture-stable-id',open_id:'fixture-person',timestamp:Math.floor(Date.now()/1000),gift_id:98765,gift_num:1,paid:true}}));b.writeUInt16BE(0,6);return b;};Socket.instance.message(wire(123));assert.equal(events.length,0);Socket.instance.message(packet(8,'{"code":0}'));Socket.instance.message(wire(999));assert.equal(events.length,0);Socket.instance.message(wire(123));Socket.instance.message(wire(123));assert.equal(events.length,1);assert.equal(events[0].giftId,98765);assert.equal(c.state.state,'authenticated');}finally{await c.stop();}
});
test('stacked healers share a per-commander ten-second healing cap',()=>{const g=new LiveGame({audienceDriven:false});try{const w=g.world;w.units=[];w.nextSpawn=1e9;const h=w.heroes.demon;h.hp-=500;h.hitAt=w.time;for(let i=0;i<6;i++){w.spawn('demon','healer',1,true);Object.assign(w.units.at(-1),{x:h.x+20,y:h.y+20,healAt:0});}w.step(50);assert.equal(h.hp,h.maxHP-455);}finally{g.close();}});
test('TTS downloads only approved audio hosts, preserves voice budget on failure and has no computer tools',async()=>{
 const {CharacterVoice,audioEndpoint}=await import('../modules/live-runtime/tts.mjs');assert.throws(()=>audioEndpoint('http://127.0.0.1/'));assert.throws(()=>audioEndpoint('https://evil.com/a.wav'));assert(audioEndpoint('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav').startsWith('https:'));
 const db=new DatabaseSync(':memory:'),cfg={enabled:true,apiKey:'fixture-key',region:'beijing',hourCharacters:110,dayCharacters:110,demonVoice:'Ethan',humanVoice:'Ryan'};let calls=0;
 const v=new CharacterVoice({db,config:()=>cfg,fetcher:async()=>{calls++;throw Error('unavailable');}});try{await v.speak({side:'demon',text:'守住城门。'});assert.equal(v.usage().hourCharacters,5);cfg.hourCharacters=5;assert.equal((await v.speak({side:'human',text:'援军来了。'})).reason,'character_budget_limit');assert.equal(calls,1);}finally{db.close();}
});

test('Fast downgrade bills standard rates and reports the actual tier separately',async()=>{
 const db=new DatabaseSync(':memory:'),g=new LiveGame();const cfg={enabled:true,profile:'luna-max',keys:{'luna-max':'fake-test-key'},hourUSD:1,dayUSD:5};const d=new ModelDirector({db,config:()=>cfg,fetcher:async()=>Response.json({service_tier:'default',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(decision)}]}],usage:{input_tokens:500,output_tokens:1500}})});
 try{assert((await d.decide(g.context('demon'))).ok);assert.equal(d.status.requestedTier,'fast');assert.equal(d.status.actualTier,'default');assert.equal(d.totals().hourUSD,.0019);}finally{db.close();g.close();}
});
