import {factionFields,allied} from '../pixel-war/public/allegiance.mjs';
import {UNITS} from '../pixel-war/public/catalog.mjs';
import {SITE_KINDS} from '../pixel-war/campaign.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const narratableArrival=item=>item?.eventNotice!=='arrival'||item.arrival?.trigger==='gift'||!!item.arrival?.gift||item.arrival?.paid===true;
// On process recovery, old arrivals stay history. A receipt is narrated at most once.
export function initializeSummonerReactions(game){
 game.meta.summonerReactions={field:game.world.fieldEpoch,cursor:Math.max(0,...(game.world.reinforcementShots||[]).map(s=>s.id))};
}
export function collectSummonerReactions(game,receive){
 const w=game.world;if(w.speechMode!=='observer'||w.paused||['inspection','settlement'].includes(w.mode))return;
 let tracker=game.meta.summonerReactions;if(!tracker||tracker.field!==w.fieldEpoch)tracker=game.meta.summonerReactions={field:w.fieldEpoch,cursor:0};
 for(const shot of w.reinforcementShots||[]){
  if(shot.id<=tracker.cursor)continue;
  // Let the first small wave arrive before describing it. Do not wait for all paid waves.
  if(w.time-shot.at<900)break;tracker.cursor=shot.id;
  if(w.time-shot.at>15000||!shot.supporter?.id||!['test','bilibili','xiaohongshu','youtube','twitch'].includes(shot.supporter.platform))continue;
  const row=game.db.prepare('SELECT payload FROM receipts WHERE id=?').get(shot.receipt);if(!row)continue;
  const original=JSON.parse(row.payload);
  if(original.kind!=='gift')continue;
  const arrival={trigger:'gift',receipt:shot.receipt,field:w.fieldEpoch,at:shot.at,kind:shot.kind,units:shot.units.map(u=>({...u})),side:shot.side,...factionFields(shot),x:shot.x,y:shot.y,source:shot.supporter.platform,paid:original.paid===true,gift:original.giftName||null};
  receive(game,{id:'arrival:'+shot.receipt,platform:shot.supporter.platform,side:shot.side,...factionFields(shot),supporter:shot.supporter,text:'援军实际到场',eventNotice:'arrival',arrival,amountMilli:arrival.paid?original.amountMilli||0:0});
 }
}
export function arrivalContext(game,item){
 const a=item?.arrival,w=game.world;if(!a||a.field!==w.fieldEpoch)return null;
 const shot=(w.reinforcementShots||[]).find(s=>s.receipt===a.receipt),members=shot?.units||a.units,ids=new Map(members.map(u=>[u.id,u.life]));
 const units=w.units.filter(u=>u.hp>0&&ids.get(u.id)===(u.life||1)),p=units.length?{x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length}:a;
 const nearby=w.units.filter(u=>u.hp>0&&distance(u,p)<300),spec=UNITS[a.kind]||{},role=a.kind==='healer'?'治疗支援':spec.machine?'攻城火力':spec.range>=200?'远程输出':spec.armor>=40?'前排保护':'近战接敌';
 return {source:a.source,paid:a.paid,gift:a.gift,side:a.side,...factionFields(a),unit:spec.name||a.kind,arrived:members.length,living:units.length,role,ageMs:w.time-a.at,nearby:{allies:nearby.filter(u=>allied(u,a)).length,opponents:nearby.filter(u=>!allied(u,a)).length},objectives:(w.campaign?.sites||[]).filter(s=>distance(s,p)<450).slice(0,2).map(s=>({name:SITE_KINDS[s.kind]?.name,controller:s.controller,contested:!!s.contested,benefit:SITE_KINDS[s.kind]?.benefit})),note:'实际入场后的采样；不表示已击杀、已救场或获胜；source=test 是本机试玩，不能称付费或真人送礼。'};
}
