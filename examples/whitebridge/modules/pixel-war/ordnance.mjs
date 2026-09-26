import {hostile,allied,isBoss,teamOf} from './public/allegiance.mjs';
import {lightBarrels} from './field-props.mjs';
import {rawDamage} from './public/catalog.mjs';
import {igniteObjects} from './objects.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {weaponMuzzle,weaponAim} from './public/weapon-geometry.mjs';
export function releaseProjectiles(w,u,target,a,space,defaultKind){
 const zFrom=u.machine?(u.kind==='dreadnought'?56:40)*(u.scale||1):25*(u.kind==='hero'?1.25:u.scale||1),shots=u.shots||1,choices=u.scatter?space.near(target,u.scatter).filter(v=>hostile(u,v)&&v.hp>0):[target],focus=combatFocus(u),releases=[];
 for(let i=0;i<shots;i++){const t=choices[i%Math.max(1,choices.length)]||target,angle=Math.atan2(t.y-u.y,t.x-u.x),muzzle=u.machine?u.scale*31:22,born=w.time+i*95,from=weaponMuzzle(u,a.angle,i,born),x=u.x+Math.cos(angle)*muzzle,y=u.y+Math.sin(angle)*muzzle;
  const m={id:++w.serial,attackId:a.xpId,source:u,focus,target:t.id,targetLife:t.life||1,targetX:t.x,targetY:t.y,x,y,physicalFrom:{x,y},visualFrom:from,angle,kind:u.projectileKind||defaultKind,speed:u.projectileSpeed||(defaultKind==='orb'?310:460),critical:a.critical,z:zFrom,zFrom,zTo:t.machine?45*(t.scale||1):25*(t.scale||1),flight:Math.hypot(t.x-u.x,t.y-u.y)/(u.projectileSpeed||460)*1000,born,until:born+5000};w.missiles.push(m);
  releases.push({x:from.x,y:from.y,z:from.z,at:born,angle:u.machine?a.angle:weaponAim(u,a.angle),side:u.side,focus,shotId:m.id,style:m.kind,machine:u.machine,scale:u.scale,critical:a.critical,from,targetX:t.x,targetY:t.y,targetZ:m.zTo,flight:m.flight});
 }
 for(const [i,e]of releases.entries())if(i===0)w.emit('release',e);else w.emitVisual('release',e);
}
export function projectileImpact(w,m,t,space,pending){
 const source={...m.source,projectile:true,battleTime:w.time},focus=m.focus||combatFocus(source),targets=source.splash?space.near(t,source.splash).filter(v=>hostile(source,v)).sort((a,b)=>Number(b.id===t.id)-Number(a.id===t.id)).slice(0,source.explosive?10:5):t.id?[t]:[];
 if(focus)w.emitVisual('shot_end',{x:t.x,y:t.y,z:t.id?m.zTo:m.z,shotId:m.id,focus,reason:t.id?'hit':'obstacle',style:m.kind});
 for(const v of targets)pending.push([source,v,rawDamage(source,v,m.critical)*(v.id===t.id?1:.5),m.critical,m.kind,{shotId:m.id,attackId:m.attackId}]);
 if(source.explosive){lightBarrels(w,t,source,source.splash);w.emit('explosion',{x:t.x,y:t.y,side:source.side,focus,shotId:m.id,radius:source.splash,style:m.kind,critical:m.critical});w.breakGround(t,source.splash,Math.max(220,source.attack),source.side,'shell',focus);igniteObjects(w,t,source.splash*.6);}
 else w.emit('burst',{x:t.x,y:t.y,z:m.zTo,side:source.side,focus,shotId:m.id,style:m.kind,critical:m.critical});
}
