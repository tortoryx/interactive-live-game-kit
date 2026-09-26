// A short report shot; the battle overview remains the normal camera target.
export class SiteCamera{
 constructor(side){this.side=side;this.active=null;this.elapsed=0;this.seen=new Set();this.cooldown=0;this.epoch=null;}
 update(state,dt,suspended=false){if(this.epoch!==state.fieldEpoch){this.epoch=state.fieldEpoch;this.seen.clear();this.active=null;this.cooldown=0;}
  const sites=(state.campaign?.sites||[]).filter(s=>s.assault?.until>state.time),alive=sites.map(s=>s.assault.id);for(const id of this.seen)if(!alive.includes(id))this.seen.delete(id);
  if(state.mode==='settlement'||suspended)return null;if(state.paused)return this.focus();
  this.cooldown=Math.max(0,this.cooldown-dt);if(this.active){this.elapsed+=dt;const current=sites.find(s=>s.id===this.active.id);if(!current||this.elapsed>=6.5){this.active=null;this.cooldown=14;return null;}this.active=current;}
  if(!this.active&&!this.cooldown){const s=sites.filter(s=>!this.seen.has(s.assault.id)).sort((a,b)=>(b.assault.defender===this.side)-(a.assault.defender===this.side)||b.progress-a.progress||b.assault.attackers-a.assault.attackers)[0];if(s){this.active=s;this.elapsed=0;this.seen.add(s.assault.id);}}
  return this.focus();
 }
 focus(){if(!this.active)return null;return {id:this.active.id,assaultId:this.active.assault.id,x:this.active.x,y:this.active.y,kind:this.active.kind,defender:this.active.assault.defender,blend:Math.max(0,Math.min(1,this.elapsed/1.25,(6.5-this.elapsed)/1.5))};
 }
}
