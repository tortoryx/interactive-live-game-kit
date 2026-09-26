import {factionFields,factionLeader,teamOf} from '../pixel-war/public/allegiance.mjs';
import {eligibleFallen,REVIVE_WINDOW} from '../pixel-war/service-life.mjs';
import {reinforcementCopies} from '../pixel-war/public/gift-strength.mjs';
import {UNITS} from '../pixel-war/public/catalog.mjs';
import {GIFT_TIERS} from '../pixel-war/public/gift-tiers.mjs';
import {GIFTS} from '../pixel-war/public/gifts.mjs';

// One point is 10 verified Bilibili price-milli units (0.01 yuan). These are
// game-only rescue progress, never a platform currency, balance or refund.
export const RESCUE_POINT_MILLI=10;
export function rescueCost(u){
 const p=u.giftQuality?.power,tier=GIFT_TIERS[u.giftQuality?.tier||0];
 const basis=p?.version===1?p.priceMilli/(p.count*reinforcementCopies(p.priceMilli)):
  tier?.from?tier.from/(GIFTS[tier.reward]?.count||1):Math.max(20,(UNITS[u.kind]?.pop||1)*20);
 const level=1+.1*Math.max(0,Math.min(9,(u.level||1)-1)),life=1+.25*Math.max(0,Math.min(4,(u.life||1)-1));
 return Math.max(1,Math.ceil(basis*.5*level*life/RESCUE_POINT_MILLI))*RESCUE_POINT_MILLI;
}
const key=(ownerId,side)=>side+':'+ownerId;
function account(game,e){
 game.meta.rescue??={version:1,accounts:{}};
 return game.meta.rescue.accounts[key(e.supporter.id,e.faction||e.side)]??={creditMilli:0,supporter:e.supporter,side:e.side,...factionFields(e)};
}
export function rescueQuote(game,ownerId,side,faction=null){
 const w=game.world,fallen=eligibleFallen(w,ownerId,side,faction).sort((a,b)=>rescueCost(a)-rescueCost(b)||a.at-b.at||a.id.localeCompare(b.id));
 const a=game.meta.rescue?.accounts[key(ownerId,faction||side)],creditMilli=a?.creditMilli||0,costMilli=fallen.reduce((n,u)=>n+rescueCost(u),0);
 return {ownerId,side,count:fallen.length,pending:(w.fallenTroops||[]).filter(u=>u.ownerId===ownerId&&teamOf(u)===(faction||side)&&u.reservedBy).length,
  creditMilli,costMilli,missingMilli:Math.max(0,costMilli-creditMilli),nextCostMilli:fallen[0]?rescueCost(fallen[0]):0,
  remainingMs:fallen.length?Math.max(0,REVIVE_WINDOW-(w.time-Math.min(...fallen.map(u=>u.at)))):0};
}
export function rescueIntent(text){return /^(?:复活|救援|我的复活)[！!。\s]*$/.test(String(text||'').trim());}
export function showRescue(game,e){const a=account(game,e);a.shownAt=game.world.time;a.supporter=e.supporter;return {status:'rescue_quote',...rescueQuote(game,e.supporter.id,e.side,e.faction)};}
// Called once inside receive's receipt transaction. Ordinary gifts still summon
// their full formation. Only gifts delivered while troops await rescue add points.
export function creditRescue(game,e,{test=false}={}){
 if(!eligibleFallen(game.world,e.supporter.id,e.side,e.faction).length)return 0;
 const value=test?e.testRescueMilli:e.platform==='bilibili'&&e.paid===true?e.amountMilli:0;
 if(!Number.isSafeInteger(value)||value<=0)return 0;
 const a=account(game,e),sum=a.creditMilli+value;if(!Number.isSafeInteger(sum))throw Error('rescue_credit_overflow');
 a.creditMilli=sum;a.shownAt=game.world.time;a.supporter=e.supporter;
 e.rescue={creditedMilli:value,spentMilli:0,reserved:0};return value;
}
export function reserveRescue(game,e){
 const w=game.world,fallen=eligibleFallen(w,e.supporter.id,e.side,e.faction).sort((a,b)=>rescueCost(a)-rescueCost(b)||a.at-b.at||a.id.localeCompare(b.id));
 const a=game.meta.rescue?.accounts[key(e.supporter.id,e.faction||e.side)];if(!fallen.length||!a)return 0;
 let available=a.creditMilli,spent=0;const chosen=[];
 for(const u of fallen){const cost=rescueCost(u);if(cost>available)break;chosen.push(u);available-=cost;spent+=cost;}
 if(!chosen.length)return 0;if(game.meta.queue.length>=4096)throw Error('queue_capacity');
 for(const u of chosen){u.reservedBy=e.id;u.rescuePaidMilli=rescueCost(u);}
 a.creditMilli=available;a.shownAt=w.time;a.lastReserved=chosen.length;a.lastRescueAt=w.time;
 const grant={receipt:e.id,side:e.side,...factionFields(e),key:'revive',reviveIds:chosen.map(u=>u.id),remaining:chosen.length,lane:1,source:e.platform,points:0,credited:true,supporter:e.supporter};
 game.meta.queue.push(grant);e.rescue??={creditedMilli:0,spentMilli:0,reserved:0};e.rescue.spentMilli+=spent;e.rescue.reserved+=chosen.length;
 game.log({side:e.side,source:e.platform,text:e.supporter.name+'：救援 '+chosen.length+' 名部队',reward:'revive'});return chosen.length;
}
export function rescueSnapshot(game){
 const w=game.world,groups=new Map(),living=new Map();
 for(const u of w.units)if(u.hp>0&&u.supporter?.id){const k=key(u.supporter.id,teamOf(u));if(!living.has(k))living.set(k,u);}
 for(const f of w.fallenTroops||[]){if(!f.reservedBy&&(w.time-f.at>REVIVE_WINDOW||w.time<f.at))continue;const k=key(f.ownerId,teamOf(f));let g=groups.get(k);
  if(!g)groups.set(k,g={ownerId:f.ownerId,side:f.side,...factionFields(f),supporter:f.supporter,x:f.x,y:f.y,at:f.at,count:0,pending:0,costMilli:0,nextCostMilli:Infinity,oldest:Infinity});
  if(f.at>g.at)Object.assign(g,{x:f.x,y:f.y,at:f.at});if(!g.supporter)g.supporter=f.supporter;
  if(f.reservedBy)g.pending++;else{const cost=rescueCost(f);g.count++;g.costMilli+=cost;g.nextCostMilli=Math.min(g.nextCostMilli,cost);g.oldest=Math.min(g.oldest,f.at);}
 }
 for(const [k,a] of Object.entries(game.meta.rescue?.accounts||{}))if(Number.isFinite(a.shownAt)&&w.time-a.shownAt<9000&&!groups.has(k))groups.set(k,{ownerId:a.supporter.id,side:a.side,...factionFields(a),supporter:a.supporter,at:a.shownAt,count:0,pending:0,costMilli:0,nextCostMilli:0});
 return [...groups].map(([k,g])=>{const a=game.meta.rescue?.accounts[k],alive=living.get(k),h=factionLeader(w,g)||w.heroes[g.side],creditMilli=a?.creditMilli||0;return {
  ownerId:g.ownerId,side:g.side,...factionFields(g),count:g.count,pending:g.pending,rescued:w.time-(a?.lastRescueAt??-Infinity)<9000?(a?.lastReserved||0):0,costMilli:g.costMilli,creditMilli,missingMilli:Math.max(0,g.costMilli-creditMilli),nextCostMilli:g.count?g.nextCostMilli:0,remainingMs:g.count?Math.max(0,REVIVE_WINDOW-(w.time-g.oldest)):0,
  supporter:alive?.supporter||g.supporter||a?.supporter||{id:g.ownerId,name:'玩家',platform:'bilibili'},anchor:{x:alive?.x??g.x??h.x,y:alive?.y??g.y??h.y},shownAt:Math.max(g.at,a?.shownAt??-Infinity),queriedAt:a?.shownAt??null};});
}
