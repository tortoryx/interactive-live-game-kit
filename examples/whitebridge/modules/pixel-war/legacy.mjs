import {allied,hostile,factionFields} from './public/allegiance.mjs';
import {allowNpc,populationLimit} from './audience-battle.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {trainViewerTroop} from './viewer-training.mjs';
import {legacyPackage} from './public/legacy-catalog.mjs';
import {UNITS,POP_CAP,BUDGET} from './public/catalog.mjs';
import {reinforcementPoint,reinforcementZone} from './reinforcements.mjs';
import {ensureProgress,refreshProgress} from './progression.mjs';
import {recordContribution} from './honors.mjs';
import {healUnit} from './healing.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const RETINUE_LIMIT=16;
const isRetinue=(u,side)=>u.side===side&&u.source==='retinue'&&!u.supporter?.id;

// Try the demonstrated footprint first; any adjustment stays within 96 pixels.
// Use the same terrain, actor, hazard and rear-enemy exclusions as reinforcements.
function retinuePoint(w,side,u){
 if(w.heroes[side].hp<=0)return null;
 const alive=w.allAlive(),zone=reinforcementZone(w,side);
 const clear=p=>w.open(p.x,p.y)&&
  !alive.some(v=>distance(v,p)<v.radius+u.radius+9)&&
  !w.hazards.some(v=>v.until>w.time&&distance(v,p)<v.radius+20)&&
  (zone!=='rear'||!alive.some(v=>v.side!==side&&distance(v,p)<100));
 if(clear(u))return {x:u.x,y:u.y,zone};
 const phase=w.random()*Math.PI*2;
 for(let n=0;n<48;n++){
  const angle=phase+n*2.399963,radius=24+Math.floor(n/12)*24;
  const p={x:u.x+Math.cos(angle)*radius,y:u.y+Math.sin(angle)*radius};
  if(clear(p))return {...p,zone};
 }
 return null;
}

// JSON persistence need not preserve aliases: the world actor wins over a reserve copy.
function linkRetinues(w){
 const actors=new Map();
 for(const side of ['demon','human'])
  for(const u of w.legacyReserve?.[side]||[])if(isRetinue(u,side))actors.set(u.id,u);
 for(const u of w.units)if(isRetinue(u,u.side))actors.set(u.id,u);
 for(const entry of w.result?.retinues||[])
  entry.units=entry.units.map(u=>actors.get(u.id)||u);
}
export function applyLegacy(w,u,p){
 if(!p||u.legacy?.id===p.id)return u;u.legacy={id:p.id,key:p.key,doctrine:p.doctrine,rank:p.rank};u.name=p.name;const base=UNITS[p.unit];Object.assign(u,{hp:base.hp,maxHP:base.hp,armor:base.armor,attack:base.attack,speed:base.speed,range:base.range,interval:base.interval,shots:base.shots||1});u.level=Math.max(u.level||1,p.level);u.xp=Math.max(u.xp||0,p.level===10?290:0);
 if(p.doctrine==='mobile'){u.maxHP=u.hp=Math.round(u.maxHP*.88);u.speed*=1.18;}if(p.doctrine==='armored'){u.armor+=16;u.speed*=.84;}
 if(p.key==='battery'){u.shots=3;u.attack=Math.round(u.attack*.8);u.interval=6.2;}if(p.key==='dash')u.armorPen=.35;
 u.viewerTraining=null;u.progressBase=null;ensureProgress(u);refreshProgress(u,w.time);u.hp=u.maxHP;u.legacyReadyAt=w.time+1200;trainViewerTroop(w,u);return u;
}
export function prepareRetinue(w,result,side){
 result.retinues??=[];if(result.retinues.some(p=>p.side===side))return;
 const h=w.heroes[side],p=legacyPackage(side,h?.rank);if(!p)return;
 const reserve=w.legacyReserve??={demon:[],human:[]};reserve[side]??=[];
 // Keep all handoff metadata inside the existing settlement rollback boundary.
 reserve.handoffs??={};
 const state=reserve.handoffs[side]??={seenRank:0,cohorts:[],retiring:[]};
 if(p.rank<=state.seenRank)return;
 state.seenRank=p.rank;
 const oldest=state.cohorts.length===2?state.cohorts[0]:null;
 // Two admitted cohorts, not an unbounded backlog of successor grants.
 // An undelivered actor pins its cohort; this successor then receives no new grant.
 if(oldest&&reserve[side].some(u=>oldest.ids.includes(u.id)&&!oldest.deployed.includes(u.id)))return;
 const count=new Set([...w.units,...reserve[side]].filter(u=>isRetinue(u,side)).map(u=>u.id)).size;
 const limit=Math.min(p.count,RETINUE_LIMIT-count);if(limit<=0)return;
 const units=[];
 for(let i=0;i<limit;i++){
  const q={x:h.x+(side==='demon'?-1:1)*(95+i%3*44),y:h.y+85+Math.floor(i/3)*54};
  const u=w.fighter(side,p.unit,UNITS[p.unit],q.x,q.y);
  // fighter() may fall back to camp when ground is blocked. This is only a
  // demonstration/reserve actor; deployment must validate its local footprint.
  Object.assign(u,q,{lane:1,source:'retinue',supporter:{name:h.name+'随军',platform:'system'},exitGoal:null,targetId:null,tactic:'hold'});
  if(w.audienceBattle)u.pop=0; // The separately bounded entourage cannot spend player capacity.
  applyLegacy(w,u,p);units.push(u);
 }
 if(oldest){state.cohorts.shift();state.retiring.push(...oldest.ids);}
 state.cohorts.push({rank:p.rank,ids:units.map(u=>u.id),deployed:[]});
 reserve[side].push(...units);
 result.retinues.push({side,package:p,units});
}
export function deployRetinues(w){
 if(w.mode==='settlement')return;
 for(const side of ['demon','human']){
  const waiting=w.legacyReserve?.[side],state=w.legacyReserve?.handoffs?.[side];
  // Do not touch world actors in prepareRetinue: a two-sided handoff can roll back.
  if(state?.retiring.length){
   const retiring=new Set(state.retiring),removed=w.units.filter(u=>isRetinue(u,side)&&retiring.has(u.id));
   const ids=new Set(removed.map(u=>u.id));
   w.units=w.units.filter(u=>!isRetinue(u,side)||!ids.has(u.id));
   w.missiles=(w.missiles||[]).filter(m=>!ids.has(m.source?.id??m.sourceId));
   for(const u of removed)w.emit('retire',{side,source:'retinue',target:u.id,x:u.x,y:u.y});
   state.retiring=[];
  }
  if(!waiting?.length)continue;
  let delivered=0;
  for(let i=0;i<waiting.length&&delivered<2;){
   const u=waiting[i],cohort=state?.cohorts.find(g=>g.ids.includes(u.id));
   // Only explicitly issued entourage IDs get the audience exception.
   if(!isRetinue(u,side)||(w.audienceBattle&&!cohort)){i++;continue;}
   const existing=w.units.find(v=>v.id===u.id);
   if(existing||cohort?.deployed.includes(u.id)){
    if(cohort&&!cohort.deployed.includes(u.id))cohort.deployed.push(u.id);
    waiting.splice(i,1);continue;
   }
   if(!w.audienceBattle){
    if(!allowNpc(w,side))break;
    const used=(w.deployed[side]||[]).filter(e=>w.time-e.at<10000).reduce((n,e)=>n+e.cost,0);
    if(w.population(side)+u.pop>populationLimit(w)||used+u.cost>BUDGET){i++;continue;}
   }
   const point=cohort?retinuePoint(w,side,u):reinforcementPoint(w,side,u.kind);
   if(!point){i++;continue;}
   Object.assign(u,point,{readyAt:w.time+800,healAt:w.time+1800,legacyReadyAt:w.time+1000,summonedAt:w.time,path:null,repathAt:0});
   w.units.push(u);waiting.splice(i,1);cohort?.deployed.push(u.id);
   if(!w.audienceBattle)(w.deployed[side]??=[]).push({at:w.time,cost:u.cost});
   w.emit('summon',{side,kind:u.kind,source:'retinue',target:u.id,x:u.x,y:u.y});
   delivered++;
  }
 }
 linkRetinues(w);
}
export function legacyHit(w,source,target,damage,style){if(!source?.legacy||damage<=0||style==='legacy'||allied(source,target)||target.hp<=0)return;const key=source.legacy.key,owner=w.units.find(u=>u.id===source.id&&(u.life||1)===(source.life||1))||source;
 if(key==='frost'){target.slowUntil=Math.max(target.slowUntil||0,w.time+1700);w.emit('legacy_frost',{x:target.x,y:target.y,side:source.side,focus:combatFocus(source),radius:35});}
 if(key==='ember'){target.legacyBurn={sourceId:source.id,life:source.life||1,source:structuredClone({id:source.id,x:source.x,y:source.y,life:source.life||1,side:source.side,kind:source.kind,source:source.source,supporter:source.supporter,giftQuality:source.giftQuality}),until:w.time+3500,nextAt:w.time+900,damage:20};if(w.time>=(owner.legacyImpactAt||0)){owner.legacyImpactAt=w.time+1600;w.breakGround(target,90,230,source.side,'flame',combatFocus(source));w.emit('flame',{x:target.x,y:target.y,radius:65,side:source.side,focus:combatFocus(source)});}}
 if((key==='storm'||key==='quake')&&w.time>=(owner.legacyImpactAt||0)){owner.legacyImpactAt=w.time+1900;const targets=w.allAlive().filter(u=>hostile(u,source)&&u.id!==target.id&&distance(u,target)<(key==='storm'?125:145)).sort((a,b)=>distance(a,target)-distance(b,target)).slice(0,2);
  if(key==='quake'){for(const u of [target,...targets])u.stunnedUntil=Math.max(u.stunnedUntil||0,w.time+(u.kind==='hero'?250:650));w.breakGround(target,150,260,source.side,'blast',combatFocus(source));w.emit('slam',{x:target.x,y:target.y,radius:150,side:source.side,focus:combatFocus(source)});}
  else for(const u of targets){w.emit('explosion',{x:u.x,y:u.y,radius:48,side:source.side,focus:combatFocus(source),style:'arc'});w.resolveHit(source,u,Math.max(10,damage*.4),false,'legacy');}
 }
}
export function updateLegacies(w){
 deployRetinues(w);w.legacyBuildings??=[];const alive=w.allAlive();
 for(const u of alive){const burn=u.legacyBurn;if(burn&&burn.until>w.time&&w.time>=burn.nextAt){burn.nextAt=w.time+900;const source=alive.find(x=>x.id===burn.sourceId&&(x.life||1)===burn.life)||burn.source;w.resolveHit(source,u,burn.damage,false,'legacy');}if(!u.legacy||u.hp<=0)continue;
  if(u.legacy.key==='dash'&&w.time>=(u.legacyReadyAt||0)&&alive.some(v=>hostile(v,u)&&distance(u,v)>90&&distance(u,v)<250)){u.hasteUntil=w.time+2300;u.legacyReadyAt=w.time+6500;w.emit('rally',{x:u.x,y:u.y,side:u.side,focus:combatFocus(u)});}
  if(u.legacy.key==='medic'&&w.time>=(u.legacyReadyAt||0)){u.legacyReadyAt=w.time+5000;for(const target of alive.filter(v=>allied(v,u)&&v.hp<v.maxHP&&distance(v,u)<155).slice(0,4)){const amount=healUnit(target,70,w.time);if(amount){recordContribution(w,u,target,0,amount);w.emit('heal',{x:target.x,y:target.y,side:u.side,focus:combatFocus(u),fromX:u.x,fromY:u.y,target:target.id,amount});}}}
  if(u.legacy.key==='depot'&&!u.legacyBuilt){u.legacyBuilt=true;const existing=w.legacyBuildings.filter(b=>allied(b,u)&&b.hp>0&&b.legacyId===u.legacy.id);if(existing.length<2&&!existing.some(b=>distance(b,u)<220)){const p=w.ground({x:u.x+(u.side==='demon'?-70:70),y:u.y+40});if(p){w.legacyBuildings.push({id:'depot-'+(++w.serial),kind:'depot',side:u.side,...factionFields(u),...p,hp:1100,maxHP:1100,legacyId:u.legacy.id,source:structuredClone(u.supporter||null),nextPulse:w.time+1000});while(w.legacyBuildings.filter(b=>allied(b,u)).length>4)w.legacyBuildings.splice(w.legacyBuildings.findIndex(b=>allied(b,u)),1);w.emit('rally',{...p,side:u.side,focus:combatFocus(u)});}}}
 }
 for(const b of w.legacyBuildings){if(b.hp<=0||w.time<b.nextPulse)continue;b.nextPulse=w.time+1000;const enemies=alive.filter(u=>hostile(u,b)&&distance(u,b)<125);b.hp=Math.max(0,b.hp-enemies.reduce((n,u)=>n+Math.min(80,u.attack*.25),0));if(b.hp<=0){b.deadAt=w.time;w.emit('explosion',{x:b.x,y:b.y,radius:80,side:b.side});continue;}for(const u of alive.filter(u=>allied(u,b)&&distance(u,b)<160).slice(0,8))u.shield=Math.min(u.kind==='hero'?180:100,(u.shield||0)+12);}
 w.legacyBuildings=w.legacyBuildings.filter(b=>b.hp>0||w.time-b.deadAt<6000);
}
