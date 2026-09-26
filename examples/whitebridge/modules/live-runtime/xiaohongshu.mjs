import {randomUUID,timingSafeEqual} from 'node:crypto';
import {normalizeXhs,opaqueId,XHS_SCHEMA} from '../connectors/xiaohongshu-events.mjs';

export function xhsConfig(current,values){
 if(Object.keys(values).some(k=>!['enabled','roomId','sourceName','relayKey'].includes(k)))throw Error('invalid_fields');
 if('enabled'in values&&typeof values.enabled!=='boolean')throw Error('invalid_enabled');
 if('roomId'in values&&!opaqueId(values.roomId))throw Error('invalid_room');
 if('sourceName'in values&&(typeof values.sourceName!=='string'||!/^[\p{L}\p{N} ._-]{2,64}$/u.test(values.sourceName)))throw Error('invalid_source');
 if('relayKey'in values&&(typeof values.relayKey!=='string'||!/^[a-f0-9]{64}$/.test(values.relayKey)))throw Error('relay_key_required');
 const next={...current,...values};
 if(next.enabled&&(!next.roomId||!next.sourceName||!next.relayKey))throw Error('relay_configuration_required');
 return next;
}

export class XhsReceiver{
 constructor({db,config,secret,enqueue,now=()=>Date.now()}){Object.assign(this,{db,config,secret,enqueue,now});db.exec('CREATE TABLE IF NOT EXISTS relay_seen(id TEXT PRIMARY KEY,at INTEGER NOT NULL)');this.reset();}
 reset(){this.sessionId=randomUUID();this.eventCounts={};this.accepted=0;this.duplicates=0;this.rejected=0;this.lastEventAt=null;this.lastReason=null;}
 status(){const c=this.config();return {adapterReady:true,platformVerified:false,schema:XHS_SCHEMA,
  state:!c.enabled?'official_gift_transport_unverified':this.lastEventAt?'relay_receiving':'awaiting_relay',
  enabled:!!c.enabled,configured:!!(c.roomId&&c.sourceName&&c.relayKey),roomId:c.roomId||null,sourceName:c.sourceName||null,
  fields:{roomId:!!c.roomId,sourceName:!!c.sourceName,relayKey:!!c.relayKey},sessionId:this.sessionId,
  eventCounts:this.eventCounts,accepted:this.accepted,duplicates:this.duplicates,rejected:this.rejected,lastEventAt:this.lastEventAt,lastReason:this.lastReason,
  reason:'platform_source_not_verified',endpoint:'/integrations/xiaohongshu/events',
  limitations:['平台采集/授权来源待接入','头像协议待核验','付费置顶与币值换算待核验']};}
 receive({key,event}){
  const c=this.config(),a=Buffer.from(typeof key==='string'?key:''),b=Buffer.from(c.relayKey||'');
  if(!c.enabled||!b.length||a.length!==b.length||!timingSafeEqual(a,b))return {ok:false,status:'rejected',reason:'relay_not_authorized'};
  let e;try{e=normalizeXhs(event,{roomId:c.roomId,secret:this.secret,sessionId:this.sessionId,now:this.now()});}
  catch(error){this.rejected++;this.lastReason=error.message;return {ok:false,status:'rejected',reason:error.message};}
  if(this.db.prepare('SELECT 1 FROM relay_seen WHERE id=?').get(e.id)){this.duplicates++;return {ok:true,status:'duplicate',id:e.id};}
  this.db.exec('BEGIN IMMEDIATE');
  try{this.enqueue(e);this.db.prepare('INSERT INTO relay_seen VALUES(?,?)').run(e.id,this.now());this.db.exec('COMMIT');}
  catch(error){this.db.exec('ROLLBACK');this.rejected++;const invalidAvatar=['avatar_size','avatar_dimensions','unsupported_avatar'].includes(error.message);this.lastReason=invalidAvatar?'invalid_avatar':'receiver_backpressure';return {ok:false,status:invalidAvatar?'rejected':'retry',reason:this.lastReason};}
  this.accepted++;this.eventCounts[e.kind]=(this.eventCounts[e.kind]||0)+1;this.lastEventAt=this.now();this.lastReason=null;
  // Old retries fail the two-minute admission window; retain a day for restarts.
  this.db.prepare('DELETE FROM relay_seen WHERE at<?').run(this.now()-86400000);
  return {ok:true,status:'accepted',id:e.id,platformVerified:false};
 }
}
