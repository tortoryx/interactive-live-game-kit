import {randomInt} from 'node:crypto';
import {planOpponent} from './opponent-director.mjs';
import {UNITS} from '../pixel-war/public/catalog.mjs';
import {populationLimit} from '../pixel-war/audience-battle.mjs';
export const broadcastMode=game=>game.meta.broadcastMode||'dual-platform';
export function modeStatus(game){return {mode:broadcastMode(game),humanController:broadcastMode(game)==='bilibili-first'?'human_and_system':'xiaohongshu',systemTroops:game.world.units.filter(u=>u.hp>0&&u.systemOpponent).length,opponent:game.meta.opponentStatus||null};}
export function configureBroadcast(game,mode){
 if(!['dual-platform','bilibili-first'].includes(mode))throw Error('invalid_broadcast_mode');
 return game.atomic(()=>{
  if(mode!==broadcastMode(game)){
   const ids=new Set(game.world.units.filter(u=>u.systemOpponent).map(u=>u.id));
   game.world.units=game.world.units.filter(u=>!ids.has(u.id));
   game.world.missiles=game.world.missiles.filter(m=>!ids.has(m.source?.id||m.sourceId)&&!ids.has(m.target));
   game.meta.opponentState=null;game.meta.opponentStatus=null;game.meta.epoch++;
  }
  game.meta.broadcastMode=mode;return {ok:true,...modeStatus(game)};
 });
}
export function affiliationIntent(text){const t=String(text||'').trim();return /^加入人族$/.test(t)?'human':/^加入魔族$/.test(t)?'demon':null;}
export function tickOpponent(game){
 if(broadcastMode(game)!=='bilibili-first'||game.world.audienceBattle)return;
 const w=game.world,living=w.units.filter(u=>u.hp>0),real=living.filter(u=>['bilibili','xiaohongshu','test'].includes(u.source));
 const power=units=>units.reduce((n,u)=>n+(UNITS[u.kind]?.cost||0),0);
 const result=planOpponent(game.meta.opponentState,{mode:broadcastMode(game),phase:w.mode,paused:w.paused,now:w.time,generation:Object.values(w.heroes).map(h=>h.id).join(':'),engaged:['live','test_live'].includes(w.mode),participants:w.audienceBattle?.participants||0,realPower:power(real),alliedHumanPower:power(real.filter(u=>u.side==='human')),botPower:power(living.filter(u=>u.systemOpponent)),availablePopulation:Math.max(0,populationLimit(w)-w.population('human'))});
 game.meta.opponentState=result.state;game.meta.opponentStatus={target:result.target,reason:result.reason};
 for(const d of result.deployments){
  // Internal engine spawn only: no fake platform event, gift receipt or actor ID.
  if(w.heroes.human.hp>0&&w.spawn('human',d.kind,d.lane,false,{source:'system',supporter:{name:'人族系统军',platform:'system'},suppressHighlight:true})){
   const u=w.units.at(-1);u.systemOpponent=true;u.tactic='advance';u.tacticUntil=w.time+20000;
  }
 }
}

// Count recent people, not troop count or the internal opponent army. Keep assignments
// stable across messages, death and reconnect; only an explicit choice switches sides.
export function assignBiliFaction(game,e,tieBreak=()=>randomInt(2)){
 const affiliations=game.meta.affiliations??={},id=e.supporter.id,old=affiliations[id];
 if(e.kind==='leave'){if(old)old.present=false;return old?.side||'demon';}
 if(e.kind==='withdraw')return old?.side||'demon';
 const now=game.now(),choice=e.kind==='chat'?affiliationIntent(e.text):null;
 let side=choice||old?.side;
 if(!side){
  const count={demon:0,human:0};
  for(const [key,a] of Object.entries(affiliations)){
   const at=Math.max(a.at||0,game.meta.participation?.viewers?.['bilibili:'+key]||0);
   if(!game.world.clans?.[game.meta.clanMembers?.[key]]||game.world.clans[game.meta.clanMembers[key]].status!=='active'){if(a.present!==false&&now-at<300000&&Object.hasOwn(count,a.side))count[a.side]++;}
  }
  side=count.demon===count.human?(tieBreak()===0?'demon':'human'):count.demon<count.human?'demon':'human';
 }
 affiliations[id]={side,at:now,present:true,source:choice?'choice':old?.source||'automatic'};
 if(Object.keys(affiliations).length>10000)game.meta.affiliations=Object.fromEntries(Object.entries(affiliations).sort((a,b)=>b[1].at-a[1].at).slice(0,10000));
 return side;
}
