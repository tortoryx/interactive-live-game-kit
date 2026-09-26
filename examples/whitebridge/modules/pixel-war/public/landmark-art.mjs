import {FACTIONS,MATERIALS} from './battle-theme.mjs';
const cache=new Map();
export const LANDMARK_BOUNDS={grain:{w:176,h:152},forge:{w:184,h:172},camp:{w:212,h:144},home:{w:252,h:226}};
export function landmarkSprite(kind,owner='human'){
 const key=kind+':'+owner;if(cache.has(key))return cache.get(key);const canvas=document.createElement('canvas');canvas.width=288;canvas.height=256;const c=canvas.getContext('2d');c.translate(144,236);const demon=owner==='demon',p={...MATERIALS,roof:FACTIONS[owner].roof,trim:FACTIONS[owner].trim,gold:MATERIALS.brass};
 const r=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);},poly=(color,points)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
 const wall=(x,y,w,h)=>{r(p.shade,x,y,w,h);r(p.stone,x+3,y,w-6,h-3);for(let row=0;row<h/10;row++)for(let col=0;col<w/19;col++){const xx=x+4+col*19+(row%2?8:0);if(xx<x+w-5)r(row%3===0?p.light:p.shade,xx,y+row*10,Math.min(15,x+w-xx-3),2);}};
 const roof=(x,y,w,h)=>{poly(p.dark,[[x-5,y+h],[x+w/2,y-5],[x+w+5,y+h]]);poly(p.roof,[[x,y+h-3],[x+w/2,y],[x+w,y+h-3]]);for(let i=8;i<h;i+=7)r(p.trim,x+w/2-i*w/(2*h),y+i,i*w/h,2);r(p.dark,x-4,y+h,w+8,5);};
 const door=(x,y,w,h)=>{r(p.dark,x,y,w,h);r(p.wood,x+3,y+3,w-6,h-3);for(let i=7;i<w-4;i+=6)r('#514d3c',x+i,y+4,2,h-4);r('#b3a078',x+4,y+h*.35,w-8,3);r('#b3a078',x+4,y+h*.75,w-8,3);};
 const sack=(x,y)=>{poly('#97886a',[[x-7,y],[x-9,y-11],[x-4,y-19],[x-5,y-23],[x+5,y-23],[x+4,y-19],[x+9,y-11],[x+7,y]]);r('#b7a682',x-4,y-15,3,12);r('#7e754a',x-5,y-20,10,2);};
 const crate=(x,y)=>{r('#4e4938',x,y,23,21);r('#79644e',x+2,y+2,19,17);r('#a08a69',x+3,y+4,17,3);r('#a08a69',x+3,y+14,17,3);r('#5d593f',x+10,y+2,2,17);};
 r('#2e403336',-LANDMARK_BOUNDS[kind].w/2,-9,LANDMARK_BOUNDS[kind].w,22);r('#676c61',-62,-3,124,12);r('#878c7c',-54,2,108,3);
 if(kind==='grain'){
  wall(-56,-93,110,90);r(p.wood,-47,-91,4,88);r(p.wood,40,-91,4,88);roof(-64,-142,128,57);door(-16,-60,32,57);r(p.gold,24,-72,17,22);r(p.dark,29,-70,3,18);r(p.dark,25,-63,14,3);
  wall(-78,-77,32,64);roof(-82,-101,40,29);for(let i=0;i<3;i++)sack(37+i*14,-3+(i%2)*6);crate(-57,-19);crate(-36,-18);sack(-59,-20);r('#95844d',-18,-104,35,15);for(let i=-11;i<=11;i+=6)r('#baa97c',i,-104,3,10);
 }else if(kind==='forge'){
  wall(-60,-89,120,86);roof(-64,-129,132,47);wall(33,-154,22,94);r(p.dark,29,-160,30,8);r('#b0a58a',29,-158,30,3);door(10,-65,24,62);r(p.dark,-49,-64,42,55);r('#b76639',-44,-59,32,47);r('#e69e54',-41,-40,26,26);r('#ffe4a0',-35,-34,14,19);r('#3b4036',-48,-17,37,5);r('#b6aaa0',-27,1,41,7);poly('#637c7a',[[-25,7],[8,7],[1,14],[-2,24],[-18,24],[-19,13]]);r('#3e534e',-26,24,30,6);for(let i=0;i<3;i++){r('#9b9e8c',38+i*9,-3-i*3,23,5);r('#566366',38+i*9,2-i*3,23,2);}crate(-75,-15);
 }else if(kind==='camp'){
  for(const x of [-100,-80,-60,40,60,80]){poly('#665e4d',[[x,2],[x,-48],[x+8,-60],[x+16,-48],[x+16,2]]);r('#918368',x+3,-44,3,44);}wall(-43,-71,88,70);roof(-53,-120,108,53);door(-16,-42,32,42);r(p.gold,-9,-78,18,10);crate(-67,-15);crate(48,-17);sack(73,-4);
 }else{
  for(const x of [-116,70]){wall(x,-141,46,145);if(demon){roof(x-9,-216,64,79);poly(p.gold,[[x+6,-210],[x-6,-224],[x+15,-211]]);}else{r(p.shade,x-5,-154,56,17);for(let i=0;i<4;i++)r(p.light,x-4+i*15,-166,9,17);}r(p.dark,x+17,-117,12,32);r(p.gold,x+20,-113,5,22);r(p.shade,x-3,-46,52,6);}
  wall(-77,-99,154,102);wall(-50,-158,100,77);roof(-57,-194,114,48);r(p.trim,-74,-98,148,8);for(let i=0;i<10;i++)r(p.light,-71+i*15,-111,10,17);door(-27,-62,54,65);poly(p.dark,[[-31,-62],[0,-89],[31,-62]]);r(p.gold,-6,-136,12,22);r(p.dark,-2,-132,4,14);r('#8d9283',-30,4,60,10);r('#727c70',-40,14,80,7);crate(-68,-17);sack(59,-3);
 }
 const value={canvas,pivot:{x:144,y:236},...LANDMARK_BOUNDS[kind]};cache.set(key,value);return value;
}
export function drawLandmark(c,kind,owner,x,y){const s=landmarkSprite(kind,owner);c.drawImage(s.canvas,Math.round(x)-s.pivot.x,Math.round(y)-s.pivot.y);}
export function drawHomeBadge(canvas,owner){if(canvas.dataset.drawn===owner)return;canvas.dataset.drawn=owner;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;const s=landmarkSprite('home',owner);c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(s.canvas,12,7,264,244,0,0,canvas.width,canvas.height);}
