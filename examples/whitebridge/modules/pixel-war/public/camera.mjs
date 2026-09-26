import {musterActive} from './muster-catalog.mjs';
import {ceremonyPerspective} from './ceremony-perspective.mjs';
import {crownStack,crownCount} from './crowns.mjs';
import {SiteCamera} from './site-camera.mjs';
import {SummonCamera} from './summon-camera.mjs';
import {WIDTH,HEIGHT} from './terrain.mjs';
import {SpatialGrid} from './spatial.mjs';
import {battleScene} from './cinematic.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function nearestBattle(state,side){const king=state.heroes[side],alive=state.units.filter(u=>u.hp>0),grid=new SpatialGrid(alive);let best=null;
 for(const e of alive){if(e.side===side)continue;const allies=grid.near(e,245,side);if(!allies.length)continue;const x=(e.x+allies[0].x)/2,y=(e.y+allies[0].y)/2,score=Math.hypot(king.x-x,king.y-y)-Math.min(5,allies.length)*28-(e.kind==='colossus'?90:0);if(!best||score<best.score)best={x,y,score};}return best;
}
export function cameraTarget(state,side,w=1455,h=818,battle){const king=state.heroes[side],objective=(state.objectives||[]).find(o=>o.id===king.mission?.id&&!o.claimedBy),rival=state.heroes[side==='demon'?'human':'demon'],duel=state.audienceBattle&&!state.units.some(u=>u.hp>0)?rival:null,target=battle??nearestBattle(state,side)??duel??objective??state.fronts[side];return{x:clamp(king.x+clamp((target.x-king.x)*.42,-w*.28,w*.28),w/2,WIDTH-w/2),y:clamp(king.y+clamp((target.y-king.y)*.36,-h*.23,h*.23),h/2,HEIGHT-h/2)};}
// Keep the overview at the chosen viewing distance, even when armies spread out.
// No simulation coordinates, speeds or orders are changed by this module.
export function overviewTarget(state,screenW=960,screenH=540,side='demon'){
 const zoom=1.25*Math.max(.20,Math.min(.34,screenW/2800,screenH/1500));
 const king=state.heroes[side],rival=state.heroes[side==='demon'?'human':'demon'],vw=screenW/zoom,vh=screenH/zoom;
 // A global bounding box centers empty space when armies split. Anchor the
 // selected leader and include only the battle that fits in this overview.
 const nearby=p=>p&&Math.abs(p.x-king.x)<vw*.62&&Math.abs(p.y-king.y)<vh*.62;
 const points=[king,{x:king.x,y:king.y-180}];
 if(nearby(rival))points.push(rival,{x:rival.x,y:rival.y-180});
 else {const fight=nearestBattle(state,side);if(nearby(fight))points.push(fight);}
 for(const p of state.campaign?.sites||[])if(nearby(p))points.push(p);
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const x=clamp((Math.min(...xs)+Math.max(...xs))/2,king.x-vw*.22,king.x+vw*.22);
 const framed=nearby(rival)?[king,rival]:[king],low=Math.max(...framed.map(p=>p.y))-(screenH/2-70)/zoom,high=Math.min(...framed.map(p=>p.y))+(screenH/2-120)/zoom;
 const y=low<=high?clamp((Math.min(...ys)+Math.max(...ys))/2,low,high):king.y;
 return {x,y,zoom};
}
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};
// Critically damped motion keeps velocity across target changes, including reversals.
// Limit travel in screen pixels so a distant event cannot whip the camera across the map.
function damp(value,target,velocity,dt,frequency,maxSpeed){
 const offset=clamp(value-target,-maxSpeed*2/frequency,maxSpeed*2/frequency),goal=value-offset;
 const decay=Math.exp(-frequency*dt),step=(velocity+frequency*offset)*dt;
 return {value:goal+(offset+step)*decay,velocity:(velocity-frequency*step)*decay};
}
export class Camera{
 constructor(side,w=960,h=540){this.side=side;this.summons=new SummonCamera(side);this.sites=new SiteCamera(side);this.x=null;this.y=null;this.zoom=.425;this.vx=0;this.vy=0;this.vz=0;this.eventSeen=new Set();this.eventShot=null;this.eventCooldown=0;this.resize(w,h);}
 resize(w,h){this.screenW=w;this.screenH=h;this.w=w/this.zoom;this.h=h/this.zoom;}
 eventFocus(state,dt,suspended){
  if(this.eventEpoch!==state.fieldEpoch){this.eventEpoch=state.fieldEpoch;this.eventSeen.clear();this.eventShot=null;this.eventCooldown=0;}
  if(suspended){if(this.eventShot){this.eventShot=null;this.eventCooldown=10;}return null;}
  if(state.paused)return null;
  this.eventCooldown=Math.max(0,this.eventCooldown-dt);
  const active=(state.warEvents||[]).filter(e=>state.time>=e.at&&state.time<e.until);
  for(const id of this.eventSeen)if(!active.some(e=>e.id===id))this.eventSeen.delete(id);
  if(this.eventShot){this.eventShot.age+=dt;if(this.eventShot.age>=7||!active.some(e=>e.id===this.eventShot.id)){this.eventShot=null;this.eventCooldown=10;}}
  if(!this.eventShot&&!this.eventCooldown){const e=active.find(e=>state.time-e.at<6500&&!this.eventSeen.has(e.id));if(e){this.eventSeen.add(e.id);this.eventShot={id:e.id,x:e.x,y:e.y,age:0};}}
  const shot=this.eventShot;if(!shot)return null;return {...shot,blend:smooth(Math.min(shot.age/1.4,(7-shot.age)/1.5))};
 }
 follow(state,dt){
  dt=clamp(Number.isFinite(dt)?dt:0,0,.05);
  const conquest=state.campaign?.conquest,scene=battleScene(state),view=ceremonyPerspective(state,this.side),overview=overviewTarget(state,this.screenW,this.screenH,this.side);
  // Troops relocate while the conquest veil is opaque. The camera belongs to
  // that same transition, not the speed-limited ordinary follow path. Also
  // recover if a backgrounded tab missed the whole settlement interval.
  const redeployed=!!conquest?.redeployed&&this.redeployId!==conquest.id;
  const missedRedeploy=this.campaignNumber!=null&&state.campaign?.number>this.campaignNumber&&state.fieldEpoch!==this.campaignEpoch;
  const recenter=redeployed||missedRedeploy;
  if(redeployed)this.redeployId=conquest.id;
  this.campaignNumber=state.campaign?.number??null;this.campaignEpoch=state.fieldEpoch;
  // Hold a wide, shared overview instead of switching nearest targets every 250 ms.
  if(!this.overview||this.overviewEpoch!==state.fieldEpoch||Math.hypot(overview.x-this.overview.x,overview.y-this.overview.y)>100){this.overview=overview;this.overviewEpoch=state.fieldEpoch;}
  let p={x:this.overview.x,y:this.overview.y},z=overview.zoom;
  const highlight=this.summons.update(state,dt);this.highlight=highlight;
  if(highlight?.receipt)for(const e of state.warEvents||[])if(e.receipt===highlight.receipt)this.eventSeen.add(e.id);
  const activeMuster=musterActive(state),muster=activeMuster&&state.time<activeMuster.cameraUntil?activeMuster:null;
  if(muster&&this.musterId!==muster.id){this.musterId=muster.id;this.musterOrigin={x:this.x??p.x,y:this.y??p.y};}
  const event=this.eventFocus(state,dt,!!conquest||!!scene||!!highlight||!!muster);
  const report=this.sites.update(state,dt,!!conquest||!!highlight||!!event||!!muster);this.report=report;
  this.shot=scene?'ceremony':highlight?'reinforcement':event?'event':muster?'muster':report?'landmark':'overview';
  if(conquest){this.shot='campaign';p=conquest.redeployed?overview:conquest.focus;z=conquest.redeployed?overview.zoom:.5;}
  else if(scene&&scene.phase!=='resume'){
   p=view.focus;
   if(scene.phase==='arrival')p={x:p.x,y:p.y-32-crownStack(crownCount(view.focus)).height*.5};
   z=scene.phase==='execution'?1.12:['fall','arrival'].includes(scene.phase)?1.03:.8;
  }else{
   if(muster&&!highlight){const aim=smooth((state.time-muster.at-1050)/1700);p={x:this.musterOrigin.x+(muster.x-this.musterOrigin.x)*aim,y:this.musterOrigin.y+(muster.y-this.musterOrigin.y)*aim};z=Math.min(overview.zoom*.76,this.screenW/2200,this.screenH/1320);}
   const focus=highlight||event||report;
   if(focus){const k=smooth(focus.blend),focusZoom=event ? .48 : highlight ? .64 : .58;p={x:p.x+(focus.x-p.x)*k,y:p.y+(focus.y-35-p.y)*k};z+=(focusZoom-z)*k;}
  }
  if(recenter){p={x:overview.x,y:overview.y};z=overview.zoom;this.shot=conquest?'campaign':'overview';}
  const initial=this.x===null;if(initial)this.zoom=overview.zoom;
  if(recenter){this.zoom=z;this.vx=0;this.vy=0;this.vz=0;}
  const zoom=damp(this.zoom,z,this.vz,dt,3.6,.24);this.zoom=zoom.value;this.vz=zoom.velocity;this.resize(this.screenW,this.screenH);
  p.x=clamp(p.x,this.w/2,WIDTH-this.w/2);
  // Keep the full map height where possible, without clamping a moving leader
  // directly into place and causing an observable camera jump.
  const framed=this.shot==='overview'?Object.values(state.heroes).filter(h=>Math.abs(h.x-p.x)<this.w*.45):[p];
  const top=Math.min(...framed.map(h=>h.y)),bottom=Math.max(...framed.map(h=>h.y));
  const minY=Math.min(this.h/2,top+(this.screenH/2-120)/this.zoom),maxY=Math.max(HEIGHT-this.h/2,bottom-(this.screenH/2-70)/this.zoom);
  p.y=this.h>=HEIGHT?HEIGHT/2:clamp(p.y,minY,maxY);
  if(initial||recenter){this.x=p.x;this.y=p.y;return;}
  // This short, scheduled entrance has a known destination and deadline. Finish
  // its eased pan before deployment, even if ordinary follow was far away.
  // Viewer highlights keep priority; after an interruption use ordinary easing.
  if(muster&&highlight)this.musterInterrupted=muster.id;
  if(this.shot==='muster'&&this.musterInterrupted!==muster.id){this.x=p.x;this.y=p.y;this.vx=0;this.vy=0;return;}
  const travelSpeed=(scene?260:190)*(this.screenW/960)/this.zoom,speed=travelSpeed/Math.SQRT2;
  const x=damp(this.x,p.x,this.vx,dt,3,speed),y=damp(this.y,p.y,this.vy,dt,3,speed);
  const ax=x.velocity-this.vx,ay=y.velocity-this.vy,acceleration=Math.hypot(ax,ay);
  const accelerationLimit=420*(this.screenW/960)/this.zoom*dt,accelerationRatio=acceleration>accelerationLimit?accelerationLimit/acceleration:1;
  const vx=this.vx+ax*accelerationRatio,vy=this.vy+ay*accelerationRatio;
  const dx=(this.vx+vx)*.5*dt,dy=(this.vy+vy)*.5*dt,travel=Math.hypot(dx,dy),limit=travelSpeed*dt,ratio=travel>limit?limit/travel:1;
  this.x+=dx*ratio;this.y+=dy*ratio;this.vx=vx*ratio;this.vy=vy*ratio;
 }
 visible(p,pad=110){return Math.abs(p.x-this.x)<this.w/2+pad&&Math.abs(p.y-this.y)<this.h/2+pad;}
 project(p){return{x:(p.x-this.x)*this.zoom+this.screenW/2,y:(p.y-this.y)*this.zoom+this.screenH/2};}
}
