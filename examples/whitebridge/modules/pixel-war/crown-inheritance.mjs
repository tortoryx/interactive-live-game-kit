import {ceremonyTiming} from './public/cinematic.mjs';
import {crownCount,crownRite} from './public/crowns.mjs';
export function prepareCrowns(w,fallen){return fallen.map(h=>({side:h.side,fromId:h.id,count:crownCount(h),drop:w.ground({x:h.x+42,y:h.y+18})||{x:h.x,y:h.y},collected:false}));}
export function beginCrownPickup(w,result){for(const e of result.crowns||[]){const hero=w.heroes[e.side];e.successorId=hero.id;e.from={x:hero.x,y:hero.y};}}
export function advanceCrownPickup(w,result){
 const timing=ceremonyTiming(result);
 for(const e of result.crowns||[]){const h=w.heroes[e.side];if(h?.id!==e.successorId||e.complete)continue;const rite=crownRite(result,e.side,w.time);if(!rite.started)continue;
  h.x=e.from.x+(e.drop.x-e.from.x)*rite.walk;h.y=e.from.y+(e.drop.y-e.from.y)*rite.walk;h.moving=rite.t<.36;h.face=h.moving?Math.atan2(e.drop.y-e.from.y,e.drop.x-e.from.x):Math.PI/2;h.walkPhase=(w.time-result.startedAt-timing.handoff)*.8;h.action=null;
  if(rite.worn&&!e.collected){e.collected=true;e.collectedAt=result.startedAt+timing.handoff+(timing.arrival-timing.handoff)*.78;}
  if(rite.t>=1){e.complete=true;h.moving=false;h.nextPlan=0;h.nextDuel=0;}
 }
}
