import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBiliRoomPanel,RoomGiftPanels,PANEL_TTL,currentRoomGifts} from '../modules/live-runtime/room-gifts.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
const body=()=>({code:0,data:{gift_config:{base_config:{list:[1,2,3,4,5].map(id=>({id,name:'礼物'+id,price:id*100,coin_type:'gold',img_basic:'https://i0.hdslb.com/fixture.png'}))}},gift_data:{room_gift_list:{silver_list:[],gold_list:[{gift_id:1},{gift_id:2},{gift_id:5,special:{is_use:0}},{gift_id:999}]},tab_list:[{list:[{gift_id:2},{gift_id:3}]}]}}});
test('room list joins only actual panel IDs, deduplicates tabs and excludes unavailable gifts and unrelated global metadata',()=>{
 const panel=parseBiliRoomPanel(body(),42,1000);assert.deepEqual(panel.gifts.map(g=>g.giftId),[1,2,3]);assert(panel.gifts.every(g=>!g.icon));assert.equal(panel.expiresAt,1000+PANEL_TTL);assert.throws(()=>parseBiliRoomPanel({code:0,data:{list:body().data.gift_config.base_config.list}},42));assert.throws(()=>parseBiliRoomPanel(body(),0));
});
test('missing room, wrong room, stale catalog or custom mappings cannot expose the global gift archive as a current room menu',()=>{
 const now=1800000000000,g=new LiveGame({now:()=>now});try{g.configureMappings([{platform:'bilibili',giftId:4,reward:'rally',multiplier:1}]);const panel=parseBiliRoomPanel(body(),42,now),conn={bilibili:{roomId:42,state:'authenticated'},giftPanels:{bilibili:panel}};const menu=playMenu(g,'demon',conn);assert.equal(menu.catalogCount,3);assert.equal(menu.gifts.length,0);g.meta.liveEnabled=true;assert.equal(playMenu(g,'demon',conn).gifts.length,3);assert.equal(playMenu(g,'human',conn).catalogCount,0);assert.equal(playMenu(g,'demon').catalogCount,0);assert.equal(playMenu(g,'demon',{...conn,bilibili:{roomId:43}}).catalogCount,0);assert.equal(currentRoomGifts(conn,'bilibili',now+PANEL_TTL),null);assert.equal(playMenu(g,'demon',{...conn,giftPanels:{bilibili:{...panel,state:'unavailable'}}}).catalogCount,0);}finally{g.close();}
});
test('public room lookup is read-only, fixed host and bounded; cached results expire and refresh failure clears them',async()=>{
 let now=1000,fail=false,calls=0;const p=new RoomGiftPanels({now:()=>now,fetcher:async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'api.live.bilibili.com');assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);assert.equal(options.body,undefined);if(fail)throw Error('offline');return Response.json(body());}});await p.refresh(null);assert.equal(calls,0);await p.refresh(42);assert.equal(p.snapshot().gifts.length,3);await p.refresh(42);assert.equal(calls,1);now+=PANEL_TTL;assert.equal(p.snapshot().state,'stale');assert.equal(p.snapshot().gifts.length,0);fail=true;await p.refresh(42);assert.equal(p.snapshot().state,'unavailable');assert.equal(p.snapshot().gifts.length,0);
});
test('late response from the old room cannot overwrite the new room, and removing configuration clears the panel immediately',async()=>{
 let resolve;const p=new RoomGiftPanels({fetcher:url=>url.endsWith('42')?new Promise(r=>resolve=r):Promise.resolve(Response.json(body()))});const old=p.refresh(42);await p.refresh(43);resolve(Response.json(body()));await old;assert.equal(p.snapshot().roomId,43);await p.refresh(null);assert.equal(p.snapshot().state,'room_required');assert.equal(p.snapshot().gifts.length,0);
});
