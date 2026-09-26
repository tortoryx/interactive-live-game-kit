import {teamOf,hostile} from './allegiance.mjs';
import {SpatialGrid} from './spatial.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Observations only: these summaries do not move units or award victories.
export function battleSignals(state){
 const units=state.units.filter(u=>u.hp>0),grid=new SpatialGrid(units),marches=[],clashes=[];
 for(const side of new Set(['demon','human',...units.map(teamOf)])){const seen=new Set(),own=units.filter(u=>teamOf(u)===side);
  for(const seed of own){if(seen.has(seed.id))continue;const group=[seed];seen.add(seed.id);
   for(let i=0;i<group.length;i++)for(const u of grid.near(group[i],180,side))if(!seen.has(u.id)&&distance(u,seed)<380){seen.add(u.id);group.push(u);}
   if(group.length<5)continue;const p={x:group.reduce((n,u)=>n+u.x,0)/group.length,y:group.reduce((n,u)=>n+u.y,0)/group.length},enemies=grid.near(p,280).filter(u=>hostile(seed,u)),fighting=group.filter(u=>u.action).length;
   if(enemies.length>=3&&fighting>=2){if(!clashes.some(v=>distance(v,p)<330))clashes.push({...p,id:'clash-'+seed.id,count:group.length+enemies.length});}
   else if(group.filter(u=>u.moving).length>=group.length*.45&&fighting<2){const dx=group.reduce((n,u)=>n+(u.moving?Math.cos(u.face):0),0),dy=group.reduce((n,u)=>n+(u.moving?Math.sin(u.face):0),0);marches.push({...p,id:'march-'+group.map(u=>u.id).sort()[0],side,count:group.length,angle:Math.atan2(dy,dx)});}
  }
 }
 return {marches:marches.sort((a,b)=>b.count-a.count).slice(0,6),clashes:clashes.sort((a,b)=>b.count-a.count).slice(0,5)};
}
