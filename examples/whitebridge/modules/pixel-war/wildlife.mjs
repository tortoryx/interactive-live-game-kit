import {hostile,factionFields} from './public/allegiance.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {announceFieldEvent} from './announcements.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const BEASTS={boar:{name:'獠牙兽',hp:1350,armor:22,attack:115,interval:1.65,speed:104,range:74,crit:.12,action:'thrust',scale:1.25},ogre:{name:'岩背巨兽',hp:4600,armor:38,attack:230,interval:2.8,speed:72,range:100,crit:.08,action:'crush',splash:115,scale:2}};
export function launchWildlife(w){
 w.wildlife??=[];if(w.paused||['settlement','inspection'].includes(w.mode)||w.wildlife.filter(u=>u.hp>0).length>3)return false;
 const centre={x:(w.heroes.demon.x+w.heroes.human.x)/2,y:(w.heroes.demon.y+w.heroes.human.y)/2},north=(w.wildlifeWave||0)%2===0;w.wildlifeWave=(w.wildlifeWave||0)+1;
 let count=0;for(const [i,kind] of ['ogre','boar','boar'].entries()){
  const p=w.ground({x:centre.x+(i-1)*86,y:centre.y+(north?-1:1)*330});if(!p)continue;
  const spec=BEASTS[kind],u=w.fighter('neutral',kind,{...spec,equipment:{}},p.x,p.y);Object.assign(u,{name:spec.name,radius:kind==='ogre'?35:23,source:'system',enragedUntil:0,nextRoar:w.time+4000,expiresAt:w.time+100000,spawnedAt:w.time,home:centre,targetId:null});w.wildlife.push(u);count++;
 }
 if(count)announceFieldEvent(w,'wildlife',centre,w.time+22000);w.nextWildlife=w.time+65000;w.emit('wildlife_arrival',{...centre,count,side:'neutral'});return count>0;
}
export function updateWildlife(w,u,alive,dt){
 if(u.stampede)return;
 u.moving=false;if(u.stunnedUntil>w.time)return;const escape=w.evade(u);if(escape&&!u.action){w.move(u,escape,dt);return;}if(u.action)return;
 const enemy=alive.filter(v=>v.hp>0&&v.side!=='neutral'&&hostile(u,v)&&distance(v,u)<650).sort((a,b)=>distance(a,u)-distance(b,u))[0];
 u.targetId=enemy?.id||null;
 if(!enemy){w.move(u,u.home,dt);return;}
 const d=distance(u,enemy);u.face=Math.atan2(enemy.y-u.y,enemy.x-u.x);
 if(u.kind==='ogre'&&d<175&&w.time>=u.nextRoar){u.nextRoar=w.time+12500;w.hazards.push({id:++w.serial,kind:'slam',x:enemy.x,y:enemy.y,side:'neutral',sourceId:u.id,sourceSnapshot:{id:u.id,side:'neutral',...factionFields(u),kind:u.kind,source:u.source,supporter:u.supporter,sponsorSide:u.sponsorSide,x:u.x,y:u.y},focus:combatFocus(u),radius:165,impact:w.time+1100,until:w.time+2200,nextPulse:w.time+1100,hit:false});w.emit('skill_cast',{x:u.x,y:u.y,side:'neutral',kind:'slam'});}
 if(d<u.range+enemy.radius){if(w.time>=u.readyAt)w.attack(u,enemy,BEASTS[u.kind].action);}else w.move(u,enemy,dt);
}
