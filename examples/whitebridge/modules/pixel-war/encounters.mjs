import {hostile,allied,factionFields} from './public/allegiance.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {announceFieldEvent} from './announcements.mjs';
import {CROSSINGS} from './public/terrain.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const DISASTERS=['meteor','quake'];
export function launchDisaster(w,kind,point){
 if(!DISASTERS.includes(kind)||w.hazards.filter(h=>h.until>w.time).length>=12)return false;const p=w.ground(point?{x:point.x,y:point.y}:{x:(w.heroes.demon.x+w.heroes.human.x)/2,y:CROSSINGS[Math.floor(w.random()*3)]});if(!p)return false;
 const duration=kind==='meteor'?1200:kind==='quake'?6000:8500;
 const h={id:++w.serial,kind,...p,radius:kind==='meteor'?185:kind==='quake'?215:195,impact:w.time+2600,until:w.time+2600+duration,nextPulse:w.time+2600,hit:false};w.hazards.push(h);announceFieldEvent(w,kind,p,h.until);w.emit('warning',{x:p.x,y:p.y,kind});for(const s of ['demon','human'])if(distance(w.heroes[s],h)<600)w.react(s,kind[0].toUpperCase()+kind.slice(1),2);return true;
}
export function encounterTargets(h,alive){
 const enemies=alive.filter(u=>u.hp>0&&(h.sourceSnapshot?.faction?hostile(h.sourceSnapshot,u):!h.side||!allied(u,h.side)));
 if(h.kind!=='volley')return enemies.filter(u=>distance(u,h)<h.radius);
 // A single lightning chain visits each enemy once, at most eight contacts.
 const hit=[],seen=new Set();let from=h;
 for(let i=0;i<8;i++){const next=enemies.filter(u=>!seen.has(u.id)&&distance(u,from)<(i?160:h.radius)).sort((a,b)=>distance(a,from)-distance(b,from))[0];if(!next)break;hit.push(next);seen.add(next.id);from=next;}
 return hit;
}
export function updateEncounters(w,alive,pending){
 for(const h of w.hazards){if(w.time<h.impact||w.time>=h.until||w.time<(h.nextPulse??h.impact))continue;const kind=h.kind||'meteor';if(kind==='flood')continue;
  if(['meteor','slam','flame','volley'].includes(kind)&&h.hit)continue;h.hit=true;h.nextPulse=w.time+1400;const source=h.sourceId?(alive.find(u=>u.id===h.sourceId&&(!h.sourceLife||(u.life||1)===h.sourceLife))||h.sourceSnapshot):null;
  const targets=encounterTargets(h,alive);let previous={x:h.x,y:h.y-220};const arcs=kind==='volley'?targets.map(u=>{const line={from:previous,to:{x:u.x,y:u.y}};previous=line.to;return line;}):undefined;w.emit(kind,{x:h.x,y:h.y,radius:h.radius,side:h.side||'neutral',focus:h.focus||combatFocus(source),arcs});
  if(!h.terrainHit&&['meteor','slam','quake','flame','volley'].includes(kind)){h.terrainHit=true;w.breakGround(h,h.radius,kind==='quake'?200:300,h.side,kind,h.focus||combatFocus(source));}
  for(const u of targets){
   const amount=kind==='meteor'?600:kind==='quake'?100:kind==='slam'?340:kind==='flame'?240:200;
   pending.push([source,u,amount*(h.damageScale||1)*100/(100+u.armor),false,kind,{attackId:h.attackId}]);
   if(u.kind!=='barracks'&&['slam','quake','meteor','flame'].includes(kind)){u.stunnedUntil=w.time+(kind==='slam'?650:200);const a=Math.atan2(u.y-h.y,u.x-h.x);const p=w.ground({x:u.x+Math.cos(a)*35,y:u.y+Math.sin(a)*35});if(p){u.x=p.x;u.y=p.y;}u.action=null;}
  }
 }
}
export function combatSkill(w,u,enemies){
 if(w.time<(u.skillReadyAt||0)||!enemies.length)return false;const nearest=enemies.filter(e=>distance(u,e)<(u.kind==='colossus'?190:310)).sort((a,b)=>(u.kind==='hero'?(a.kind==='hero'?-400:0)-(b.kind==='hero'?-400:0):0)+distance(u,a)-distance(u,b))[0];if(!nearest)return false;
 const kind=u.kind==='colossus'?'slam':u.side==='demon'?'flame':'volley';u.skillReadyAt=w.time+(kind==='slam'?11500:14000);const p=kind==='slam'?{x:u.x+Math.cos(u.face)*55,y:u.y+Math.sin(u.face)*55}:{x:nearest.x,y:nearest.y};
 w.hazards.push({id:++w.serial,kind,...p,attackId:'skill:'+u.id+':'+(u.life||1)+':'+w.time,side:u.side,sourceId:u.id,sourceLife:u.life||1,focus:combatFocus(u),sourceSnapshot:combatFocus(u)?structuredClone({id:u.id,x:u.x,y:u.y,life:u.life||1,side:u.side,...factionFields(u),kind:u.kind,source:u.source,supporter:u.supporter,giftQuality:u.giftQuality}):null,radius:kind==='slam'?175:kind==='flame'?175:135,impact:w.time+850,until:w.time+2000,nextPulse:w.time+850,hit:false});w.emit('skill_cast',{x:u.x,y:u.y,side:u.side,focus:combatFocus(u),kind});
 if(u.kind==='hero'){u.orderLabel=u.side==='demon'?'炼狱爆破':'连锁雷击';if(nearest.kind==='hero')w.react(u.side,'Duel');}return true;
}
export function collectPickup(w,u,p){
 p.used=true;let amount=0;
 if(p.kind==='heal'){amount=Math.min(u.maxHP-u.hp,u.kind==='hero'?400:150);u.hp+=amount;}
 else if(p.kind==='shield'){amount=Math.min(400-u.shield,240);u.shield+=amount;}
 else if(p.kind==='haste')u.hasteUntil=w.time+12000;
 else if(p.kind==='fury')u.furyUntil=w.time+12000;else if(p.kind==='ammo')u.ammoUntil=w.time+25000;
 w.emit('pickup',{x:u.x,y:u.y,side:u.side,focus:combatFocus(u),kind:p.kind,target:u.id});if(amount>0)w.emit('heal',{x:u.x,y:u.y,side:u.side,focus:combatFocus(u),target:u.id,amount,shield:p.kind==='shield'});
}
export function usefulPickup(p,u,time){return p.kind==='ammo'?(!!u.projectileKind||['bow','shortbow','crossbow'].includes(u.equipment?.weapon))&&!(u.ammoUntil>time+2000):p.kind==='heal'?u.hp<u.maxHP*.92:p.kind==='shield'?u.shield<240:p.kind==='haste'?(u.hasteUntil||0)<time+2000:(u.furyUntil||0)<time+2000;}
