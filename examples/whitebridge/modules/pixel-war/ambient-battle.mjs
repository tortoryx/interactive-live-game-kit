import {UNITS} from './public/catalog.mjs';
import {populationLimit} from './audience-battle.mjs';
// A small, symmetrical background army. No viewer identity, rewards or fake gifts.
export const AMBIENT_CAP=60,AMBIENT_WAVE=10,AMBIENT_WAVE_MS=8000;
export const AMBIENT_RECOVERY_MAX=16;
const background=u=>u.hp>0&&u.kind==='levy'&&!u.supporter?.id;
export function tickAmbientBattle(w){
 if(!w.audienceBattle||w.paused||['settlement','inspection'].includes(w.mode)||w.time<(w.nextAmbientWave??2000))return;
 w.nextAmbientWave=w.time+AMBIENT_WAVE_MS;
 // Compare only background extras. Paid/owned troops never raise the opposing
 // reinforcement budget; their contribution is not cancelled by rubber-banding.
 const counts=Object.fromEntries(['demon','human'].map(side=>[side,w.units.filter(u=>u.side===side&&background(u)).length]));
 for(const side of ['demon','human']){
  const h=w.heroes[side],enemy=w.heroes[side==='human'?'demon':'human'];if(h.hp<=0||enemy.hp<=0)continue;
  const count=counts[side],other=counts[side==='human'?'demon':'human'];
  const recovery=Math.min(AMBIENT_RECOVERY_MAX,Math.max(0,Math.ceil((other-count-8)*.6)));
  const n=Math.min(AMBIENT_WAVE+recovery,AMBIENT_CAP-count,Math.max(0,populationLimit(w)-w.population(side)-40));
  const dx=enemy.x-h.x,dy=enemy.y-h.y,len=Math.hypot(dx,dy)||1,fx=dx/len,fy=dy/len;
  for(let i=0;i<n;i++){
   const across=(i-(n-1)/2)*19,back=140+(i%3)*22;
   const p=w.ground({x:h.x-fx*back-fy*across,y:h.y-fy*back+fx*across});if(!p)continue;
   const unit={...w.fighter(side,'levy',UNITS.levy,p.x,p.y),lane:1,tactic:'advance',tacticUntil:w.time+600000,source:'system',ambient:true,targetId:null,exitGoal:null};w.units.push(unit);
  }
 }
}
export function battleDamageScale(source,target){
 if(source?.kind==='levy'&&!source.supporter?.id&&target.supporter?.id)return .45;
 if(target.kind!=='hero'&&!target.commander)return 1;
 if(source?.kind==='hero'||source?.commander)return .32;
 if(source?.kind==='levy'&&!source.supporter?.id)return .12;
 // Non-player escorts also leave the killing power to audience reinforcements.
 if(source?.side&&source.side!=='neutral'&&!source.supporter?.id)return .3;
 return 1;
}
