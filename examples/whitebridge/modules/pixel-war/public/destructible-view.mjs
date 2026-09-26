import {COLS,CELL,TERRAIN} from './terrain.mjs';
import {drawScenery} from './landscape.mjs';
export const objectKey=o=>Math.floor(o.y/CELL)*COLS+Math.floor(o.x/CELL);
export function visibleScenery(land,o,time){const entry=land.changes?.[objectKey(o)];return o.kind==='camp'||!entry||time-entry.at<2300;}
export function drawDestructible(c,o,state,time){
 const key=objectKey(o),entry=state.terrainChanges?.[key],wound=state.objectDamage?.[key];
 if(!entry){c.save();if(wound&&time-wound.lastHitAt<170){c.translate(Math.sin((time-wound.lastHitAt)/22)*3,0);}drawScenery(c,o);c.restore();}
 else {const t=Math.max(0,(time-entry.at)/1000);if(t<2.3){c.save();c.translate(o.x,o.y);if(o.kind==='tree'){const a=Math.min(1,t/1.3);c.rotate((Math.cos(entry.angle||0)>=0?1:-1)*a*a*1.48);c.globalAlpha=Math.max(0,1-(t-1.5)/.8);drawScenery(c,{...o,x:0,y:0});}else for(let i=0;i<12;i++){c.fillStyle=o.kind==='barrier'?(i%2?'#c99b62':'#5d4231'):(i%2?'#afa993':'#4f5c52');const a=i*2.4;c.globalAlpha=1-t/2.3;c.fillRect(Math.cos(a)*t*65,Math.sin(a)*t*30-75*t+42*t*t,o.kind==='barrier'?12:6,4);}c.restore();}}
 if(wound&&!entry){c.save();c.fillStyle='#1e2e24';c.fillRect(o.x-16,o.y-72,32,4);c.fillStyle=wound.burnUntil>time?'#ffb34e':'#dbb783';c.fillRect(o.x-16,o.y-72,32*Math.max(0,wound.hp/wound.maxHP),3);c.restore();}
}
export function drawFires(c,state,camera,time){for(const o of Object.values(state.objectDamage||{})){if(!(o.burnUntil>time)||!camera.visible(o,100))continue;c.save();c.translate(o.x,o.y);for(let i=0;i<9;i++){const f=((time-o.burnAt)/650+i*.17)%1,x=Math.sin(i*2.4)*19,y=-7-f*68;c.globalAlpha=(1-f)*.85;c.fillStyle=i%3?'#fc8137':'#ffdd75';c.fillRect(x-f*4,y,7*(1-f)+3,14*(1-f)+5);}for(let i=0;i<4;i++){const f=((time-o.burnAt)/2100+i*.25)%1;c.globalAlpha=.35*(1-f);c.fillStyle='#393b38';c.fillRect(-16+f*30,-65-f*65,20+f*20,16+f*12);}c.restore();}}
