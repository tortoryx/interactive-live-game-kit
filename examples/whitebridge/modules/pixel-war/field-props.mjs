import {teamOf,allied,hostile,factionFields} from './public/allegiance.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {frontX} from './campaign.mjs';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function ensureFieldProps(w){const front=w.campaign?.stage||0;if(w.fieldProps?.stage===front)return w.fieldProps;const x=frontX(w),at=(dx,y)=>w.ground({x:x+dx,y});
 const points=[['tower',-320,800],['tower',320,1504],['barrel',-280,940],['barrel',260,1320],['barrel',80,1740]];
 w.fieldProps={stage:front,items:points.map(([kind,dx,y],i)=>({id:'prop-'+front+'-'+i,kind,...at(dx,y),controller:null,used:false,fuseAt:null}))};
 for(const dx of [-480,480]){const p=at(dx,1232);if(p)w.pickups.push({id:++w.serial,...p,kind:'ammo',until:w.time+90000});}
 return w.fieldProps;
}
export function lightBarrels(w,p,source,radius=100){for(const b of ensureFieldProps(w).items){if(b.kind!=='barrel'||b.used||b.fuseAt||dist(b,p)>radius)continue;b.fuseAt=w.time+950;b.sourceId=source?.id;b.sourceLife=source?.life||1;b.sourceSnapshot=combatFocus(source)?structuredClone({id:source.id,x:source.x,y:source.y,life:source.life||1,side:source.side,...factionFields(source),kind:source.kind,source:source.source,supporter:source.supporter,giftQuality:source.giftQuality}):null;w.emit('barrel_fuse',{x:b.x,y:b.y,side:source?.side});}}
export function updateFieldProps(w){const props=ensureFieldProps(w),alive=w.allAlive();for(const p of props.items){
 if(p.kind==='tower'){const near=alive.filter(u=>u.side!=='neutral'&&dist(p,u)<135),teams=[...new Set(near.map(teamOf))];p.contested=teams.length>1;p.controller=teams.length===1?teams[0]:null;if(p.controller)for(const u of near.filter(u=>teamOf(u)===p.controller&&u.kind!=='hero'&&u.range>150)){u.watchUntil=w.time+1800;}continue;}
 if(p.used)continue;
 if(!p.fuseAt){const shooter=alive.find(u=>(u.kind==='hero'||u.projectileKind)&&dist(u,p)>165&&dist(u,p)<u.range&&alive.filter(v=>hostile(v,u)&&dist(v,p)<130).length>=2&&!alive.some(v=>allied(v,u)&&dist(v,p)<140));if(shooter)lightBarrels(w,p,shooter,20);}
 if(p.fuseAt&&w.time>=p.fuseAt){p.used=true;p.usedAt=w.time;const source=alive.find(u=>u.id===p.sourceId&&(u.life||1)===(p.sourceLife||1))||p.sourceSnapshot;w.emit('explosion',{x:p.x,y:p.y,radius:155,side:source?.side||'neutral',focus:combatFocus(source),style:'powder'});w.breakGround(p,155,320,source?.side,'powder',combatFocus(source));for(const u of alive.filter(u=>u.hp>0&&dist(u,p)<155))w.resolveHit(source,u,Math.round(310*100/(100+u.armor)),false,'powder');lightBarrels(w,p,source,190);}
 }}
