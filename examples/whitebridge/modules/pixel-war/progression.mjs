import {hostile,allied,isBoss,teamOf} from './public/allegiance.mjs';
import {allocateGift} from './public/gift-strength.mjs';
import {generatedTroopShout} from './luna-speech.mjs';
import {combatFocus} from './public/combat-focus.mjs';
import {UNITS} from './public/catalog.mjs';
export const XP_LEVELS=[0,30,85,170,290],MAX_LEVEL=5;
export function ensureProgress(u){if(!UNITS[u.kind]||u.kind==='hero'||u.commander)return false;u.xp??=0;u.level??=1;u.kills??=0;u.progressBase??={hp:u.maxHP,attack:u.attack,armor:u.armor,speed:u.speed,range:u.range};return true;}
export function refreshProgress(u,time=0){if(!ensureProgress(u))return;const n=u.level-1,b=u.progressBase;if(u.giftQuality?.power?.version===1&&u.viewerTraining?.revision===3){const a=allocateGift(u.giftQuality.power,u.viewerTraining.rank,u.level);u.maxHP=a.hp;u.attack=a.attack;u.armor=a.armor;u.speed=b.speed*(1+.025*n);u.range=b.range*(u.watchUntil>time?1.18:1);return;}u.maxHP=Math.round(b.hp*(1+.08*n));u.attack=Math.round(b.attack*(1+.1*n));u.armor=b.armor+n*2;u.speed=b.speed*(1+.025*n);u.range=b.range*(u.watchUntil>time?1.18:1);}
export function awardAttack(w,source,target,effectiveDamage,attackId){
 if(!source||!attackId||!(effectiveDamage>0)||allied(source,target)||['barrel','barracks'].includes(target.kind)||!['demon','human'].includes(source.side))return false;
 const u=w.units.find(v=>v.id===source.id&&(v.life||1)===(source.life||1)&&v.hp>0);if(!u||!ensureProgress(u))return false;
 // One point per successful attack, including a shield hit. Burst bullets,
 // splash targets and delayed/reloaded projectiles share the same attack ID.
 u.attackXpLedger??=[];if(u.attackXpLedger.includes(attackId))return false;
 u.attackXpLedger.push(attackId);u.attackXpLedger=u.attackXpLedger.slice(-32);addExperience(w,u,1);return true;
}
export function awardKill(w,source,target){
 if(!source||allied(source,target)||!['demon','human'].includes(source.side)||target.kind==='barrel'||target.hp>0||target.rewardedLife===(target.life||1))return false;
 target.rewardedLife=target.life||1;const u=w.units.find(u=>u.id===source.id&&(u.life||1)===(source.life||1)&&u.hp>0);if(!u||!ensureProgress(u))return false;
 const amount=(target.kind==='hero'||target.commander)?100:Math.min(65,Math.round(12*Math.sqrt(target.pop||3)));u.kills++;addExperience(w,u,amount);return true;
}
function addExperience(w,u,amount){
 u.xp+=amount;const old=u.level;u.level=Math.max(old,XP_LEVELS.reduce((level,xp,i)=>u.xp>=xp?i+1:level,1));refreshProgress(u,w.time);
 if(u.level>old){w.emit('level_up',{x:u.x,y:u.y,target:u.id,side:u.side,focus:combatFocus(u),level:u.level});if(w.generatedSpeechOnly&&w.speechMode!=='observer'){generatedTroopShout(w,u,'level_up');return true;}w.chatter??=[];w.chatter.push({id:++w.serial,unitId:u.id,side:u.side,origin:'battle-rule',audioMode:'silent',text:u.level===5?'我现在能打十个！':'升阶了！接着打！',at:w.time,until:w.time+4500,priority:5});w.chatter=w.chatter.slice(-18);}return true;
}
