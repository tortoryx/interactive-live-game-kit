import {factionLeader,nearestOpponent,teamOf} from './public/allegiance.mjs';
import {generatedTroopShout} from './luna-speech.mjs';
import {withdrawalPlan} from './withdrawal.mjs';
import {refreshProgress} from './progression.mjs';
import {campaignGoal,fieldCamp,commandCampaign} from './campaign.mjs';
import {ORDER_LABELS} from './public/chat-commands.mjs';
import {enrollTroop,serviceExpired,REVIVE_WINDOW} from './service-life.mjs';
import {scavengeStep,clearScavenge,SCAVENGE_MS} from './scavenging.mjs';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function troopShout(w,u,event,force=false){
 if(w.generatedSpeechOnly&&w.speechMode!=='observer')return generatedTroopShout(w,u,event);
 if(u.kind==='hero'||!['human','demon'].includes(u.side)||u.hp<=0)return false;
 const roles={musketeer:['装填！掩护我！','稳住，瞄准！'],repeater:['三连发，压住他们！'],blunderbuss:['靠近点才够疼！'],grenadier:['接住这个！','炸弹，散开！'],cannon:['重炮装填！','开炮！'],dreadnought:['双炮就位！','把路轰开！'],scout:['追不上我吧！','我去抄后路！'],shortbow:['快箭跟上！'],crossbow:['这一箭专治重甲！'],bow:['箭雨压住他们！','别挡箭路！'],ranger:['盯住后排！','放箭！'],mage:['闪开，要炸了！','轰开他们！'],siege:['破阵，给我开！','这一锤下去！'],colossus:['都给我让开！','吃我一锤！'],shield:['盾墙顶住！','站我后面！'],healer:['别跑出治疗！','你先别倒！'],pike:['枪尖朝前！','骑兵来了！'],rider:['跟我冲侧翼！','别让弓手跑了！']};
 const texts={raid_grain:['去抢粮仓！'],raid_forge:['砸开工坊大门！'],defend_grain:['粮仓不能丢！'],defend_forge:['守住我们的工坊！'],attack:['冲过去！',...(roles[u.kind]||['别让他跑了！','跟上，跟上！'])],hurt:['顶住！','还没倒呢！','嘶，这下真疼！'],advance:['收到，往前压！'],retreat:['收到！撤，别掉队！'],guard:['收到，护住首领！'],revive:['这回别卖我！']};
 const options=texts[event];if(!options)return false;w.chatter??=[];w.nextChatter??={};
 if(!force&&(w.time<(u.nextChatter||0)||w.time<(w.nextChatter[u.side]||0)))return false;
 // Cosmetic cadence never consumes combat RNG.
 const hash=[...u.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,Math.floor(w.time/3000));
 if(!force&&hash%4===0)return false;
 u.nextChatter=w.time+4800;w.nextChatter[u.side]=w.time+550;
 w.chatter=w.chatter.filter(v=>v.until>w.time&&v.unitId!==u.id).slice(-17);
 w.chatter.push({id:++w.serial,unitId:u.id,side:u.side,event,text:options[hash%options.length],at:w.time,until:w.time+3600,origin:'battle-rule',audioMode:'silent',voiceKey:null,priority:force?4:u.supporter&&u.supporter.platform!=='system'?2:1});return true;
}
export function commandOwnedTroops(w,side,ownerId,order,faction=null){
 if(!Object.hasOwn(ORDER_LABELS,order)||!ownerId)return {status:'invalid_order',count:0};
 if(w.paused||['settlement','inspection'].includes(w.mode))return {status:'battle_paused',count:0};
 const durationMs=order==='scavenge'?SCAVENGE_MS:order.includes('_')?45000:12000,units=w.units.filter(u=>u.hp>0&&teamOf(u)===(faction||side)&&u.supporter?.id===ownerId&&u.source!=='system');
 for(const u of units){clearScavenge(u);u.viewerOrder={kind:order,ownerId,issuedAt:w.time,until:w.time+durationMs,...(order==='scavenge'?{origin:{x:u.x,y:u.y}}:{})};u.path=null;u.repathAt=0;u.escort=null;u.exitGoal=null;u.localCombat=null;}
 if(units[0])troopShout(w,units[0],order,true);
 return {status:units.length?'commanded':'no_troops',count:units.length,order,durationMs,...(order==='scavenge'&&units.length?{message:'你的 '+units.length+' 名士兵开始搜寻附近补给'}:{})};
}
export function viewerTroopStep(w,u,enemy,dt){
 const order=u.viewerOrder;if(!order||order.until<=w.time||order.ownerId!==u.supporter?.id){if(u.scavenge?.ordered)clearScavenge(u);return false;}
 if(order.kind==='scavenge')return scavengeStep(w,u,dt,{ordered:true});
 if(order.kind.includes('_')){const goal=campaignGoal(w,u,{order:order.kind});if(!goal)return false;if(enemy&&distance(u,enemy)<u.range+enemy.radius){if(w.time>=u.readyAt)w.attack(u,enemy);}else if(distance(u,goal)>35)w.move(u,goal,dt);return true;}
 const h=factionLeader(w,u)||u.origin||u,opponent=u.faction?(nearestOpponent(w,u,{boss:true})||enemy||h):w.heroes[u.side==='demon'?'human':'demon'],dir=opponent.x>=h.x?1:-1;
 if(order.kind==='retreat'){
  const goal=w.ground({x:h.x-dir*210,y:h.y+(u.lane-1)*65})||fieldCamp(w,u.side);
  if(distance(u,goal)>32)w.move(u,goal,dt);return true;
 }
 const guarding=order.kind==='guard',goal=guarding?{x:h.x+dir*75,y:h.y+(u.lane-1)*50}:order.kind==='attack'?opponent:{x:(u.faction?u.x:w.front(u.side).x)+dir*200,y:u.y};
 const target=order.kind==='attack'&&distance(u,opponent)<u.range+opponent.radius?opponent:enemy;
 if(target&&(!guarding||distance(target,h)<260)&&distance(u,target)<u.range+target.radius){
  if(w.time>=u.readyAt)w.attack(u,target);return true;
 }
 if(distance(u,goal)>35)w.move(u,goal,dt);return true;
}
export function rememberFallen(w,u){
 if(!u.supporter?.id||!['test','bilibili','xiaohongshu'].includes(u.source)||u.kind==='hero'||u.oneLife)return;
 w.fallenTroops??=[];if(w.fallenTroops.some(v=>v.id===u.id))return;
 enrollTroop(w,u);if(serviceExpired(w,u))return;
 w.fallenTroops.push(structuredClone({id:u.id,x:u.x,y:u.y,supporter:u.supporter,kind:u.kind,barracksId:u.barracksId,faction:u.faction,factionName:u.factionName,factionColor:u.factionColor,side:u.side,ownerId:u.supporter.id,life:u.life||1,at:w.time,xp:u.xp||0,level:u.level||1,kills:u.kills||0,progressBase:u.progressBase,viewerTraining:u.viewerTraining,legacy:u.legacy,giftQuality:u.giftQuality,service:u.service,name:u.name,battleStats:Object.fromEntries(['interval','shots','armorPen','legacyBuilt'].filter(k=>u[k]!==undefined).map(k=>[k,u[k]]))}));
 w.fallenTroops=w.fallenTroops.filter(v=>v.reservedBy||w.time-v.at<=REVIVE_WINDOW);
}
export function reviveIdentity(w,u,viewer){
 w.fallenTroops??=[];const i=viewer.reviveId?w.fallenTroops.findIndex(v=>v.id===viewer.reviveId&&v.ownerId===viewer.supporter?.id&&v.kind===u.kind&&(v.side===u.side||!!v.reservedBy&&v.reservedBy===viewer.receipt)&&!serviceExpired(w,v)&&(!v.reservedBy&&w.time-v.at<=REVIVE_WINDOW||!!v.reservedBy&&v.reservedBy===viewer.receipt)):-1;
 if(i<0){u.life=1;return false;}
 const fallen=w.fallenTroops.splice(i,1)[0];w.units=w.units.filter(v=>v.id!==fallen.id);u.id=fallen.id;u.life=fallen.life+1;Object.assign(u,{supporter:viewer.supporter,source:viewer.source||viewer.supporter.platform,receipt:viewer.receipt,xp:fallen.xp||0,level:fallen.level||1,kills:fallen.kills||0,progressBase:fallen.progressBase,viewerTraining:fallen.viewerTraining,legacy:fallen.legacy,giftQuality:fallen.giftQuality,service:fallen.service,barracksId:fallen.barracksId,name:fallen.name||u.name,faction:viewer.faction,factionName:viewer.factionName,factionColor:viewer.factionColor,...fallen.battleStats});refreshProgress(u,w.time);u.hp=u.maxHP;troopShout(w,u,'revive',true);return true;
}
export function heroAdvice(w,side,order){
 if(['raid_grain','raid_forge','defend_grain','defend_forge'].includes(order))return commandCampaign(w,side,order,{source:'model'});
 const h=w.heroes[side];if(order!=='retreat')h.withdrawal=null;h.viewerAdvice={kind:order,until:w.time+12000};h.nextPlan=0;h.path=null;h.repathAt=0;
 if(order==='attack'){h.nextDuel=0;h.duelUntil=w.time+12000;}
}
export function heroAdviceStep(w,u,enemy,dt){
 const a=u.viewerAdvice;if(!a||a.until<=w.time)return false;
 const dir=u.side==='demon'?1:-1;
 if(a.kind==='retreat'){const plan=withdrawalPlan(w,u,enemy?[enemy]:[],'advice:'+a.until);if(plan){w.move(u,plan.goal,dt);u.orderLabel='听取建议：短撤整队';return true;}u.viewerAdvice=null;return false;}
 if(enemy&&distance(u,enemy)<u.range+enemy.radius){if(w.time>=u.readyAt)w.attack(u,enemy);return true;}
 const front=w.front(u.side),goal=w.ground({x:front.x-dir*(a.kind==='guard'?100:20),y:front.y});if(goal&&distance(u,goal)>35)w.move(u,goal,dt);u.orderLabel='听取建议：'+ORDER_LABELS[a.kind];return true;
}

export function nearbyTroopChatter(w){w.nextNearbyChatter??={};for(const side of ['demon','human']){if(w.time<(w.nextNearbyChatter[side]||0))continue;w.nextNearbyChatter[side]=w.time+2200;const h=w.heroes[side],units=w.units.filter(u=>u.hp>0&&u.side===side&&distance(u,h)<600&&w.time>=(u.nextChatter||0)).sort((a,b)=>(a.nextChatter||0)-(b.nextChatter||0));const u=units.find(u=>u.action)||units.find(u=>u.moving);if(u)troopShout(w,u,u.action?'attack':'advance');}}
