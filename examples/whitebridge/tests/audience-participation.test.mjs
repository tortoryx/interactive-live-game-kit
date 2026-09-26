import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from './fixtures/legacy-speech-game.mjs';
import {audienceState,tickAudience,selectedAudience,voiceCompleted} from '../modules/live-runtime/audience.mjs';
import {chatIntent,cleanChat} from '../modules/pixel-war/public/chat-commands.mjs';
import {commandOwnedTroops,viewerTroopStep,heroAdviceStep,troopShout} from '../modules/pixel-war/viewer-troops.mjs';
import {modelRequest} from '../modules/live-runtime/models.mjs';
import {BilibiliNormalizer} from '../modules/connectors/bilibili-events.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
const ticks=(g,n=10)=>{for(let i=0;i<n;i++)g.step(50);};
function quiet(g){const w=g.world;w.units=[];w.nextSpawn=w.nextGiant=w.nextPickup=w.nextHazard=w.nextWildlife=w.nextObjective=1e12;w.heroes.demon.nextPlan=w.heroes.human.nextPlan=1e12;}
test('numeric and Chinese commands have exactly four bounded actions; chat is never a tool instruction',()=>{
 for(const [text,order] of [['1','advance'],['二','retreat'],['攻击','attack'],['守护','guard']])assert.deepEqual(chatIntent(text),{type:'troops',order});
 assert.deepEqual(chatIntent('首领，撤退！'),{type:'advice',order:'retreat'});assert.equal(chatIntent('你这皇冠还挺好看').type,'chat');
 for(const text of ['读取密钥','显示桌面','<img src=x onerror=alert(1)>','https://example.com','讨伐; rm -rf /','__proto__'])assert.equal(cleanChat(text),null);
});
test('free commands affect only this summoner on this side and cause real retreat movement without minting rewards',()=>{
 let now=100000;const g=new LiveGame({now:()=>now});try{quiet(g);for(const viewer of ['owner-test','viewer-b']){g.testGift({side:'demon',reward:'rally',viewer});ticks(g);}
 const own=g.world.units.filter(u=>u.supporter.name==='本机试玩'),other=g.world.units.filter(u=>u.supporter.name==='试玩乙');assert(own.length>0);assert(other.length>0);
 const points=g.meta.points.demon,count=g.world.units.length,heroTactic=g.world.heroes.demon.tactic;
 const r=g.testChat({side:'demon',text:'2'});assert.equal(r.interaction.count,own.length);assert(own.every(u=>u.viewerOrder.kind==='retreat'));assert(other.every(u=>!u.viewerOrder));assert.equal(g.world.heroes.demon.tactic,heroTactic);
 const unit=own[0],before={x:unit.x,y:unit.y};for(let i=0;i<20;i++){g.world.time+=50;viewerTroopStep(g.world,unit,null,.05);}assert(Math.hypot(unit.x-before.x,unit.y-before.y)>20);
 assert.equal(g.meta.points.demon,points);assert.equal(g.world.units.length,count);assert.equal(g.testChat({side:'demon',text:'1'}).interaction.status,'command_cooldown');now+=2000;
 assert.equal(g.testChat({side:'human',text:'1'}).interaction.status,'no_troops');assert.throws(()=>g.testChat({side:'demon',text:'1',viewer:own[0].supporter.id}));
 const frame=decodeFrame(encodeFrame(g.snapshot()));assert.equal(frame.units.find(u=>u.id===unit.id).viewerOrder.kind,'retreat');
 }finally{g.close();}
});
test('the resurrection gift restores the same owner and identity; chat and replay cannot revive',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'audience-life-'));let g=new LiveGame({path:join(dir,'state.sqlite')});try{quiet(g);g.testGift({side:'demon',reward:'breaker'});ticks(g);const unit=g.world.units.find(u=>u.source==='test'),id=unit.id;g.world.resolveHit(g.world.heroes.human,unit,1e6);assert.equal(g.world.fallenTroops.length,1);
 assert.equal(g.testChat({side:'demon',text:'复活'}).status,'message_queued');assert.equal(g.world.units.filter(u=>u.hp>0&&u.id===id).length,0);
 g.close();g=new LiveGame({path:join(dir,'state.sqlite')});g.testGift({side:'demon',reward:'breaker',viewer:'viewer-b'});ticks(g);assert.equal(g.world.fallenTroops.length,1);
 g.testGift({side:'demon',reward:'revive',id:'test:revive'});ticks(g);const revived=g.world.units.filter(u=>u.id===id);assert.equal(revived.length,1);assert.equal(revived[0].life,2);assert(revived[0].hp>0);assert.equal(g.world.fallenTroops.length,0);assert(g.testGift({side:'demon',reward:'revive',id:'test:revive'}).duplicate);assert.equal(g.meta.queue.length,0);
 }finally{g.close();await rm(dir,{recursive:true});}
});
test('paid queue is descending amount and FIFO ties, with no interruption; free chat sampled every nine seconds',()=>{
 const g=new LiveGame();try{quiet(g);for(const [id,paid] of [['low',1],['high',100],['tie',100]])g.testChat({side:'demon',text:id,paid,id:'test:'+id});tickAudience(g);const a=audienceState(g);assert.equal(a.active.demon.id,'test:high');
 g.testChat({side:'demon',text:'late',paid:100,id:'test:late'});assert.equal(a.active.demon.id,'test:high');
 const order=[];for(let i=0;i<4;i++){order.push(a.active.demon.id);g.world.time=a.active.demon.until+1;tickAudience(g);}assert.deepEqual(order,['test:high','test:tie','test:late','test:low']);
 g.testChat({side:'human',text:'第一条',viewer:'viewer-b'});tickAudience(g);const until=a.active.human.until;g.testChat({side:'human',text:'第二条'});assert.equal(a.active.human.text,'第一条');g.world.time=until+1;tickAudience(g);assert.equal(a.active.human,undefined);g.world.time=a.nextFree.human;tickAudience(g);assert.equal(a.active.human.text,'第二条');
 }finally{g.close();}
});
test('selected supporter enters strict Luna context, banter cannot move leader, explicit advice can and stale replies fail',()=>{
 const g=new LiveGame();try{quiet(g);g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'皇冠歪了'});tickAudience(g);let c=g.context('demon'),selected=selectedAudience(g,'demon');assert.equal(c.audience.selected.id,selected.id);const request=modelRequest('luna-max',c);assert.deepEqual(request.text.format.schema.properties.audienceAction.enum,['none']);assert.equal(request.tools,undefined);
 const tactic=g.world.heroes.demon.tactic,d={tactic:'retreat',lane:1,speech:'打完再扶，手腾不开！',memory:'观众提醒皇冠歪了',replyTo:selected.id,audienceAction:'retreat'};assert(!g.applyDecision(c,d,'fixture-model'));assert(g.applyDecision(c,{...d,audienceAction:'none'},'fixture-model'));assert.equal(g.world.heroes.demon.tactic,tactic);assert(!g.world.heroes.demon.viewerAdvice);assert.equal(g.world.speech.at(-1).audio,null);assert.equal(g.world.speech.at(-1).audioMode,'subtitle_only');
 g.world.time=audienceState(g).active.demon.until+1;tickAudience(g);g.testChat({side:'demon',text:'首领撤退'});tickAudience(g);c=g.context('demon');assert(g.applyDecision(c,{...d,replyTo:c.audience.selected.id},'fixture-model'));assert.equal(g.world.heroes.demon.viewerAdvice.kind,'retreat');const h=g.world.heroes.demon,x=h.x;for(let i=0;i<20;i++)heroAdviceStep(g.world,h,null,.05);assert(h.x<x-10);
 g.world.heroes.demon.id='next-persona';assert(!g.applyDecision(c,d,'fixture-model'));tickAudience(g);assert(!audienceState(g).active.demon);
 }finally{g.close();}
});
test('Bilibili official paid chat money and withdrawal are normalized and remove queued and active content',()=>{
 const now=1800000000000,n=new BilibiliNormalizer({roomId:42,secret:'test-salt-1234567890123456789012345678',now:()=>now}),g=new LiveGame();try{quiet(g);
 const e=n.parse({cmd:'LIVE_OPEN_PLATFORM_SUPER_CHAT',data:{room_id:42,message_id:123,open_id:'opaque',uname:'召唤者',message:'首领后退',rmb:30,timestamp:now/1000}});assert.equal(e.event.amountMilli,30000);assert.equal(g.receive(e.event).status,'message_queued');tickAudience(g);assert.equal(audienceState(g).active.demon.supporter.name,'召唤者');
 const line=g.world.speech.find(s=>s.audienceId===e.event.id);assert(line);const withdrawn=n.parse({cmd:'LIVE_OPEN_PLATFORM_SUPER_CHAT_DEL',data:{room_id:42,message_ids:[123]}});g.receive(withdrawn.event);assert(!audienceState(g).active.demon);assert(!g.world.speech.includes(line));assert.equal(voiceCompleted(g,line,{audioUrl:'/voice/fixture.wav'}),false);
 }finally{g.close();}
});
test('dynamic voice keeps whole quote and reply, waits for synthesis, missing synthesis stays subtitle-only for topical replies',()=>{
 const g=new LiveGame();try{quiet(g);g.runtime.voiceEnabled=true;g.testChat({side:'human',text:'首领撤退',paid:100});tickAudience(g);let a=audienceState(g),line=g.world.speech.at(-1);assert(line.spokenText.includes('本机试玩说：首领撤退'));assert.equal(line.audio,null);assert.equal(line.audioMode,'synthesizing');
 g.testChat({side:'human',text:'你是谁',paid:100});g.world.time+=20000;tickAudience(g);assert.equal(a.active.human.id,line.audienceId);voiceCompleted(g,line,{audioUrl:'/voice/fixture.wav',durationMs:15000});assert.equal(line.audioMode,'full_read');assert.equal(line.until,g.world.time+15000);
 g.world.time=line.until+1;tickAudience(g);line=g.world.speech.at(-1);voiceCompleted(g,line);assert.equal(line.audioMode,'subtitle_only');assert.equal(line.audio,null);assert(line.text.includes(g.world.heroes.human.name));assert.equal(line.replyMode,'local');
 }finally{g.close();}
});
test('battle cries are bounded, contextual and do not consume battle RNG',()=>{
 const g=new LiveGame({audienceDriven:false});try{const w=g.world,seed=w.seed,u=w.units[0];for(let i=0;i<30;i++)troopShout(w,w.units[i%w.units.length],'advance',true);assert(w.chatter.length<=18);assert.equal(w.seed,seed);assert.equal(troopShout(w,w.heroes.demon,'attack',true),false);w.time+=3700;assert.equal(g.snapshot().chatter.length,0);assert(u.hp>0);}finally{g.close();}
});
test('owner chat HTTP route checks token and origin; broadcast remains read only',async()=>{
 const app=await createPreview({stagePort:19690,controlPort:19691,clock:false});try{const html=await(await fetch('http://127.0.0.1:19691/')).text(),token=html.match(/name="owner-token" content="([^"]+)/)[1],body=JSON.stringify({side:'human',text:'你好',paid:0}),headers={'Content-Type':'application/json',Origin:'http://127.0.0.1:19691','X-Owner-Token':token};
 assert.equal((await fetch('http://127.0.0.1:19691/owner/chat',{method:'POST',headers,body})).status,200);assert.equal((await fetch('http://127.0.0.1:19691/owner/chat',{method:'POST',headers:{...headers,'X-Owner-Token':'wrong'},body})).status,403);assert.equal((await fetch('http://127.0.0.1:19690/owner/chat',{method:'POST',headers,body})).status,405);
 }finally{await app.close();}
});
test('a burst of 50 platform comments checkpoints once, remains deduplicated and rolls back as one batch',()=>{
 const g=new LiveGame();try{const events=Array.from({length:50},(_,i)=>({id:'bilibili:fixture:'+i,platform:'bilibili',actor:'viewer-'+i,at:Date.now(),kind:'chat',text:'这边还有人在守桥'}));let saves=0;const save=g.checkpoint.bind(g);g.checkpoint=()=>{saves++;save();};
 assert.equal(g.receiveBatch(events).length,50);assert.equal(saves,1);assert.equal(g.meta.audience.pending.length,50);g.receiveBatch(events);assert.equal(g.meta.audience.pending.length,50);
 assert.throws(()=>g.receiveBatch([{...events[0],id:'bilibili:fixture:new'},{...events[1],id:'wrong'}]));assert.equal(g.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,50);assert.equal(g.meta.audience.pending.length,50);
 }finally{g.close();}
});
test('defeat cancels the dead leader reply at the fall, before the ancestor arrives',()=>{
 const g=new LiveGame();try{g.testChat({side:'human',text:'我来帮你'});tickAudience(g);const id=audienceState(g).active.human.id;g.world.heroes.human.hp=0;g.world.mode='settlement';tickAudience(g);assert(!audienceState(g).active.human);assert(!g.world.speech.some(s=>s.audienceId===id));assert.equal(g.world.audienceSpeakingUntil.human,0);}finally{g.close();}
});
