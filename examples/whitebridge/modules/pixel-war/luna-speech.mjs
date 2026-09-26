import {localLeaderCue,localBubble,tickLocalBubbles} from './local-bubbles.mjs';
import {applyObserver} from '../live-runtime/show-observer.mjs';
import {applyDebate,tickDebate} from '../live-runtime/show-debate.mjs';
import {LEADER_IDENTITY_VERSION} from './leader-lineage.mjs';
// Model dialogue retains provenance; observer mode uses silent game-event bubbles.
import {voiceSegments} from '../live-runtime/speech-turn.mjs';
import {LUNA_MODEL,INSTANT_MODEL,isCommanderModel} from '../live-runtime/model-identity.mjs';
export {LUNA_MODEL,INSTANT_MODEL,isCommanderModel};
export const CUES={
 reinforcement:'本方又有真实玩家部署到场。根据 facts 的玩家名与援军种类作反应，可朝对手得意或向援军喊话；不是第一次叫外援，不捏造玩家提问、金额或胜负。',
 support:'玩家刚对首领发动支援或定向打击。根据本次 facts 说出反应，不捏造付费金额、伤害和观众问题。',
 opening:'开场，对敌方短促挑衅；尚无人帮忙，不声称观众发言。',
 opening_reply:'开场，回敬敌将的挑衅，别背世界观。',
 help_accuse:'敌方第一次获得玩家外援；抱怨他单挑叫外援，不假定援军具体形态，不编造金额。',
 help_boast:'自己第一次获得玩家外援；得意地回敬对手，不假装观众问了问题。',
 arrival:'你是刚战败角色的父辈，刚来接手。用一句话介绍辈分并挑衅；不说已发生了尚未发生的伤害。',
 defeat:'你刚战败，要退场；短促嘴硬或自嘲，不催礼物。',
 victory:'你刚获胜；得意一下，不编造具体斩将者。',
 hurt:'刚受了伤，依据此条件嘀咕或骂对手，不假定部位、武器和观众。',
 destruction:'刚刚发生地形破坏；短促反应，不编造道路一定通了。',
 resource:'刚取得地图资源；一句短促反应，不说未经确认的资源名。',
 monologue:'无人发言时接着自己的念头嘀咕，对敌将嘴硬或说自己担心的事。可预存，不能断言还没开打、刚打中、对手已退、尚无人帮忙等会变化的状态；不回答不存在的观众，不重复身份介绍，不凭空完成动作。',
 troop_attack:'小兵正向敌兵下手，短促骂一声，凶一点；不喊整齐的战斗口号，不指定武器、不虚构结果。',
 troop_hurt:'小兵刚挨打，吃痛骂人；别喊我还能战或宣誓。',troop_advance:'小兵正在前进的短促喊声。',
 troop_retreat:'小兵收到自己主人的撤退指令，短促回应。',troop_guard:'小兵收到守护首领的指令，短促回应。',
 troop_revive:'小兵被复活，缓过一口气的短促反应，别喊又能战了。',troop_level_up:'小兵确实变强了，短促地朝敌人放狠话，不讲等级，不喊力量来了，不谈游戏系统。'
};
const sides=['demon','human'];
export function speechState(w){return w.lunaSpeech??={version:1,personas:{},cache:[],pending:[],history:[],seen:{},nextAt:0,lastIdle:0,serial:0,lastRequestAt:-1e12,retryAt:0,packs:{}};}
export function enableLunaSpeech(w){w.generatedSpeechOnly=true;const s=speechState(w);if(s.identityVersion!==LEADER_IDENTITY_VERSION){s.cache=[];s.coverage={};s.packs={};s.continuation=null;s.identityVersion=LEADER_IDENTITY_VERSION;}w.speech=(w.speech||[]).filter(l=>isCommanderModel(l.model)||w.speechMode==='observer'&&localBubble(l));w.chatter=(w.chatter||[]).filter(l=>isCommanderModel(l.model)||w.speechMode==='observer'&&localBubble(l));w.sceneSpeakingUntil=0;s.personas??={};for(const side of sides)s.personas[side]??=w.heroes[side].id;s.packs??={};if(!s.cache.length&&!w.units.some(u=>u.hp>0)){for(const side of sides)cueSpeech(w,side,side==='demon'?'opening':'opening_reply',null,{priority:3,ttl:90000});}return s;}
export function cueSpeech(w,side,cue,facts=null,{priority=1,ttl=30000}={}){
 if(w.speechMode==='observer')return localLeaderCue(w,side,cue);
 if(!w.generatedSpeechOnly||!CUES[cue]||!w.heroes[side])return false;const s=speechState(w),persona=w.heroes[side].id,key=persona+':'+cue;
 if((s.seen[key]??-Infinity)+((priority>=3)?1000:18000)>w.time||s.pending.some(q=>q.persona===persona&&q.cue===cue))return false;
 s.seen[key]=w.time;s.pending.push({id:'cue-'+(++s.serial),side,persona,cue,facts,priority,at:w.time,until:w.time+ttl});s.pending=s.pending.sort((a,b)=>b.priority-a.priority||a.at-b.at).slice(0,24);return true;
}
function usable(w,c){return isCommanderModel(c.model)&&w.heroes[c.side]?.id===c.persona&&c.until>w.time;}
function take(w,side,cue,{reuse=false}={}){const s=speechState(w),c=s.cache.find(c=>c.side===side&&c.cue===cue&&usable(w,c)&&!c.future&&(!c.used||reuse));if(!c)return null;c.used=true;c.uses=(c.uses||0)+1;return c;}
export function generatedTroopShout(w,u,event){
 if(!w.generatedSpeechOnly||u.hp<=0||u.kind==='hero'||!sides.includes(u.side))return false;
 const key=({attack:'troop_attack',hurt:'troop_hurt',advance:'troop_advance',retreat:'troop_retreat',guard:'troop_guard',revive:'troop_revive',level_up:'troop_level_up'})[event];if(!key)return false;
 w.nextChatter??={};if(w.time<(u.nextChatter||0)||w.time<(w.nextChatter[u.side]||0))return false;
 const line=take(w,u.side,key,{reuse:true});if(!line)return false;
 u.nextChatter=w.time+6500;w.nextChatter[u.side]=w.time+1100;w.chatter??=[];w.chatter=w.chatter.filter(l=>l.until>w.time&&l.unitId!==u.id).slice(-17);
 w.chatter.push({id:++w.serial,unitId:u.id,side:u.side,event,text:line.text,model:line.model,generationId:line.generationId,at:w.time,until:w.time+2400,priority:u.supporter?.id?3:1});return true;
}
export function tickLunaSpeech(w,{voice=false}={}){
 if(!w.generatedSpeechOnly||w.paused||w.mode==='inspection')return;tickDebate(w);if(w.speechMode==='observer'){tickLocalBubbles(w);return;}const s=speechState(w);
 for(const side of sides){const h=w.heroes[side];if(s.personas[side]!==h.id){s.personas[side]=h.id;s.cache=s.cache.flatMap(c=>c.side!==side?[c]:c.cue==='arrival'&&c.future&&c.persona!==h.id&&!c.used&&c.until>w.time?[{...c,persona:h.id,future:false}]:[]);s.pending=s.pending.filter(q=>q.side!==side||q.persona===h.id);s.seen=Object.fromEntries(Object.entries(s.seen).filter(([k])=>sides.some(x=>k.startsWith(w.heroes[x].id+':'))));if(w.mode!=='settlement'&&!w.warDrama?.seenSupport?.includes(h.id))cueSpeech(w,side,side==='demon'?'opening':'opening_reply',null,{priority:3,ttl:90000});}}
 if(s.continuation&&(s.continuation.persona!==w.heroes[s.continuation.side]?.id||w.heroes[s.continuation.side].hp<=0||Object.values(w.audienceWaiting||{}).some(Boolean)||Object.values(w.audienceSpeakingUntil||{}).some(t=>t>w.time)))s.continuation=null;
 s.cache=s.cache.filter(c=>usable(w,c));s.pending=s.pending.filter(q=>q.until>w.time&&q.persona===w.heroes[q.side]?.id&&(w.heroes[q.side].hp>0||q.cue==='defeat'));
 if(w.time<(w.sceneSpeakingUntil||0)||w.time<s.nextAt||Object.values(w.audienceSpeakingUntil||{}).some(t=>t>w.time)||Object.values(w.audienceWaiting||{}).some(Boolean))return;
 if(!w.showDebate?.active&&!s.pending.some(q=>q.priority>=3||q.cue==='monologue')&&w.mode!=='settlement'&&w.time-s.lastIdle>12000){const preferred=sides[Math.floor(w.time/12000)%2],side=[preferred,...sides.filter(side=>side!==preferred)].find(side=>s.cache.some(c=>c.side===side&&c.cue==='monologue'&&!c.used&&usable(w,c)));if(side)cueSpeech(w,side,'monologue',null,{ttl:12000});s.lastIdle=w.time;}
 // Preserve conversational order. A reply cannot leapfrog its ungenerated question.
 const sequence=s.continuation,paired=['opening','opening_reply','help_accuse','help_boast'];
 const q=sequence||s.pending.find((q,i)=>s.cache.some(c=>c.side===q.side&&c.cue===q.cue&&usable(w,c)&&!c.future&&!c.used)&&(!paired.includes(q.cue)||!s.pending.slice(0,i).some(p=>paired.includes(p.cue))));if(!q)return;const line=sequence?sequence.line:take(w,q.side,q.cue);if(!line)return;
 if(!sequence)s.pending.splice(s.pending.indexOf(q),1);const index=sequence?.index||0,raw=[line.text,...(line.continuations||[])],parts=sequence?.playbackParts||(voice?voiceSegments(raw):raw),text=parts[index];s.continuation=index+1<parts.length?{...q,line,index:index+1,playbackParts:parts}:null;const published={id:++w.serial,side:q.side,persona:q.persona,text,spokenText:text,segment:index+1,segments:parts.length,model:line.model,generationId:line.generationId,generatedAt:line.generatedAt,preloaded:true,cue:q.cue,duologue:['opening','opening_reply','help_accuse','help_boast'].includes(q.cue),audio:null,audioMode:voice?'synthesizing':'subtitle_only',at:w.time,until:w.time+(voice?23000:Math.max(3300,Math.min(8000,1300+text.length*110))),conversationMode:'event_reaction',evidence:{kind:q.cue,facts:q.facts}};
 w.speech.push(published);w.speech=w.speech.slice(-12);s.nextAt=published.until+300;w.sceneSpeakingUntil=published.until;
 // The existing voice completion fence uses this active speaker identifier.
 w.warDrama??={seenSupport:[],history:[],queue:[]};w.warDrama.speaking=published.id;w.warDrama.nextAt=s.nextAt;
 s.history.push({side:q.side,persona:q.persona,text,cue:q.cue,at:w.time,generationId:line.generationId});s.history=s.history.slice(-8);
}
export function prepareSpeechRequest(w,now,{openingOnly=false,essentialOnly=false,ambientInterval=0,excludeSides=[],parallel=false,standby=false,troopsOnly=false}={}){
 if(w.speechMode==='observer')return null;const s=speechState(w);s.packs??={};s.coverage??={};s.sideRetry??={};if(!w.generatedSpeechOnly||w.paused&&!standby||w.mode==='inspection'||now<s.retryAt||!parallel&&now-s.lastRequestAt<10000)return null;
 const eligible=sides.filter(side=>!excludeSides.includes(side)).map(side=>{
  const h=w.heroes[side],blockedCues=s.uncertainCues?.[h.id]||[],needed=s.pending.filter(q=>q.side===side&&q.persona===h.id&&q.until>w.time&&!s.cache.some(c=>c.side===side&&c.cue===q.cue&&usable(w,c)&&!c.used)).map(q=>q.cue).filter(cue=>!blockedCues.includes(cue));
  const missing=Object.keys(CUES).filter(cue=>!blockedCues.includes(cue)&&!['support','reinforcement'].includes(cue)&&!(s.coverage[h.id]||[]).includes(cue)),initial=missing.length>0,due=now-(s.packs[h.id]||0)>=120000;
  const core=initial?['monologue',...missing.filter(c=>c!=='monologue')].filter(c=>missing.includes(c)):due?['monologue','hurt','destruction','resource','troop_attack','troop_hurt']:[];
  // A real reinforcement is audience work, not idle preload. The broker still enforces the full budget.
  const urgent=s.pending.filter(q=>q.side===side&&q.persona===h.id&&q.until>w.time&&q.priority>=3&&q.facts?.receipt&&needed.includes(q.cue)).map(q=>q.cue);
  const ambientDue=now-((parallel?s.ambientBySide?.[side]:s.lastAmbientRequestAt)??-1e12)>=ambientInterval;
  const essentials=[...['monologue'].filter(cue=>!s.cache.some(c=>c.side===side&&c.cue===cue&&usable(w,c)&&!c.used)),...needed.filter(cue=>!cue.startsWith('troop_')), ...['hurt'].filter(cue=>!s.cache.some(c=>c.side===side&&c.cue===cue&&usable(w,c)&&!c.used))];
  const keys=troopsOnly?(ambientDue&&(!s.troopPacks?.[h.id]||now-s.troopPacks[h.id]>90000)?Object.keys(CUES).filter(c=>c.startsWith('troop_')):[]):urgent.length?[...new Set(urgent)].slice(0,1):essentialOnly?(ambientDue?[...new Set(essentials)].filter(cue=>!blockedCues.includes(cue)).slice(0,1):[]):openingOnly?(h.rank===0&&!(s.coverage[h.id]||[]).includes(side==='demon'?'opening':'opening_reply')?[side==='demon'?'opening':'opening_reply','monologue']:[]):[...new Set([...needed,...core])].filter(cue=>!blockedCues.includes(cue)&&(initial||needed.includes(cue)||due)).slice(0,1);
  const blocked=s.uncertainCues?.[h.id]||[];return {side,h,keys:keys.filter(cue=>!blocked.includes(cue)),needed,priority:urgent.length?20:needed.length?10:0,queueOrder:s.pending.findIndex(q=>q.side===side&&keys.includes(q.cue))};
 }).filter(v=>v.keys.length&&(v.priority>=20||now-((parallel?s.ambientBySide?.[v.side]:s.lastAmbientRequestAt)??-1e12)>=ambientInterval)&&now>=(s.sideRetry[v.side]||0)).sort((a,b)=>Number(b.priority>=20)-Number(a.priority>=20)||(s.packs[a.h.id]||0)-(s.packs[b.h.id]||0)||b.priority-a.priority||((a.queueOrder<0?Infinity:a.queueOrder)-(b.queueOrder<0?Infinity:b.queueOrder))||b.keys.length-a.keys.length);
 const v=eligible[0];if(!v)return null;s.lastRequestAt=now;if(v.priority<20){s.lastAmbientRequestAt=now;s.ambientBySide??={};s.ambientBySide[v.side]=now;}return {id:'luna-pack-'+(++s.serial),kind:'preload',side:v.side,persona:v.h.id,at:w.time,items:v.keys.map(cue=>({cue,condition:cue==='arrival'?(v.needed.includes(cue)?'当前角色刚作为父辈赶来；上一代名字未知时，只说你刚打那位的爹。':'未来由当前角色的下一位父辈说：自称给定 name 的爹。'):CUES[cue],delivery:cue==='arrival'&&!v.needed.includes(cue)?'successor':'current',limit:cue.startsWith('troop_')?14:48})),recent:s.history.slice(-4),facts:s.pending.filter(q=>q.side===v.side).slice(0,3).map(q=>({cue:q.cue,facts:q.facts})),generationTime:now};
}
export function applySpeechPack(w,request,result,now){
 if(request.commentary)return applyObserver(w,request,result,now);
 if(w.speechMode==='observer')return false;
 if(request.duet)return applyDebate(w,request,result,now);
 const s=speechState(w);if(result?.reason==='electron_turn_uncertain'){s.uncertainCues??={};s.uncertainCues[request.persona]=[...new Set([...(s.uncertainCues[request.persona]||[]),...request.items.map(i=>i.cue)])];s.uncertainCues=Object.fromEntries(Object.entries(s.uncertainCues).filter(([id])=>sides.some(side=>w.heroes[side].id===id)));}if(!result?.ok||!isCommanderModel(result.model)||request.persona!==w.heroes[request.side]?.id){s.sideRetry??={};s.sideRetry[request.side]=now+12000;return false;}
 const pack=result.decision;if(pack.requestId!==request.id||!Array.isArray(pack.lines))return false;
 if(request.items.every(i=>i.cue.startsWith('troop_'))){s.troopPacks??={};s.troopPacks[request.persona]=now;}
 s.coverage??={};s.coverage[request.persona]=[...new Set([...(s.coverage[request.persona]||[]),...request.items.map(i=>i.cue)])];s.coverage=Object.fromEntries(Object.entries(s.coverage).filter(([id])=>sides.some(side=>w.heroes[side].id===id)));s.packs??={};s.packs[request.persona]=now;s.packs=Object.fromEntries(Object.entries(s.packs).filter(([id])=>sides.some(side=>w.heroes[side].id===id)));const allowed=new Set(request.items.map(i=>i.cue));s.cache=s.cache.filter(c=>c.side!==request.side||!allowed.has(c.cue));for(const line of pack.lines){if(!allowed.has(line.cue)||typeof line.text!=='string'||!line.text.trim()||line.text.length>(line.cue.startsWith('troop_')?14:48)||/https?:|www\.|[\u0000-\u001f]/.test(line.text))continue;s.cache.push({side:request.side,persona:request.persona,cue:line.cue,text:line.text,continuations:(line.continuations||[]).filter(t=>typeof t==='string'&&t.length<=48).slice(0,line.cue.startsWith('troop_')?0:2),future:request.items.find(i=>i.cue===line.cue)?.delivery==='successor',model:result.model,generationId:request.id,generatedAt:now,until:w.time+(line.cue==='monologue'?120000:600000),used:false});}
 s.cache=s.cache.slice(-100);s.retryAt=0;s.sideRetry??={};s.sideRetry[request.side]=0;return true;
}
