import {factionName,factionColor} from './faction-labels.mjs';
export const TONES={danger:{color:'#ff786a',dark:'#542e29',label:'危险'},success:{color:'#a5dfaa',dark:'#294938',label:'推进'},neutral:{color:'#edcd7f',dark:'#4b4430',label:'中立'}};
export function eventTone(e,side,state){
 if(['meteor','quake','storm','wildlife'].includes(e.kind))return 'danger';
 if(e.kind?.startsWith('royal_'))return 'success';
 if(e.actorSide)return 'neutral';
 if(['meteor','quake','storm','wildlife'].includes(e.kind)&&state){const h=state.heroes?.[side],r=e.kind==='quake'?370:e.kind==='storm'?320:250;if([h,...state.units.filter(u=>u.side===side&&u.hp>0)].some(u=>u&&Math.hypot(u.x-e.x,u.y-e.y)<r))return 'danger';}
 return 'neutral';
}
export function eventCaption(e,side){if(e.kind==='assault')return factionName(e.defender)+'据点受袭';if(e.kind==='march')return (factionName(e.actorSide)+'大军行进')+' ×'+e.count;return e.title;}
export function tacticalIcon(c,kind,x,y,color='#edcd7f',size=18){c.save();c.translate(Math.round(x),Math.round(y));c.scale(size/24,size/24);c.strokeStyle='#17271f';c.lineWidth=3;c.lineJoin='miter';c.fillStyle=color;
 const rect=(x,y,w,h)=>c.fillRect(x,y,w,h),poly=pts=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke();c.fill();};
 if(kind==='alert'){poly([[0,-12],[12,10],[-12,10]]);c.fillStyle='#273027';rect(-1.5,-6,3,8);rect(-1.5,5,3,3);}
 else if(kind==='clash'){for(const flip of [-1,1]){c.save();c.scale(flip,1);poly([[-9,-11],[-4,-9],[8,6],[5,9],[-8,-6]]);c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(2,9);c.lineTo(10,2);c.moveTo(7,7);c.lineTo(11,12);c.stroke();c.restore();}}
 else if(kind==='grain'){poly([[-5,-10],[5,-10],[4,-6],[10,-1],[9,10],[-9,10],[-10,-1],[-4,-6]]);c.strokeStyle='#4f5735';c.lineWidth=1.8;c.beginPath();c.moveTo(0,-3);c.lineTo(0,7);for(let n=-2;n<7;n+=3){c.moveTo(0,n+2);c.lineTo(-4,n);c.moveTo(0,n+2);c.lineTo(4,n);}c.stroke();}
 else if(kind==='forge'){poly([[-11,-8],[11,-8],[7,-2],[3,0],[3,6],[8,8],[8,11],[-8,11],[-8,8],[-3,6],[-3,0],[-8,-1]]);}
 else if(kind==='home'||kind==='camp'){poly([[-11,10],[-11,-7],[-7,-7],[-7,-11],[-3,-11],[-3,-7],[3,-7],[3,-11],[7,-11],[7,-7],[11,-7],[11,10]]);c.fillStyle='#20372a';rect(-3,2,6,8);rect(-8,-3,3,3);rect(5,-3,3,3);}
 else if(kind==='march'){for(const [dx,dy] of [[-6,0],[5,-3]]){poly([[dx-4,dy-6],[dx,dy-10],[dx+4,dy-6],[dx+4,dy],[dx-4,dy]]);rect(dx-4,dy+2,8,7);}c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo(4,11);c.lineTo(11,11);c.lineTo(8,8);c.stroke();}
 else if(kind==='king'){poly([[-11,-7],[-5,-2],[0,-11],[5,-2],[11,-7],[9,8],[-9,8]]);rect(-9,10,18,3);}
 else if(kind==='giant'){poly([[-9,9],[-9,-7],[-3,-7],[-3,-12],[3,-12],[3,-7],[9,-7],[9,9]]);c.fillStyle='#243b30';rect(-5,-3,3,4);rect(2,-3,3,4);}
 else {poly([[0,-11],[11,0],[0,11],[-11,0]]);}
 c.restore();}
export function commanderGlow(c,u,camera,side,time){if(u.hp<=0)return;const p=camera.project(u),color=factionColor(u.side),r=35+(u.side===side?Math.sin(time/700)*2:0);c.save();c.translate(p.x,p.y);c.scale(1,.36);const glow=c.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,color+'50');glow.addColorStop(1,color+'00');c.fillStyle=glow;c.beginPath();c.arc(0,0,r,0,7);c.fill();c.strokeStyle=color+'b0';c.lineWidth=2;c.beginPath();c.arc(0,0,r-9,0,7);c.stroke();c.restore();}
