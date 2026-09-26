import {allied} from './public/allegiance.mjs';
import {UNITS} from './public/catalog.mjs';
import {WIDTH,HEIGHT} from './public/terrain.mjs';
import {populationLimit} from './audience-battle.mjs';
import {announceFieldEvent} from './announcements.mjs';
import {MUSTER_INTERVAL,MUSTER_LEAD,MUSTER_DESCENT,MUSTER_TITLE_DROP,MUSTER_ASSEMBLE,MUSTER_MARCH,MUSTER_SIZE,MUSTER_GROUPS,MUSTER_NPC_CAP,formationSet,formationSlots} from './public/muster-catalog.mjs';
const sides=['demon','human'],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const npc=u=>u.hp>0&&u.kind==='levy'&&!u.supporter?.id;
// Search locally without collapsing several ranks onto the same nearestGround cell.
function slotGround(w,p,occupied){
 for(const radius of [0,24,48,72])for(let i=0;i<(radius?8:1);i++){
  const q={x:p.x+Math.cos(i*Math.PI/4)*radius,y:p.y+Math.sin(i*Math.PI/4)*radius};
  if(w.open(q.x,q.y)&&occupied.every(o=>Math.hypot(o.x-q.x,o.y-q.y)>=21)){occupied.push(q);return q;}
 }
 return null;
}
function deploy(w,m){
 // Both sides receive the same number; paid troops and their population reserve
 // are never replaced or converted into background soldiers.
 const cap=Math.max(0,Math.min(MUSTER_SIZE*MUSTER_GROUPS,...sides.map(side=>Math.min(MUSTER_NPC_CAP-w.units.filter(u=>allied(u,side)&&npc(u)).length,populationLimit(w)-w.population(side)-40))));
 const placements={demon:[],human:[]};
 for(const side of sides){const occupied=w.units.filter(u=>u.hp>0&&allied(u,side));const groups=m.groups.filter(g=>g.side===side);
  for(let i=0;i<cap;i++){const g=groups[i%MUSTER_GROUPS],slot=formationSlots(g.formation)[Math.floor(i/MUSTER_GROUPS)],p=slotGround(w,{x:g.x+g.dir*slot.x,y:g.y+slot.y},occupied);if(p)placements[side].push({g,slot,p});}
 }
 const count=Math.min(placements.demon.length,placements.human.length);m.addedCount=count;m.count=count;m.deployed=true;
 for(const side of sides)for(const {g,p} of placements[side].slice(0,count)){
  const u={...w.fighter(side,'levy',UNITS.levy,p.x,p.y),source:'system',ambient:true,lane:g.lane,tactic:'advance',tacticUntil:m.until,targetId:null,exitGoal:null};
  u.musterSlot={group:g.id,x:p.x,y:p.y};u.musterArrivalAt=m.deployAt;u.musterLandAt=m.landAt;u.readyAt=Math.max(u.readyAt,m.marchAt);u.face=g.dir===1?0:Math.PI;w.units.push(u);g.units.push(u.id);
 }
 // When the NPC budget is full, rally surviving rear troops instead of making
 // more units. They walk into formation with their existing wounds and identity.
 const alive=w.allAlive();
 const reserves=Object.fromEntries(sides.map(side=>[side,w.units.filter(u=>allied(u,side)&&npc(u)&&!u.musterSlot&&!u.action&&!u.viewerOrder&&!u.barracksId&&Math.abs(u.x-m.x)<1200&&Math.abs(u.y-m.y)<800&&!alive.some(e=>!allied(e,side)&&Math.hypot(e.x-u.x,e.y-u.y)<180)).sort((a,b)=>Math.abs(a.x-m.x)-Math.abs(b.x-m.x))]));
 const rally=Math.min(MUSTER_SIZE*MUSTER_GROUPS-count,...sides.map(s=>reserves[s].length));
 for(const side of sides){const groups=m.groups.filter(g=>g.side===side),occupied=w.units.filter(u=>u.hp>0&&allied(u,side)).map(u=>({x:u.x,y:u.y}));
  for(const u of reserves[side].slice(0,rally)){
   const g=groups.reduce((a,b)=>a.units.length<=b.units.length?a:b),slots=formationSlots(g.formation),slot=slots[Math.min(MUSTER_SIZE-1,g.units.length)];
   const p=slotGround(w,{x:g.x+g.dir*slot.x,y:g.y+slot.y},occupied)||u;
   u.musterSlot={group:g.id,x:p.x,y:p.y};u.path=null;u.repathAt=0;g.units.push(u.id);
  }
 }
 m.count+=rally;
 if(m.count){w.emit('muster',{x:m.x,y:m.y,count:m.count,source:'system'});const e=announceFieldEvent(w,'muster',m,m.until);e.detail='两族各 '+m.count+' 名列阵';}
 else m.until=w.time;
}
export function tickMuster(w){
 if(!w.audienceBattle||w.paused||['settlement','inspection'].includes(w.mode)||w.campaign?.conquest)return;
 if(w.muster&&(w.muster.version!==2||w.muster.field!==w.fieldEpoch||w.time>=w.muster.until)){w.muster=null;for(const u of w.units)if(u.musterSlot){delete u.musterSlot;u.path=null;u.repathAt=0;}}
 w.nextMuster??=w.time+MUSTER_INTERVAL;
 if(w.muster&&!w.muster.deployed&&w.time>=w.muster.deployAt)deploy(w,w.muster);
 if(w.muster?.deployed&&!w.muster.landed&&w.time>=w.muster.landAt){w.muster.landed=true;w.emit('muster_land',{x:w.muster.x,y:w.muster.y,source:'system'});}
 if(w.time<w.nextMuster||sides.some(s=>w.heroes[s].hp<=0))return;
 w.nextMuster=w.time+MUSTER_INTERVAL;w.musterCycle=(w.musterCycle||0)+1;
 const d=w.heroes.demon,h=w.heroes.human,center={x:(d.x+h.x)/2,y:clamp((d.y+h.y)/2,550,HEIGHT-550)};
 // Keep the two large formations in one local battlefield. Distant split-off leaders
 // must not force a map-wide camera pan or spawn an army inside a base.
 const groups=sides.flatMap(side=>formationSet(side,w.musterCycle).map((f,i)=>{
  const dir=side==='demon'?1:-1,x=clamp(center.x-dir*590,480,WIDTH-480),y=center.y;
  return {...f,formation:f.id,id:'muster-'+w.musterCycle+'-'+side+'-'+i,side,dir,x,y,lane:1,units:[]};
 }));
 w.muster={version:2,id:'muster-'+w.musterCycle,field:w.fieldEpoch,at:w.time,deployAt:w.time+MUSTER_LEAD,landAt:w.time+MUSTER_LEAD+MUSTER_DESCENT,titleAt:w.time+MUSTER_LEAD+MUSTER_DESCENT,titleHoldAt:w.time+MUSTER_LEAD+MUSTER_DESCENT+MUSTER_TITLE_DROP,cameraUntil:w.time+MUSTER_LEAD+MUSTER_ASSEMBLE+350,marchAt:w.time+MUSTER_LEAD+MUSTER_ASSEMBLE,until:w.time+MUSTER_LEAD+MUSTER_ASSEMBLE+MUSTER_MARCH,...center,groups,deployed:false,count:0};
}
// Normal navigation, damage, hazard avoidance and contact combat remain active.
// A formation is a temporary march order, never a shield or stat multiplier.
export function musterStep(w,u,enemy,dt){
 if(!u.musterSlot)return false;const m=w.muster,g=m?.groups.find(g=>g.id===u.musterSlot.group);
 if(u.supporter?.id||!g||m.field!==w.fieldEpoch||w.time>=m.until||enemy&&Math.hypot(enemy.x-u.x,enemy.y-u.y)<Math.max(120,u.range+enemy.radius+20)){
  delete u.musterSlot;u.path=null;u.repathAt=0;return false;
 }
 if(w.time<m.marchAt){if(!(u.musterLandAt>w.time))w.move(u,u.musterSlot,dt);else u.moving=false;if(!u.moving)u.face=g.dir===1?0:Math.PI;return true;}
 const travel=Math.min(660,(w.time-m.marchAt)*.06);
 w.move(u,{x:u.musterSlot.x+g.dir*travel,y:u.musterSlot.y},dt);return true;
}
export function holdMuster(w,ms){
 if(Number.isFinite(w.nextMuster))w.nextMuster+=ms;
 for(const u of w.units)if(u.musterLandAt>w.time-ms){u.musterArrivalAt+=ms;u.musterLandAt+=ms;}
 if(w.muster)for(const k of ['at','deployAt','landAt','titleAt','titleHoldAt','cameraUntil','marchAt','until'])if(Number.isFinite(w.muster[k]))w.muster[k]+=ms;
}
