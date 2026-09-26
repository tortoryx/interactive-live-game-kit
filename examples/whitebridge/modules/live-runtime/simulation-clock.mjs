// Ordinary event-loop delays accrue bounded debt; each callback does at most five steps.
// A pause or actual sleep discards old debt rather than replaying an unattended battle.
export class SimulationClock {
 constructor(game,now=performance.now()){this.game=game;this.last=now;this.pending=0;}
 advance(now){
  const elapsed=Math.max(0,now-this.last);this.last=now;
  if(this.game.world.paused){this.pending=0;return;}
  this.pending=elapsed>2000?250:Math.min(1000,this.pending+elapsed);
  for(let steps=0;steps<5&&this.pending>=50;steps++){this.pending-=50;for(let i=0;i<(this.game.world.mode==='settlement'?1:this.game.world.speed);i++)this.game.step(50);}
 }
}
