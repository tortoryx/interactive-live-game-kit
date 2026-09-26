import {cleanChat} from '../pixel-war/public/chat-commands.mjs';
import {publicProfile} from '../live-runtime/public-profile.mjs';
import crypto from 'node:crypto';
import {inflateSync} from 'node:zlib';

// Transport is NOT established by this module. Only feed packets from a verified,
// authorized platform WebSocket. A syntactically valid packet is not authenticated.
export function decodePackets(input, budget={bytes:0,packets:0}, depth=0) {
  const buffer=Buffer.from(input);
  budget.bytes+=buffer.length;
  if(depth>3||budget.bytes>1024*1024)throw new Error('packet_budget');
  const result=[];
  for(let offset=0;offset<buffer.length;) {
    if(buffer.length-offset<16)throw new Error('truncated_header');
    const size=buffer.readUInt32BE(offset), header=buffer.readUInt16BE(offset+4);
    const version=buffer.readUInt16BE(offset+6),operation=buffer.readUInt32BE(offset+8);
    if(size<16||header!==16||size>buffer.length-offset||++budget.packets>256)throw new Error('invalid_packet');
    const body=buffer.subarray(offset+header,offset+size);offset+=size;
    if(operation!==5)continue;
    if(version===2){result.push(...decodePackets(inflateSync(body,{maxOutputLength:1024*1024-budget.bytes}),budget,depth+1));continue;}
    if(version!==0)throw new Error('unverified_protocol_version');
    const event=JSON.parse(body.toString('utf8'));
    if(!event||typeof event!=='object'||Array.isArray(event))throw new Error('invalid_event');
    result.push(event);
  }
  return result;
}

const FAMILIES={
  'open-live-v2':{dm:'LIVE_OPEN_PLATFORM_DM',gift:'LIVE_OPEN_PLATFORM_SEND_GIFT',like:'LIVE_OPEN_PLATFORM_LIKE',sc:'LIVE_OPEN_PLATFORM_SUPER_CHAT',withdraw:'LIVE_OPEN_PLATFORM_SUPER_CHAT_DEL',join:'LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER'},
  'open-platform':{dm:'OPEN_LIVEROOM_DM',gift:'OPEN_LIVEROOM_SEND_GIFT',like:'OPEN_LIVEROOM_LIKE'},
};


export class BilibiliNormalizer {
  constructor({roomId,secret,family='open-live-v2',now=()=>Date.now()}) {
    if(!Object.hasOwn(FAMILIES,family)||!Number.isSafeInteger(roomId)||roomId<=0||typeof secret!=='string'||secret.length<32)throw new Error('invalid_config');
    this.roomId=roomId;this.secret=secret;this.family=FAMILIES[family];this.now=now;this.seen=new Map();
  }
  parse(event){
    if(!event||typeof event!=='object'||!Object.values(this.family).includes(event.cmd))return {status:'ignored',reason:'unknown_command'};
    const d=event.data;
    if(!d||d.room_id!==this.roomId)return {status:'quarantine',reason:'wrong_room'};
    if(event.cmd===this.family.withdraw){if(!Array.isArray(d.message_ids)||!d.message_ids.length||d.message_ids.length>100||!d.message_ids.every(v=>Number.isSafeInteger(v)&&v>0))return {status:'quarantine',reason:'withdraw_fields'};const messageIds=d.message_ids.map(v=>'bilibili:sc:'+this.roomId+':'+v);return {status:'accepted',event:{platform:'bilibili',id:'bilibili:withdraw:'+crypto.createHash('sha256').update(messageIds.join(',')).digest('hex').slice(0,32),actor:'platform-moderation',at:this.now(),kind:'withdraw',messageIds}};}
    // ENTER has no msg_id in the official schema. This non-purchase event can
    // coalesce repeated entry notifications for the same user/second.
    const stableId=event.cmd===this.family.join?'join-'+crypto.createHmac('sha256',this.secret).update(String(d.open_id)+':'+d.timestamp).digest('hex'):event.cmd===this.family.sc&&Number.isSafeInteger(d.message_id)&&d.message_id>0?'sc-'+d.message_id:d.msg_id;
    if(typeof stableId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(stableId))return {status:'quarantine',reason:'stable_event_id_required'};
    if(typeof d.open_id!=='string'||d.open_id.length<1||d.open_id.length>256)return {status:'quarantine',reason:'actor_required'};
    const now=this.now();
    if(!Number.isSafeInteger(d.timestamp)||d.timestamp*1000>now+30000||now-d.timestamp*1000>120000)return {status:'quarantine',reason:'event_time'};
    for(const [id,time]of this.seen)if(now-time>15*60*1000)this.seen.delete(id);
    const id='bilibili:'+this.roomId+':'+stableId;
    if(this.seen.has(id))return {status:'duplicate',id};
    if(this.seen.size>=20000)return {status:'quarantine',reason:'capacity'};
    const actor=crypto.createHmac('sha256',this.secret).update('bilibili:'+d.open_id).digest('hex').slice(0,24);
    const base={platform:'bilibili',id,actor,at:d.timestamp*1000};let data;
    if(event.cmd===this.family.join){data={...base,kind:'join',supporter:publicProfile(d)};
    }else if(event.cmd===this.family.dm){
      const text=cleanChat(d.msg);if(!text)return {status:'ignored',reason:'outside_game_menu'};
      data={...base,kind:'chat',text,supporter:publicProfile(d)};
    }else if(event.cmd===this.family.sc){
      const text=cleanChat(d.message);if(!text||!Number.isSafeInteger(d.rmb)||d.rmb<1||d.rmb>1000000||!Number.isSafeInteger(d.message_id)||d.message_id<1)return {status:'quarantine',reason:'sc_fields'};
      const hasTime=Number.isSafeInteger(d.start_time)&&Number.isSafeInteger(d.end_time)&&d.end_time>d.start_time&&d.end_time-d.start_time<=7200;
      data={...base,pinStart:hasTime?d.start_time*1000:null,pinEnd:hasTime?d.end_time*1000:null,kind:'chat',text,amountMilli:d.rmb*1000,messageId:'bilibili:sc:'+this.roomId+':'+d.message_id,supporter:publicProfile(d)};
    }else if(event.cmd===this.family.gift){
      if(!Number.isSafeInteger(d.gift_id)||d.gift_id<1||!Number.isSafeInteger(d.gift_num)||d.gift_num<1||d.gift_num>100000||typeof d.paid!=='boolean')return {status:'quarantine',reason:'gift_fields'};
      if((Object.hasOwn(d,'combo_gift')&&typeof d.combo_gift!=='boolean')||
        (Object.hasOwn(d,'blind_gift')&&(!d.blind_gift||typeof d.blind_gift.status!=='boolean')))return {status:'quarantine',reason:'ambiguous_gift_fields'};
      if(d.combo_gift===true){const c=d.combo_info;if(!c||typeof c.combo_id!=='string'||c.combo_id.length<1||c.combo_id.length>128||!Number.isSafeInteger(c.combo_base_num)||c.combo_base_num<1||!Number.isSafeInteger(c.combo_count)||c.combo_count<1)return {status:'quarantine',reason:'combo_fields'};}
      if(d.blind_gift?.status===true)return {status:'quarantine',reason:'blind_gift_unverified'};
      // Official field: gift_num is the quantity in this SEND_GIFT event;
      // combo_count is presentation metadata, never another troop multiplier.
      // price is a UNIT value in milli-RMB, not the whole batch's value.
      const value=d.price*d.gift_num;
      data={...base,kind:'gift',giftName:typeof d.gift_name==='string'?cleanChat(d.gift_name):null,giftId:d.gift_id,quantity:d.gift_num,paid:d.paid,amountMilli:d.paid&&Number.isSafeInteger(d.price)&&d.price>=0&&Number.isSafeInteger(value)&&value<=1e12?value:0,supporter:publicProfile(d)};
    }else{
      if(!Number.isSafeInteger(d.like_count)||d.like_count<1||d.like_count>100000)return {status:'quarantine',reason:'like_fields'};
      data={...base,kind:'like',quantity:d.like_count};
    }
    this.seen.set(id,now);
    return {status:'accepted',event:data};
  }
}
