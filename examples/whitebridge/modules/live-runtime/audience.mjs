import {HOST_PASSAGE_MAX_CHARS} from './host-spoken-style.mjs';
import {arrivalContext,narratableArrival} from './summoner-reactions.mjs';
import {rememberObserverSpoken,forgetObserverSpoken} from './observer-topics.mjs';
import {interactionFeedback} from './interaction-feedback.mjs';
import {MODEL_CLIENT_MS,MODEL_QUEUE_MS} from './model-timing.mjs';
import {speechDuration,safePublishedText} from './speech-turn.mjs';
import {isCommanderModel} from '../pixel-war/luna-speech.mjs';
import {cleanChat,chatIntent,ORDER_LABELS} from '../pixel-war/public/chat-commands.mjs';
import {commandOwnedTroops,heroAdvice} from '../pixel-war/viewer-troops.mjs';
import {characterReply,topicReply} from './conversation.mjs';
import LINES from '../duel-preview/battle-lines.json' with {type:'json'};
import {FREE_CHAT_TTL_MS,ARRIVAL_TTL_MS,PAID_CHAT_TTL_MS,MAX_PREPARED_PER_SIDE,MAX_PREPARED_TOTAL,sameViewer,viewerTurnKey,narrationExpired,narrationPriority,replyPacing} from './audience-pacing.mjs';
import {noteAudienceArrival,noteAudienceReply,appendAudienceReply,noteAudienceUnanswered,relationshipReply,forgetWithdrawnExchanges,refreshRelationships,notePublishedViewerReply} from './relationships.mjs';
const sides=['demon','human'];
const awaitingPage=game=>game.runtime?.modelReason==='electron_page_warming';
export function audienceState(game){return game.meta.audience??={pending:[],active:{},history:[],nextFree:{demon:0,human:0},serial:0};}
function finish(a,item,status,at){a.history.push({id:item.id,messageId:item.messageId,side:item.side,persona:item.persona,supporter:item.supporter,text:item.text,amountMilli:item.amountMilli,status,reply:item.presentedText||null,model:item.model||null,modelStarted:!!item.modelStarted,fallbackReason:item.fallbackReason||null,replyMode:item.replyMode||null,audioMode:item.audioMode||null,at});a.history=a.history.slice(-16);}
export function withdrawAudience(game,ids){
 forgetWithdrawnExchanges(game,ids);
 const a=audienceState(game),removed=new Set(ids);const revoked=[...a.pending,...Object.values(a.active),...a.history].filter(m=>removed.has(m.messageId)).map(m=>m.id);a.revoked=[...new Set([...(a.revoked||[]),...revoked])].slice(-64);game.world.speech=game.world.speech.filter(s=>!a.revoked.includes(s.audienceId));a.pinned=(a.pinned||[]).filter(m=>!removed.has(m.messageId));
 forgetObserverSpoken(game.world,[...ids,...revoked]);
 a.pending=a.pending.filter(m=>!removed.has(m.messageId));
 for(const side of sides){const item=a.active[side];if(item&&removed.has(item.messageId)){game.world.speech=game.world.speech.filter(s=>s.audienceId!==item.id);delete a.active[side];if(game.world.audienceSpeakingUntil)game.world.audienceSpeakingUntil[side]=0;}}
 a.history=a.history.filter(m=>!removed.has(m.messageId));return {status:'withdrawn'};
}
export function receiveChat(game,e){
 if(!narratableArrival(e))return {status:'silent_arrival'};
 const text=cleanChat(e.text);if(!text)return {status:'rejected_text'};
 const a=audienceState(game),w=game.world,intent=chatIntent(text);
 if(!e.eventNotice)noteAudienceArrival(game,e);
 if(e.platform==='bilibili'&&e.messageId&&Number.isSafeInteger(e.pinStart)&&Number.isSafeInteger(e.pinEnd)&&e.pinEnd>game.now()){a.pinned=(a.pinned||[]).filter(m=>m.end>game.now()&&m.messageId!==e.messageId);a.pinned.push({messageId:e.messageId,side:e.side,supporter:e.supporter,text,amountMilli:e.amountMilli,start:e.pinStart,end:e.pinEnd});a.pinned=a.pinned.sort((a,b)=>b.amountMilli-a.amountMilli).slice(0,200);}
 if(Object.keys(game.meta.cooldowns).length>4000)game.meta.cooldowns=Object.fromEntries(Object.entries(game.meta.cooldowns).filter(([,at])=>game.now()-at<60000).slice(-3500));
 let command=null;
 if(intent.type==='troops'){
  const key='troops:'+e.side+':'+e.supporter.id,previous=game.meta.cooldowns[key]??-1e9;
  if(game.now()-previous<1500)command={status:'command_cooldown',count:0};
  else {command=commandOwnedTroops(w,e.side,e.supporter.id,intent.order,e.faction||null);game.meta.cooldowns[key]=game.now();}
 }
 const paid=Number.isSafeInteger(e.amountMilli)&&e.amountMilli>0;
 // Commands never require paying and never create troops, points or damage.
 if(intent.type==='troops'&&!paid){if(command.status!=='command_cooldown')game.log({side:e.side,source:e.platform,text:e.supporter.name+'：'+(command.count?command.count+' 名部队已'+ORDER_LABELS[intent.order]:command.status==='battle_paused'?'战斗交接中，开战后再发指令':'当前没有存活部队，可先派援军')});return {...command,intent};}
 const previous=a.pending.filter(m=>m.side===e.side&&m.supporter.platform===e.supporter.platform&&m.supporter.id===e.supporter.id&&(!m.amountMilli||e.eventNotice==='arrival')&&(m.eventNotice||null)===(e.eventNotice||null)).at(-1);
 if((!paid||e.eventNotice==='arrival')&&previous){a.pending=a.pending.filter(m=>m!==previous);finish(a,previous,'sampled_out',w.time);}
 const ttl=e.eventNotice==='arrival'?ARRIVAL_TTL_MS:paid?PAID_CHAT_TTL_MS:FREE_CHAT_TTL_MS;
 const item={id:e.id,messageId:e.messageId||null,eventNotice:e.eventNotice||null,...(e.arrival?{arrival:e.arrival}:{}),seq:++a.serial,side:e.side,faction:e.faction,factionName:e.factionName,supporter:e.supporter,text,intent,amountMilli:paid?Math.min(e.amountMilli,1e12):0,at:w.time,expires:w.time+ttl,receivedAt:game.now(),deadline:game.now()+ttl,source:e.platform};
 a.pending.push(item);if(!e.eventNotice)interactionFeedback(game,e,'reply_waiting');
 const group=a.pending.filter(m=>!!m.amountMilli===paid).sort(narrationPriority);
 for(const overflow of group.slice(paid?200:64)){a.pending=a.pending.filter(m=>m!==overflow);finish(a,overflow,'queue_full',w.time);}
 return {status:a.pending.includes(item)?'message_queued':'queue_full',paid,command};
}
export const priority=(a,b)=>b.amountMilli-a.amountMilli||a.seq-b.seq;
export function audienceItem(game,side,id){const a=audienceState(game);return a.active[side]?.id===id?a.active[side]:a.pending.find(m=>m.side===side&&m.id===id);}
export function selectedAudience(game,side,item){const m=item||audienceState(game).active[side];return m&&(m.phase==='waiting_model'||item)?{id:m.id,text:m.text,supporter:m.supporter.name,notice:m.eventNotice,...(m.arrival?{arrival:arrivalContext(game,m)}:{}),paid:m.amountMilli>0,advice:m.intent.type==='advice'?m.intent.order:null}:null;}
export function audienceModelStarted(game,side,id){
 const m=audienceItem(game,side,id);if(m?.id!==id||m.phase!=='waiting_model'||m.modelStarted||narrationExpired(game,m))return;
 m.modelStarted=true;m.until=Math.max(m.until,game.world.time+MODEL_CLIENT_MS);
 // Admission late in the queue must leave time for the request to finish.
 // Unsent messages retain their short TTL; repeated starts cannot renew it.
 const cap=(m.receivedAt??game.now())+(m.eventNotice==='arrival'?75000:m.amountMilli?PAID_CHAT_TTL_MS:60000);
 const deadline=Math.min(cap,Math.max(m.deadline||0,game.now()+25000));
 m.expires+=Math.max(0,deadline-(m.deadline||deadline));m.deadline=deadline;
}
export function audienceModelFailed(game,side,id,reason){const a=audienceState(game),m=audienceItem(game,side,id);if(!m||m.phase!=='waiting_model'||m.persona!==game.world.heroes[side].id)return false;m.until=game.world.time;m.fallbackReason=reason||'model_unavailable';interactionFeedback(game,m,'reply_failed');if(a.pending.includes(m)){a.pending=a.pending.filter(v=>v!==m);finish(a,m,'unanswered',game.world.time);noteAudienceUnanswered(game,m);}return true;}
export function pruneAudienceQueue(game){
 const a=audienceState(game),w=game.world;
 // Retire free-enlist narration saved by older versions, including prefetched
 // voice. Troops, visual feedback and the viewer's actual chat are untouched.
 for(const item of [...a.pending,...Object.values(a.active)])if(!narratableArrival(item)){
  a.pending=a.pending.filter(m=>m!==item);if(a.active[item.side]===item)delete a.active[item.side];
  w.speech=w.speech.filter(l=>l.audienceId!==item.id);
  if(w.audienceSpeakingUntil)w.audienceSpeakingUntil[item.side]=0;
  finish(a,item,'silent_arrival',w.time);
 }
 a.pending=a.pending.filter(m=>{const retired=m.arrival&&m.arrival.field!==w.fieldEpoch||m.persona&&(m.persona!==w.heroes[m.side].id||w.heroes[m.side].hp<=0);if(!retired&&!narrationExpired(game,m))return true;finish(a,m,retired?'persona_retired':'expired',w.time);return false;});
}
// Always run independently of speech completion. Never speculate a second
// turn for the same viewer before the preceding reply has been published.
export function nextAudiencePreparation(game,{blockedViewers=new Set()}={}){
 const a=audienceState(game),w=game.world;if(w.paused||['settlement','inspection'].includes(w.mode)||!game.runtime?.modelEnabled)return null;
 pruneAudienceQueue(game);
 const direct=Object.values(a.active).filter(m=>m.phase==='waiting_model'&&!m.modelStarted&&!blockedViewers.has(viewerTurnKey(m))).sort(narrationPriority)[0];
 if(direct)return {side:direct.side,item:direct,prefetch:false};
 const prepared=a.pending.filter(m=>m.phase);
 if(prepared.length>=MAX_PREPARED_TOTAL)return null;
 const candidate=a.pending.filter(m=>!m.phase&&!blockedViewers.has(viewerTurnKey(m))&&w.heroes[m.side].hp>0&&prepared.filter(v=>v.side===m.side).length<MAX_PREPARED_PER_SIDE&&!Object.values(a.active).some(v=>sameViewer(v,m))&&!prepared.some(v=>sameViewer(v,m))).sort(narrationPriority)[0];
 if(!candidate)return null;
 Object.assign(candidate,{persona:w.heroes[candidate.side].id,phase:'waiting_model',until:w.time+MODEL_QUEUE_MS});
 return {side:candidate.side,item:candidate,prefetch:true};
}
export function storePreparedReply(game,context,decision,model){
 const a=audienceState(game),m=a.pending.find(v=>v.id===context.audience.selected.id&&v.side===context.side);
 if(!m||m.phase!=='waiting_model'||m.persona!==context.persona||narrationExpired(game,m))return false;
 reserveReplyPlayback(game,m);m.phase='ready';m.model=model;m.prepared={context,decision};return true;
}
// An answer generated inside its freshness window needs time for local TTS.
// Reserve once, only after actual text exists; unsent/failed work never gets
// extra queue life. A free reply still cannot start over one minute later.
function reserveReplyPlayback(game,item){
 if(!game.runtime?.voiceEnabled||item.playbackReserved||narrationExpired(game,item))return;
 item.playbackReserved=true;
 const cap=(item.receivedAt??game.now())+(item.eventNotice==='arrival'?75000:item.amountMilli?PAID_CHAT_TTL_MS:60000);
 const deadline=Math.min(cap,Math.max(item.deadline||0,game.now()+35000));
 const extra=Math.max(0,deadline-(item.deadline||deadline));
 item.deadline=deadline;item.expires+=extra;
}
export function recoverAudiencePreparation(game){
 const a=audienceState(game);
 // Never replay a model request whose old process lost its completion. Ready
 // text is reusable within its original deadline, but audio buffers are not.
 a.pending=a.pending.filter(m=>{delete m.preparedVoice;delete m.voicePreparedAttempted;if(m.phase==='waiting_model'&&m.modelStarted){m.fallbackReason='interrupted_request';finish(a,m,'unanswered',game.world.time);return false;}if(m.phase==='waiting_model')delete m.phase;return true;});
 for(const m of Object.values(a.active)){delete m.preparedVoice;delete m.voicePreparedAttempted;if(m.phase==='waiting_model'&&m.modelStarted){m.phase='unanswered';m.fallbackReason='interrupted_request';m.until=game.world.time;}}
}
export function fallbackReply(game,item){
 if(item.intent.type==='chat'&&!item.eventNotice){const recalled=relationshipReply(game,item);if(recalled)return {...recalled,speech:recalled.speech.slice(0,80)};}
 const h=game.world.heroes[item.side],action=item.intent.type==='advice'?item.intent.order:'none';
 const accepted=action==='retreat'||action==='guard'||h.hp/h.maxHP>.28;
 const event=action==='none'?'Chat':accepted?({advance:'Advance',retreat:'Retreat',attack:'Attack',guard:'Guard'})[action]:'Refuse';
 const key=item.side+'Audience'+event;
 let speech=LINES[key]?.text||'听见了，先让我应付眼前这群。',audio=key;
 if(action==='none'){speech=item.eventNotice?'收到了，援军到了我会看着接应。':characterReply(game,item.side,item.text)||topicReply(item.side,item.text);audio=null;}
 return {speech,audio,action:accepted?action:'none'};
}
function resolveLocally(game,item){
 const r=game.world.generatedSpeechOnly?{}:fallbackReply(game,item);
 item.fallbackReason=item.fallbackReason||game.runtime?.modelReason||(item.modelStarted?'model_timeout':'model_unavailable');
 if(r.speech)return replyAudience(game,item.id,r.speech,r);
 item.phase='unanswered';item.replyMode='none';item.reaction=null;item.until=game.world.time+1200;
 noteAudienceUnanswered(game,item);
}
function publishReplySegment(game,item){
 const w=game.world,speech=item.parts[item.partIndex],first=item.partIndex===0,dynamic=!!game.runtime?.voiceEnabled;
 const spokenText=w.generatedSpeechOnly||item.eventNotice==='arrival'?speech:!first?speech:item.eventNotice?`收到${item.supporter.name}的礼物。${speech}`:`${item.supporter.name}说：${item.text}。${speech}`;
 const line={id:++w.serial,field:w.fieldEpoch,deadline:item.deadline,amountMilli:item.amountMilli,seq:item.seq,eventNotice:item.eventNotice,side:item.side,...(w.speechMode==='observer'?{performer:'empress'}:{}),persona:item.persona,text:speech,spokenText,audienceId:item.id,quote:first?{text:item.text,supporter:item.supporter,paid:item.amountMilli>0,notice:item.eventNotice}:null,model:item.model,audio:dynamic?null:item.replyAudio,fallbackAudio:item.replyAudio,audioMode:dynamic?'synthesizing':item.replyAudio?'prerecorded_reply':'subtitle_only',replyMode:item.model?'model':'local',fallbackReason:item.model?null:item.fallbackReason,at:w.time,until:w.time+(dynamic?35000:item.parts.length>1?speechDuration(speech):9000),action:first?item.action:'none',segment:item.partIndex+1,segments:item.parts.length};
 item.audioMode=line.audioMode;item.phase=dynamic?'synthesizing':'speaking';item.until=line.until;item.reaction=first?speech:item.reaction+speech;
 if(!dynamic)rememberPublishedSegment(game,item,line);
 w.audienceSpeakingUntil??={};w.audienceSpeakingUntil[item.side]=item.until;
 w.speech=w.speech.filter(s=>s.audienceId!==item.id);w.speech.push(line);w.speech=w.speech.slice(-12);return line;
}
function rememberPublishedSegment(game,item,line){
 if(line.memoryCommitted)return;line.memoryCommitted=true;item.presentedText=(item.presentedText||'')+line.text;
 if(line.segment===1)noteAudienceReply(game,item,line.text,item.action);else appendAudienceReply(game,item,line.text);
 notePublishedViewerReply(game,item,line.text);
 if(line.performer==='empress')rememberObserverSpoken(game.world,line.text,{audienceId:item.id,messageId:item.messageId});
}
export function audienceReplyParts(game,parts){
 const pacing=replyPacing(game),maxChars=game.world.speechMode==='observer'?Math.min(pacing.maxChars,HOST_PASSAGE_MAX_CHARS):pacing.maxChars;
 // Each cancellable bubble is a complete thought, never a fixed-width chunk.
 // This lets a new viewer suppress follow-ups without leaving half a sentence.
 const thoughts=parts.flatMap(text=>text.length<=24||pacing.mode==='quiet'&&!game.runtime?.voiceEnabled?[text]:text.match(/[^。！？!?；;]+(?:[。！？!?；;]+[”」』"]*|$)/gu)||[text]);
 const out=[];let chars=0;
 for(const thought of thoughts){if(out.length>=pacing.maxSegments||chars+thought.length>maxChars)break;out.push(thought);chars+=thought.length;}
 // Preserve audience-load limits, then render the selected host reply once.
 return game.world.speechMode==='observer'&&out.length?[out.join('')]:out;
}
export function replyAudience(game,id,speech,{model=null,action='none',audio=null,continuations=[]}={}){
 const a=audienceState(game),w=game.world,item=Object.values(a.active).find(m=>m.id===id);
 if(w.generatedSpeechOnly&&!isCommanderModel(model))return false;
 if(!Array.isArray(continuations)||continuations.length>3)return false;
 const parts=[speech,...continuations];
 const displayable=parts.every(s=>isCommanderModel(model)?safePublishedText(s)&&s.length<=80:!!cleanChat(s));
 if(!item||item.phase!=='waiting_model'||item.persona!==w.heroes[item.side].id||!displayable||parts.join('').length>300)return false;
 const allowed=w.speechMode!=='observer'&&item.intent.type==='advice'?item.intent.order:'none';
 if(action!=='none'&&action!==allowed)return false;
 const replyParts=audienceReplyParts(game,parts).slice(0,item.eventNotice==='arrival'?2:4);if(!replyParts.length||narrationExpired(game,item))return false;
 if(action!=='none')heroAdvice(w,item.side,action);
 reserveReplyPlayback(game,item);item.model=model;item.replyAudio=audio;item.fallbackReason=model?null:item.fallbackReason||game.runtime?.modelReason||null;item.replyMode=model?'model':'local';item.action=action;item.parts=replyParts;item.partIndex=0;
 publishReplySegment(game,item);return true;
}
export function voiceCompleted(game,line,{audioUrl,durationMs}={}){
 const a=audienceState(game),w=game.world,item=a.active[line.side];
 if(w.paused||!item||item.id!==line.audienceId||item.phase!=='synthesizing'||item.persona!==w.heroes[line.side].id||w.heroes[line.side].hp<=0||line.field!==undefined&&line.field!==w.fieldEpoch||!w.speech.includes(line)||narrationExpired(game,item))return false;
 line.audioDuration=audioUrl?Math.max(4000,Math.min(60000,durationMs||line.spokenText.length*230)):item.parts?.length>1?speechDuration(line.text):9000;
 line.at=w.time;line.until=line.at+(game.presentationRequired?15000:line.audioDuration);
 line.audioUrl=audioUrl;line.audio=audioUrl?null:line.fallbackAudio;line.audioMode=audioUrl?'full_read':line.fallbackAudio?'prerecorded_reply':'subtitle_only';item.audioMode=line.audioMode;item.phase=game.presentationRequired?'awaiting_playback':'speaking';item.until=line.until;
 if(!game.presentationRequired)rememberPublishedSegment(game,item,line);
 w.audienceSpeakingUntil[line.side]=line.until;return true;
}
// Only the designated broadcast renderer can call this via the scoped receipt
// endpoint. Model/TTS completion alone does not mean the leader spoke.
export function audiencePresentation(game,{id,field,persona,event}){
 const w=game.world,line=w.speech.find(s=>s.id===id&&s.audienceId),item=line&&audienceState(game).active[line.side];
 if(!game.presentationRequired||w.paused||field!==w.fieldEpoch||!line||line.persona!==persona||w.heroes[line.side].id!==persona||w.heroes[line.side].hp<=0||item?.id!==line.audienceId||!['awaiting_playback','speaking'].includes(item.phase))return false;
 if(event==='started'){
  if(line.presentationStarted)return true;
  if(narrationExpired(game,item)||item.until<=w.time)return false;
  line.presentationStarted=true;line.at=w.time;line.until=w.time+line.audioDuration+2000;item.until=line.until;item.phase='speaking';w.audienceSpeakingUntil[line.side]=line.until;rememberPublishedSegment(game,item,line);return true;
 }
 if(event!=='ended'&&event!=='failed'||event==='ended'&&!line.presentationStarted)return false;
 if(line.presentationEnded)return true;
 line.presentationEnded=true;line.until=w.time;item.until=w.time;
 if(!line.presentationStarted){item.phase='unanswered';item.fallbackReason='playback_unavailable';item.reaction=null;}
 return true;
}
export function tickAudience(game){
 refreshRelationships(game);
 const a=audienceState(game),w=game.world;
 for(const side of sides){const item=a.active[side];if(item&&(item.persona!==w.heroes[side].id||w.heroes[side].hp<=0)){w.speech=w.speech.filter(s=>s.audienceId!==item.id);finish(a,item,'persona_retired',w.time);delete a.active[side];if(w.audienceSpeakingUntil)w.audienceSpeakingUntil[side]=0;}}
 if(w.paused||['settlement','inspection'].includes(w.mode))return;
 pruneAudienceQueue(game);
 for(const side of sides){let active=a.active[side];
  if(active&&['waiting_model','synthesizing','awaiting_playback'].includes(active.phase)&&narrationExpired(game,active)){
   w.speech=w.speech.filter(s=>s.audienceId!==active.id);finish(a,active,'expired',w.time);delete a.active[side];if(w.audienceSpeakingUntil)w.audienceSpeakingUntil[side]=0;active=null;
  }
  if(active&&(active.persona!==w.heroes[side].id||active.until<=w.time)){
   if(active.persona!==w.heroes[side].id){game.world.speech=game.world.speech.filter(s=>s.audienceId!==active.id);active.phase='cancelled_persona';}
   if(active.phase==='waiting_model'&&active.persona===w.heroes[side].id){resolveLocally(game,active);continue;}
   if(active.phase==='synthesizing'){const line=w.speech.find(s=>s.audienceId===active.id);if(line&&voiceCompleted(game,line))continue;}
   if(active.phase==='awaiting_playback'){active.phase='unanswered';active.reaction=null;active.fallbackReason='playback_unavailable';w.speech=w.speech.filter(s=>s.audienceId!==active.id);}
   const followup=a.pending.length>0||Object.values(a.active).some(m=>m.side!==side);
   if(active.phase==='speaking'&&active.parts&&active.partIndex+1<active.parts.length&&!followup&&!narrationExpired(game,active)&&active.partIndex+1<replyPacing(game).maxSegments){active.partIndex++;publishReplySegment(game,active);continue;}
   if(followup&&active.parts?.length>1)a.nextFree[side]=Math.min(a.nextFree[side],w.time);
   finish(a,active,active.phase==='cancelled_persona'?'persona_retired':active.phase==='unanswered'?'unanswered':'responded',w.time);delete a.active[side];active=null;
  }
  if(!active){
   const pacing=replyPacing(game),eligible=a.pending.filter(m=>m.side===side&&(m.eventNotice!=='arrival'||m.phase==='ready')&&(m.amountMilli>0||pacing.mode!=='quiet'||w.time>=a.nextFree[side])).sort(narrationPriority),item=eligible[0];if(!item||item.phase==='waiting_model')continue;
   // One subscription request is shared by both commanders: allow one preceding turn
   // plus this reply's bounded Max-generation budget. Battle orders keep their shorter freshness fence.
   a.pending=a.pending.filter(m=>m!==item);active={...item,persona:w.heroes[side].id,phase:'waiting_model',until:w.time+(game.runtime?.modelEnabled||awaitingPage(game)?MODEL_QUEUE_MS:23000)};a.active[side]=active;if(!item.amountMilli)a.nextFree[side]=w.time+pacing.freeGapMs;
   if(item.prepared){
    const {context,decision}=item.prepared;delete active.prepared;
    const applied=game.applyDecision({...context,audience:{...context.audience,prefetch:false}},decision,item.model);
    if(!applied){active.fallbackReason='stale_decision';resolveLocally(game,active);}
    continue;
   }
  }
  // Reserving the last available call blocks new work, not this inflight reply.
  // Failure, timeout and persona retirement still resolve through the paths above.
  // An empty Instant page can still be preparing. Keep the unsent turn within
  // its original narration TTL; warming is not a failed generation. Never
  // extend the deadline or replay an already-started request.
  if(active.phase==='waiting_model'&&!active.modelStarted&&!game.runtime?.modelEnabled&&!awaitingPage(game)&&!['codex_login_unavailable','broker_unavailable','codex_quota_unavailable'].includes(game.runtime?.modelReason))resolveLocally(game,active);
 }
}
export function audienceSnapshot(game){const a=audienceState(game);return {clock:game.now(),revoked:a.revoked||[],pinned:(a.pinned||[]).filter(m=>m.end>game.now()&&m.start<=game.now()).map(m=>({...m,remainingMs:m.end-game.now()})),active:a.active,preparing:a.pending.filter(m=>m.phase).map(m=>({id:m.id,side:m.side,phase:m.phase,modelStarted:!!m.modelStarted})),pacing:replyPacing(game),pending:Object.fromEntries(sides.map(s=>[s,{paid:a.pending.filter(m=>m.side===s&&m.amountMilli>0).length,free:a.pending.filter(m=>m.side===s&&!m.amountMilli).length}])),history:a.history.slice(-6),troops:game.world.units.filter(u=>u.hp>0&&u.supporter?.id).reduce((out,u)=>{const k=u.side+':'+u.supporter.id;out[k]=(out[k]||0)+1;return out;},{}),fallen:(game.world.fallenTroops||[]).reduce((out,u)=>{const k=u.side+':'+u.ownerId;out[k]=(out[k]||0)+1;return out;},{})};}
