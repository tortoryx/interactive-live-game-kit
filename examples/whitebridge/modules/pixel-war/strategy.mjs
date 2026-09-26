import {allied} from './public/allegiance.mjs';
import {duelManeuver} from './duel-maneuver.mjs';
import {openingDuel} from './audience-battle.mjs';
import {withdrawalPlan} from './withdrawal.mjs';
import {campaignGoal,frontX} from './campaign.mjs';
import {usefulPickup} from './encounters.mjs';
import {CROSSINGS,WIDTH,HEIGHT} from './public/terrain.mjs';
export const OBJECTIVE_TYPES={supply:{name:'补给箱',reward:'附近友军回复生命'},warhorn:{name:'战号',reward:'全军攻击提高 25%，持续 14 秒'},ward:{name:'守护石',reward:'统帅和护卫获得护盾'}};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),other=s=>s==='demon'?'human':'demon',dir=s=>s==='demon'?1:-1;
export function updateObjectives(w,ms){
 w.objectives??=[];w.nextObjective??=w.time+4000;w.strategyStats??={claims:{demon:0,human:0},contested:0};
 if(w.time>=w.nextObjective){w.nextObjective=w.time+32000;const lane=Math.floor(w.time/32000)%2===0?0:2,p=w.ground({x:frontX(w)+(w.random()-.5)*120,y:CROSSINGS[lane]});if(p){const kind=['supply','warhorn','ward'][Math.floor(w.time/32000)%3];w.objectives.push({id:'objective-'+(++w.serial),kind,lane,...p,revealAt:w.time,readyAt:w.time+4000,until:w.time+36000,progress:{demon:0,human:0},claimedBy:null});}}
 w.objectives=w.objectives.filter(o=>w.time<(o.claimedBy?o.claimedAt+4500:o.until));
 for(const o of w.objectives){if(o.claimedBy||w.time<o.readyAt)continue;const nearby=w.allAlive().filter(u=>dist(u,o)<105),presence={demon:nearby.some(u=>allied(u,'demon')),human:nearby.some(u=>allied(u,'human'))};o.contested=presence.demon&&presence.human;
  if(o.contested&&!o.wasContested){w.strategyStats.contested++;w.emit('contest',{x:o.x,y:o.y});}o.wasContested=o.contested;
  for(const s of ['demon','human']){const king=w.heroes[s],opponent=w.heroes[other(s)],troops=nearby.filter(u=>u.kind!=='hero'),ownControl=troops.some(u=>allied(u,s)),enemyControl=troops.some(u=>!allied(u,s));const channel=king.hp>0&&dist(king,o)<185&&!enemyControl&&(ownControl||dist(opponent,o)>185);o.progress[s]=Math.max(0,Math.min(2500,o.progress[s]+(channel?ms:-ms*.4)));if(o.progress[s]>=2500){o.claimedBy=s;o.claimedAt=w.time;w.strategyStats.claims[s]++;w.emit('objective_claim',{x:o.x,y:o.y,side:s,kind:o.kind});
   if(o.kind==='warhorn')w.battleBuffs[s]=w.time+14000;
   for(const u of w.allAlive().filter(u=>allied(u,s)&&(u.kind==='hero'||dist(u,o)<380))){if(o.kind==='supply'){const amount=Math.min(u.maxHP-u.hp,u.kind==='hero'?360:180);u.hp+=amount;w.emit('heal',{x:u.x,y:u.y,target:u.id,side:s,amount});}else if(o.kind==='ward'){u.shield=Math.min(u.kind==='hero'?600:300,u.shield+180);w.emit('heal',{x:u.x,y:u.y,target:u.id,side:s,amount:180,shield:true});}}
   w.react(s,'Claim',2);break;}
  }
 }
}
export function commanderPlan(w,u,enemies,friends){
 const now=w.time,threat=enemies.filter(e=>dist(e,u)<190),guard=friends.filter(f=>dist(f,u)<240);u.nextPlan??=0;
 const retreatRequested=u.tactic==='retreat'&&u.tacticUntil>now,needsCover=threat.length>guard.length+7&&u.hp/u.maxHP<.5||u.hp/u.maxHP<.22&&threat.length>0;
 if(needsCover){u.duelUntil=0;if(u.mission?.type==='duel')u.mission=null;}
 if(retreatRequested||needsCover||u.withdrawal&&!u.withdrawal.done){const issue=retreatRequested?'tactic:'+u.tacticUntil:u.withdrawal&&!u.withdrawal.done?u.withdrawal.issue:'danger',plan=withdrawalPlan(w,u,enemies,issue);if(plan)return plan;if(retreatRequested){u.tactic='hold';u.tacticUntil=now;}}
 const strategicOrder=w.campaign?.orders?.[u.side];if(strategicOrder?.until>now){const p=campaignGoal(w,u,{leader:true,order:strategicOrder.kind});if(p){u.mission=p;return {order:'campaign',label:p.label,goal:p};}}
 const response=w.campaign?.responses?.[u.side];if(response?.until>now){const p=campaignGoal(w,u,{leader:true});if(p){u.mission=p;return {order:'defend',label:p.label,goal:p};}}
 const opening=openingDuel(w,u);if(opening)return opening;
 const maneuver=duelManeuver(w,u);if(maneuver)return maneuver;
 if(now>=u.nextPlan||u.mission?.type==='objective'&&!w.objectives.some(o=>o.id===u.mission.id&&!o.claimedBy&&o.until>now)){
  u.nextPlan=now+2500;
  const pickup=w.pickups.filter(p=>!p.used&&p.until-now>3500&&dist(p,u)<600&&usefulPickup(p,u,now)).sort((a,b)=>dist(a,u)-dist(b,u))[0];
  const objectives=w.objectives.filter(o=>!o.claimedBy&&o.until-now>5000).map(o=>({o,score:dist(u,o)+(u.tacticUntil>now&&u.tacticLane!==o.lane?180:0)+(o.contested&&guard.length<2?160:0)})).sort((a,b)=>a.score-b.score);
  if(pickup&&u.hp/u.maxHP<.65)u.mission={type:'pickup',id:pickup.id,x:pickup.x,y:pickup.y,label:'寻找补给，恢复状态'};
  else if(objectives[0]&&dist(u,objectives[0].o)<450&&u.hp/u.maxHP>.24){const o=objectives[0].o,p=w.ground({x:o.x-dir(u.side)*135,y:o.y});u.mission={type:'objective',id:o.id,...p,label:'争夺'+OBJECTIVE_TYPES[o.kind].name};}
  else if(pickup&&dist(u,pickup)<260)u.mission={type:'pickup',id:pickup.id,x:pickup.x,y:pickup.y,label:pickup.kind==='shield'?'收取护盾':'收取补给'};
  else if(w.campaign){u.mission=campaignGoal(w,u,{leader:true});}
  else {const target=enemies.filter(e=>e.hp>0).sort((a,b)=>dist(u,a)-dist(u,b)+(a.kind==='hero'?180:0)-(b.kind==='hero'?180:0))[0],front=w.front(u.side),p=w.ground(target?{x:Math.max(64,Math.min(WIDTH-64,target.x-dir(u.side)*Math.min(180,u.range*.7))),y:target.y}:{x:front.x-dir(u.side)*120,y:front.y});if(p)u.mission={type:'skirmish',...p,label:'支援最近交战 · 推进阵线'};}

 }
 if(u.mission?.type==='pickup'&&!w.pickups.some(p=>p.id===u.mission.id&&!p.used)){u.nextPlan=0;u.mission=null;}
 const mission=u.mission;if(!mission)return null;
 // A detached squad trades front-line strength for control of a resource.
 if(mission.type==='objective'&&now>=(u.nextEscort||0)){u.nextEscort=now+4000;const chosen=friends.filter(f=>f.hp/f.maxHP>.3).sort((a,b)=>dist(a,u)-dist(b,u)).slice(0,4);for(const f of chosen){f.escort={hero:u.id,objective:mission.id,until:now+6500};f.repathAt=0;}}
 const o=mission.type==='objective'?w.objectives.find(o=>o.id===mission.id):null;
 return {goal:mission,order:mission.type==='campaign'?'campaign':['patrol','skirmish'].includes(mission.type)?'skirmish':mission.type==='pickup'?'resupply':'objective',label:o?.contested?'争夺'+OBJECTIVE_TYPES[o.kind].name+'，护卫交战':mission.label};
}
export function escortGoal(w,u){const offset=Number(u.id.split('-').at(-1))%4,order=w.audienceOrders?.[u.side];if(order?.until>w.time){const hero=w.heroes[order.kind==='challenge'?other(u.side):u.side];return w.ground({x:hero.x-dir(u.side)*(order.kind==='challenge'?90:55),y:hero.y+(offset-1.5)*35});}const e=u.escort;if(!e||e.until<w.time)return null;const o=w.objectives.find(o=>o.id===e.objective&&!o.claimedBy);if(!o)return null;
 const p=w.ground({x:o.x-dir(u.side)*(35+offset*6),y:o.y+(offset-1.5)*20});
 return p&&dist(p,o)<=65?p:{x:o.x,y:o.y};
}
