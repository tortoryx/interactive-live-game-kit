import {receiveView} from './show-observer.mjs';
import {debatePresentation} from './show-debate.mjs';
import {audiencePresentation} from './audience.mjs';
// A single broadcast renderer owns presentation receipts. This lease has no
// game-control capability, and ordinary preview tabs never acquire it.
export class PlaybackReceipts {
 constructor(game,{now=()=>Date.now()}={}){this.game=game;this.now=now;this.owner=null;this.until=0;}
 status(){return {connected:!!this.owner&&this.until>this.now(),last:this.last||null};}
 ownerPreview(body){
  // The authenticated control page relays its own iframe only. A real
  // broadcast renderer always has priority; this never acquires its lease.
  if(this.status().connected)return {ok:false,reason:'broadcast_presenter_active'};
  if(!body||!['started','ended','failed'].includes(body.event)||!Number.isSafeInteger(body.id)||typeof body.persona!=='string')return {ok:false,reason:'invalid_receipt'};
  return {ok:this.game.atomic(()=>debatePresentation(this.game,body)||audiencePresentation(this.game,body))};
 }
 receive(body){
  if(!body||typeof body.client!=='string'||!/^[a-f0-9-]{36}$/.test(body.client))return {ok:false,reason:'invalid_client'};
  const now=this.now();
  if(body.event==='claim'){
   if(this.owner&&this.owner!==body.client&&this.until>now)return {ok:false,reason:'presenter_busy'};
   this.owner=body.client;this.until=now+15000;return {ok:true};
  }
  if(this.owner!==body.client||this.until<=now)return {ok:false,reason:'presenter_expired'};
  this.until=now+15000;
  if(body.event==='view')return {ok:receiveView(this.game.world,body,now)};
  if(!['started','ended','failed'].includes(body.event)||!Number.isSafeInteger(body.id)||typeof body.persona!=='string')return {ok:false,reason:'invalid_receipt'};
  const ok=this.game.atomic(()=>debatePresentation(this.game,body)||audiencePresentation(this.game,body));if(ok)this.last={event:body.event,lineId:body.id,at:now};return {ok};
 }
}
