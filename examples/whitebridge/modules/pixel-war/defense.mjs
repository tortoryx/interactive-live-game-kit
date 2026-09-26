import {allied} from './public/allegiance.mjs';
const sides=['demon','human'],opponent=s=>s==='demon'?'human':'demon',distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function updateDefense(w){
 const c=w.campaign;c.responses??={};if(w.time<(c.nextDefenseScan||0))return;c.nextDefenseScan=w.time+750;
 const all=w.units.filter(u=>u.hp>0);
 for(const side of sides){
  const sites=c.sites.filter(s=>s.assault?.until>w.time&&s.assault.defender===side).sort((a,b)=>b.progress-a.progress||b.assault.attackers-a.assault.attackers),previous=c.responses[side];
  let order=c.orders[side];if(order?.source==='model'&&sites[0]?.assault.at>order.at){delete c.orders[side];order=null;}
  const troops=all.filter(u=>allied(u,side)&&!(u.viewerOrder?.until>w.time));for(const u of all.filter(u=>allied(u,side)))u.defense=null;
  if(order?.until>w.time){const site=order.kind.startsWith('defend_')&&c.sites.find(s=>s.owner===side&&s.kind===order.kind.split('_')[1]);if(site){for(const u of troops)u.defense={siteId:site.id,until:order.until};c.responses[side]={siteId:site.id,kind:site.kind,at:order.at,until:order.until,source:order.source||'owner',assigned:troops.length};}else delete c.responses[side];continue;}
  if(!sites.length){delete c.responses[side];continue;}
  const primary=sites[0];c.responses[side]={siteId:primary.id,kind:primary.kind,at:previous?.siteId===primary.id?previous.at:w.time,until:w.time+1800,attackers:primary.assault.attackers,source:'watch',assigned:0};
  // Keep a fighting reserve; a viewer's explicit order always retains ownership.
  const available=new Set(troops),budget=Math.max(1,Math.ceil(troops.length*(sites.length>1?.8:.65)));let used=0;
  for(const site of sites){const candidates=[...available].sort((a,b)=>distance(a,site)-distance(b,site)),need=Math.max(3,site.assault.attackers*2);
   for(const u of candidates.slice(0,Math.min(need,budget-used))){u.defense={siteId:site.id,until:w.time+1800};available.delete(u);used++;}
  }
  c.responses[side].assigned=used;const h=w.heroes[side];if(previous?.siteId!==primary.id){h.mission=null;h.nextPlan=0;h.duelUntil=0;h.sortieUntil=0;h.path=null;}

 }
}
export function defenseStep(w,u,enemy,goal,dt){if(!u.defense||u.defense.until<=w.time||!goal||distance(u,goal)<200)return false;
 if(enemy&&distance(u,enemy)<u.range&&w.time>=u.readyAt&&w.time>=(u.defenseShotAt||0)){w.attack(u,enemy);u.defenseShotAt=w.time+2200;}else w.move(u,goal,dt);return true;
}
