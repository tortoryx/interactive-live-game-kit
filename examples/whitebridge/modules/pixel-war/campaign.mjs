import {allied,nearestOpponent} from './public/allegiance.mjs';
import {battleHonors,recordCampaignCapture} from './honors.mjs';
import {updateDefense} from './defense.mjs';
import {supporterEvent} from './supporter-events.mjs';
import {battleSignals} from './public/battle-signals.mjs';
import {START_X,START_Y,CROSSINGS,REGION_NAMES,regionAt,WIDTH,CELL,TERRAIN,gridTerrain,passable} from './public/terrain.mjs';
import {announceFieldEvent} from './announcements.mjs';
const sides=['demon','human'],enemy=s=>s==='demon'?'human':'demon',dir=s=>s==='demon'?1:-1,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const SITE_KINDS={grain:{name:'粮仓',benefit:'补给援军'},forge:{name:'兵工坊',benefit:'前线装备'}};
export const CONQUEST_REDEPLOY_MS=8500,CONQUEST_END_MS=12000;
export const FRONT_STEP=1024,FRONT_LIMIT=8,CAPTURE_MS=14000,PUSH_MS=8000;
// Count bodies, not population cost or hero power. One extra occupant gives
// normal speed; each further person adds 25%, capped at triple speed.
export const captureSpeed=advantage=>advantage>0?Math.min(3,1+(advantage-1)*.25):0;
export const frontX=w=>START_X+(w.campaign?.front||0)*FRONT_STEP;
export function fieldCamp(w,side){const p={x:frontX(w)-dir(side)*1076,y:START_Y};for(let n=0;n<9;n++){const q={x:p.x-dir(side)*n*32,y:p.y},t=gridTerrain(Math.floor(q.x/CELL),Math.floor(q.y/CELL),w.terrainChanges);if(passable(q.x,q.y,w.terrainChanges)&&t!==TERRAIN.FORD)return q;}return w.ground(p)||p;}
function siteGround(w,point){
 let best=null;
 // Place the building in a clearing instead of hiding it under tree canopies.
 for(let dy=-160;dy<=160;dy+=32)for(let dx=-224;dx<=224;dx+=32){const p={x:point.x+dx,y:point.y+dy};if(!passable(p.x,p.y,w.terrainChanges))continue;let blocked=0;
  for(let x=-100;x<=100;x+=32)for(let y=-150;y<=130;y+=32)if([TERRAIN.ROCK,TERRAIN.TREE,TERRAIN.BARRIER,TERRAIN.WATER].includes(gridTerrain(Math.floor((p.x+x)/CELL),Math.floor((p.y+y)/CELL),w.terrainChanges)))blocked++;
  const score=blocked*35+Math.hypot(dx,dy);if(!best||score<best.score)best={...p,score};
 }return best?{x:best.x,y:best.y}:w.ground(point)||point;
}
function sitesFor(w,front){return sides.flatMap(owner=>['grain','forge'].map((kind,i)=>({id:`site:${front}:${owner}:${kind}`,owner,kind,controller:owner,...siteGround(w,{x:START_X+front*FRONT_STEP-dir(owner)*590,y:CROSSINGS[i?2:0]}),progress:0,claimFor:null,presence:{demon:0,human:0}})));}

export function ensureCampaign(w){if(!w.campaign||w.campaign.version!==1){w.campaign={version:1,front:0,stage:0,sites:sitesFor(w,0),pending:null,history:[],homeWins:{demon:0,human:0},homeClaimed:null,orders:{}};}w.campaign.number??=1;return w.campaign;}
function notice(w,kind,p,title,detail,meta={}){const e=announceFieldEvent(w,kind,p,w.time);if(e){Object.assign(e,{title,detail,...meta});if(['assault','capture','frontline'].includes(kind)){for(const previous of w.announcements)if(previous!==e&&previous.displayAt>w.time-3100)previous.displayAt=w.time-3100;e.displayAt=w.time;}}}
export function siteControl(w,side,kind){const c=ensureCampaign(w);return c.sites.filter(s=>s.kind===kind&&s.controller===side).length;}
export function reinforcementCount(w,side,base){return Math.max(1,base+siteControl(w,side,'grain')-1);}
export function campaignDamageMultiplier(w,source){return source&&!source.faction&&sides.includes(source.side)?1+.08*Math.max(0,siteControl(w,source.side,'forge')-1):1;}
export function commandCampaign(w,side,order,{source='owner'}={}){if(!sides.includes(side)||!['raid_grain','raid_forge','defend_grain','defend_forge'].includes(order)||w.paused||w.campaign?.conquest||['settlement','inspection'].includes(w.mode))return false;ensureCampaign(w).orders[side]={kind:order,source,at:w.time,until:w.time+(source==='model'?24000:45000)};for(const u of w.units.filter(u=>allied(u,side)))u.defense=null;const h=w.heroes[side];h.withdrawal=null;h.nextPlan=0;h.mission=null;h.path=null;h.sortieUntil=0;h.duelUntil=0;h.viewerAdvice=null;h.tactic='hold';h.tacticUntil=0;return true;}
// Homeland conquest is a campaign result, not a commander death or a heal.
function beginConquest(w,winner){
 const c=ensureCampaign(w);if(c.conquest)return;
 if(c.homeClaimed!==winner)c.homeWins[winner]++;
 c.homeClaimed=winner;c.pending=null;
 const loser=enemy(winner),honors=battleHonors({honors:c.merit||w.honors},winner,[]);
 c.conquest={id:'conquest-'+(++w.serial),number:c.number,winner,loser,startedAt:w.time,redeployAt:w.time+CONQUEST_REDEPLOY_MS,until:w.time+CONQUEST_END_MS,redeployed:false,focus:{x:START_X+dir(winner)*FRONT_LIMIT*FRONT_STEP,y:START_Y},honors};
 for(const u of w.allAlive()){u.moving=false;u.action=null;}
 w.emit('victory',{side:winner,...c.conquest.focus});
 notice(w,'frontline',c.conquest.focus,(loser==='demon'?'魔族家乡':'人族王城')+'失守','战役结束，幸存部队撤往边境。',{actorSide:winner});
}
function redeployCampaign(w){
 const c=w.campaign,r=c.conquest;if(r.redeployed)return;
 c.history.push({side:r.winner,at:w.time,outcome:'conquest',number:c.number});c.history=c.history.slice(-24);
 c.front=0;c.stage++;c.number++;c.homeClaimed=null;c.pending=null;c.orders={};c.responses={};c.signals={marches:[],clashes:[]};c.nextSignals=0;c.marchNotices={};c.sites=sitesFor(w,0);c.merit={entries:{},finishers:{}};
 const relocate=(u,p)=>{const at=w.ground(p)||p;Object.assign(u,at,{path:null,repathAt:0,campaignPlan:null,defense:null,escort:null,exitGoal:null,localCombat:null,targetId:null,tactic:'hold',tacticUntil:0,mission:null,nextPlan:0,withdrawal:null,withdrawalCooldown:0,action:null,moving:false,sortieUntil:0,duelUntil:0,nextDuel:w.time+4000,viewerAdvice:null,scavenge:null});if(u.viewerOrder)u.viewerOrder={...u.viewerOrder,goal:null,...(u.viewerOrder.origin?{origin:{...at}}:{})};};
 for(const side of sides){
  relocate(w.heroes[side],{x:START_X-dir(side)*270,y:START_Y});
  const troops=w.units.filter(u=>allied(u,side)&&u.hp>0);
  for(const [i,u]of troops.entries())relocate(u,{x:START_X-dir(side)*(440+Math.floor(i/15)*42),y:START_Y+(i%15-7)*38});
  for(const [i,b]of (w.barracks||[]).filter(b=>allied(b,side)&&b.hp>0).entries())relocate(b,{x:START_X-dir(side)*(840+Math.floor(i/6)*140),y:START_Y+(i%6-2.5)*160});
  for(const [i,b]of (w.legacyBuildings||[]).filter(b=>allied(b,side)&&b.hp>0).entries())relocate(b,{x:START_X-dir(side)*680,y:START_Y+(i%7-3)*110});
 }
 for(const [i,c]of Object.values(w.clans||{}).entries()){const a=i*2.399963,p={x:START_X+Math.cos(a)*800,y:START_Y+Math.sin(a)*750};for(const [n,u]of w.allAlive().filter(v=>v.faction===c.id).entries())relocate(u,{x:p.x+(n%7-3)*45,y:p.y+Math.floor(n/7)*45});}
 // Retire spatial effects belonging to the previous battlefield. Fallen-unit
 // rescue records and viewer cooldowns remain intact.
 w.missiles=[];w.hazards=[];w.warEvents=[];w.surprises=[];w.wildlife=[];w.pickups=[];w.objectives=[];w.announcements=[];w.events=[];w.chatter=[];
 w.nextObjective=w.time+6000;w.nextPickup=w.time+4000;w.fieldEpoch=(w.fieldEpoch||0)+1;r.redeployed=true;
}
export function advanceConquest(w){
 const c=w.campaign,r=c?.conquest;if(!r)return false;
 if(w.time>=r.redeployAt&&!r.redeployed)redeployCampaign(w);
 if(w.time>=r.until){c.lastConquest={number:r.number,winner:r.winner,at:w.time,participants:r.honors.totalParticipants};c.conquest=null;}
 return true;
}
export function updateCampaign(w,ms){
 const c=ensureCampaign(w);if(w.paused||['settlement','inspection'].includes(w.mode))return;if(advanceConquest(w))return;
 c.alarmVersion??={demon:0,human:0};const alive=w.allAlive().filter(u=>sides.includes(u.side)&&u.kind!=='barracks');
 for(const site of c.sites){const near=alive.filter(u=>dist(u,site)<130);site.presence=Object.fromEntries(sides.map(s=>[s,near.filter(u=>allied(u,s)).length]));const challenger=enemy(site.controller),attacking=site.presence[challenger],defending=site.presence[site.controller],advantage=near.some(u=>u.faction)?0:attacking-defending;site.contested=near.some(u=>u.faction)||!!(attacking&&defending);site.captureRate=captureSpeed(Math.abs(advantage));site.captureSide=advantage>0?challenger:advantage<0?site.controller:null;
  if(attacking){if(!site.assault||site.assault.until<=w.time||site.assault.defender!==site.controller){c.alarmVersion[site.controller]++;site.assault={id:'assault-'+(++w.serial),at:w.time,defender:site.controller,attacker:challenger};notice(w,'assault',site,SITE_KINDS[site.kind].name+'正在交战','敌军已抵达据点，双方正在争夺。',{siteId:site.id,actorSide:challenger,defender:site.controller});}Object.assign(site.assault,{until:w.time+3500,attackers:near.filter(u=>allied(u,challenger)).length,defenders:near.filter(u=>allied(u,site.controller)).length});}
  else if(site.assault?.until<=w.time)site.assault=null;
  if(advantage>0){if(site.claimFor!==challenger){site.claimFor=challenger;site.progress=0;}site.progress=Math.min(CAPTURE_MS,site.progress+ms*site.captureRate);}
  else if(advantage<0)site.progress=Math.max(0,site.progress-ms*site.captureRate);
  else if(!attacking&&!defending)site.progress=Math.max(0,site.progress-ms*.5);
  if(site.progress>=CAPTURE_MS){site.controller=challenger;site.progress=0;site.claimFor=null;site.changedAt=w.time;site.assault=null;const restored=site.controller===site.owner;const owners=new Map(near.filter(u=>allied(u,challenger)&&u.supporter?.id).map(u=>[u.supporter.platform+':'+u.supporter.id,u.supporter]));for(const supporter of owners.values()){supporterEvent(w,challenger,supporter,'capture',{siteKind:site.kind,restored});recordCampaignCapture(w,challenger,supporter);}notice(w,'capture',site,(site.controller==='demon'?'魔族':'人族')+(restored?'夺回':'占领')+SITE_KINDS[site.kind].name,site.kind==='grain'?'夺取方每波援军 +1，失守方每波援军 −1。':'夺取方攻击 +8%，夺回工坊可取消敌方加成。',{actorSide:challenger,siteId:site.id});w.emit('objective_claim',{x:site.x,y:site.y,side:challenger,kind:site.kind});}
 }
 updateDefense(w);
 if(w.time>=(c.nextSignals||0)){c.nextSignals=w.time+1000;c.signals=battleSignals(w);c.marchNotices??={};for(const side of sides){const army=c.signals.marches.find(a=>a.side===side);if(army&&w.time>=(c.marchNotices[side]||0)){c.marchNotices[side]=w.time+25000;notice(w,'march',army,(side==='demon'?'魔族':'人族')+'大军行进 ×'+army.count,'成队兵力正在转移，注意行军方向。',{actorSide:side,count:army.count});}}}
 const threats=sides.filter(s=>c.sites.filter(p=>p.owner===enemy(s)).every(p=>p.controller===s));
 if(threats.length!==1||w.mode==='sparring'){c.pending=null;return;}
 const winner=threats[0];if(!c.pending||c.pending.side!==winner)c.pending={side:winner,at:w.time+PUSH_MS};
 if(w.time<c.pending.at)return;
 const next=c.front+dir(winner);if(Math.abs(next)>FRONT_LIMIT){beginConquest(w,winner);return;}
 c.homeClaimed=null;c.history.push({from:c.front,to:next,side:winner,at:w.time});c.history=c.history.slice(-24);c.front=next;c.stage++;c.pending=null;c.orders={};c.responses={};c.signals={marches:[],clashes:[]};c.nextSignals=0;c.sites=sitesFor(w,next);
 const name=REGION_NAMES[regionAt(frontX(w))];notice(w,'frontline',{x:frontX(w),y:START_Y},(winner==='demon'?'魔族':'人族')+'推进到'+name,'战线前进一片地区，首领伤势和现有部队保留。',{actorSide:winner});
 for(const u of alive){u.path=null;u.repathAt=0;u.campaignPlan=null;u.defense=null;u.escort=null;u.exitGoal=null;if(u.kind==='hero'){u.mission=null;u.nextPlan=0;u.duelUntil=0;u.nextDuel=w.time+6000;}}
 w.objectives=[];w.nextObjective=w.time+6000;
}
// Serial suffixes advance in batches of five. Hash the whole ID so every
// ambient wave does not accidentally consist entirely of stationary guards.
export function formationHash(id){let h=2166136261;for(const ch of String(id))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0;}
// Permanent guard IDs survive while attackers die, eventually filling the army
// cap with guards. Rotate a bounded share of the currently living formation.
const guardCache=new WeakMap();
export function campaignGuard(w,u){
 let cache=guardCache.get(w);const epoch=Math.floor(w.time/18000),stage=w.campaign?.stage||0;
 if(!cache||cache.epoch!==epoch||cache.stage!==stage||w.time<cache.at||w.time-cache.at>=1000){
  cache={epoch,stage,at:w.time,ids:new Set()};
  for(const side of sides){const eligible=w.units.filter(v=>v.hp>0&&allied(v,side)&&!(v.viewerOrder?.until>w.time)&&v.kind!=='barracks');
   eligible.sort((a,b)=>formationHash(a.id+':'+epoch)-formationHash(b.id+':'+epoch));
   for(const v of eligible.slice(0,Math.floor(eligible.length*.2)))cache.ids.add(v.id);
  }guardCache.set(w,cache);
 }
 return cache.ids.has(u.id);
}
export function campaignGoal(w,u,{leader=false,order=null}={}){
 if(u.faction){const e=nearestOpponent(w,u);return e?{x:e.x,y:e.y,type:'combat',label:'追击对手'}:null;}const c=ensureCampaign(w),kind=order||c.orders[u.side]?.until>w.time&&c.orders[u.side].kind;
 const response=leader?c.responses?.[u.side]:u.defense;let options=c.sites;
 if(!kind&&response?.until>w.time&&c.sites.some(p=>p.id===response.siteId)){options=c.sites.filter(p=>p.id===response.siteId);}
 else
 if(kind){const [verb,type]=kind.split('_');options=options.filter(p=>p.owner===(verb==='defend'?u.side:enemy(u.side))&&p.kind===type);}
 else {const threatened=c.sites.filter(p=>p.owner===u.side&&(p.controller!==u.side||p.presence[enemy(u.side)]>0));const guard=campaignGuard(w,u);
  if(threatened.length&&(leader||guard||threatened.some(p=>dist(u,p)<430)))options=threatened;
  else if(!leader&&guard)options=c.sites.filter(p=>p.owner===u.side);
  else options=c.sites.filter(p=>p.owner===enemy(u.side)&&p.controller!==u.side);
 }
 if(!options.length)options=c.sites.filter(p=>p.owner===u.side);
 const laneKind=u.lane===0?'grain':u.lane===2?'forge':null;
 const ranked=options.map(p=>({p,score:dist(u,p)+(p.kind===laneKind?-220:0)+p.presence[enemy(u.side)]*(leader?24:0)})).sort((a,b)=>a.score-b.score),site=ranked[0]?.p;if(!site)return null;
 const defending=site.owner===u.side,slot=formationHash(u.id)%32,angle=slot*2.399963229728653;
 const radius=leader?110:42+Math.sqrt(slot/31)*70;
 const desired=leader?{x:site.x-dir(u.side)*110,y:site.y}:{x:site.x+Math.cos(angle)*radius,y:site.y+Math.sin(angle)*radius};
 const grounded=w.ground(desired),goal=grounded&&dist(grounded,site)<125?grounded:site;
 return {...goal,type:'campaign',id:site.id,label:(defending?'守住':'争夺')+(site.owner==='demon'?'魔族':'人族')+SITE_KINDS[site.kind].name,site,defending};
}
export function campaignSnapshot(w){const c=ensureCampaign(w),{merit,...visible}=c;return {...visible,region:REGION_NAMES[regionAt(frontX(w))],frontX:frontX(w),homes:{demon:{x:START_X-FRONT_LIMIT*FRONT_STEP,y:START_Y},human:{x:START_X+FRONT_LIMIT*FRONT_STEP,y:START_Y}},camps:Object.fromEntries(sides.map(s=>[s,fieldCamp(w,s)])),width:WIDTH};}
