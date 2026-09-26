import {factionLeader,nearestOpponent,factionFields,hostile,isBoss} from './public/allegiance.mjs';
import {announceFieldEvent} from './announcements.mjs';
import {recordContribution} from './honors.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {cueSpeech} from './luna-speech.mjs';
const other=s=>s==='demon'?'human':'demon';
export const COMMANDER_SUPPORT={
 fieldMedic:{kind:'royal_heal',name:'急救',fraction:.30},
 lifeSurge:{kind:'royal_vitality',name:'生命祝福',duration:20000},
 battleFury:{kind:'royal_power',name:'战意沸腾',duration:20000},
 ironWard:{kind:'royal_guard',name:'铁壁庇护',duration:15000},
 royalSpring:{kind:'royal_restore',name:'圣泉复苏',fraction:1},
 royalStrike:{kind:'royal_strike',name:'定向天罚'}
};
export function applyCommanderSupport(w,g){
 const spec=COMMANDER_SUPPORT[g.key];if(!spec||!g.supporter?.id||w.paused||w.mode==='settlement')return null;
 const hero=factionLeader(w,g),target=g.key==='royalStrike'?(g.faction&&hero?nearestOpponent(w,hero,{boss:true})||nearestOpponent(w,hero):w.heroes[other(g.side)]):hero;if(!hero||hero.hp<=0||!target||target.hp<=0)return null;
 const source={id:'support-'+(++w.serial),kind:'commander_support',side:g.side,...factionFields(g),source:g.source,supporter:structuredClone(g.supporter),giftQuality:g.quality,x:hero.x,y:hero.y,life:1},focus=combatFocus(source);let amount=0,buff=null;
 hero.commanderBuffs??={};
 if(spec.fraction){amount=Math.min(hero.maxHP-hero.hp,Math.round(hero.maxHP*spec.fraction));hero.hp+=amount;recordContribution(w,source,hero,0,amount);}
 else if(g.key==='lifeSurge'){
  buff=hero.commanderBuffs.vitality;const extra=buff?.extra||Math.round(hero.maxHP*.20);
  if(!buff){hero.maxHP+=extra;hero.hp+=extra;amount=extra;recordContribution(w,source,hero,0,extra);}
  hero.commanderBuffs.vitality={until:w.time+spec.duration,extra,owner:source.supporter};
 }else if(g.key==='battleFury'){hero.commanderBuffs.power={until:w.time+spec.duration,owner:source.supporter};hero.supportAttack=1.4;}
 else if(g.key==='ironWard'){hero.commanderBuffs.guard={until:w.time+spec.duration,owner:source.supporter};}
 else if(g.key==='royalStrike'){
  const victims=[target,...w.allAlive().filter(u=>u.id!==target.id&&hostile(source,u)&&Math.hypot(u.x-target.x,u.y-target.y)<170).slice(0,12)];
  for(const u of victims){const before=u.hp;w.resolveHit(source,u,u.maxHP*(isBoss(u)?.25:.45),false,'royal_strike');amount+=Math.max(0,before-u.hp);}
  w.breakGround(target,170,700,g.side,'blast',focus);w.emit('explosion',{x:target.x,y:target.y,radius:180,side:g.side,focus,style:'royal_strike'});
 }
 const applied=!!spec.duration||amount>0;
 target.lastSupport={receipt:g.receipt,id:source.id,at:w.time,until:w.time+3500,kind:spec.kind,amount,owner:source.supporter,side:g.side,name:spec.name,applied};
 const note=announceFieldEvent(w,spec.kind,target,w.time+(spec.duration||3500));Object.assign(note,{actorSide:g.side,owner:source.supporter,title:spec.name,detail:(amount?(g.key==='royalStrike'?'伤害 −':'生命 +')+Math.round(amount):spec.duration?({lifeSurge:'上限 +20%',battleFury:'攻击 +40%',ironWard:'减伤 35%'})[g.key]:'生命已满')+' · '+g.supporter.name,targetId:target.id});
 if(amount&&g.key!=='royalStrike')w.emit('heal',{x:target.x,y:target.y,target:target.id,side:g.side,amount,focus});
 if(applied)cueSpeech(w,g.side,'support',{owner:g.supporter.name,action:spec.name,receipt:g.receipt,amount:Math.round(amount),target:target.name},{priority:3,ttl:45000});
 return {applied,amount};
}
export function updateCommanderSupport(w){for(const h of [...Object.values(w.heroes),...w.units.filter(u=>u.commander&&u.hp>0)]){
 const b=h.commanderBuffs;if(!b)continue;for(const [key,v] of Object.entries(b)){if(v.until>w.time)continue;if(key==='vitality'){h.maxHP=Math.max(1,h.maxHP-v.extra);h.hp=Math.min(h.hp,h.maxHP);}delete b[key];}h.supportAttack=b.power?1.4:1;
}}
export function holdCommanderSupport(w,ms){for(const h of [...Object.values(w.heroes),...w.units.filter(u=>u.commander&&u.hp>0)]){for(const b of Object.values(h.commanderBuffs||{}))b.until+=ms;if(h.lastSupport){h.lastSupport.at+=ms;h.lastSupport.until+=ms;}}}
export function commanderGuardScale(w,target){return target.commanderBuffs?.guard?.until>w.time ? .65 : 1;}
