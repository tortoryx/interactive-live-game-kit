import {ceremonyTiming} from './cinematic.mjs';
// Counts are inherited game facts; drawing stays bounded at very high generations.
export const crownCount=u=>Math.max(0,Math.floor(Number.isFinite(u?.wornCrowns)?u.wornCrowns:Math.max(0,u?.rank||0)+1));
export const crownStack=count=>{const visible=Math.min(32,count),height=Math.min(82,Math.max(0,count-1)*5);return {visible,height,step:visible>1?height/(visible-1):0};};
const clamp=t=>Math.max(0,Math.min(1,t));
export const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
export function crownRite(result,side,time){
 const entry=result?.crowns?.find(e=>e.side===side);if(!entry)return null;
 const timing=ceremonyTiming(result),start=result.startedAt+timing.handoff,duration=Math.max(1,timing.arrival-timing.handoff),t=clamp((time-start)/duration);
 return {entry,t,cutAt:result.startedAt+timing.celebrate+850,walk:ease(t/.36),bend:Math.sin(Math.PI*clamp((t-.36)/.42)),lift:ease((t-.5)/.28),worn:t>=.78,started:time>=start};
}
export function crownPilePoint(entry,i){const n=Math.min(12,entry.count),row=Math.floor(i/6),col=i%6,columns=Math.min(6,n-row*6);return{x:entry.drop.x+(col-(columns-1)/2)*19,y:entry.drop.y+row*13,rotation:(i%3-1)*.13};}
export function drawCrown(c,x,y,{scale=1,rotation=0,alpha=1}={}){
 c.save();c.translate(x,y);c.rotate(rotation);c.scale(scale,scale);c.globalAlpha*=alpha;
 c.fillStyle='#493b2d';c.fillRect(-8,-5,17,10);c.fillStyle='#d9a936';c.fillRect(-7,-2,15,6);
 for(const dx of[-7,0,7]){c.fillStyle='#8e632c';c.fillRect(dx-1,-7,3,6);c.fillStyle='#ffe093';c.fillRect(dx,-7,1,5);}
 c.fillStyle='#fff0b3';c.fillRect(-6,0,13,1);c.fillStyle='#b74442';c.fillRect(-1,2,3,2);c.restore();
}
export function drawWornCrowns(c,count,anchor,sway=0){
 const layout=crownStack(count);for(let i=0;i<layout.visible;i++)drawCrown(c,anchor.x+Math.sin(i*.45+sway)*Math.min(1.7,i*.09),anchor.y-5-i*layout.step,{scale:.9});
 if(count>32){c.save();c.font='bold 9px monospace';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#302d26';c.strokeText('×'+count,anchor.x,anchor.y-layout.height-17);c.fillStyle='#ffe093';c.fillText('×'+count,anchor.x,anchor.y-layout.height-17);c.restore();}
}
export function drawInheritedCrowns(c,state,time,actors){
 const r=state.result;if(!r?.crowns||state.mode!=='settlement')return;
 for(const entry of r.crowns){
  const cut=r.startedAt+ceremonyTiming(r).celebrate+850;if(time<cut)continue;const rite=crownRite(r,entry.side,time);if(rite.worn)continue;
  const fallen=r.fallen.find(h=>h.side===entry.side),hero=state.heroes[entry.side],next=rite.started&&hero?.id===entry.successorId;
  const flight=clamp((time-cut)/900),pieces=Math.min(12,entry.count),stack=crownStack(entry.count+1),anchor=next?actors.headAnchor('walk',0,2,hero.rank>=2):null;
  c.save();for(let i=0;i<pieces;i++){
   const ground=crownPilePoint(entry,i),launch={x:fallen.x+(i-(pieces-1)/2)*3,y:fallen.y-59-i*2};
   let x=launch.x+(ground.x-launch.x)*ease(flight),y=launch.y+(ground.y-launch.y)*ease(flight)-Math.sin(flight*Math.PI)*45,rotation=(1-flight)*(i%2?1:-1)*5+ground.rotation,scale=1.12;
   if(flight>=1){c.fillStyle='#302b2166';c.beginPath();c.ellipse(ground.x,ground.y+6,11,3,0,0,7);c.fill();}
   if(next&&rite.lift>0){const target={x:hero.x+anchor.x*1.25,y:hero.y+(anchor.y-5-(i+1)*stack.step)*1.25},t=rite.lift;x=ground.x+(target.x-ground.x)*t;y=ground.y+(target.y-ground.y)*t-Math.sin(t*Math.PI)*24;rotation=ground.rotation*(1-t);scale=1.12;}
   drawCrown(c,x,y,{scale,rotation});
  }
  if(entry.count>12){c.font='bold 12px monospace';c.textAlign='center';c.fillStyle='#ffe093';c.fillText('×'+entry.count,entry.drop.x,entry.drop.y+34);}
  c.restore();
 }
}
