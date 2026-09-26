import {allied} from './public/allegiance.mjs';
import {collectPickup,usefulPickup} from './encounters.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const SCAVENGE_RADIUS=360,SCAVENGE_MS=20000;
const labels={heal:'治疗',shield:'护盾',fury:'狂怒',haste:'加速',ammo:'弹药'};
export function clearScavenge(u){if(u.scavenge?.path===u.path){u.path=null;u.repathAt=0;}u.scavenge=null;}

// A viewer order takes priority over ordinary tactics. Without an order,
// callers only offer this short detour when the soldier is out of combat.
export function scavengeStep(w,u,dt,{ordered=false}={}){
 const origin=ordered?u.viewerOrder.origin||u:u,radius=ordered?SCAVENGE_RADIUS:145;
 let s=u.scavenge;if(s&&s.ordered!==ordered){clearScavenge(u);s=null;}
 s??=u.scavenge={ordered,pickupId:null,nextSearch:0,path:null};
 const useful=p=>p&&!p.used&&p.until>w.time&&distance(origin,p)<=radius&&usefulPickup(p,u,w.time);
 let p=w.pickups.find(p=>p.id===s.pickupId);
 if(!useful(p)||s.revision!==w.terrainRevision){if(s.pickupId!=null){clearScavenge(u);s=u.scavenge={ordered,pickupId:null,nextSearch:0,path:null};}p=null;}
 if(!p&&w.time>=s.nextSearch){
  s.nextSearch=w.time+1000;
  s.blocked=Object.fromEntries(Object.entries(s.blocked||{}).filter(([,until])=>until>w.time).slice(-32));
  const claimed=new Set(w.units.filter(v=>v!==u&&v.hp>0&&allied(v,u)&&v.scavenge?.pickupId!=null&&(!v.scavenge.ordered||v.viewerOrder?.until>w.time)).map(v=>v.scavenge.pickupId));
  const candidates=w.pickups.filter(p=>useful(p)&&!claimed.has(p.id)&&!s.blocked[p.id]).sort((a,b)=>distance(u,a)-distance(u,b));
  for(const candidate of candidates.slice(0,4)){
   const path=w.nav.plan(u,candidate);if(!path?.length||distance(path.at(-1),candidate)>=28){s.blocked[candidate.id]=w.time+5000;continue;}
   let length=0,last=u;for(const next of path){length+=distance(last,next);last=next;}if(length>radius*2.5){s.blocked[candidate.id]=w.time+5000;continue;}
   p=candidate;s.pickupId=p.id;s.path=path;s.revision=w.terrainRevision;s.expires=w.time+Math.min(15000,length/Math.max(1,u.speed)*1600+2000);u.path=path;u.pathIndex=0;u.repathAt=w.time+900;break;
  }
 }
 if(!p)return false;
 if(w.time>s.expires){clearScavenge(u);u.scavenge={ordered,pickupId:null,nextSearch:w.time+1200,path:null};return false;}
 if(distance(u,p)<30){collectPickup(w,u,p);clearScavenge(u);return true;}
 u.orderLabel='拾取'+labels[p.kind];w.move(u,p,dt);s.path=u.path;return true;
}
