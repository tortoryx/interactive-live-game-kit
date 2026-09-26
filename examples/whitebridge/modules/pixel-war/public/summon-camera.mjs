import {viewerFocus} from './viewer-events.mjs';
export class SummonCamera{
 constructor(side){this.side=side;this.epoch=null;this.last=0;this.queue=[];this.active=null;this.elapsed=0;this.cooldown=0;this.noticeSeen=new Set();this.focused=new Set();}
 enqueue(shot){const key=shot.receipt||shot.id;if(this.focused.has(key))return;const index=this.queue.findIndex(s=>(s.receipt||s.id)===key);if(index<0)this.queue.push(shot);}
 update(state,dt){const history=state.reinforcementShots||[];
 if(this.epoch!==state.fieldEpoch){this.epoch=state.fieldEpoch;this.last=Math.max(0,...history.map(s=>s.id));this.queue=[];this.active=null;this.cooldown=0;this.focused=new Set(history.map(s=>s.receipt||s.id));this.noticeSeen=new Set((state.viewerEvents?.items||[]).map(r=>r.id));return null;}
 for(const shot of history){if(shot.id<=this.last)continue;if(state.time-shot.at<8000)this.enqueue(shot);}this.last=Math.max(this.last,...history.map(s=>s.id));
 for(const row of state.viewerEvents?.items||[]){if(this.noticeSeen.has(row.id))continue;const focus=viewerFocus(state,row);if(focus){this.noticeSeen.add(row.id);this.enqueue({...focus,id:'viewer:'+row.id,receipt:row.id,notice:row,at:state.time,eventTitle:row.detail});}}
 this.queue=this.queue.filter(s=>state.time-s.at<8000&&(!s.notice||viewerFocus(state,s.notice))).slice(-4);if(this.noticeSeen.size>128)this.noticeSeen=new Set((state.viewerEvents?.items||[]).map(r=>r.id));
 // Update a receipt as its remaining soldiers arrive over several server ticks.
 this.queue=this.queue.map(s=>history.find(v=>v.id===s.id)||s);
 if(state.mode==='settlement'||state.campaign?.conquest)return null;if(state.paused)return this.focus(state);
 this.cooldown=Math.max(0,this.cooldown-dt);
 if(this.active?.notice){const focus=viewerFocus(state,this.active.notice);if(focus)this.active={...this.active,x:focus.x,y:focus.y};else this.active=null;}
 if(this.active){this.active=history.find(s=>s.id===this.active.id)||this.active;this.elapsed+=dt*1000;if(this.elapsed>=5600){this.active=null;this.elapsed=0;this.cooldown=2;}}
 if(!this.active&&this.queue.length&&!this.cooldown){this.active=this.queue.shift();this.focused.add(this.active.receipt||this.active.id);if(this.focused.size>128)this.focused.delete(this.focused.values().next().value);this.elapsed=0;this.cooldown=0;}
 return this.focus(state);
 }
 focus(state){const s=this.active;if(!s)return null;const ids=new Map(s.units.map(u=>[u.id,u.life])),units=state.units.filter(u=>ids.get(u.id)===(u.life||1)&&u.hp>0),x=units.length?units.reduce((n,u)=>n+u.x,0)/units.length:s.x,y=units.length?units.reduce((n,u)=>n+u.y,0)/units.length:s.y,blend=Math.min(1,this.elapsed/1600,(5600-this.elapsed)/1600);return {...s,x,y,blend:Math.max(0,blend),living:units.length,queued:this.queue.length};}
}
