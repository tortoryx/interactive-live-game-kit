const sides=['demon','human'];
// Background thinking gets at most half the call allowance. The broker owns the
// hard ceiling; a waiting viewer is always considered before a battlefield alarm.
export function backgroundBudgetAvailable(m={}){
 return ![['hourCalls','hourLimitCalls'],['dayCalls','dayLimitCalls']].some(([used,limit])=>m[limit]>0&&(m[used]||0)>=Math.floor(m[limit]/2));
}
export class DecisionSchedule {
 constructor(){this.last={demon:0,human:0};this.lastBackground={demon:0,human:0};this.personas={};this.hp={};this.alarms={};this.nextAt=0;}
 take(w,now,{background=true,models={},excludeSides=[]}={}){if(w.paused||['inspection','settlement'].includes(w.mode))return null;
  const waiting=sides.filter(side=>!excludeSides.includes(side)&&w.audienceWaiting?.[side]);if(!waiting.length&&now<this.nextAt)return null;
  if(!waiting.length&&(!background||!backgroundBudgetAvailable(models)))return null;
  const ranked=(waiting.length?waiting:sides.filter(s=>!excludeSides.includes(s))).map(side=>{const h=w.heroes[side],age=now-this.last[side],changed=this.personas[side]!==h.id,wounded=(this.hp[side]??h.hp)-h.hp>h.maxHP*.1,ordered=w.audienceOrders?.[side]?.until>w.time,alarm=(w.campaign?.alarmVersion?.[side]||0)!==(this.alarms[side]||0),urgent=changed||wounded||ordered||alarm;return {side,h,age,urgent,score:age+(alarm?30000:urgent?8000:0)};}).filter(v=>v.age>=(waiting.length?500:10000)&&(waiting.length||now-this.lastBackground[v.side]>=(v.urgent?45000:120000))).sort((a,b)=>b.score-a.score);
  const v=ranked[0];if(!v)return null;this.last[v.side]=now;if(!waiting.length)this.lastBackground[v.side]=now;this.personas[v.side]=v.h.id;this.hp[v.side]=v.h.hp;this.alarms[v.side]=w.campaign?.alarmVersion?.[v.side]||0;this.nextAt=now+10000;return v.side;
 }
}
