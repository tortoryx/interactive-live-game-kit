import {labelSlot,overlaps} from './label-layout.mjs';
import {ownerColor} from './combat-focus.mjs';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const points=n=>Math.floor(n/10);
export function rescueLines(r){
 if(!r.count)return [r.pending?'已救回 '+r.pending+' 名 · 等待入场':r.rescued?'已复活 '+r.rescued+' 名 · 继续作战':'暂无可复活部队','剩余救援点 '+points(r.creditMilli)];
 const missing=Math.max(0,r.nextCostMilli-r.creditMilli);
 return ['待救 '+r.count+' 名 · '+Math.ceil(r.remainingMs/1000)+'秒',
  '下一名 '+points(Math.min(r.creditMilli,r.nextCostMilli))+'/'+points(r.nextCostMilli)+' 点'+(missing?' · 差 '+Math.ceil(missing/10):'')];
}
export function rescueCards(rows,camera,occupied,time){
 const out=[],blocked=[...occupied,{x:0,y:camera.screenH-320,w:235,h:320}];
 const recent=rows.filter(r=>time-r.shownAt<8000).sort((a,b)=>(b.queriedAt??-1)-(a.queriedAt??-1)||b.shownAt-a.shownAt);
 for(const r of recent){if(out.length>=2)break;const p=camera.project(r.anchor),offscreen=p.x<12||p.x>camera.screenW-12||p.y<75||p.y>camera.screenH-25;
  const anchor={x:clamp(p.x,110,camera.screenW-110),y:clamp(p.y-35,150,camera.screenH-85)},box=labelSlot(anchor,192,62,blocked,camera.screenW,camera.screenH,160);
  if(!box)continue;out.push({...r,...box,offscreen,angle:Math.atan2(p.y-camera.screenH/2,p.x-camera.screenW/2),lines:rescueLines(r)});blocked.push(box);
 }return out;
}
// One request per owner; under a burst shorten cards instead of hiding everyone
// after the first two. Quotes always come from the latest server snapshot.
export class RescuePresentationQueue {
 constructor(){this.seen=new Map();this.pending=[];this.active=[];this.time=0;}
 update(rows,time){
  if(time<this.time){this.seen.clear();this.pending=[];this.active=[];}this.time=time;
  const byKey=new Map(rows.map(r=>[r.side+':'+r.ownerId,r]));
  for(const [key,r] of byKey){const stamp=r.shownAt+':'+r.count+':'+r.pending;
   if(this.seen.get(key)===stamp)continue;this.seen.set(key,stamp);
   if(this.active.some(a=>a.key===key))continue;
   this.pending=this.pending.filter(a=>a.key!==key);this.pending.push({key,at:time,requested:r.queriedAt===r.shownAt});
  }
  this.pending=this.pending.filter(a=>byKey.has(a.key)).sort((a,b)=>Number(b.requested)-Number(a.requested)||a.at-b.at);
  const duration=this.pending.length>4?2000:5000;
  this.active=this.active.filter(a=>byKey.has(a.key)&&time-a.at<Math.min(a.duration,duration));
  while(this.active.length<2&&this.pending.length)this.active.push({...this.pending.shift(),at:time,duration});
  for(const k of this.seen.keys())if(!byKey.has(k))this.seen.delete(k);
  return this.active.map(a=>({...byKey.get(a.key),shownAt:a.at}));
 }
}
export class RescueStatus {
 constructor(){this.positions=new Map();this.queue=new RescuePresentationQueue();}
 draw(c,rows,camera,occupied,time,labels,dt=1/60){
  const cards=rescueCards(this.queue.update(rows,time),camera,occupied,time),live=new Set();
  for(const r of cards){const key=r.side+':'+r.ownerId;live.add(key);const old=this.positions.get(key);let x=r.x,y=r.y;
   if(old){const k=1-Math.exp(-12*Math.min(dt,.1));x=old.x+(x-old.x)*k;y=old.y+(y-old.y)*k;}
   this.positions.set(key,{x,y});const rect={x,y,w:r.w,h:r.h};if(occupied.some(b=>overlaps(rect,b)))continue;occupied.push(rect);
   const tint=ownerColor(r.supporter),alpha=clamp((8000-(time-r.shownAt))/350,0,1);
   c.save();c.globalAlpha=alpha;c.fillStyle='#14251bea';c.fillRect(x,y,r.w,r.h);c.fillStyle=tint;c.fillRect(x,y,3,r.h);
   labels.circle(c,{x:x+17,y:y+17,alpha:1,owner:r.supporter,side:r.side},9,tint);
   if(r.offscreen){c.save();c.translate(x+17,y+17);c.rotate(r.angle);c.fillStyle=tint;c.beginPath();c.moveTo(16,0);c.lineTo(11,-3);c.lineTo(11,3);c.fill();c.restore();}
   c.textAlign='left';c.font='bold 11px sans-serif';c.fillStyle='#ffe4a8';c.fillText(Array.from(r.supporter.name||'玩家').slice(0,12).join('')+' · 救援',x+32,y+16,154);
   c.font='11px sans-serif';c.fillStyle='#e6ecd8';c.fillText(r.lines[0],x+9,y+33,175);c.fillStyle='#afdebb';c.fillText(r.lines[1],x+9,y+48,175);
   c.fillStyle='#456250';c.fillRect(x+9,y+55,174,3);c.fillStyle=tint;c.fillRect(x+9,y+55,174*(r.nextCostMilli?Math.min(1,r.creditMilli/r.nextCostMilli):1),3);c.restore();
  }
  for(const k of this.positions.keys())if(!live.has(k))this.positions.delete(k);
  return cards.map(({supporter,lines,x,y,w,h,offscreen})=>({name:supporter.name,lines,x,y,w,h,offscreen}));
 }
}
