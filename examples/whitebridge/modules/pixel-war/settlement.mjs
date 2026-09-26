import {teamOf,factionLeader} from './public/allegiance.mjs';
import {holdMuster} from './muster.mjs';
import {legacyPackage} from './public/legacy-catalog.mjs';
import {prepareRetinue} from './legacy.mjs';
import {prepareCrowns,beginCrownPickup,advanceCrownPickup} from './crown-inheritance.mjs';
import {CINEMATIC,ceremonyTiming,settlementTiming} from './public/cinematic.mjs';
import {battleHonors} from './honors.mjs';
import {leaderDeaths,retireTroops} from './service-life.mjs';
const sides=['demon','human'];
export function beginSettlement(w,dead){
 if(w.mode==='settlement')return false;dead=[...new Set(dead)].filter(s=>sides.includes(s)&&w.heroes[s].hp<=0);if(!dead.length)return false;
 const finisher=dead.length===1?w.honors?.finishers?.[w.heroes[dead[0]].id]:null,winner=dead.length===1?(finisher?.faction||sides.find(s=>s!==dead[0])):null,fallen=dead.map(s=>structuredClone({...w.heroes[s],path:null})),victor=winner?(factionLeader(w,winner)||w.units.find(u=>u.id===finisher?.unitId)):null;
 w.result={ceremonyVersion:3,timing:null,dead,winner,startedAt:w.time,returnMode:['live','test_live','showcase'].includes(w.mode)?w.mode:'test_live',handedOff:false,fallen,honors:battleHonors(w,winner,fallen),victor:victor?structuredClone({...victor,path:null,action:null}):null};
 w.result.timing=settlementTiming(w.result.honors,winner);
 w.result.upcoming=dead.map(side=>({side,package:legacyPackage(side,w.ranks[side]+1)}));
 w.result.crowns=prepareCrowns(w,fallen);
 w.leaderDeaths=leaderDeaths(w)+dead.length;retireTroops(w);
 for(const s of dead){const h=w.heroes[s];h.deadAt??=w.time;h.action=null;h.moving=false;}
 for(const u of w.allAlive())u.moving=false;
 if(winner)w.wins[winner]=(w.wins[winner]||0)+1;w.mode='settlement';w.settlementUntil=w.time+w.result.timing.end;
 if(dead[0])w.say(dead[0],dead[0]+'DefeatNew');w.emit('victory',{side:winner,x:fallen[0].x,y:fallen[0].y});
}
// Hold combat clocks through the entire ceremony; no free cooldowns or expired projectiles.
export function holdBattleClocks(w,ms){
 holdMuster(w,ms);
 const shift=(o,keys)=>{for(const k of keys)if(Number.isFinite(o?.[k]))o[k]+=ms;};
 shift(w,['nextSpawn','nextAmbientWave','nextPickup','nextHazard','nextGiant','nextWildlife','nextObjective','nextSurprise','startedAt']);
 for(const u of [...Object.values(w.heroes),...w.units,...(w.wildlife||[])]){
  shift(u,['readyAt','hitAt','healAt','summonedAt','lastAttackAt','nextCoverShot','sortieUntil','tacticUntil','skillReadyAt','stunnedUntil','hasteUntil','furyUntil','slowUntil','nextPlan','nextEscort','nextDuel','duelUntil','expiresAt','nextRoar','nextChatter','watchUntil','ammoUntil','legacyReadyAt','legacyImpactAt','defenseShotAt','withdrawalCooldown']);
  if(u.action&&typeof u.action==='object')shift(u.action,['started','contactAt','until']);
  for(const x of [...(u.recentHeals||[]),...(u.recentWounds||[])])shift(x,['at']);
  shift(u.legacyBurn,['until','nextAt']);shift(u.withdrawal,['until','started']);shift(u.defense,['until']);shift(u.viewerOrder,['until']);shift(u.scavenge,['nextSearch','expires']);shift(u.viewerAdvice,['until']);
  if(u.kind!=='hero')shift(u,['deadAt']);if(u.mission)shift(u.mission,['until']);if(u.escort)shift(u.escort,['until']);
 }
 for(const u of w.fallenTroops||[])shift(u,['at']);
 for(const b of w.barracks||[])shift(b,['readyAt','nextProduceAt','builtAt','hitAt','deadAt']);
 for(const e of w.warEvents||[])shift(e,['at','impact','until']);
 for(const b of w.legacyBuildings||[])shift(b,['nextPulse','deadAt']);
 for(const p of w.fieldProps?.items||[])shift(p,['fuseAt']);
 for(const e of w.surprises||[])shift(e,['at','impact','until']);
 for(const e of w.announcements||[])shift(e,['at','displayAt','effectUntil','until']);
 for(const line of w.chatter||[])shift(line,['at','until']);
 shift(w.nextChatter,sides);shift(w.campaign?.pending,['at']);for(const o of Object.values(w.campaign?.orders||{}))shift(o,['until']);
 shift(w.campaign,['nextDefenseScan','nextSignals']);for(const s of w.campaign?.sites||[])shift(s.assault,['at','until']);for(const r of Object.values(w.campaign?.responses||{}))shift(r,['at','until']);shift(w.campaign?.marchNotices,sides);
 for(const m of w.missiles)shift(m,['born','until']);
 for(const h of w.hazards)shift(h,['impact','until','nextPulse']);
 for(const p of w.pickups)shift(p,['until']);
 for(const f of Object.values(w.objectDamage||{}))shift(f,['burnAt','burnUntil','nextPulse','lastHitAt','nextSpread']);
 for(const [team,entries]of Object.entries(w.deployed))if(!sides.includes(team))for(const d of entries)shift(d,['at']);
 for(const s of sides){shift(w.battleBuffs,[s]);shift(w.audienceOrders?.[s],['until']);for(const d of w.deployed[s]||[])shift(d,['at']);}
 for(const o of w.objectives||[])shift(o,['revealAt','readyAt','claimedAt','expires','nextWave','until']);
}
export function advanceSettlement(w,ms=50){
 const r=w.result,timing=ceremonyTiming(r);holdBattleClocks(w,ms);r.startedAt??=w.settlementUntil-timing.end;
 if(!r.handedOff&&w.time>=r.startedAt+timing.handoff){
  const before={ranks:{...w.ranks},heroes:{...w.heroes},serial:w.serial,seed:w.seed,reserve:structuredClone(w.legacyReserve),retinues:structuredClone(r.retinues)};
  try{const successors=r.dead.map(s=>{const fallen=r.fallen.find(h=>h.side===s),next=w.makeHero(s,w.ranks[s]+1),toward=s==='demon'?-1:1,p=w.ground({x:fallen.x+toward*140,y:fallen.y+70})||w.ground(fallen);Object.assign(next,p,{mission:null,nextPlan:0,nextDuel:0,skillReadyAt:w.time+1500,orderLabel:'替'+fallen.name+'报仇'});return [s,next];});
   for(const [s,next] of successors){w.ranks[s]=next.rank;w.heroes[s]=next;if(r.ceremonyVersion>=2)prepareRetinue(w,r,s);}
  }catch(error){Object.assign(w,{ranks:before.ranks,heroes:before.heroes,serial:before.serial,seed:before.seed,legacyReserve:before.reserve});r.retinues=before.retinues;throw error;}
  r.handedOff=true;r.arrivals=r.dead.map(s=>({side:s,name:w.heroes[s].name,rank:w.ranks[s],x:w.heroes[s].x,y:w.heroes[s].y}));
  beginCrownPickup(w,r);
  w.honors={entries:{},finishers:{}};w.startedAt=w.time;
  for(const s of r.dead){const crowns=r.crowns?.find(e=>e.side===s);w.say(s,s+(w.ranks[s]===1?'Father':'Elder'),crowns?{fallenName:r.fallen.find(h=>h.side===s).name,crownsOnGround:crowns.count,ownCrowns:1,totalAfterPickup:crowns.count+1,action:'走近并拾起战败晚辈的王冠'}:null);w.emit('arrival',{side:s,x:w.heroes[s].x,y:w.heroes[s].y});}
 }
 if(r.handedOff)advanceCrownPickup(w,r);
 if(r.handedOff&&w.time>=r.startedAt+timing.end)w.mode=r.returnMode||'test_live';
}
