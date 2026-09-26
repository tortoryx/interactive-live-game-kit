import {factionName,factionColor} from './faction-labels.mjs';
// Resolve only things that have actually arrived, never a paid entitlement.
export function viewerFocus(state,row){
 if(!row.spotlight)return null;
 const event=(state.warEvents||[]).find(e=>e.receipt===row.id&&e.until>state.time);
 if(event)return {...event,units:[],kind:'event',supporter:row.supporter,side:row.side};
 const building=(state.barracks||[]).find(b=>b.receipt===row.id&&b.hp>0);
 if(building)return {...building,units:[],kind:'barracks',supporter:row.supporter};
 const support=Object.values(state.heroes).find(h=>h.lastSupport?.receipt===row.id&&h.lastSupport.until>state.time);
 if(support)return {x:support.x,y:support.y,units:[],kind:'support',supporter:row.supporter,side:row.side};
 return null;
}
export class ViewerEvents{
 constructor(){this.seen=new Set();this.rows=[];this.initialized=false;this.epoch=null;}
 update(state,now){
  const receipts=state.viewerEvents?.items||[];
  if(!this.initialized||this.epoch!==state.fieldEpoch){this.initialized=true;this.epoch=state.fieldEpoch;this.seen=new Set(receipts.map(r=>r.id));this.rows=[];return [];}
  const fresh=receipts.filter(r=>!this.seen.has(r.id)&&r.until>state.viewerEvents.clock);
  for(const row of fresh){this.seen.add(row.id);this.rows.push({...row,shownAt:now});}
  this.rows=this.rows.filter(r=>now-r.shownAt<6500).slice(-3);
  if(this.seen.size>256)this.seen=new Set(receipts.map(r=>r.id));
  return fresh;
 }
 render(root,state,now){
  const rows=this.rows.map(row=>{const shot=(state.reinforcementShots||[]).find(s=>s.receipt===row.id),focus=viewerFocus(state,row);
   return {...row,detail:row.kind==='cooldown'&&row.readyAt?'还剩 '+Math.max(0,Math.ceil((row.readyAt-state.viewerEvents.clock)/1000))+' 秒':shot?(row.kind==='faction'?row.detail:'部队已入场 ×'+shot.units.length):focus?row.detail.replace('等待入场','已生效').replace('事件已排队','事件已生效'):row.detail};});
  const signature=rows.map(r=>r.id+':'+r.detail).join('|');
  if(root.dataset.receipts===signature)return;root.dataset.receipts=signature;const oldIds=new Set([...root.children].map(e=>e.dataset.receipt));
  root.replaceChildren(...rows.slice().reverse().map(row=>{
   const card=document.createElement('article');card.className='viewerEvent'+(oldIds.has(row.id)?'':' arriving');card.dataset.receipt=row.id;card.dataset.kind=row.kind;card.style.setProperty('--event-color',row.factionColor||factionColor(row.side));
   const icon=document.createElement('span');icon.className='viewerEventIcon';icon.textContent=({gift:'✦',recruit:'⚔',spell:'ϟ',faction:'⚑',cooldown:'◷',chat:'…',order:'➤'})[row.kind];
   const copy=document.createElement('div'),name=document.createElement('strong'),action=document.createElement('b'),detail=document.createElement('small');
   name.textContent=row.supporter.name+' · '+(row.factionName||factionName(row.side))+(row.supporter.platform==='test'?' · 试玩':'');action.textContent=row.title;detail.textContent=row.detail;
   copy.append(name,action,detail);card.append(icon,copy);return card;
  }));root.hidden=!this.rows.length;
 }
}
