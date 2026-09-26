// Respect the actual owned-page capacity before consuming a viewer queue item.
export function modelAdmission(models={},inflight=0){
 if(models.retryAt>Date.now())return false;
 const capacity=models.transport==='electron'?Math.max(1,Math.min(3,models.parallelism||3)):models.transport==='api'?Math.max(1,Math.min(2,models.parallelism||1)):1;
 if(inflight>=capacity)return false;
 return models.transport!=='electron'||!models.pages||models.pages.ready>0;
}
import {prepareObserver} from './show-observer.mjs';
import {prepareDebate} from './show-debate.mjs';
import {backgroundBudgetAvailable} from './decision-schedule.mjs';
import {hasRecentAudience} from './relationships.mjs';
import {prepareSpeechRequest} from '../pixel-war/luna-speech.mjs';

export const BACKGROUND_REQUEST_GAP_MS=15000;

// A full preload cache must never be a prerequisite for commander decisions.
// Viewer replies go first, then due strategy, then the remaining preload work.
export function nextModelWork(game, schedule, now, models, {watching=true,excludeSides=[],backgroundBusy=false,busyLanes=[]}={}) {
 const w=game.world;
 let side=schedule.take(w,now,{background:false,models,excludeSides});
 if(side)return {side,pack:null};
 if(Object.values(w.audienceWaiting||{}).some(Boolean)||game.meta.audience?.pending?.length)return null;
 // Enlist spam must not starve commentary. Gift reactions get viewer priority
 // once actual arrival is queued; deployment alone does not reserve the voice.
 // A single ambient request can run beside viewer work. Its admission clock
 // is persisted on game metadata, so cache invalidations cannot burst requests.
 if(backgroundBusy||busyLanes.some(l=>!l.startsWith('reply:')))return null;
 const pacing=game.meta.backgroundPacing??={nextAt:0};
 if(now<pacing.nextAt)return null;
 const work=nextBackgroundWork(game,schedule,now,models,{watching,excludeSides,backgroundBusy,busyLanes});
 if(work){pacing.nextAt=now+BACKGROUND_REQUEST_GAP_MS;if(work.pack?.duet)pacing.lastShow='debate';if(work.pack?.commentary)pacing.lastShow='observer';}
 return work;
}
function nextBackgroundWork(game,schedule,now,models,{watching,excludeSides,backgroundBusy,busyLanes}) {
 const w=game.world;let side;
 if(w.speechMode==='observer'){
  const pressure=Math.max(0,...[['hourCalls','hourLimitCalls'],['dayCalls','dayLimitCalls']].map(([u,l])=>models[l]>0?(models[u]||0)/models[l]:0));
  if(pressure>=.95)return null;
  const pacing=game.meta.ambientSpeechPacing??={nextAt:0};if(pressure>=.8&&now<pacing.nextAt)return null;
  const pack=watching?prepareObserver(w,now):null;if(pack&&pressure>=.8)pacing.nextAt=now+60000;return pack?{side:null,pack}:null;
 }
 const occupied=lane=>busyLanes.includes(lane)||(lane==='background'&&backgroundBusy);
 side=occupied('background')?null:schedule.take(w,now,{background:hasRecentAudience(game),models,excludeSides});
 if(side)return {side,pack:null};
 // Keep the hard ceiling and a final 5% viewer reserve. Above 80%, pace
 // ambient batches instead of silently disabling both performers at once.
 const economy=!backgroundBudgetAvailable(models);
 const pressure=Math.max(0,...[['hourCalls','hourLimitCalls'],['dayCalls','dayLimitCalls']].map(([used,limit])=>models[limit]>0?(models[used]||0)/models[limit]:0));
 const urgent=(w.lunaSpeech?.pending||[]).some(q=>q.priority>=3&&q.facts?.receipt&&q.until>w.time);
 if(watching&&pressure>=.8&&!urgent){
  const pacing=game.meta.ambientSpeechPacing??={nextAt:0,lastKind:null};
  if(pressure>=.95||now<pacing.nextAt)return null;
  const kinds=pacing.lastKind==='observer'?['debate','observer']:['observer','debate'];
  for(const kind of kinds){if(occupied('show:'+kind))continue;const pack=kind==='observer'?prepareObserver(w,now):prepareDebate(w,now);if(pack){pacing.nextAt=now+60000;pacing.lastKind=kind;return {side:null,pack};}}
  return null;
 }
 const ambient=watching&&pressure<.8;
 // Camera commentary is independent of leader generation. A failed or empty
 // banter queue must not silence the host; viewers and urgent reactions win.
 if(ambient&&!urgent){
  // Rotate admission after every attempt, even failed ones. A slow host request
  // must not continually win the sole background slot and starve both leaders.
  const kinds=game.meta.backgroundPacing.lastShow==='observer'?['debate','observer']:['observer','debate'];
  for(const kind of kinds){const pack=kind==='observer'?prepareObserver(w,now):prepareDebate(w,now);if(pack)return {side:null,pack};}
 }
 // Once the paired show is running, do not spend its refill lane generating
 // disconnected idle monologues. Real support reactions and ceremonies remain.
 if(w.showDebate?.active&&!urgent&&w.mode!=='settlement'){
  const observer=ambient&&!occupied('show:observer')?prepareObserver(w,now):null;if(observer)return {side:null,pack:observer};
  const troops=ambient&&!occupied('background')?prepareSpeechRequest(w,now,{troopsOnly:true,excludeSides,parallel:true,ambientInterval:8000}):null;return troops?{side:null,pack:troops}:null;
 }
 if(occupied('background'))return null;
 const pack=prepareSpeechRequest(w,now,{excludeSides,parallel:models.transport==='electron',openingOnly:!ambient,essentialOnly:ambient&&economy,ambientInterval:economy?60000:30000});
 return pack?{side:null,pack}:null;
}

export function recordModelWork(game,context,{startedAt,applied=false,reason=null,finishedAt=null,model=null}={}) {
 const state=game.meta.modelActivity??={recent:[],sides:{}};
 const kind=context.speechRequest?'preload':context.audience?.selected?'reply':'strategy';
 const record={audienceId:context.audience?.selected?.id||null,prefetch:!!context.audience?.prefetch,epoch:context.epoch,side:context.side,persona:context.persona,kind,startedAt,...(context.speechRequest?{cues:context.speechRequest.items.map(i=>i.cue)}:{}),
  ...(finishedAt===null?{state:'requesting'}:{state:applied?'applied':'rejected',finishedAt,latencyMs:finishedAt-startedAt,reason,model})};
 state.sides[context.side]=record;
 if(finishedAt!==null){state.recent.push(record);state.recent=state.recent.slice(-12);}
 return record;
}
