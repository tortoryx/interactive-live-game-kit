import {createHash,createHmac,randomUUID} from 'node:crypto';
import {decodePackets,BilibiliNormalizer} from '../connectors/bilibili-events.mjs';
import {boundedJson} from './models.mjs';
export function signedRequest(config,body,now=Date.now()){
 const raw=JSON.stringify(body),headers={'x-bili-accesskeyid':config.accessKeyId,'x-bili-content-md5':createHash('md5').update(raw).digest('hex'),'x-bili-signature-method':'HMAC-SHA256','x-bili-signature-nonce':randomUUID().replaceAll('-',''),'x-bili-signature-version':'1.0','x-bili-timestamp':String(Math.floor(now/1000))};
 headers.Authorization=createHmac('sha256',config.accessKeySecret).update(Object.entries(headers).map(([k,v])=>`${k}:${v}`).join('\n')).digest('hex');headers['Content-Type']='application/json';headers.Accept='application/json';return {body:raw,headers};
}
export function packet(operation,body=''){const bytes=Buffer.from(body),header=Buffer.alloc(16);header.writeUInt32BE(bytes.length+16);header.writeUInt16BE(16,4);header.writeUInt16BE(1,6);header.writeUInt32BE(operation,8);header.writeUInt32BE(1,12);return Buffer.concat([header,bytes]);}
export function allowedSocket(raw){const u=new URL(raw);if(u.protocol!=='wss:'||u.port&&u.port!=='443'||u.username||u.password||!['bilibili.com','biliapi.com','biliapi.net'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('unexpected_wss_endpoint');return u.href;}
export class BiliConnection {
 constructor({config,onEvent,onStatus=()=>{},secret,fetcher=fetch,WebSocketClass=WebSocket,onQuarantine=()=>{}}){this.config=config;this.onEvent=onEvent;this.onQuarantine=onQuarantine;this.onStatus=onStatus;this.secret=secret;this.fetcher=fetcher;this.WS=WebSocketClass;this.generation=0;this.state={state:'disabled',accepted:0,quarantined:0,eventCounts:{},lastEventAt:null};this.enabled=false;this.gameId=null;}
 report(state){this.state={...this.state,state};this.onStatus(this.state);}
 async api(path,body,cfg=this.config()){const data=await boundedJson(await this.fetcher(`https://live-open.biliapi.com/v2/app/${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),...signedRequest(cfg,body)}));if(data.code!==0){const error=Error('platform_authorization_failed');error.platformCode=Number.isSafeInteger(data.code)?data.code:null;error.operation=path;throw error;}return data.data;}
 async start(){if(this.enabled)return;this.enabled=true;this.generation++;await this.connect(this.generation);}
 async connect(epoch){if(!this.enabled||epoch!==this.generation)return;const cfg=this.config();if(!cfg.enabled||!cfg.accessKeyId||!cfg.accessKeySecret||!cfg.anchorCode||!Number.isSafeInteger(cfg.appId)||!Number.isSafeInteger(cfg.roomId)){this.report('credentials_required');return;}
  // Each asynchronous callback owns only its own socket, timers and platform session.
  const a={cfg,gameId:null,authenticated:false};this.attempt=a;
  const current=()=>this.enabled&&epoch===this.generation&&this.attempt===a;
  this.authenticated=false;this.state={state:'connecting',accepted:0,quarantined:0,eventCounts:{},lastEventAt:null,roomId:cfg.roomId,sessionId:randomUUID(),sessionStartedAt:Date.now()};this.report('connecting');
  try{
   const data=await this.api('start',{app_id:cfg.appId,code:cfg.anchorCode},cfg);const gameId=data?.game_info?.game_id;
   if(typeof gameId!=='string'||gameId.length<1||gameId.length>200)throw Error('invalid_session');a.gameId=gameId;
   if(!current()){await this.endSession(a);return;}
   this.gameId=gameId;this.sessionConfig=cfg;
   if(data?.anchor_info?.room_id!==cfg.roomId)throw Error('room_mismatch');
   const url=allowedSocket(data.websocket_info?.wss_link?.[0]);const auth=JSON.parse(data.websocket_info.auth_body);if(!auth||typeof auth!=='object')throw Error('invalid_auth');auth.protover=2;
   const normalizer=new BilibiliNormalizer({roomId:cfg.roomId,secret:this.secret});a.lastBeat=Date.now();
   const transport={roomId:cfg.roomId,sessionId:this.state.sessionId};
   const ws=new this.WS(url);a.ws=ws;this.ws=ws;ws.binaryType='arraybuffer';
   a.authTimer=setTimeout(()=>{if(current()&&!a.authenticated)ws.close();},10000);
   ws.addEventListener('open',()=>{if(current())ws.send(packet(7,JSON.stringify(auth)));});
   ws.addEventListener('message',event=>{
    if(!current())return;
    try{const bytes=Buffer.from(event.data);if(bytes.length>1024*1024)throw Error('frame_limit');
     let offset=0;while(offset<bytes.length){if(bytes.length-offset<16)throw Error('truncated_packet');const size=bytes.readUInt32BE(offset),header=bytes.readUInt16BE(offset+4),op=bytes.readUInt32BE(offset+8);if(header!==16||size<16||offset+size>bytes.length)throw Error('packet_size');const part=bytes.subarray(offset,offset+size);offset+=size;
      if(op===8){const result=JSON.parse(part.subarray(16).toString());if(result.code!==0)throw Error('ws_auth');a.authenticated=this.authenticated=true;clearTimeout(a.authTimer);a.lastBeat=Date.now();this.state.lastError=null;this.report('authenticated');}
      else if(op===3){if(a.authenticated)a.lastBeat=Date.now();}
      else if(op===5&&a.authenticated){for(const raw of decodePackets(part)){if(raw.cmd==='LIVE_OPEN_PLATFORM_INTERACTION_END')throw Error('session_ended');const parsed=normalizer.parse(raw);if(parsed.status==='accepted'){const saved=this.onEvent({...parsed.event,transport});if(saved===false){this.state.duplicates=(this.state.duplicates||0)+1;continue;}this.state.accepted++;this.state.eventCounts[parsed.event.kind]=(this.state.eventCounts[parsed.event.kind]||0)+1;this.state.lastEventAt=Date.now();}else if(parsed.status==='quarantine'){this.state.quarantined++;this.state.lastQuarantine={reason:parsed.reason,at:Date.now()};this.onQuarantine({reason:parsed.reason,roomId:cfg.roomId,at:Date.now(),command:raw.cmd,giftId:Number.isSafeInteger(raw.data?.gift_id)?raw.data.gift_id:null});}}}
     }
    }catch(error){a.authenticated=this.authenticated=false;this.state.lastError={reason:['ws_auth','session_ended','outbox_full'].includes(error.message)?error.message:'packet_rejected',at:Date.now()};this.report('packet_rejected');ws.close();}
   });
   ws.addEventListener('error',()=>{if(current()){this.report('connection_failed');ws.close();}});
   ws.addEventListener('close',()=>{clearTimeout(a.authTimer);clearInterval(a.heartbeat);if(!current())return;a.authenticated=this.authenticated=false;this.report('reconnecting');a.retry=setTimeout(async()=>{if(!current())return;await this.endSession(a);if(current())void this.connect(epoch);},5000);});
   a.heartbeat=setInterval(async()=>{if(!current())return;if(Date.now()-a.lastBeat>65000){ws.close();return;}if(ws.readyState===1)ws.send(packet(2));try{await this.api('heartbeat',{game_id:gameId},cfg);}catch{if(current())ws.close();}},20000);
  }catch(error){await this.endSession(a);if(current()){this.state.lastError={reason:['room_mismatch','invalid_session','invalid_auth','platform_authorization_failed'].includes(error.message)?error.message:'connection_failed',code:error.platformCode??null,operation:error.operation||null,at:Date.now()};this.report('authorization_or_connection_failed');a.retry=setTimeout(()=>{if(current())void this.connect(epoch);},30000);}}
 }
 async endSession(a=this.attempt){if(!a)return;const id=a.gameId;a.gameId=null;if(this.attempt===a)this.gameId=null;if(id)await this.api('end',{app_id:a.cfg.appId,game_id:id},a.cfg).catch(()=>{});}
 async stop(){const a=this.attempt;this.attempt=null;this.enabled=false;const epoch=++this.generation;if(a){clearTimeout(a.retry);clearTimeout(a.authTimer);clearInterval(a.heartbeat);a.ws?.close();}this.authenticated=false;this.gameId=null;await this.endSession(a);if(!this.enabled&&epoch===this.generation)this.report('disabled');}
}
