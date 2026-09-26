import {POP_CAP} from './public/catalog.mjs';
import {START_X,START_Y} from './public/terrain.mjs';

export const playerTroop=u=>!!u.supporter?.id&&['test','bilibili','xiaohongshu'].includes(u.source);
export function crowdScale(participants=0){
 const n=Math.max(0,Math.floor(participants)),tier=n<=100?0:Math.min(4,Math.ceil((n-100)/100));
 return {participants:n,tier,systemCap:0,waveSize:0,waveMs:18000-tier*2000,populationCap:Math.max(POP_CAP,Math.min(600,Math.ceil(n*2.4)))};
}
export function setAudienceScale(w,participants=0){
 if(!w.audienceBattle)return;
 w.audienceBattle={version:2,...crowdScale(participants)};
}
export function enableAudienceBattle(w){
 if(w.audienceBattle?.version===2)return;
 w.audienceBattle={version:2,...crowdScale()};
 w.units=(w.units||[]).filter(playerTroop);w.wildlife=[];w.legacyReserve={demon:[],human:[]};
 const ids=new Set([...Object.values(w.heroes),...w.units].map(u=>u.id));
 w.missiles=(w.missiles||[]).filter(m=>ids.has(m.source?.id)&&ids.has(m.target));
 for(const h of Object.values(w.heroes)){h.mission=null;h.nextPlan=0;h.path=null;h.repathAt=0;h.duelUntil=0;h.nextDuel=0;h.withdrawal=null;h.sortieUntil=0;if(h.action&&!ids.has(h.action.target))h.action=null;}
 w.hazards=[];w.surprises=[];w.announcements=[];
}
export const npcCount=(w,side)=>w.units.filter(u=>u.hp>0&&u.side===side&&!playerTroop(u)).length;
export const populationLimit=w=>w.audienceBattle?.populationCap||POP_CAP;
export function allowNpc(w,side){return !w.audienceBattle;}
export function openingDuel(w,u){
 if(w.time>2500||!w.audienceBattle||w.units.some(v=>v.hp>0&&playerTroop(v)))return null;
 const rival=w.heroes[u.side==='demon'?'human':'demon'];if(!rival||rival.hp<=0)return null;
 const centre={x:START_X+(w.campaign?.front||0)*1024,y:START_Y},reach=Math.min(u.range,rival.range)*.7;
 const home=w.ground({x:centre.x+(u.side==='demon'?-1:1)*reach*.55,y:centre.y});
 const outside=Math.hypot(u.x-centre.x,u.y-centre.y)>410||Math.hypot(rival.x-centre.x,rival.y-centre.y)>460;
 const goal=outside?home:w.ground({x:(u.x+rival.x)/2+(u.side==='demon'?-1:1)*reach*.5,y:centre.y+(rival.y-centre.y)*.3});
 u.mission={type:outside?'regroup':'duel',id:rival.id,...goal,label:outside?'回到道路中央交战':'与'+rival.name+'交手'};
 return {order:outside?'regroup':'duel',label:u.mission.label,goal};
}
export function openingPositions(w){
 // Begin within fighting distance on the central road, with room for a viewer's
 // first reinforcements behind either commander. Use passable engine positions.
 for(const [side,offset] of [['demon',-120],['human',120]]){const h=w.heroes[side],p=w.ground({x:START_X+offset,y:START_Y});if(p)Object.assign(h,p);}
}
