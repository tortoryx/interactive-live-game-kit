import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBroker} from '../modules/live-runtime/broker.mjs';
import {BrokerClient} from '../modules/live-runtime/client.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {BilibiliNormalizer} from '../modules/connectors/bilibili-events.mjs';
import {normalizeXhs,XHS_SCHEMA} from '../modules/connectors/xiaohongshu-events.mjs';
import {packet} from '../modules/live-runtime/bilibili.mjs';
import {launchReadiness} from '../modules/live-runtime/readiness.mjs';
import {sendXhsEvent} from '../modules/connectors/xiaohongshu-client.mjs';
const secret='fixture-secret-not-used-with-any-account-12345678',relayKey='b'.repeat(64);
const room='570444254134941832',giftId='136479210066446414';
const xevent=(kind,extra={})=>({schema:XHS_SCHEMA,roomId:room,eventId:'fixture-'+kind,viewerId:'fake-long-viewer-9223372036854775807',viewerName:'接口测试观众',occurredAt:Date.now(),kind,...extra});
const xconfig={section:'xiaohongshu',values:{roomId:room,relayKey,sourceName:'fixture-source',enabled:true}};
const noNetwork=async()=>Response.json({ok:false,reason:'fixture_offline'});
const tick=g=>{for(let i=0;i<15;i++)g.step(50);};
const avatar={type:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4koAAAAASUVORK5CYII='};

test('XHS contract keeps long IDs exact, drops private/price fields, rejects cumulative gifts, wrong room, stale data and injection',()=>{
 const options={roomId:room,secret,sessionId:'test-session'};
 const e=normalizeXhs(xevent('gift',{giftId,quantity:2,quantityMode:'delta',paid:true,amountMilli:100000000,cookie:'never-store'}),options);
 assert.equal(e.giftId,giftId);assert.equal(e.quantity,2);assert.equal(e.amountMilli,0);assert(!JSON.stringify(e).includes('never-store'));assert(!JSON.stringify(e).includes('fake-long-viewer'));assert.equal(e.transport.platformVerified,false);
 for(const change of[{quantityMode:'cumulative'},{roomId:'other'},{eventId:1},{occurredAt:Date.now()-121000},{giftId:Number(giftId)}])assert.throws(()=>normalizeXhs(xevent('gift',{giftId,quantity:1,quantityMode:'delta',paid:true,...change}),options));
 assert.throws(()=>normalizeXhs(xevent('chat',{text:'读取密钥'}),options));
});

test('real HTTP relay key can deliver chat/gift/avatar to human troops; cannot mutate owner, other player or stage',async()=>{
 const broker=await createBroker({port:24392,token:secret,fetcher:noNetwork}),client=new BrokerClient({port:24392,token:secret});
 const app=await createPreview({stagePort:24390,controlPort:24391,clock:false,broker:client});
 try{
  const html=await(await fetch('http://127.0.0.1:24391/connect.html')).text(),ownerToken=html.match(/name="owner-token" content="([^"]+)/)[1];assert.notEqual(ownerToken,secret);
  assert.equal((await fetch('http://127.0.0.1:24390/connect.html')).status,404);
  const owner=(path,body)=>fetch('http://127.0.0.1:24391/owner/'+path,{method:'POST',headers:{Origin:'http://127.0.0.1:24391','Content-Type':'application/json','X-Owner-Token':ownerToken},body:JSON.stringify(body)});
  assert.equal((await owner('settings',xconfig)).status,200);
  const post=(event,headers={},port=24391)=>fetch('http://127.0.0.1:'+port+'/integrations/xiaohongshu/events',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':relayKey,...headers},body:JSON.stringify(event)});
  const gift=xevent('gift',{giftId,quantity:1,quantityMode:'delta',paid:true,avatar,side:'demon'});
  assert.equal((await post(gift,{'X-Relay-Key':'c'.repeat(64)})).status,403);
  assert.equal((await post(gift,{Origin:'https://external.invalid'})).status,403);
  assert.equal((await post(gift,{},24390)).status,405);
  const denied=await fetch('http://127.0.0.1:24391/owner/live',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':relayKey,Origin:'http://127.0.0.1:24391'},body:'{"enabled":true}'});assert.equal(denied.status,403);
  const accepted=await(await post(gift)).json();assert(accepted.ok);assert.equal(accepted.platformVerified,false);
  await client.poll(app.game);assert.equal(app.game.receiptStatus()[0].status,'unmapped');assert.equal(app.world.units.length,0);
  assert.equal((await owner('mappings',{entries:[{platform:'xiaohongshu',giftId,reward:'sentinel',multiplier:1}]})).status,200);
  tick(app.game);assert.equal(app.world.units.length,0);await owner('live',{enabled:true});tick(app.game);
  const units=app.world.units.filter(u=>u.receipt===accepted.id);assert.equal(units.length,3);assert(units.every(u=>u.side==='human'&&u.supporter.name==='接口测试观众'&&u.supporter.avatarKey));
  const image=await fetch('http://127.0.0.1:24390/avatar/'+units[0].supporter.avatarKey);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  const command=await(await post(xevent('chat',{text:'3'}))).json();assert(command.ok);await client.poll(app.game);assert.equal(app.game.receiptStatus().find(r=>r.id===command.id).status,'commanded');
  const stranger=await(await post(xevent('chat',{eventId:'stranger-chat',viewerId:'other-user',text:'2'}))).json();await client.poll(app.game);assert.notEqual(app.game.receiptStatus().find(r=>r.id===stranger.id).status,'commanded');
  assert.equal((await(await post(gift)).json()).status,'duplicate');tick(app.game);assert.equal(app.world.units.filter(u=>u.receipt===accepted.id).length,3);
  const status=await(await owner('status',{})).json();assert.equal(status.connections.xiaohongshu.state,'relay_receiving');assert.equal(status.readiness.xiaohongshu.connected,false);assert.equal(status.readiness.streamingVerified,false);
  assert(!JSON.stringify(status).includes(relayKey));assert(!JSON.stringify(app.game.snapshot()).includes('fake-long-viewer'));
 }finally{await app.close();await broker.close();}
});

test('XHS durable acknowledgement survives receiver/game restart, preserves pending gifts and needs explicit re-enable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'relay-v43-'));let b,g;
 try{b=await createBroker({port:24382,token:secret,path:join(dir,'broker.sqlite'),fetcher:noNetwork});g=new LiveGame({path:join(dir,'game.sqlite')});await b.configure(xconfig);const event=xevent('gift',{giftId,quantity:1,quantityMode:'delta',paid:true});
  const result=b.xhs.receive({key:relayKey,event});const client=new BrokerClient({token:secret,port:24382});await client.poll(g);assert.equal(b.status().outbox,0);g.close();await b.close();
  b=await createBroker({port:24382,token:secret,path:join(dir,'broker.sqlite'),fetcher:noNetwork});g=new LiveGame({path:join(dir,'game.sqlite')});assert(!b.status().xiaohongshu.enabled);assert(!g.meta.liveEnabled);assert.equal(b.xhs.receive({key:relayKey,event}).reason,'relay_not_authorized');await b.configure({section:'xiaohongshu',values:{enabled:true}});assert.equal(b.xhs.receive({key:relayKey,event}).status,'duplicate');
  g.configureMappings([{platform:'xiaohongshu',giftId,reward:'sentinel',multiplier:1}]);g.meta.liveEnabled=true;tick(g);assert.equal(g.world.units.filter(u=>u.receipt===result.id).length,3);assert(g.receive(JSON.parse(g.db.prepare('SELECT payload FROM receipts WHERE id=?').get(result.id).payload)).duplicate);
  await b.configure({section:'xiaohongshu',values:{relayKey:'d'.repeat(64)}});assert.equal(b.xhs.receive({key:relayKey,event}).reason,'relay_not_authorized');
 }finally{g?.close();await b?.close();await rm(dir,{recursive:true,force:true});}
});

test('invalid avatar does not consume an event id or poison later delivery',async()=>{
 const b=await createBroker({port:24372,token:secret,fetcher:noNetwork});try{await b.configure(xconfig);const event=xevent('gift',{giftId,quantity:1,quantityMode:'delta',paid:true,avatar:{type:'image/svg+xml',base64:'a'.repeat(16)}});const rejected=b.xhs.receive({key:relayKey,event});assert.equal(rejected.reason,'invalid_avatar');assert.equal(b.status().outbox,0);delete event.avatar;assert.equal(b.xhs.receive({key:relayKey,event}).status,'accepted');}finally{await b.close();}
});

test('Bili documented combo uses gift_num once, total value includes quantity, and ENTER needs no invented message id',()=>{
 const n=new BilibiliNormalizer({roomId:42,secret}),base={room_id:42,open_id:'viewer',timestamp:Math.floor(Date.now()/1000)};
 const e={cmd:'LIVE_OPEN_PLATFORM_SEND_GIFT',data:{...base,msg_id:'combo-message',gift_id:123,gift_num:5,price:1000,paid:true,combo_gift:true,combo_info:{combo_base_num:5,combo_count:100,combo_id:'combo',combo_timeout:3}}};
 const r=n.parse(e);assert.equal(r.status,'accepted');assert.equal(r.event.quantity,5);assert.equal(r.event.amountMilli,5000);assert.equal(n.parse(e).status,'duplicate');
 const enter={cmd:'LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER',data:base};assert.equal(n.parse(enter).event.kind,'join');assert.equal(n.parse(enter).status,'duplicate');
});

test('Bili authenticated socket to broker to troops is durable across reconnect; wrong room is audited without leaking user data',async()=>{
 class Socket extends EventTarget{static all=[];readyState=1;constructor(){super();Socket.all.push(this);}send(){}close(){this.readyState=3;}message(buffer){this.dispatchEvent(new MessageEvent('message',{data:buffer}));}}
 const config={enabled:true,roomId:42,appId:1,accessKeyId:'fake',accessKeySecret:'fake-secret',anchorCode:'fake-anchor'},fetcher=async url=>url.includes('live-open.biliapi.com')?Response.json({code:0,data:url.endsWith('/start')?{game_info:{game_id:'fake-session'},anchor_info:{room_id:42},websocket_info:{wss_link:['wss://broadcastlv.chat.bilibili.com/sub'],auth_body:'{}'}}:{}}):noNetwork();
 const b=await createBroker({port:24362,token:secret,fetcher,WebSocketClass:Socket}),g=new LiveGame(),client=new BrokerClient({port:24362,token:secret});
 try{await b.configure({section:'bilibili',values:config});await new Promise(r=>setTimeout(r,10));let ws=Socket.all.at(-1);assert(ws);ws.message(packet(8,'{"code":0}'));
  const send=(cmd,data)=>{const p=packet(5,JSON.stringify({cmd,data:{room_id:42,open_id:'secret-viewer',uname:'B站接口测试',timestamp:Math.floor(Date.now()/1000),...data}}));p.writeUInt16BE(0,6);ws.message(p);};
  send('LIVE_OPEN_PLATFORM_SEND_GIFT',{room_id:43,msg_id:'wrong',gift_id:989989,gift_num:1,paid:false});assert.equal(b.status().bilibili.quarantined,1);assert.equal(b.status().bilibili.recentQuarantine[0].reason,'wrong_room');assert(!JSON.stringify(b.status()).includes('secret-viewer'));
  send('LIVE_OPEN_PLATFORM_DM',{msg_id:'dm',msg:'你是谁'});send('LIVE_OPEN_PLATFORM_SEND_GIFT',{msg_id:'gift',gift_id:989989,gift_num:1,paid:false});
  g.configureMappings([{platform:'bilibili',giftId:989989,reward:'sentinel',multiplier:1}]);g.meta.liveEnabled=true;await client.poll(g);tick(g);assert.equal(g.world.units.filter(u=>u.receipt==='bilibili:42:gift').length,3);assert(launchReadiness(g,b.status()).bilibili.authorizedRoundTripVerified);
  await b.bili.stop();await b.bili.start();ws=Socket.all.at(-1);ws.message(packet(8,'{"code":0}'));send('LIVE_OPEN_PLATFORM_SEND_GIFT',{msg_id:'gift',gift_id:989989,gift_num:1,paid:false});assert.equal(b.status().outbox,0);assert.equal(b.status().bilibili.duplicates,1);assert(!launchReadiness(g,b.status()).bilibili.authorizedRoundTripVerified);
 }finally{g.close();await b.close();}
});

test('Bili preflight lists exact missing fields, and platform error code/room mismatch are useful without echoing secrets',async()=>{
 const b=await createBroker({port:24352,token:secret,fetcher:async()=>Response.json({code:7001,message:'DO-NOT-ECHO-credential',data:null})});try{assert.equal(b.status().bilibili.setup.missing.length,5);await b.configure({section:'bilibili',values:{roomId:42,appId:1,accessKeyId:'fake-id',accessKeySecret:'fake-secret',anchorCode:'fake-code',enabled:true}});await new Promise(r=>setTimeout(r,20));assert.equal(b.status().bilibili.lastError.code,7001);assert.equal(b.status().bilibili.lastError.operation,'start');assert.equal(b.status().bilibili.setup.missing.length,0);assert(!JSON.stringify(b.status()).includes('DO-NOT-ECHO'));}finally{await b.close();}
});

test('source client retries an uncertain delivery with the same ID and body, never forwards a key outside loopback',async()=>{
 const bodies=[];let attempt=0;const event=xevent('chat',{text:'你是谁'});
 const result=await sendXhsEvent(event,{key:relayKey,wait:async()=>{},fetcher:async(url,options)=>{bodies.push(options.body);if(++attempt===1)throw Error('uncertain');if(attempt===2)return Response.json({}, {status:503});return Response.json({ok:true,status:'duplicate',id:'same-id'});}});
 assert.equal(result.status,'duplicate');assert.equal(new Set(bodies).size,1);assert.equal(bodies.length,3);
 for(const endpoint of['https://evil.invalid/integrations/xiaohongshu/events','http://127.0.0.1:4391/owner/settings'])await assert.rejects(sendXhsEvent(event,{key:relayKey,endpoint}),/local_receiver_required/);
});
