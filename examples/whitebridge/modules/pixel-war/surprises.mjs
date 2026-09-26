import {SURPRISE_EVENTS} from './public/event-catalog.mjs';
import {announceFieldEvent} from './announcements.mjs';
export function launchSurprise(w,kind){
 if(!SURPRISE_EVENTS.includes(kind)||w.paused||['settlement','inspection'].includes(w.mode))return false;
 w.surprises??=[];if(w.surprises.some(e=>e.kind===kind&&e.until>w.time)||w.surprises.filter(e=>e.until>w.time).length>=3)return false;
 const d=w.heroes.demon,h=w.heroes.human,p=w.ground({x:(d.x+h.x)/2,y:(d.y+h.y)/2});if(!p)return false;
 const e={id:++w.serial,kind,...p,at:w.time,impact:w.time+3200,until:w.time+(kind==='bloodmoon'?18000:kind==='supply'?30000:15000),applied:false};
 w.surprises.push(e);announceFieldEvent(w,kind,p,e.until);
 if(kind==='storm')for(let i=0;i<3;i++){const q=w.ground({x:p.x+(i-1)*145,y:p.y+(i%2?100:-85)});if(q)w.hazards.push({id:++w.serial,kind:'volley',...q,radius:125,impact:w.time+3600+i*4100,until:w.time+4900+i*4100,nextPulse:w.time+3600+i*4100,hit:false,eventId:e.id});}
 if(kind==='bloodmoon'){for(const u of w.allAlive().filter(u=>u.side!=='neutral'))u.furyUntil=Math.max(u.furyUntil||0,e.until);e.applied=true;}
 return true;
}
export function updateSurprises(w){
 w.surprises??=[];w.surprises=w.surprises.filter(e=>e.until>w.time);w.announcements=(w.announcements||[]).filter(e=>e.until>w.time);
 w.nextSurprise??=w.time+18000;
 if(w.time>=w.nextSurprise&&!w.audienceBattle){w.surpriseIndex??=0;launchSurprise(w,SURPRISE_EVENTS[w.surpriseIndex++%SURPRISE_EVENTS.length]);w.nextSurprise=w.time+55000;}
 for(const e of w.surprises){
  if(e.kind==='bloodmoon')for(const u of w.units)if(u.hp>0)u.furyUntil=Math.max(u.furyUntil||0,e.until);
  if(e.kind==='supply'&&!e.applied&&w.time>=e.impact){e.applied=true;for(const [i,kind] of ['heal','shield','fury','heal','haste','shield'].entries()){const a=i*Math.PI/3,p=w.ground({x:e.x+Math.cos(a)*110,y:e.y+Math.sin(a)*75});if(p)w.pickups.push({id:++w.serial,...p,kind,until:e.until,supplyId:e.id});}w.emit('pickup',{x:e.x,y:e.y,radius:170,kind:'supply'});}
 }
}
