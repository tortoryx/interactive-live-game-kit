import {catalogGift} from './gift-catalog.mjs';
import {boundedJson} from './models.mjs';

export const PANEL_TTL=300000;
export function parseBiliRoomPanel(body,roomId,at=Date.now()){
 if(!Number.isSafeInteger(roomId)||roomId<1||body?.code!==0)throw Error('room_gift_response');
 const d=body.data,config=d?.gift_config?.base_config?.list,room=d?.gift_data?.room_gift_list;
 if(!Array.isArray(config)||!room||!Array.isArray(room.gold_list)||!Array.isArray(room.silver_list))throw Error('room_gift_shape');
 const byId=new Map(config.map(g=>[g.id,g])),entries=[...room.silver_list,...room.gold_list,...(d.gift_data.tab_list||[]).flatMap(t=>Array.isArray(t.list)?t.list:[])],out=new Map();
 for(const row of entries){
  if(row.special?.is_use===0)continue;
  const id=row.gift_id,g=byId.get(id);if(!g||!Number.isSafeInteger(id)||!Number.isSafeInteger(g.price)||g.price<0||!['gold','silver'].includes(g.coin_type)||typeof g.name!=='string')continue;
  const known=catalogGift('bilibili',id);
  out.set(id,{id:'bilibili:'+id,giftId:id,name:g.name.slice(0,40),price:g.price,coinType:g.coin_type,icon:known?.source===g.img_basic?known.icon:null,panelOrder:out.size,availability:'public_room_panel'});
 }
 return {state:'ready',roomId,verifiedAt:at,expiresAt:at+PANEL_TTL,scope:'public_room_panel',gifts:[...out.values()],source:'https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList?platform=pc&room_id='+roomId};
}
export function currentRoomGifts(connections,platform,now=Date.now()){
 const panel=connections?.giftPanels?.[platform],roomId=connections?.[platform]?.roomId;
 return panel?.state==='ready'&&String(panel.roomId)===String(roomId)&&Number.isFinite(panel.expiresAt)&&panel.expiresAt>now?panel:null;
}
export class RoomGiftPanels{
 constructor({fetcher=fetch,now=()=>Date.now()}={}){this.fetcher=fetcher;this.now=now;this.roomId=null;this.nextAt=0;this.epoch=0;this.state={state:'room_required',gifts:[]};}
 async refresh(roomId){
  if(roomId!==this.roomId){this.roomId=roomId;this.epoch++;this.nextAt=0;this.state={state:Number.isSafeInteger(roomId)&&roomId>0?'loading':'room_required',roomId:roomId||null,gifts:[]};}
  if(!Number.isSafeInteger(roomId)||roomId<1||this.now()<this.nextAt)return;
  this.nextAt=this.now()+PANEL_TTL;const epoch=this.epoch;
  try{const url='https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList?platform=pc&room_id='+roomId,body=await boundedJson(await this.fetcher(url,{redirect:'error',signal:AbortSignal.timeout(10000)}),2*1024*1024),panel=parseBiliRoomPanel(body,roomId,this.now());if(epoch===this.epoch)this.state=panel;}
  catch{if(epoch===this.epoch){this.state={state:'unavailable',roomId,gifts:[]};this.nextAt=this.now()+30000;}}
 }
 snapshot(){if(this.state.state==='ready'&&this.state.expiresAt<=this.now())return {...this.state,state:'stale',gifts:[]};return this.state;}
}
