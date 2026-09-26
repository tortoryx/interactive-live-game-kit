import {createHash,createHmac} from 'node:crypto';
import {cleanChat} from '../pixel-war/public/chat-commands.mjs';
import {displayName} from '../live-runtime/public-profile.mjs';

// Our adapter contract, NOT a Xiaohongshu API or a vendor's wire protocol.
// Only an explicitly configured source may submit it through the private relay.
export const XHS_SCHEMA='whitebridge.xiaohongshu.v1';
export const opaqueId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function normalizeXhs(input,{roomId,secret,sessionId,now=Date.now()}){
 if(!input||input.schema!==XHS_SCHEMA||!opaqueId(input.roomId)||input.roomId!==roomId)throw Error('wrong_room_or_schema');
 if(!opaqueId(input.eventId)||!opaqueId(input.viewerId))throw Error('stable_ids_required');
 if(!Number.isSafeInteger(input.occurredAt)||input.occurredAt>now+30000||input.occurredAt<now-120000)throw Error('event_time');
 if(!['chat','gift','like','join','leave'].includes(input.kind))throw Error('unsupported_event');
 // Keep long platform identifiers as strings; never round them through Number.
 const id='xiaohongshu:'+createHash('sha256').update(JSON.stringify([roomId,input.eventId])).digest('hex');
 const actor=createHmac('sha256',secret).update('xiaohongshu:'+input.viewerId).digest('hex').slice(0,24);
 const out={id,actor,platform:'xiaohongshu',at:input.occurredAt,kind:input.kind,
  supporter:{name:displayName(input.viewerName),platform:'xiaohongshu'},
  transport:{adapter:XHS_SCHEMA,roomId,sessionId,source:'owner_relay',platformVerified:false}};
 if(input.avatar)out.supporter.avatarImage={type:input.avatar.type,base64:input.avatar.base64};
 if(input.kind==='chat'){const text=cleanChat(input.text);if(!text)throw Error('message_filtered');out.text=text;}
 if(input.kind==='gift'){
  if(!opaqueId(input.giftId)||input.quantityMode!=='delta'||!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>100000||typeof input.paid!=='boolean')throw Error('gift_delta_required');
  Object.assign(out,{giftId:input.giftId,giftName:displayName(input.giftName,'礼物'),quantity:input.quantity,paid:input.paid,amountMilli:0});
  // No guessed coin-to-RMB conversion or caller-supplied cash priority.
 }
 if(input.kind==='like'){if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>100000)throw Error('invalid_like');out.quantity=input.quantity;}
 return out;
}
