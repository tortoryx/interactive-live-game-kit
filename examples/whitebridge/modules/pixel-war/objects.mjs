import {combatFocus} from './public/combat-focus.mjs';
import {CELL,COLS,ROWS,TERRAIN,gridTerrain} from './public/terrain.mjs';
const wood=t=>t===TERRAIN.TREE||t===TERRAIN.BARRIER;
export function nearbyObjects(w,p,r){const out=[];for(let y=Math.max(1,Math.floor((p.y-r)/CELL));y<Math.min(ROWS-1,Math.ceil((p.y+r)/CELL));y++)for(let x=Math.max(1,Math.floor((p.x-r)/CELL));x<Math.min(COLS-1,Math.ceil((p.x+r)/CELL));x++){const key=y*COLS+x,original=gridTerrain(x,y);if(w.terrainChanges[key]||!wood(original))continue;const o={key,original,x:x*CELL+16,y:y*CELL+16};if(Math.hypot(o.x-p.x,o.y-p.y)<=r)out.push(o);}return out;}
export function damageObject(w,key,power,source,fire=false){
 if(w.terrainChanges[key]||!Number.isFinite(power)||power<=0)return false;
 const original=gridTerrain(key%COLS,Math.floor(key/COLS));if(!wood(original))return false;
 w.objectDamage??={};let o=w.objectDamage[key];if(!o){if(Object.keys(w.objectDamage).length>=128)return false;const hp=original===TERRAIN.TREE?180:240;o=w.objectDamage[key]={key,original,x:key%COLS*CELL+16,y:Math.floor(key/COLS)*CELL+16,hp,maxHP:hp};}
 o.hp-=power;o.lastHitAt=w.time;o.angle=source?Math.atan2(o.y-source.y,o.x-source.x):0;
 if(o.hp<=0){w.breakGround(o,50,200,source?.side,fire?'burn':'chop',combatFocus(source));delete w.objectDamage[key];}
 else w.emit('wood_hit',{x:o.x,y:o.y,key,focus:combatFocus(source),side:source?.side||'neutral'});return true;
}
export function igniteObjects(w,point,radius,generation=0){
 w.objectDamage??={};let count=0;for(const item of nearbyObjects(w,point,radius).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))){
  if(Object.values(w.objectDamage).filter(o=>o.burnUntil>w.time).length>=24||count>=8)break;
  if(w.objectDamage[item.key]?.burnUntil>w.time)continue;
  if(!damageObject(w,item.key,1,null))continue;const o=w.objectDamage[item.key];if(!o)continue;Object.assign(o,{burnAt:w.time,burnUntil:w.time+4800,nextPulse:w.time+800,nextSpread:w.time+2400,generation});count++;w.emit('tree_fire',{x:o.x,y:o.y,key:o.key});
 }return count;
}
export function updateObjects(w,alive,pending){
 w.objectDamage??={};for(const o of Object.values(w.objectDamage)){
  if(w.terrainChanges[o.key]){delete w.objectDamage[o.key];continue;}if(!o.burnUntil){if(w.time-o.lastHitAt>90000)delete w.objectDamage[o.key];continue;}
  if(w.time>=o.burnUntil){damageObject(w,o.key,999,null,true);continue;}
  if(w.time>=o.nextPulse){o.nextPulse=w.time+900;damageObject(w,o.key,o.maxHP*.16,null,true);for(const u of alive)if(u.hp>0&&Math.hypot(u.x-o.x,u.y-o.y)<46)pending.push([null,u,24,false,'fire']);}
  if(w.time>=o.nextSpread&&o.generation<1){o.nextSpread=w.time+1000000000;igniteObjects(w,o,48,1);}
 }
}
export function tryChop(w,u,goal){
 if(!['militia','rider','berserker','siege'].includes(u.kind)||w.time<u.readyAt||u.action)return false;
 const angle=Math.atan2(goal.y-u.y,goal.x-u.x),o=nearbyObjects(w,u,78).find(o=>Math.cos(Math.atan2(o.y-u.y,o.x-u.x)-angle)>.65);
 if(!o)return false;w.attack(u,{...o,id:'wood:'+o.key},u.kind==='siege'?'crush':'slash');u.action.sceneryKey=o.key;return true;
}
