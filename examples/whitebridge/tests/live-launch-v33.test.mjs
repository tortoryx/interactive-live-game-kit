import test from 'node:test';import assert from 'node:assert/strict';
import {BiliConnection,packet} from '../modules/live-runtime/bilibili.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {launchReadiness} from '../modules/live-runtime/readiness.mjs';
class Socket extends EventTarget{
 static all=[];readyState=1;constructor(){super();Socket.all.push(this);}send(){}close(){this.readyState=3;}lateClose(){this.dispatchEvent(new Event('close'));}message(b){this.dispatchEvent(new MessageEvent('message',{data:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}));}
}
const cfg={enabled:true,roomId:42,appId:1,accessKeyId:'fixture',accessKeySecret:'fixture',anchorCode:'fixture'};
const startData=id=>({game_info:{game_id:id},anchor_info:{room_id:42},websocket_info:{wss_link:['wss://broadcastlv.chat.bilibili.com/sub'],auth_body:'{}'}});
const gift=(id,extra={})=>({id:'bilibili:42:'+id,platform:'bilibili',kind:'gift',actor:'fixture-viewer',at:Date.now(),giftId:987651,quantity:1,paid:false,...extra});

test('late socket close and error cannot unauthenticate the replacement or stop its timer',async()=>{
 let n=0;const events=[],c=new BiliConnection({config:()=>cfg,onEvent:e=>events.push(e),secret:'fixture-secret-at-least-thirty-two-characters',WebSocketClass:Socket,fetcher:async url=>Response.json({code:0,data:url.endsWith('/start')?startData('session-'+(++n)):{}})});
 try{await c.start();const a=Socket.all.at(-1);a.message(packet(8,'{"code":0}'));c.state.eventCounts.gift=12;await c.stop();await c.start();const b=Socket.all.at(-1);b.message(packet(8,'{"code":0}'));const heartbeat=c.attempt.heartbeat;
 a.lateClose();a.dispatchEvent(new Event('error'));
 assert(c.authenticated);assert.equal(c.state.state,'authenticated');assert(!heartbeat._destroyed);assert.equal(c.state.eventCounts.gift,undefined);
 const p=packet(5,JSON.stringify({cmd:'LIVE_OPEN_PLATFORM_SEND_GIFT',data:{room_id:42,msg_id:'gift1',open_id:'v',timestamp:Math.floor(Date.now()/1000),gift_id:987651,gift_num:1,paid:false}}));p.writeUInt16BE(0,6);b.message(p);
 assert.equal(events.length,1);assert.equal(events[0].transport.sessionId,c.state.sessionId);assert.equal(events[0].transport.roomId,42);
 }finally{await c.stop();}
});

test('an old pending start failure never ends the new authorized session',async()=>{
 let rejectOld,n=0;const ended=[];
 const c=new BiliConnection({config:()=>cfg,onEvent:()=>{},secret:'fixture-secret-at-least-thirty-two-characters',WebSocketClass:Socket,fetcher:async(url,options)=>{if(url.endsWith('/start')){if(++n===1)return new Promise((resolve,reject)=>{rejectOld=reject;});return Response.json({code:0,data:startData('new-session')});}if(url.endsWith('/end'))ended.push(JSON.parse(options.body).game_id);return Response.json({code:0,data:{}});}});
 try{const old=c.start();await c.stop();await c.start();Socket.all.at(-1).message(packet(8,'{"code":0}'));rejectOld(Error('old failure'));await old;assert.deepEqual(ended,[]);assert.equal(c.gameId,'new-session');assert(c.authenticated);}finally{await c.stop();}assert.deepEqual(ended,['new-session']);
});

test('readiness requires current-session chat and fulfilled real gift, not broker counters, old-room events or queued summons',()=>{
 const g=new LiveGame();try{const transport={roomId:42,sessionId:'session-one'};const status={bilibili:{state:'authenticated',...transport,eventCounts:{chat:10,gift:10}}};g.meta.liveEnabled=true;g.configureMappings([{platform:'bilibili',giftId:987651,reward:'sentinel',multiplier:1}]);
 assert(!launchReadiness(g,status).bilibili.authorizedRoundTripVerified);
 g.receive({id:'bilibili:42:chat1',platform:'bilibili',actor:'v',kind:'chat',at:Date.now(),text:'你是谁',transport});g.world.paused=true;g.receive(gift('gift1',{transport}));g.drain();assert(!launchReadiness(g,status).bilibili.authorizedRoundTripVerified);
 g.world.paused=false;for(let i=0;i<15;i++)g.step(50);const ready=launchReadiness(g,status);assert(ready.bilibili.authorizedRoundTripVerified);assert.equal(ready.bilibili.receiptEvidence.gift.applied,3);assert(!ready.streamingVerified);assert(!ready.platformPlayReady);
 assert(!launchReadiness(g,{bilibili:{...status.bilibili,sessionId:'new-session'}}).bilibili.authorizedRoundTripVerified);
 assert(!launchReadiness(g,{bilibili:{...status.bilibili,roomId:43}}).bilibili.authorizedRoundTripVerified);
 g.meta.liveEnabled=false;assert(launchReadiness(g,status).blockers.includes('真实礼物兑换尚未启用'));
 }finally{g.close();}
});

test('discarded revive targets cannot be recorded as successful fulfillment',()=>{
 const g=new LiveGame();try{g.testGift({side:'demon',reward:'sentinel'});g.drain();const u=g.world.units[0];g.world.resolveHit(g.world.heroes.human,u,1e7);const r=g.testGift({side:'demon',reward:'revive'});g.world.fallenTroops=[];g.drain();const row=g.db.prepare('SELECT status,payload FROM receipts WHERE id=?').get(r.id);assert.equal(row.status,'no_fallen_troops');assert.equal(JSON.parse(row.payload).fulfillment.applied,0);}finally{g.close();}
});

test('unmapped retry progresses past the first 500 unmatched receipts',()=>{
 const g=new LiveGame();try{g.atomic(()=>{for(let i=0;i<501;i++)g.receive(gift('unmapped-'+i,{giftId:9900000+i}));});g.configureMappings([{platform:'bilibili',giftId:9900500,reward:'sentinel',multiplier:1}]);assert.equal(g.db.prepare('SELECT status FROM receipts WHERE id=?').get('bilibili:42:unmapped-500').status,'queued');assert.equal(g.meta.queue.length,1);}finally{g.close();}
});
