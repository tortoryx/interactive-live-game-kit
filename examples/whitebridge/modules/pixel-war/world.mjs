import {teamOf,allied,hostile,factionFields,isBoss} from './public/allegiance.mjs';
import {clanStep,clanSpawnPoint,updateClans,clansSnapshot,CLAN_POP_CAP,GLOBAL_ARMY_CAP} from './clans.mjs';
import {tickMuster,musterStep} from './muster.mjs';
import {localBubble} from './local-bubbles.mjs';
import {tickAmbientBattle,battleDamageScale} from './ambient-battle.mjs';
import {leaderName} from './leader-lineage.mjs';
import {scavengeStep,clearScavenge} from './scavenging.mjs';
import {updateCommanderSupport,holdCommanderSupport,commanderGuardScale} from './commander-support.mjs';
import {cueSpeech,isCommanderModel} from './luna-speech.mjs';
import {updateBarracks,barracksSpawnPoint} from './barracks.mjs';
import {updateOwnedEvents} from './owned-events.mjs';
import {crowdScale,allowNpc,populationLimit,openingPositions,playerTroop} from './audience-battle.mjs';
import {combatFocus,reserveEffects,troopEffectIdentity} from './public/combat-focus.mjs';
import {enrollTroop,leaderDeaths} from './service-life.mjs';
import {trainViewerTroop} from './viewer-training.mjs';
import {legacyHit,updateLegacies} from './legacy.mjs';
import {legacyAvailability} from './public/legacy-catalog.mjs';
import {healUnit} from './healing.mjs';
import {defenseStep} from './defense.mjs';
import {withdrawalPlan,expireWithdrawal} from './withdrawal.mjs';
import {reinforcementPoint,recordReinforcement} from './reinforcements.mjs';
import {updateFieldProps} from './field-props.mjs';
import {nearbyTroopChatter} from './viewer-troops.mjs';
import {refreshProgress,awardKill,awardAttack} from './progression.mjs';
import {releaseProjectiles,projectileImpact} from './ordnance.mjs';
import {ensureCampaign,updateCampaign,campaignGoal,fieldCamp,frontX,reinforcementCount,campaignDamageMultiplier,campaignSnapshot,formationHash} from './campaign.mjs';
import {CINEMATIC,ceremonyTiming} from './public/cinematic.mjs';
import {updateSurprises} from './surprises.mjs';
import {troopShout,rememberFallen,reviveIdentity,viewerTroopStep,heroAdviceStep} from './viewer-troops.mjs';
import {launchWildlife,updateWildlife} from './wildlife.mjs';
import {damageObject,igniteObjects,updateObjects,tryChop} from './objects.mjs';
import {recordContribution} from './honors.mjs';
import {beginSettlement,advanceSettlement,holdBattleClocks} from './settlement.mjs';
import {SpatialGrid} from './public/spatial.mjs';
import {breakGround} from './destruction.mjs';
import {react} from './narration.mjs';
import {launchDisaster,updateEncounters,combatSkill,collectPickup,usefulPickup} from './encounters.mjs';
import {updateObjectives,commanderPlan,escortGoal} from './strategy.mjs';
import {FieldNavigation} from './navigation.mjs';
import {WIDTH,HEIGHT,START_X,START_Y,MAP_REVISION,CROSSINGS,CAMPS,CELL,COLS,WEIGHTS,terrainCombatMultiplier,gridTerrain,passable,nearestGround,clearSegment,TERRAIN} from './public/terrain.mjs';
import {UNITS,ACTIONS,DEFAULT_HERO,POP_CAP,BUDGET,rawDamage,HERO_WEAPONS} from './public/catalog.mjs';
import VOICES from '../duel-preview/voices.json' with {type:'json'};
export const SIDES=['demon','human'],UNIT_KEYS=Object.keys(UNITS);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const direction=side=>side==='demon'?1:-1;
function sight(a,b,changes){const n=Math.ceil(distance(a,b)/20);for(let i=1;i<n;i++)if([TERRAIN.ROCK,TERRAIN.TREE,TERRAIN.BARRIER].includes(gridTerrain(Math.floor((a.x+(b.x-a.x)*i/n)/CELL),Math.floor((a.y+(b.y-a.y)*i/n)/CELL),changes)))return false;return true;}
const LOCAL_CHASE=180, LOCAL_REPLAN_MS=800;
function releaseLocalPath(u){
  if(u.localCombat?.path&&u.path===u.localCombat.path){u.path=null;u.repathAt=0;}
}
function localOwnedCombat(w,u,enemies,dt){
  const rank=e=>e.kind==='hero'?0:e.kind==='barracks'?2:1;
  const targets=enemies.filter(e=>e.hp>0).sort((a,b)=>rank(a)-rank(b)||distance(u,a)-distance(u,b));
  const target=targets.find(e=>distance(u,e)<u.range+e.radius&&distance(u,e)>=(u.minRange||0)&&sight(u,e,w.terrainChanges));
  if(target){
    u.face=Math.atan2(target.y-u.y,target.x-u.x);
    if(w.time>=u.readyAt)w.attack(u,target,UNITS[u.kind].action);
    return true;
  }
  const close=targets.find(e=>u.minRange&&distance(u,e)>0&&distance(u,e)<u.minRange&&sight(u,e,w.terrainChanges));
  if(close){
    releaseLocalPath(u);
    // A cached resource route can lie close to the retreat destination.
    if(!u.localCombat?.backing){u.path=null;u.repathAt=0;}
    u.localCombat={backing:true};
    const a=Math.atan2(close.y-u.y,close.x-u.x);
    w.move(u,{x:u.x-Math.cos(a)*70,y:u.y-Math.sin(a)*70},dt);
    return true;
  }
  if(!targets.length){releaseLocalPath(u);u.localCombat=null;return false;}
  if(u.localCombat?.backing){u.path=null;u.repathAt=0;u.localCombat=null;}
  let c=u.localCombat??={origin:null,target:null,path:null,nextPlan:0};
  const reach=e=>u.range+e.radius+LOCAL_CHASE;
  // A new encounter at a new post must not inherit an old exhausted leash.
  if(c.origin&&distance(u,c.origin)>LOCAL_CHASE+u.range+40&&!targets.some(e=>distance(c.origin,e)<reach(e))){
    releaseLocalPath(u);c=u.localCombat={origin:null,target:null,path:null,nextPlan:0};
  }
  const eligible=e=>distance(u,e)>=(u.minRange||0)&&distance(u,e)<reach(e)&&(!c.origin||distance(c.origin,e)<reach(e));
  // Keep one origin for a continuous encounter; do not re-arm a rolling chase.
  if(c.origin&&distance(u,c.origin)>=LOCAL_CHASE){releaseLocalPath(u);return false;}
  const current=targets.find(e=>e.id===c.target&&eligible(e));
  if(current&&w.time<c.nextPlan&&c.terrainRevision===w.terrainRevision){
    if(u.path===c.path&&u.path?.length&&u.pathIndex<u.path.length)w.move(u,c.path.at(-1),dt);
    // A moving target does not send the squad back to its resource route
    // between searches; hold the last pursuit point until the next update.
    return true;
  }
  releaseLocalPath(u);
  // Cache failed searches too; a blocked enemy must not trigger A* every frame.
  if(w.time<c.nextPlan)return false;
  c.nextPlan=w.time+LOCAL_REPLAN_MS;c.target=null;
  for(const e of targets){
    if(!eligible(e))continue;
    const path=w.nav.plan(u,e);if(!path?.length)continue;
    let length=0,previous=u;
    for(const p of path){length+=distance(previous,p);previous=p;}
    if(length>reach(e))continue;
    c.origin??={x:u.x,y:u.y};c.target=e.id;c.path=path;c.terrainRevision=w.terrainRevision;
    u.path=path;u.pathIndex=0;u.repathAt=c.nextPlan;
    w.move(u,e,dt);return true;
  }
  return false;
}
export class PixelWorld{
  constructor(seed=37,{audienceDriven=false}={}){if(audienceDriven)this.audienceBattle={version:2,...crowdScale()};this.leaderDeaths=0;this.heroStatsRevision=2;this.mapRevision=MAP_REVISION;this.seed=seed;this.time=0;this.serial=0;this.revision=0;this.round=0;this.ranks={demon:0,human:0};this.wins={demon:0,human:0};this.mode='sparring';this.speed=1;this.paused=false;this.terrainChanges={};this.terrainRevision=0;this.nav=new FieldNavigation(()=>this.terrainChanges);this.events=[];this.speech=[];this.damageTotals={demon:0,human:0};this.heroes=Object.fromEntries(SIDES.map(s=>[s,this.makeHero(s)]));this.resetField();}
  random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  emit(type,data){this.events.push({id:++this.serial,type,at:this.time,...data});this.events=reserveEffects(this.events,this.time);}
  emitVisual(type,data){this.fxSerial=(this.fxSerial||0)+1;this.events.push({id:-this.fxSerial,type,at:this.time,...data});this.events=reserveEffects(this.events,this.time);}
  say(side,key,facts=null){if(this.generatedSpeechOnly){const cue=/Defeat/.test(key)?'defeat':/Father|Elder/.test(key)?'arrival':null;return cue&&cueSpeech(this,side,cue,facts,{priority:4,ttl:25000});}const l=VOICES[key];if(!l)return;const recent=this.speech.filter(v=>v.side===side).at(-1);if(recent&&this.time-recent.at<4500&&!/Defeat|Father|Elder/.test(key))return;this.speech.push({id:++this.serial,side,persona:this.heroes[side].id,text:l.text,audio:key,at:this.time});this.speech=this.speech.slice(-8);}
  fighter(side,kind,spec,x,y){const p=this.ground({x,y})||{x:CAMPS[side]?.x||START_X,y:CAMPS[side]?.y||1152};return{...spec,equipment:{...spec.equipment},id:`${side}-${kind}-${++this.serial}`,side,kind,...p,maxHP:spec.hp,hp:spec.hp,shield:0,training:spec.hp,face:side==='demon'?0:Math.PI,radius:kind==='hero'?19:spec.machine?Math.round(15*spec.scale):kind==='colossus'?30:Math.max(9,Math.round(12*(spec.scale||1))),readyAt:this.time+500,action:null,hitAt:-9999,path:null,repathAt:0,deadAt:null,moving:false,walkPhase:this.random()*1000,pose:0,hitAngle:0,healAt:this.time+1800};}
  makeHero(side,rank=this.ranks[side]){const loadout=side==='human'?'bow':'staff',s={...DEFAULT_HERO,...HERO_WEAPONS[loadout],equipment:{...DEFAULT_HERO.equipment,weapon:loadout,offhand:null},hp:DEFAULT_HERO.hp*(1+.08*rank),attack:HERO_WEAPONS[loadout].attack*(1+.025*rank)};return{...this.fighter(side,'hero',s,START_X+(side==='demon'?-636:636),1152),rank,name:leaderName(side,rank),order:'command',sortieUntil:0,tactic:'hold',tacticLane:1,tacticUntil:0};}
  resetField(){this.clans={};this.clanSerial=0;this.barracks=[];this.warEvents=[];this.warDrama=null;this.legacyReserve={demon:[],human:[]};this.legacyBuildings=[];this.reinforcementShots=[];this.fieldProps=null;this.campaign=null;ensureCampaign(this);this.surprises=[];this.announcements=[];this.nextSurprise=this.time+18000;this.surpriseIndex=0;this.fallenTroops=[];this.chatter=[];this.nextChatter={};this.audienceSpeakingUntil={};this.wildlife=[];this.nextWildlife=this.time+30000;this.objectDamage={};this.honors={entries:{},finishers:{}};this.result=null;this.terrainChanges={};this.terrainRevision=(this.terrainRevision||0)+1;this.banter={};this.localBubbles={};this.audienceOrders={};this.fieldEpoch=(this.fieldEpoch||0)+1;this.objectives=[];this.nextObjective=this.time+5000;this.battleBuffs={demon:0,human:0};this.strategyStats={claims:{demon:0,human:0},contested:0};for(const h of Object.values(this.heroes))Object.assign(h,{mission:null,nextPlan:0,nextEscort:0,duelUntil:0,nextDuel:0});this.events=[];this.units=[];this.missiles=[];this.pickups=[];this.hazards=[];this.deployed={demon:[],human:[]};this.nextSpawn=this.time+4000;this.nextPickup=this.time+7000;this.nextHazard=this.time+10000;this.disasterIndex=0;this.nextGiant=this.time+45000;this.nextSpeechBySide={demon:this.time+900,human:this.time+1900};this.startedAt=this.time;
    for(const side of SIDES){const h=this.heroes[side];Object.assign(h,{x:START_X+(side==='demon'?-636:636),y:1152,hp:h.maxHP,training:h.maxHP,shield:0,path:null,repathAt:0,action:null,withdrawal:null,withdrawalCooldown:0,sortieUntil:0,readyAt:this.time+1000,order:'command',orderLabel:'整队出发',deadAt:null,stunnedUntil:0,hasteUntil:0,furyUntil:0,slowUntil:0,skillReadyAt:this.time+5000});
      if(!this.audienceBattle){for(let lane=0;lane<3;lane++)for(const kind of ['shield','militia','militia','pike','bow','bow','berserker','sentinel'])this.spawn(side,kind,lane,true);this.spawn(side,'colossus',1,true);this.spawn(side,'ranger',0,true);this.spawn(side,'healer',2,true);}
    }
    if(this.audienceBattle)openingPositions(this);
  }
  population(side){return this.units.filter(u=>u.hp>0&&teamOf(u)===side).reduce((a,u)=>a+u.pop,0);}
  spawn(side,kind,lane=1,initial=false,viewer=null){if(!SIDES.includes(side)||!Object.hasOwn(UNITS,kind)||![0,1,2].includes(lane))return false;if(!viewer&&!allowNpc(this,side))return false;const spec=UNITS[kind],team=viewer?.faction||side;this.deployed[team]=(this.deployed[team]||[]).filter(d=>this.time-d.at<10000);if(this.population(viewer?.faction||side)+spec.pop>(viewer?.faction?CLAN_POP_CAP:viewer||initial?populationLimit(this):Math.min(POP_CAP-32,populationLimit(this)-32))||viewer?.faction&&this.units.filter(u=>u.hp>0).length>=GLOBAL_ARMY_CAP||!initial&&this.deployed[team].reduce((a,d)=>a+d.cost,0)+spec.cost>BUDGET)return false;
    let point;if(viewer){if(viewer.barracksId){const b=this.barracks?.find(b=>b.id===viewer.barracksId&&b.hp>0&&allied(b,viewer)&&b.supporter.id===viewer.supporter?.id);if(!b)return false;point=barracksSpawnPoint(this,b,kind);}else point=viewer.faction?clanSpawnPoint(this,viewer):reinforcementPoint(this,side,kind);if(!point)return false;}
    else point={x:initial?(frontX(this)+(side==='demon'?-396:396))+direction(side)*(this.random()*80):fieldCamp(this,side).x,y:initial?CROSSINGS[lane]+(this.random()-.5)*72:fieldCamp(this,side).y+12};
    if(!initial)this.deployed[team].push({at:this.time,cost:spec.cost});
    const unit={...this.fighter(side,kind,spec,point.x,point.y),lane,tacticUntil:this.heroes[side].tacticUntil,tactic:this.heroes[side].tacticUntil>this.time?this.heroes[side].tactic:'hold',targetId:null,exitGoal:initial||viewer?null:{x:fieldCamp(this,side).x+direction(side)*140,y:fieldCamp(this,side).y+30},...(viewer?{...factionFields(viewer),source:viewer.source,receipt:viewer.receipt,barracksId:viewer.barracksId,supporter:viewer.supporter,giftQuality:viewer.quality,service:viewer.service?structuredClone(viewer.service):undefined,summonedAt:this.time}:{})};if(viewer){if(viewer.reviveId&&!reviveIdentity(this,unit,viewer))return false;trainViewerTroop(this,unit);enrollTroop(this,unit);if(unit.giftQuality?.tier>=3)unit.shield=Math.round(unit.maxHP*.25);}this.units.push(unit);if(viewer&&!viewer.suppressHighlight)recordReinforcement(this,unit,viewer);
    if(!initial)this.emit('summon',{side,kind,source:viewer?.source||'system',receipt:viewer?.receipt,zone:point.zone,target:unit.id,x:unit.x,y:unit.y,revived:!!viewer?.reviveId});return true;
  }
  beginShowcase(){if(this.mode==='settlement')return false;this.mode='showcase';this.paused=false;this.round++;this.resetField();return true;}
  resumeSparring(){if(this.mode==='settlement')return false;this.mode='sparring';this.paused=false;this.resetField();return true;}
  setSpeed(n){if(![1,2,4].includes(n))return false;this.speed=n;return true;}
  inspect(rank,pose){if(!Number.isInteger(rank)||rank<0||rank>20||!Number.isInteger(pose)||pose<0||pose>3)return false;this.paused=true;this.mode='inspection';for(const s of SIDES){this.ranks[s]=rank;this.heroes[s]=this.makeHero(s);}this.resetField();for(const h of Object.values(this.heroes))h.pose=pose;return true;}
  sortie(side){if(!SIDES.includes(side))return false;this.heroes[side].sortieUntil=this.time+18000;return true;}
  audienceCommand(side,kind){if(!SIDES.includes(side)||!['challenge','guard'].includes(kind)||this.paused||['inspection','settlement'].includes(this.mode))return false;this.audienceOrders??={};if(this.audienceOrders[side]?.until>this.time)return false;this.audienceOrders[side]={kind,until:this.time+12000};this.heroes[side].nextPlan=0;this.heroes[side].sortieUntil=0;this.heroes[side].tacticUntil=0;this.heroes[side].tactic='hold';if(kind==='challenge')this.heroes[side].nextDuel=0;this.react(side,kind==='challenge'?'Duel':'Support',2);const h=this.heroes[side];this.emit('audience_command',{side,x:h.x,y:h.y,kind});for(const u of this.units.filter(u=>allied(u,side))){u.repathAt=0;u.escort=null;}return true;}
  command(side,tactic,lane=1){if(!SIDES.includes(side)||!['hold','advance','retreat','north','middle','south','backline'].includes(tactic)||![0,1,2].includes(lane))return false;const h=this.heroes[side];Object.assign(h,{tactic,tacticLane:lane,tacticUntil:this.time+30000,nextPlan:0,mission:null});if(tactic!=='retreat')h.withdrawal=null;if(tactic==='advance')this.sortie(side);else h.sortieUntil=0;for(const u of this.units.filter(u=>allied(u,side)&&u.hp>0)){u.tactic=tactic;u.tacticUntil=this.time+30000;u.lane=lane;u.repathAt=0;}return true;}
  equip(side,weapon){if(!SIDES.includes(side)||!['sword','spear','bow','staff','mace'].includes(weapon))return false;const h=this.heroes[side];h.equipment.weapon=weapon;h.equipment.offhand=weapon==='sword'?'shield':null;Object.assign(h,HERO_WEAPONS[weapon]);h.attack*=1+.025*h.rank;h.action=null;return true;}
  allAlive(){return [...Object.values(this.heroes),...this.units,...(this.barracks||[]),...(this.wildlife||[])].filter(u=>u.hp>0&&!(u.musterLandAt>this.time));}
  ground(p){return nearestGround(p,this.terrainChanges);}
  open(x,y){return passable(x,y,this.terrainChanges);}
  react(side,event,priority){return react(this,side,event,priority);}
  breakGround(point,radius,power,side,cause,focus=null){return breakGround(this,point,radius,power,side,cause,focus);}
  walkable(u){return this.open(u.x,u.y);}
  move(u,goal,dt){if(distance(u,goal)<10)return;const dest=this.ground(goal);if(!dest)return;
    if(!u.path||this.time>=u.repathAt||distance(u.path.at(-1),dest)>105){u.path=this.nav.plan(u,dest);u.pathIndex=0;u.repathAt=this.time+1600+this.random()*700;}
    if(!u.path)return;let budget=u.speed*dt*(u.hasteUntil>this.time?1.3:1)*(u.slowUntil>this.time?.5:1)/WEIGHTS[gridTerrain(Math.floor(u.x/CELL),Math.floor(u.y/CELL),this.terrainChanges)];const prev={x:u.x,y:u.y};
    while(budget>0&&u.pathIndex<u.path.length){const p=u.path[u.pathIndex],d=distance(u,p),step=Math.min(budget,d);if(d<.01){u.pathIndex++;continue;}const next={x:u.x+(p.x-u.x)/d*step,y:u.y+(p.y-u.y)/d*step};if(!this.open(next.x,next.y)){u.path=null;u.repathAt=0;break;}u.x=next.x;u.y=next.y;budget-=step;if(d<=step)u.pathIndex++;else break;}
    if(distance(prev,u)>.1){u.face=Math.atan2(u.y-prev.y,u.x-prev.x);u.moving=true;u.walkPhase+=distance(prev,u)*9;}
  }
  front(side){const members=this.units.filter(u=>u.hp>0&&allied(u,side));const dir=direction(side);if(!members.length)return{x:fieldCamp(this,side).x+dir*220,y:START_Y};const sorted=members.toSorted((a,b)=>dir*(a.x-b.x));const lead=sorted[Math.floor(sorted.length*.7)];return{x:lead.x,y:1152+(lead.y-1152)*.25};}
  evade(u){const fire=Object.values(this.objectDamage||{}).find(o=>o.burnUntil>this.time&&distance(o,u)<58);if(fire){const a=Math.atan2(u.y-fire.y,u.x-fire.x);return this.ground({x:fire.x+Math.cos(a)*90,y:fire.y+Math.sin(a)*90});}const hazard=this.hazards.find(h=>(h.sourceSnapshot?.faction?hostile(h.sourceSnapshot,u):!h.side||!allied(u,h.side))&&(h.impact>this.time||h.kind==='quake'&&h.until>this.time)&&distance(u,h)<h.radius+25);if(!hazard)return null;let best=null;for(let i=0;i<12;i++){const a=i*Math.PI/6,p=this.ground({x:hazard.x+Math.cos(a)*(hazard.radius+56),y:hazard.y+Math.sin(a)*(hazard.radius+56)});if(p&&(!best||distance(u,p)<distance(u,best)))best=p;}return best;}
  attack(u,target,actionKey=null){if(!hostile(u,target))return;const key=actionKey||u.actionType||u.action||UNITS[u.kind]?.action||DEFAULT_HERO.action;const type=typeof key==='string'?key:UNITS[u.kind]?.action||'cast';const spec=ACTIONS[type];const critical=this.random()<u.crit;
    u.action={type,xpId:'attack:'+u.id+':'+(u.life||1)+':'+this.time,started:this.time,contactAt:this.time+spec.contact,until:this.time+spec.duration,target:target.id,targetLife:target.life||1,critical,released:false,angle:Math.atan2(target.y-u.y,target.x-u.x)};troopShout(this,u,'attack');u.lastAttackAt=this.time;u.face=u.action.angle;if(combatFocus(u))this.emitVisual('windup',{x:u.x,y:u.y,source:u.id,focus:combatFocus(u),style:type,angle:u.face,contactAt:u.action.contactAt,until:u.action.until,critical});u.readyAt=this.time+Math.max(spec.duration,u.interval*1000);u.moving=false;
  }
  resolveHit(source,target,base,critical=false,style='slash',visual={}){
    if(target.hp<=0)return;troopShout(this,target,'hurt');const amount=Math.max(0,Math.round(base*battleDamageScale(source,target)*terrainCombatMultiplier(source,target,this.terrainChanges)*campaignDamageMultiplier(this,source)*commanderGuardScale(this,target))),absorbed=Math.min(target.shield,amount);target.shield-=absorbed;const beforeHP=target.hp;let healthDamage=amount-absorbed;
    target.hp=Math.max(target.kind==='hero'&&this.mode==='sparring'?target.maxHP*.35:0,target.hp-healthDamage);healthDamage=Math.round(beforeHP-target.hp);
    if(target.kind==='hero'&&healthDamage>80){target.recentWounds=(target.recentWounds||[]).filter(h=>this.time-h.at<1800);target.recentWounds.push({at:this.time,amount:healthDamage});if(target.recentWounds.reduce((n,h)=>n+h.amount,0)>260)this.react(target.side,'Hurt',2);}target.hitAt=this.time;target.hitAngle=source?Math.atan2(target.y-source.y,target.x-source.x):0;
    this.emit('hit',{x:target.x,y:target.y,target:target.id,source:source?.id,focus:combatFocus(source),shotId:visual.shotId,z:target.machine?45*(target.scale||1):28*(target.scale||1),side:source?.side||'neutral',amount:healthDamage,absorbed,protected:this.mode==='sparring'&&target.kind==='hero'&&healthDamage===0&&absorbed===0,critical,style,angle:target.hitAngle});
    awardAttack(this,source,target,healthDamage+absorbed,visual.attackId);const credit=source?.sponsorSide?{...source,side:source.sponsorSide}:source;recordContribution(this,credit,target,healthDamage,0,style);legacyHit(this,source,target,healthDamage,style);if(source&&teamOf(source)&&source.side!=='neutral'){const team=teamOf(source);this.damageTotals[team]=(this.damageTotals[team]||0)+healthDamage;}if(target.hp<=0&&target.deadAt===null){target.deadAt=this.time;target.action=null;if(target.kind!=='barracks'&&target.side!=='neutral')rememberFallen(this,target);this.emit('death',{x:target.x,y:target.y,target:target.id,side:target.side,...troopEffectIdentity(target)});awardKill(this,source,target);}
  }
  tickActions(alive,byId=new Map(alive.map(u=>[u.id,u])),space=new SpatialGrid(alive)){const pending=[];
    for(const u of alive){const a=u.action;if(!a||typeof a==='string')continue;const spec=ACTIONS[a.type];if(this.time>=a.contactAt&&!a.released){a.released=true;if(a.sceneryKey!=null){damageObject(this,a.sceneryKey,u.attack*(a.critical?1.75:1),u);continue;}const target=byId.get(a.target);if(!target||target.hp<=0||(a.targetLife??1)!==(target.life||1))continue;
      const projectile=spec.projectile;if(projectile){releaseProjectiles(this,u,target,a,space,projectile);}
      else if(distance(u,target)<u.range+target.radius+10&&sight(u,target,this.terrainChanges)){const targets=u.splash?space.near(target,u.splash).filter(v=>hostile(u,v)).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,5):[target];for(const v of targets)pending.push([u,v,rawDamage(u,v,a.critical)*(v.id===target.id?1:.5),a.critical,a.type,{attackId:a.xpId}]);if(u.splash){this.emit('burst',{x:target.x,y:target.y,side:u.side,focus:combatFocus(u),style:'crush',radius:u.splash});this.breakGround(target,u.splash,u.attack*(a.critical?1.75:1),u.side,'blast',combatFocus(u));}}
      else this.emit('miss',{x:target.x,y:target.y,target:target.id,side:u.side,focus:combatFocus(u)});
    }if(this.time>=a.until)u.action=null;}
    return pending;
  }
  step(ms=50){if(!Number.isFinite(ms)||ms<1||ms>100)throw Error('invalid_step');if(this.paused)return;this.time+=ms;this.revision++;const dt=ms/1000;
    if(this.campaign?.conquest){holdCommanderSupport(this,ms);holdBattleClocks(this,ms);updateCampaign(this,ms);return;}
    if(this.mode==='settlement'){holdCommanderSupport(this,ms);advanceSettlement(this,ms);return;}updateCommanderSupport(this);
    this.wildlife??=[];this.wildlife=this.wildlife.filter(u=>(u.deadAt===null||this.time-u.deadAt<4500)&&u.expiresAt>this.time);if(this.time>=(this.nextWildlife??this.time+30000)){if(!this.audienceBattle)launchWildlife(this);else this.nextWildlife=this.time+30000;};this.nextWildlife??=this.time+30000;
    this.units=this.units.filter(u=>u.deadAt===null||this.time-u.deadAt<4500);this.pickups=this.pickups.filter(p=>!p.used&&p.until>this.time);this.hazards=this.hazards.filter(h=>h.until>this.time);
    updateClans(this);tickMuster(this);tickAmbientBattle(this);
    if(this.time>=this.nextSpawn){const active=['live','test_live','showcase'].includes(this.mode),scale=this.audienceBattle;this.nextSpawn=this.time+(scale?scale.waveMs:active?8000:4000);for(let i=0;i<(scale?scale.waveSize:active?4:6);i++){const regular=UNIT_KEYS.filter(k=>!['colossus','cannon','dreadnought'].includes(k)),kind=regular[Math.floor(this.random()*regular.length)],lane=Math.floor(this.random()*3);for(const side of SIDES)if(scale||i<reinforcementCount(this,side,active?3:5))this.spawn(side,kind,lane);}}
    if(this.time>=(this.nextGiant||0)){this.nextGiant=this.time+45000;if(!this.audienceBattle)for(const side of SIDES)if(!this.units.some(u=>allied(u,side)&&u.kind==='colossus'&&u.hp>0))this.spawn(side,'colossus',Math.floor(this.random()*3));}
    updateBarracks(this);updateOwnedEvents(this);updateCampaign(this,ms);if(this.campaign?.conquest)return;updateFieldProps(this);updateLegacies(this);updateSurprises(this);this.battleBuffs??={demon:0,human:0};updateObjectives(this,ms);const fronts=Object.fromEntries(SIDES.map(s=>[s,this.front(s)]));
    if(this.time>=this.nextPickup){this.nextPickup=this.time+12000;for(const s of SIDES){const p=this.ground({x:fronts[s].x-direction(s)*90,y:fronts[s].y+(this.random()-.5)*260});if(p)this.pickups.push({id:++this.serial,...p,kind:['heal','shield','haste','fury'][Math.floor(this.random()*4)],until:this.time+22000});}}
    if(this.time>=this.nextHazard&&!this.audienceBattle){this.nextHazard=this.time+22000;const near=this.units.filter(u=>u.hp>0),center=near.find(u=>near.some(e=>e.side!==u.side&&distance(e,u)<160))||this.heroes.demon;launchDisaster(this,['meteor','quake'][(this.disasterIndex||0)%2],{x:center.x,y:center.y});this.disasterIndex=(this.disasterIndex||0)+1;}
    this.nextSpeechBySide??={demon:this.time+500,human:this.time+1200};for(const side of SIDES)if(this.time>=this.nextSpeechBySide[side]){this.nextSpeechBySide[side]=Number.MAX_SAFE_INTEGER;if(!this.audienceBattle)this.react(side,'Ready');}
    const alive=this.allAlive();for(const u of alive){if(u.kind==='hero')expireWithdrawal(this,u);if(!u.commander)refreshProgress(u,this.time);u.battleTime=this.time;}const byId=new Map(alive.map(u=>[u.id,u])),space=new SpatialGrid(alive),armies=Object.fromEntries(SIDES.map(s=>[s,alive.filter(u=>allied(u,s))]));const pending=this.tickActions(alive,byId,space);
    for(const u of alive){if(u.kind==='barracks')continue;if(u.side==='neutral'){updateWildlife(this,u,alive,dt);continue;}u.moving=false;u.empowered=this.battleBuffs[teamOf(u)]>this.time||u.furyUntil>this.time||u.kind==='berserker'&&u.hp<u.maxHP*.5;if(u.kind==='hero'&&this.mode==='sparring'&&this.time-Math.max(u.hitAt,u.lastAttackAt||0)>5500)u.hp=Math.min(u.maxHP,u.hp+90*dt);if(u.stunnedUntil>this.time){u.moving=false;continue;}if(!(u.tacticUntil>this.time))u.tactic='hold';if(typeof u.action==='string')u.action=null;const escape=this.evade(u);if(escape&&!u.action){this.move(u,escape,dt);continue;}
      const pickup=this.pickups.find(p=>!p.used&&distance(u,p)<30&&usefulPickup(p,u,this.time));if(pickup)collectPickup(this,u,pickup);
      if(u.action)continue;if(u.exitGoal){if(distance(u,u.exitGoal)>12){this.move(u,u.exitGoal,dt);continue;}u.exitGoal=null;}
      const enemySide=u.side==='demon'?'human':'demon',enemies=u.kind==='hero'?alive.filter(v=>hostile(u,v)):space.near(u,Math.max(460,u.range+50)).filter(v=>hostile(u,v)),friends=u.kind==='hero'?armies[u.side].filter(v=>v.kind!=='hero'):null;
      const rival=u.kind==='hero'?this.heroes[enemySide]:null;let enemy=rival?.hp>0&&distance(u,rival)<u.range+45&&sight(u,rival,this.terrainChanges)?rival:null;
      if(!enemy){let score=Infinity;for(const e of enemies){if(e.hp<=0)continue;const d=distance(u,e);if(d>=Math.max(460,u.range+50))continue;const value=d+(u.tactic==='backline'&&['bow','mage','healer','ranger'].includes(e.kind)?-160:0);if(value<score&&sight(u,e,this.terrainChanges)){enemy=e;score=value;}}}
      if(u.kind==='healer'&&this.time>=u.healAt){const injured=space.near(u,215,teamOf(u)).filter(v=>v.hp<v.maxHP).sort((a,b)=>a.hp/a.maxHP-b.hp/b.maxHP)[0];if(injured){const amount=healUnit(injured,(isBoss(injured)?15:60)*(u.giftQuality?.power?.version===1?u.attack/16:1),this.time);if(!amount)continue;recordContribution(this,u,injured,0,amount);u.healAt=this.time+1800;this.emit('heal',{x:injured.x,y:injured.y,fromX:u.x,fromY:u.y,focus:combatFocus(u),amount,target:injured.id,side:u.side});}}
      if(u.kind!=='hero'&&viewerTroopStep(this,u,enemy,dt)){u.localCombat=null;continue;}if(u.kind==='hero'&&heroAdviceStep(this,u,enemy,dt))continue;
      if(u.kind==='colossus')combatSkill(this,u,enemies);
      if(u.kind==='hero'){
        if(enemy?.kind==='hero')this.react(u.side,'Duel');
        if(enemies.filter(e=>distance(u,e)<350).length>=7)this.react(u.side,'Threat');
        if(u.sortieUntil<=this.time){const plan=commanderPlan(this,u,enemies,friends);if(plan){u.order=plan.order;u.orderLabel=plan.label;if(!['retreat','regroup'].includes(plan.order))combatSkill(this,u,enemies);if(plan.order==='regroup'){if(plan.goal)this.move(u,plan.goal,dt);continue;}if(enemy&&distance(u,enemy)<u.range&&this.time>=u.readyAt&&this.time>=(u.nextCoverShot||0)){this.attack(u,enemy,u.actionType);u.nextCoverShot=this.time+2100;u.orderLabel=plan.order==='retreat'?'边战边撤':'参与交战 · '+(plan.order==='objective'?'争夺资源':'掩护小队');continue;}if(plan.goal&&distance(u,plan.goal)>25)this.move(u,plan.goal,dt);continue;}}
        const dir=direction(u.side),near=enemy&&distance(u,enemy)<150,sortie=u.sortieUntil>this.time;
        const retreat=u.tacticUntil>this.time&&u.tactic==='retreat'||near&&!sortie&&friends.filter(f=>distance(f,u)<250).length<4;
        const post=this.ground({x:clamp(fronts[u.side].x-dir*(sortie?-70:300),64,WIDTH-64),y:u.tacticUntil>this.time&&['north','middle','south'].includes(u.tactic)?CROSSINGS[u.tacticLane]:fronts[u.side].y});u.order=retreat?'retreat':sortie?'advance':'command';
        if(retreat){const plan=withdrawalPlan(this,u,enemies,u.tactic==='retreat'?'tactic:'+u.tacticUntil:'danger');if(plan){this.move(u,plan.goal,dt);continue;}u.order=sortie?'advance':'command';}
        if(enemy&&distance(u,enemy)<u.range&&this.time>=u.readyAt){this.attack(u,enemy,u.actionType);continue;}
        if(post&&distance(u,post)>38)this.move(u,post,dt);else u.face=dir===1?0:Math.PI;continue;
      }
      if(u.faction){if(clanStep(this,u,enemy,dt))continue;}
      if(musterStep(this,u,enemy,dt))continue;
      const sideOrder=this.audienceOrders?.[u.side];
      const defaultOwned=playerTroop(u)&&u.kind!=='healer'&&!(sideOrder?.kind==='guard'&&sideOrder.until>this.time);
      if(defaultOwned){
        if(localOwnedCombat(this,u,enemies,dt)){if(u.scavenge&&!u.scavenge.ordered)clearScavenge(u);continue;}
        // Rejected targets must not re-enter the unbounded legacy chase.
        enemy=null;
      }else if(u.localCombat){releaseLocalPath(u);u.localCombat=null;}
      if(!(u.viewerOrder?.until>this.time)&&(!enemy||distance(u,enemy)>u.range+enemy.radius+30)){if(scavengeStep(this,u,dt))continue;}else if(u.scavenge&&!u.scavenge.ordered)clearScavenge(u);
      const missionGoal=u.defense?.until>this.time?campaignGoal(this,u):escortGoal(this,u)||campaignGoal(this,u);if(defenseStep(this,u,enemy,missionGoal,dt))continue;if((!enemy||distance(u,enemy)>u.range+30)&&tryChop(this,u,enemy||missionGoal||this.heroes[enemySide]))continue;if(missionGoal&&distance(u,missionGoal)>48&&(!enemy||distance(u,enemy)>Math.max(125,u.range))){this.move(u,missionGoal,dt);continue;}const d=enemy?distance(u,enemy):Infinity;
      if(enemy&&d<u.range+enemy.radius&&d>=(u.minRange||0)){u.face=Math.atan2(enemy.y-u.y,enemy.x-u.x);if(this.time>=u.readyAt)this.attack(u,enemy,UNITS[u.kind].action);}
      else if(enemy&&u.minRange&&d<u.minRange&&d>0){this.move(u,{x:u.x-Math.cos(Math.atan2(enemy.y-u.y,enemy.x-u.x))*70,y:u.y-Math.sin(Math.atan2(enemy.y-u.y,enemy.x-u.x))*70},dt);}
      else if(missionGoal){if(enemy&&distance(enemy,missionGoal)<200)this.move(u,enemy,dt);else if(distance(u,missionGoal)>35)this.move(u,missionGoal,dt);}
      else if(enemy&&d<420){this.move(u,enemy,dt);}
      else if(!defaultOwned){const lane=CROSSINGS[u.lane],passed=direction(u.side)*(u.x-frontX(this))>120;this.move(u,passed?this.heroes[u.side==='demon'?'human':'demon']:{x:frontX(this)+direction(u.side)*180,y:lane},dt);}
    }
    for(const m of this.missiles){if(this.time<m.born)continue;const t=byId.get(m.target);if(!t||t.hp<=0||(m.targetLife??1)!==(t.life||1)){if(m.focus)this.emitVisual('shot_end',{x:m.x,y:m.y,z:m.z,shotId:m.id,focus:m.focus,reason:'lost',style:m.kind});m.done=true;continue;}const tFlight=Math.min(1,Math.max(0,(this.time-m.born)/(m.flight||500)));m.z=(m.zFrom||24)+((m.zTo||24)-(m.zFrom||24))*tFlight+(m.kind==='grenade'?Math.sin(tFlight*Math.PI)*75:0);const d=distance(m,t),step=m.speed*dt;m.angle=Math.atan2(t.y-m.y,t.x-m.x);if(d<step+t.radius){projectileImpact(this,m,t,space,pending);m.done=true;}else{m.x+=Math.cos(m.angle)*step;m.y+=Math.sin(m.angle)*step;const key=Math.floor(m.y/CELL)*COLS+Math.floor(m.x/CELL);if([TERRAIN.ROCK,TERRAIN.TREE,TERRAIN.BARRIER].includes(gridTerrain(Math.floor(m.x/CELL),Math.floor(m.y/CELL),this.terrainChanges))){m.done=true;if(m.source.explosive){projectileImpact(this,m,{x:m.x,y:m.y},space,pending);}else {if(m.focus)this.emitVisual('shot_end',{x:m.x,y:m.y,z:m.z,shotId:m.id,focus:m.focus,reason:'obstacle',style:m.kind});if(m.kind==='orb')igniteObjects(this,m,42);else damageObject(this,key,m.source.attack*.5,m.source);}}}}
    for(const m of this.missiles)if(m.focus&&!m.done&&m.until<=this.time)this.emitVisual('shot_end',{x:m.x,y:m.y,z:m.z,shotId:m.id,focus:m.focus,reason:'expired',style:m.kind});this.missiles=this.missiles.filter(m=>!m.done&&m.until>this.time);
    updateEncounters(this,alive,pending);updateObjects(this,alive,pending);
    for(const hit of pending)this.resolveHit(...hit);
    updateClans(this);nearbyTroopChatter(this);
    const collisionReach=Math.max(56,...alive.map(u=>u.radius*2));new SpatialGrid(alive,collisionReach).pairs(collisionReach,(a,b,d2)=>{const r=a.radius+b.radius;if(d2>=r*r)return;const d=Math.sqrt(d2),angle=formationHash(a.id+'|'+b.id)/4294967296*Math.PI*2,shift=(r-d)*.23,dx=(d>1e-6?(b.x-a.x)/d:Math.cos(angle))*shift,dy=(d>1e-6?(b.y-a.y)/d:Math.sin(angle))*shift;for(const[u,x,y]of[[a,a.x-dx,a.y-dy],[b,b.x+dx,b.y+dy]])if(u.kind!=='barracks'&&this.open(x,y)){u.x=x;u.y=y;}});
    if(['showcase','test_live','live'].includes(this.mode)){const dead=SIDES.filter(s=>this.heroes[s].hp<=0);if(dead.length){beginSettlement(this,dead);}}
  }
  snapshot(){const unit=u=>({id:u.id,...factionFields(u),commander:!!u.commander,oneLife:!!u.oneLife,side:u.side,kind:u.kind,name:u.name,legacy:u.legacy,legacyBurn:u.legacyBurn?{until:u.legacyBurn.until}:undefined,rank:u.rank||0,commanderBuffs:u.commanderBuffs,lastSupport:u.lastSupport,supportAttack:u.supportAttack||1,source:u.source||'system',viewerTrained:!!u.viewerTraining,giftQuality:u.giftQuality,service:u.service,remainingBattles:null,life:u.life||1,machine:!!u.machine,level:u.level||1,xp:u.xp||0,kills:u.kills||0,speed:u.speed,watchUntil:u.watchUntil||0,ammoUntil:u.ammoUntil||0,withdrawal:u.kind==='hero'?u.withdrawal:undefined,viewerOrder:u.viewerOrder,summonedAt:u.summonedAt,receipt:u.receipt,barracksId:u.barracksId,musterArrivalAt:u.musterArrivalAt,musterLandAt:u.musterLandAt,sponsorSide:u.sponsorSide,eventId:u.eventId,stampede:u.stampede,straggler:u.straggler,x:u.x,y:u.y,hp:u.hp,maxHP:u.maxHP,shield:u.shield,training:u.training,face:u.face,action:u.action,moving:u.moving,walkPhase:u.walkPhase,hitAt:u.hitAt,hitAngle:u.hitAngle,deadAt:u.deadAt,pose:u.pose,equipment:u.equipment,order:u.order,orderLabel:u.orderLabel,mission:u.mission,empowered:u.empowered,scale:u.scale||1,hasteUntil:u.hasteUntil||0,furyUntil:u.furyUntil||0,slowUntil:u.slowUntil||0,stunnedUntil:u.stunnedUntil||0,skillReadyAt:u.skillReadyAt||0,supporter:u.supporter||{name:(this.heroes[u.side]?.name||u.name||'野兽')+'亲卫',platform:'system'},attack:u.attack,armor:u.armor,range:u.range,crit:u.crit,interval:u.interval});const fronts=Object.fromEntries(SIDES.map(s=>[s,this.front(s)]));
    return{version:5,clans:clansSnapshot(this),muster:this.muster||null,barracks:this.barracks||[],warEvents:this.warEvents||[],audienceBattle:this.audienceBattle||null,legacies:Object.fromEntries(SIDES.map(s=>[s,legacyAvailability(this,s)])),legacyBuildings:this.legacyBuildings||[],legacyWaiting:Object.fromEntries(SIDES.map(s=>[s,this.legacyReserve?.[s]?.length||0])),reinforcementShots:(this.reinforcementShots||[]).filter(s=>this.time-s.at<180000),fieldProps:this.fieldProps?.items||[],campaign:campaignSnapshot(this),surprises:this.surprises||[],announcements:this.announcements||[],chatter:(this.chatter||[]).filter(v=>v.until>this.time&&(!this.generatedSpeechOnly||isCommanderModel(v.model)||this.speechMode==='observer'&&localBubble(v))),mapRevision:this.mapRevision,fieldEpoch:this.fieldEpoch,terrainChanges:this.terrainChanges,terrainRevision:this.terrainRevision,audienceOrders:this.audienceOrders,revision:this.revision,time:this.time,mode:this.mode,paused:this.paused,speed:this.speed,round:this.round,wins:this.wins,heroes:Object.fromEntries(SIDES.map(s=>[s,unit(this.heroes[s])])),units:this.units.map(unit),wildlife:(this.wildlife||[]).map(unit),objectDamage:this.objectDamage||{},population:Object.fromEntries(SIDES.map(s=>[s,this.population(s)])),populationCap:populationLimit(this),armyCount:Object.fromEntries(SIDES.map(s=>[s,this.units.filter(u=>allied(u,s)&&u.hp>0).length])),fronts,missiles:this.missiles.map(m=>({id:m.id,x:m.x,y:m.y,angle:m.angle,kind:m.kind,side:m.source.side,born:m.born,z:m.z,zFrom:m.zFrom,zTo:m.zTo,flight:m.flight,focus:m.focus||combatFocus(m.source),from:m.visualFrom,physicalFrom:m.physicalFrom,targetX:m.targetX,targetY:m.targetY,critical:m.critical})),hazards:this.hazards,pickups:this.pickups,objectives:this.objectives||[],strategyStats:this.strategyStats,events:this.events.filter(e=>this.time-e.at<1600),speech:this.speech.filter(v=>!this.generatedSpeechOnly||isCommanderModel(v.model)||this.speechMode==='observer'&&localBubble(v)),result:this.result&&this.time-this.result.startedAt<ceremonyTiming(this.result).end?this.result:null,damageTotals:this.damageTotals,world:{width:WIDTH,height:HEIGHT},source:'local_rule_ai',platforms:{bilibili:'not_connected',xiaohongshu:'not_connected'},broadcast:false};}
}
