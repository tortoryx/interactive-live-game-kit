import {usefulPickup} from './encounters.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),other=s=>s==='demon'?'human':'demon';
const labels={supply:'争抢补给',objective:'转向资源点',support:'向援军靠拢',spacing:'拉开后反击'};
function withdrawGoal(w,u,rival){
 const candidates=[];
 for(const p of w.pickups||[])if(!p.used&&p.until>w.time+4500&&usefulPickup(p,u,w.time)&&distance(u,p)>95&&distance(u,p)<420)candidates.push({point:p,reason:'supply',score:distance(u,p)-180});
 for(const p of w.objectives||[])if(!p.claimedBy&&p.until>w.time+6000&&distance(u,p)>150&&distance(u,p)<480)candidates.push({point:p,reason:'objective',score:distance(u,p)-90});
 for(const p of w.units||[])if(p.hp>0&&p.side===u.side&&distance(u,p)>170&&distance(u,p)<330)candidates.push({point:p,reason:'support',score:distance(u,p)+80});
 const angle=Math.atan2(u.y-rival.y,u.x-rival.x);
 // A short displacement, never an orbit or a return to the opening bridge.
 for(const turn of [0,.55,-.55])candidates.push({point:{x:u.x+Math.cos(angle+turn)*270,y:u.y+Math.sin(angle+turn)*270},reason:'spacing',score:400+Math.abs(turn)*50});
 for(const c of candidates.sort((a,b)=>a.score-b.score)){const goal=w.ground(c.point);if(goal&&distance(u,goal)>100&&distance(u,goal)<500)return {goal,reason:c.reason};}
 return null;
}
function approach(w,u,rival){const reach=Math.min(u.range||180,rival.range||180)*.66,angle=Math.atan2(u.y-rival.y,u.x-rival.x);return w.ground({x:rival.x+Math.cos(angle)*reach,y:rival.y+Math.sin(angle)*reach});}
export function duelManeuver(w,u){
 const rival=w.heroes?.[other(u.side)];
 if(u.kind!=='hero'||u.hp<=0||!rival||rival.hp<=0||w.paused||['settlement','inspection'].includes(w.mode))return null;
 const key=[w.fieldEpoch,w.heroes.demon.id,w.heroes.human.id].join(':');
 let s=w.duelManeuver;
 if(s?.key!==key)s=w.duelManeuver={key,phase:'engage',reason:'engage',until:w.time+8000,cycle:0};
 if(s.phase==='maneuver'){
  const retreating=w.heroes[s.retreating];
  if(w.time>=s.until||distance(retreating,s.goal)<40){s.phase='engage';s.reason='reengage';s.until=w.time+8500;}
 }else if(w.time>=s.until){
  if(distance(u,rival)>600)return null;
  const d=w.heroes.demon,h=w.heroes.human,diff=d.hp/d.maxHP-h.hp/h.maxHP;
  const side=Math.abs(diff)>.18?(diff<0?'demon':'human'):(s.cycle%2?'human':'demon');
  const target=withdrawGoal(w,w.heroes[side],w.heroes[other(side)]);
  if(target){Object.assign(s,{phase:'maneuver',retreating:side,pursuer:other(side),goal:target.goal,reason:target.reason,until:w.time+6000,cycle:s.cycle+1});}
  else s.until=w.time+4000;
 }
 if(distance(u,rival)>850&&s.phase==='engage')return null;
 const retreat=s.phase==='maneuver'&&s.retreating===u.side;
 const goal=retreat?s.goal:approach(w,u,rival);if(!goal)return null;
 const order=retreat?'retreat':s.phase==='maneuver'?'chase':'duel';
 const label=retreat?labels[s.reason]:order==='chase'?'追击'+rival.name:'与'+rival.name+'交锋';
 u.mission={type:order,id:rival.id,...goal,label};
 return {order,label,goal};
}
