import {allied,factionFields} from './public/allegiance.mjs';
import {UNITS} from './public/catalog.mjs';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function reinforcementZone(w,side){const h=w.heroes[side],hostiles=w.allAlive().filter(u=>!allied(u,side)&&d(u,h)<260),quadrants=new Set(hostiles.filter(u=>d(u,h)<220).map(u=>Math.floor((Math.atan2(u.y-h.y,u.x-h.x)+Math.PI)/(Math.PI/2))%4));const hazardous=w.hazards.some(v=>v.until>w.time&&d(v,h)<v.radius+40);return hostiles.length>=4&&quadrants.size>=3?'surrounded':hostiles.length||hazardous?'rear':'safe';}
export function reinforcementPoint(w,side,kind){const h=w.heroes[side];if(h.hp<=0)return null;const zone=reinforcementZone(w,side),alive=w.allAlive(),spec=UNITS[kind],radius=spec.machine?15*spec.scale:kind==='colossus'?30:12*(spec.scale||1),phase=w.random()*Math.PI*2;
 for(let n=0;n<96;n++){const angle=zone==='rear'?(side==='demon'?Math.PI:0)+Math.sin(phase+n*2.399963)*.85:phase+n*2.399963,r=zone==='rear'?180+Math.floor(n/24)*32:64+Math.floor(n/24)*34,p={x:h.x+Math.cos(angle)*r,y:h.y+Math.sin(angle)*r};
 if(!w.open(p.x,p.y)||alive.some(u=>d(u,p)<u.radius+radius+9)||w.hazards.some(v=>v.until>w.time&&d(v,p)<v.radius+20))continue;
 if(zone==='rear'&&alive.some(u=>!allied(u,side)&&d(u,p)<100))continue;return {...p,zone};}return null;
}
export function recordReinforcement(w,u,viewer){w.reinforcementShots??=[];let shot=w.reinforcementShots.find(s=>s.receipt===viewer.receipt);if(!shot){shot={id:++w.serial,receipt:viewer.receipt,side:u.side,...factionFields(u),at:w.time,x:u.x,y:u.y,kind:u.kind,supporter:u.supporter,units:[]};w.reinforcementShots.push(shot);}shot.units.push({id:u.id,life:u.life||1});w.reinforcementShots=w.reinforcementShots.filter(s=>w.time-s.at<180000).slice(-128);}
