import {factionName,factionColor} from './faction-labels.mjs';
import {ownerColor} from './combat-focus.mjs';
const rect=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
export function drawPlayerBarracks(c,b,time){
 const tint=ownerColor(b.supporter),dark=b.side==='demon',age=time-b.builtAt;c.save();c.translate(b.x,b.y);
 if(b.hp<=0){rect(c,'#38372c',-72,-8,144,27);for(let i=0;i<12;i++)rect(c,i%2?'#827360':'#535446',-70+i*12,-i%3*12,17,13);c.restore();return;}
 c.globalAlpha=Math.min(1,.35+age/2300);rect(c,'#27372980',-95,0,190,30);rect(c,'#5b5143',-78,-47,156,65);rect(c,dark?'#8c7384':'#b3b799',-69,-83,138,100);
 for(const s of [-1,1]){rect(c,'#504a42',s*66-16,-112,32,128);rect(c,dark?'#6b596c':'#898d75',s*66-12,-110,24,117);for(let i=0;i<3;i++)rect(c,'#b3b49c',s*66-18+i*13,-123,9,18);rect(c,tint,s*66-5,-73,10,23);}
 rect(c,dark?'#483c51':'#455d50',-63,-99,126,24);rect(c,tint,-62,-101,124,5);rect(c,'#202b24',-25,-49,50,66);rect(c,'#e3b36c',-18,-42,36,58);rect(c,'#3e3327',-14,-41,28,52);rect(c,'#e6c082',-18,10,36,5);
 for(const x of [-47,39]){rect(c,'#25312a',x,-43,11,18);rect(c,'#f5d292',x+2,-40,7,13);}
 rect(c,'#3e4934',-60,14,120,10);if(b.status==='producing'){rect(c,'#d3c38a',-9+Math.sin(time/200)*6,-31,5,7);for(let i=0;i<3;i++){const t=(time/90+i*11)%30;rect(c,'#a6aa8d70',45+t*.3,-118-t,12+t*.4,9+t*.4);}}
 if(age<2400){c.strokeStyle=tint;c.lineWidth=3;c.strokeRect(-87,-127,174,150);for(let i=0;i<5;i++)rect(c,'#f9e6a3',-65+i*31,8-Math.abs(Math.sin(time/160+i))*60,4,4);}
 c.restore();
}
export function drawBarracksLabels(c,state,camera,side){
 const boxes=[];for(const b of state.barracks||[]){if(b.hp<=0||!camera.visible(b))continue;const p=camera.project(b),tint=ownerColor(b.supporter),x=p.x,y=p.y-132*camera.zoom;
 c.save();c.textAlign='center';c.font='bold 11px sans-serif';c.strokeStyle='#13251e';c.lineWidth=4;const name=(factionName(b.side)+' · ')+b.supporter.name+'的兵营';c.strokeText(name,x,y);c.fillStyle=tint;c.fillText(name,x,y);rect(c,'#15291f',x-43,y+6,86,5);rect(c,factionColor(b.side),x-43,y+6,86*b.hp/b.maxHP,5);c.font='10px sans-serif';c.fillStyle='#eee4ca';const status={building:'建造中',producing:'出兵 '+Math.max(0,Math.ceil((b.nextProduceAt-state.time)/1000))+'s',capacity:'12 名驻外 · 等待空位',waiting:'等待出兵空间',exhausted:'本营兵力已出完'}[b.status]||'';c.strokeText(status+' · 余 '+b.reserve+' 人',x,y+23);c.fillText(status+' · 余 '+b.reserve+' 人',x,y+23);c.restore();boxes.push({x:x-95,y:y-15,w:190,h:42});}return boxes;
}
export function drawWarSky(c,state,time){
 for(const e of state.warEvents||[]){if(!['meteor','storm','quake'].includes(e.kind))continue;const age=time-e.at;if(age<0||age>11500)continue;
 if(e.kind==='meteor')for(const h of state.hazards.filter(h=>h.eventId===e.id)){const remaining=h.impact-time;if(remaining>1900||remaining<-180)continue;const t=Math.max(0,remaining/1900),x=h.x+t*210,y=h.y-t*720;c.save();c.strokeStyle='#ff7f3b80';c.lineWidth=25;c.beginPath();c.moveTo(x+105,y-330);c.lineTo(x,y);c.stroke();c.strokeStyle='#ffdd89';c.lineWidth=9;c.beginPath();c.moveTo(x+65,y-215);c.lineTo(x,y);c.stroke();rect(c,'#563e35',x-19,y-23,38,35);rect(c,'#ffcf7f',x-13,y-10,26,19);rect(c,'#fff3c4',x-5,y+4,10,10);c.restore();}
 if(e.kind==='quake'){c.save();c.strokeStyle='#ebc28066';c.lineWidth=9;c.beginPath();for(let i=0;i<13;i++){const x=e.x-470+i*78,y=e.y+Math.sin(i*3.8)*45;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();c.restore();}
 }
}
