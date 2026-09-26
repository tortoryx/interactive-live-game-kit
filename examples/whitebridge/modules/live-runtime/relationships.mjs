import {cleanChat,ORDER_LABELS} from '../pixel-war/public/chat-commands.mjs';
import {asksMemory,asksRecord} from './conversation.mjs';
import {createViewerMemory,accessViewerMemory,sweepViewerMemory,departViewerMemory,activeViewerMemory,allViewerMemoryRecords} from './viewer-memory.mjs';
const SIDES=['demon','human'];
const keyOf=p=>p?.id&&['test','bilibili','xiaohongshu'].includes(p.platform)?p.platform+':'+p.id:null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const enemy=s=>s==='demon'?'human':'demon';
export function relationshipState(game,side){
 const w=game.world;game.meta.relationships??={};let s=game.meta.relationships[side];
 if(!s||s.persona!==w.heroes[side].id||s.fieldEpoch!==w.fieldEpoch){s={persona:w.heroes[side].id,fieldEpoch:w.fieldEpoch,memory:createViewerMemory(),cursor:0,pending:[],nextSpotlight:w.time+6000};game.meta.relationships[side]=s;}
 if(!s.memory){s.memory=createViewerMemory();for(const [key,record] of Object.entries(s.viewers||{}))accessViewerMemory(s.memory,key,{now:game.now(),create:()=>record});delete s.viewers;}
 if(w.heroes[side].hp<=0){s.memory=createViewerMemory();s.pending=[];s.advice=null;s.cursor=w.supporterEvents?.serial||0;}
 const now=game.now();if(!s.nextMemorySweepAt||now>=s.nextMemorySweepAt){sweepViewerMemory(s.memory,now);s.nextMemorySweepAt=now+1000;}
 return s;
}
export const relationshipRecords=(game,side)=>allViewerMemoryRecords(relationshipState(game,side).memory);
function viewer(game,side,p,activate=false){
 const key=keyOf(p);if(!key||game.world.heroes[side].hp<=0)return null;
 const s=relationshipState(game,side),r=accessViewerMemory(s.memory,key,{now:game.now(),activate,create:()=>({supporter:{id:p.id,platform:p.platform,name:String(p.name).slice(0,24),avatarKey:p.avatarKey||null},firstAt:game.world.time,lastAt:game.world.time,messages:0,replies:0,deployed:0,kills:0,healing:0,losses:0,shields:0,captures:0,facts:[],exchanges:[],lastRecall:null})});
 if(activate){r.supporter.name=String(p.name).slice(0,24);r.supporter.avatarKey=p.avatarKey||r.supporter.avatarKey;r.lastAt=game.world.time;}return r;
}
export function noteAudiencePresence(game,e){return viewer(game,e.side,e.supporter,true);}
export function noteViewerChat(game,e){
 if(!game.viewerHistory||e.kind!=='chat'||e.eventNotice||!cleanChat(e.text)||!keyOf(e.supporter))return;
 game.viewerHistory.arrived({platform:e.supporter.platform,viewerId:e.supporter.id,name:e.supporter.name,side:e.side,persona:game.world.heroes[e.side].id,eventId:e.id,messageId:e.messageId||null,text:cleanChat(e.text),at:game.now()});
}
export function notePublishedViewerReply(game,item,speech){
 if(!item.eventNotice)game.viewerHistory?.appendReply({eventId:item.id,persona:item.persona,text:speech,at:game.now(),segment:item.partIndex||0});
}
export function noteAudienceArrival(game,e){noteViewerChat(game,e);const r=noteAudiencePresence(game,e);if(r&&!e.eventNotice)r.messages++;}
export function noteAudienceDeparture(game,e){const s=relationshipState(game,e.side),key=keyOf(e.supporter);if(!key)return false;s.pending=s.pending.filter(p=>p.key!==key);return departViewerMemory(s.memory,key,game.now());}
function remember(game,side,r,type,text,id,priority=0){
 const s=relationshipState(game,side),fact={id,type,text,at:game.world.time};
 r.facts=r.facts.filter(f=>f.type!==type);r.facts.push(fact);r.facts=r.facts.slice(-8);r.lastAt=game.world.time;
 const queued=s.pending.find(e=>e.key===keyOf(r.supporter)&&e.type===type);
 if(queued){queued.id=id;queued.at=game.world.time;}
 else if(priority&&game.world.time-(r.spotlights?.[type]??-1e9)>=45000){s.pending.push({key:keyOf(r.supporter),type,id,priority,at:game.world.time});s.pending=s.pending.sort((a,b)=>b.priority-a.priority||a.at-b.at).slice(0,12);}
}
export function refreshRelationships(game){
 const w=game.world;
 for(const side of SIDES){const s=relationshipState(game,side);if(w.heroes[side].hp<=0)continue;
 for(const e of w.supporterEvents?.items||[]){if(e.id<=s.cursor||e.side!==side||e.persona!==s.persona||e.fieldEpoch!==s.fieldEpoch)continue;const r=viewer(game,side,e.supporter);if(!r)continue;
 switch(e.kind){
 case 'deployed':r.deployed++;remember(game,side,r,'deployed',`你在本代已实际派出 ${r.deployed} 名援军`,'event:'+e.id);break;
 case 'heal_hero':r.healing+=e.amount;if(e.critical)remember(game,side,r,'rescue',`我的血量不足三成五时，你的治疗兵为我恢复了 ${e.amount} 点生命`,'event:'+e.id,5);else remember(game,side,r,'healing',`你的治疗兵已为我恢复 ${Math.round(r.healing)} 点生命`,'event:'+e.id);break;
 case 'shield_hero':r.shields+=e.amount;remember(game,side,r,e.critical?'rescue':'shield',`${e.critical?'我的血量不足三成五时，':''}你为我补上了 ${e.amount} 点护盾`,'event:'+e.id,e.critical?5:0);break;
 case 'kill':r.kills++;if(r.kills===1||r.kills%5===0||e.hero)remember(game,side,r,'kills',e.hero?'你的部队完成了对敌方首领的最后一击':`你的部队在本代已经击倒 ${r.kills} 个敌人`,'event:'+e.id,e.hero?5:r.kills>=5?3:0);break;
 case 'troop_lost':r.losses++;if(!w.units.some(u=>u.hp>0&&u.side===side&&keyOf(u.supporter)===keyOf(r.supporter)))remember(game,side,r,'loss','你在场上的部队已经全部阵亡','event:'+e.id,3);break;
 case 'capture':r.captures++;remember(game,side,r,'capture',`你的部队参与${e.restored?'夺回':'占领'}了${e.siteKind==='grain'?'粮仓':'工坊'}`,'event:'+e.id,4);break;
 }
 }
 s.cursor=w.supporterEvents?.serial||s.cursor;
 const a=s.advice;if(a){const h=w.heroes[side];if(w.mode==='settlement')continue;
 if(w.time>=a.until){const r=accessViewerMemory(s.memory,a.key,{now:game.now()});if(r){const moved=distance(h,a.position),damage=Math.max(0,a.hp-h.hp),gap=distance(h,w.heroes[enemy(side)])-a.gap;const outcome=a.enemyPersona!==w.heroes[enemy(side)].id?'敌方首领已经换代，暂不比较行动前后的距离':a.action==='retreat'&&moved>60&&gap>40?'与敌方首领的距离已经拉开':a.action==='advance'&&moved>60&&gap< -60?'与敌方首领的距离已经缩短':h.lastAttackAt>a.at?'这段时间参与了交战':'暂时没有观察到明显的位移或交战变化';
 remember(game,side,r,'advice_result',`我采纳了你的“${ORDER_LABELS[a.action]}”建议，${outcome}${damage>h.maxHP*.1?'；这段时间仍受到明显伤害，不能确定是建议导致的':''}`,'advice:'+a.id,2);}
 delete s.advice;}
 }
 }
 if(w.supporterEvents){const consumed=Math.min(...SIDES.map(side=>relationshipState(game,side).cursor));w.supporterEvents.items=w.supporterEvents.items.filter(e=>e.id>consumed);}
}
export function noteAudienceReply(game,item,speech,action){
 const r=viewer(game,item.side,item.supporter);if(!r)return;
 r.replies++;if(!item.eventNotice)r.exchanges.push({messageId:item.messageId||null,turnId:item.id,text:item.text,reply:speech.slice(0,300),at:game.world.time});r.exchanges=r.exchanges.slice(-6);
 if(item.intent.type==='advice'){
 const s=relationshipState(game,item.side);
 remember(game,item.side,r,'advice',`你建议我${ORDER_LABELS[item.intent.order]}，我${action==='none'?'没有采纳':'采纳了'}`,'reply:'+(item.messageId||item.id));
 if(action!=='none'){const h=game.world.heroes[item.side];s.advice={key:keyOf(item.supporter),action,id:item.messageId||item.id,messageId:item.messageId,enemyPersona:game.world.heroes[enemy(item.side)].id,at:game.world.time,until:game.world.time+12000,hp:h.hp,position:{x:h.x,y:h.y},gap:distance(h,game.world.heroes[enemy(item.side)])};}
 }
}
export function appendAudienceReply(game,item,text){
 const r=viewer(game,item.side,item.supporter);const exchange=r?.exchanges.find(e=>e.turnId===item.id);if(exchange)exchange.reply=(exchange.reply+text).slice(0,300);
}
export function noteAudienceUnanswered(game,item){
 const r=viewer(game,item.side,item.supporter);if(!r||item.eventNotice)return;
 r.exchanges.push({messageId:item.messageId||null,text:item.text,reply:null,at:game.world.time});r.exchanges=r.exchanges.slice(-6);
}
// Presence is based on real chat/join/like/gift activity, never surviving troops.
export function hasRecentAudience(game){return SIDES.some(side=>Object.keys(relationshipState(game,side).memory.active).length>0);}
export function forgetWithdrawnExchanges(game,ids){game.viewerHistory?.withdraw(ids);const deleted=new Set(ids),factIds=new Set(ids.flatMap(id=>['reply:'+id,'advice:'+id]));for(const side of SIDES){const s=relationshipState(game,side);for(const r of allViewerMemoryRecords(s.memory)){r.exchanges=r.exchanges.filter(e=>!deleted.has(e.messageId));r.facts=r.facts.filter(f=>!factIds.has(f.id));}if(deleted.has(s.advice?.messageId))delete s.advice;s.pending=s.pending.filter(e=>!factIds.has(e.id));}}
function factsFor(game,side,r){return r.facts.filter(f=>f.type!=='loss'||!game.world.units.some(u=>u.hp>0&&u.side===side&&keyOf(u.supporter)===keyOf(r.supporter)));}
function summary(game,side,r){return {name:r.supporter.name,platform:r.supporter.platform,replies:r.replies,deployed:r.deployed,kills:r.kills,captures:r.captures,facts:factsFor(game,side,r).slice(-4).map(f=>f.text),previousExchanges:r.exchanges.slice(-4).map(e=>({viewerSaid:e.text,leaderReplied:e.reply}))};}
export function relationshipContext(game,side,supporter,selectedItem=null){
 const s=relationshipState(game,side),key=keyOf(supporter),r=key?activeViewerMemory(s.memory,key,game.now()):null;
 // Personal context is retrieved only for an actual selected audience turn.
 const personal=r?summary(game,side,r):null,item=selectedItem||game.meta.audience?.active?.[side];
 if(personal&&item&&item.supporter.id===supporter.id&&item.supporter.platform===supporter.platform&&game.viewerHistory){
  personal.previousExchanges=game.viewerHistory.recall({platform:supporter.platform,viewerId:supporter.id,side,persona:s.persona,text:item.text,now:game.now(),excludeEventId:item.id,limit:6,maxChars:2800}).map(e=>({viewerSaid:e.viewerSaid,leaderReplied:e.leaderReplied,receivedAt:new Date(e.receivedAt).toISOString(),repliedAt:e.repliedAt===null?null:new Date(e.repliedAt).toISOString()}));
 }
 return {scope:'current_living_leader_only',clock:{now:new Date(game.now()).toISOString(),timeZone:'Asia/Shanghai'},viewer:personal,recentAllies:[]};
}
export function fitRelationshipContext(context){
 const r=context.audience.relationships;
 // Keep current battle observations and the most recent personal evidence first.
 while(Buffer.byteLength(JSON.stringify(context))>11500){
  if(r.recentAllies.length)r.recentAllies.pop();
  else if(r.viewer?.facts.length>1)r.viewer.facts.shift();
  else if(r.viewer?.previousExchanges.length>1)r.viewer.previousExchanges.shift();
  else if(context.audience.recent.length>1)context.audience.recent.shift();
  else if(r.viewer?.previousExchanges.length)r.viewer.previousExchanges.shift();
  else break;
 }
 return context;
}
const eventRemarks={
 rescue:r=>r.facts.find(f=>f.type==='rescue')?.text.includes('护盾')?'这面盾来得正好！差点就交代在这儿了。':'抬上来了……还好，刚才真有点悬。',
 capture:r=>`据点拿到了。${r.supporter.name}这队，顶住！`,
 kills:r=>`${r.supporter.name}这队已经打掉 ${r.kills} 个了。打得比我还凶。`,
 loss:()=> '那一队全倒了……得换条路，不能再这么送了。',
 advice_result:r=>r.facts.find(f=>f.type==='advice_result').text.includes('明显伤害')?'退了还是挨打，这位置不对。':null
};
export function relationshipReply(game,item){
 if(!asksMemory(item.text)&&!asksRecord(item.text))return null;
 const s=relationshipState(game,item.side),key=keyOf(item.supporter),r=key?activeViewerMemory(s.memory,key,game.now()):null;if(!r)return {speech:'一时没想起来，你提醒我一句？',audio:null,action:'none'};
 if(/我的战绩|我的战功|我的贡献/.test(item.text)&&(r.deployed||r.kills||r.captures))return {speech:`你这边出了 ${r.deployed} 名援军，打掉 ${r.kills} 个，参与拿了 ${r.captures} 次据点。`,audio:null,action:'none'};
 const f=factsFor(game,item.side,r).filter(f=>f.type!=='advice').sort((a,b)=>b.at-a.at)[0];
 if(f){r.lastRecall=f.id;const fact=f.text;return {speech:`${asksMemory(item.text)?'记得，':''}${fact}。`,audio:null,action:'none'};}
 const last=r.exchanges.filter(e=>!asksMemory(e.text)).at(-1);
 if(last&&asksMemory(item.text))return {speech:`记得，你说过“${last.text.slice(0,30)}”。`,audio:null,action:'none'};
 return {speech:asksMemory(item.text)?'一时没想起来，你提醒我一句？':'还没有记下你的战功。',audio:null,action:'none'};
}
export function spotlightSupporter(game){
 const w=game.world;if(w.generatedSpeechOnly||w.paused||['settlement','inspection'].includes(w.mode))return;
 for(const side of SIDES){const s=relationshipState(game,side);if(w.heroes[side].hp<=0||w.time<s.nextSpotlight||game.meta.audience?.active?.[side]||game.meta.audience?.pending?.some(m=>m.side===side))continue;
 s.pending=s.pending.filter(e=>w.time-e.at<45000&&activeViewerMemory(s.memory,e.key,game.now()));
 const e=s.pending.shift();if(!e)continue;const r=activeViewerMemory(s.memory,e.key,game.now()),f=factsFor(game,side,r).find(f=>f.id===e.id);if(!f||!eventRemarks[e.type])continue;
 const text=eventRemarks[e.type](r)?.slice(0,80);if(!cleanChat(text))continue;r.lastRecall=e.id;r.spotlights??={};r.spotlights[e.type]=w.time;s.nextSpotlight=w.time+18000;w.audienceSpeakingUntil??={};w.audienceSpeakingUntil[side]=w.time+7500;
 w.speech.push({id:++w.serial,side,persona:s.persona,text,spokenText:text,audio:null,at:w.time,until:w.time+7500,community:true,conversationMode:'event_reaction',evidence:{kind:e.type,id:e.id},supporter:{name:r.supporter.name,platform:r.supporter.platform}});w.speech=w.speech.slice(-12);
 }
}
