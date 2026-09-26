// Presentation uses elapsed viewing time, even while the game is paused.
export class ViewRhythm{
 constructor(){this.elapsed=0;this.boardUntil=4;this.front=null;this.expansion=0;this.nextMap=18;this.mapUntil=0;this.nextBoard=48;this.hotUntil=0;}
 update(state,camera,dt){this.elapsed+=Math.min(.1,dt);const t=this.elapsed,front=state.campaign?.front;
 if(this.front!==null&&front!==this.front)this.boardUntil=t+4;this.front=front;
 const hits=(state.events||[]).filter(e=>e.type==='hit'&&state.time-e.at<800&&camera.visible(e)).length;
 if(hits>=7||state.heroes?.[camera.side]?.action)this.hotUntil=t+3;
 const calm=t>this.hotUntil&&!state.result;
 if(calm&&t>=this.nextBoard){this.boardUntil=t+4;this.nextBoard=t+48;}
 if(calm&&t>=this.nextMap){this.mapUntil=t+6;this.nextMap=t+38;}
 const expand=calm&&t<this.mapUntil?1:0;this.expansion+=(expand-this.expansion)*(1-Math.exp(-dt*5));
 return {board:t<this.boardUntil&&!state.result,expansion:this.expansion,calm};
 }
}
export function battleMapBox(camera,expansion=0){const w=Math.min(144+44*expansion,camera.screenW*.26),h=w*102/175,x=12,y=54;return {x,y,w,h};}
