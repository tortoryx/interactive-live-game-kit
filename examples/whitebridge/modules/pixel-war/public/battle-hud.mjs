import {factionName,factionColor} from './faction-labels.mjs';
import {sparringProtected} from './deployment-feedback.mjs';
import {drawTacticalMap} from './tactical-map.mjs';
import {TONES} from './tactical-style.mjs';
import {battleMapBox} from './view-rhythm.mjs';
import {WIDTH,HEIGHT} from './terrain.mjs';
import {threatLane} from './threats.mjs';
export const FACTIONS={human:{name:'人族',cause:'击败魔族首领，把村民带回来。',reason:'魔族供粮修渠，也强征人血、不许村民离开。我们要保护他们，也让他们能自己选择。'},demon:{name:'魔族',cause:'击退勇者，守住村民的粮仓。',reason:'人类王庭以保护为名征粮征兵。我们不认他们的正义，更不能让村庄再被抢空。'}};
function icon(c,kind,x,y,color,size=6){c.save();c.translate(Math.round(x),Math.round(y));c.strokeStyle='#13271e';c.lineWidth=2;c.fillStyle=color;c.beginPath();if(kind==='king'){c.moveTo(-size,-size);c.lineTo(-size/2,0);c.lineTo(0,-size);c.lineTo(size/2,0);c.lineTo(size,-size);c.lineTo(size,size/2);c.lineTo(-size,size/2);}else if(kind==='beast'){c.moveTo(-size,-size);c.lineTo(0,-size/2);c.lineTo(size,-size);c.lineTo(size*.7,size*.7);c.lineTo(0,size);c.lineTo(-size*.7,size*.7);}else if(kind==='giant'){c.moveTo(0,-size);c.lineTo(size,0);c.lineTo(0,size);c.lineTo(-size,0);}else{c.moveTo(0,-size);c.lineTo(size,size*.8);c.lineTo(-size,size*.8);}c.closePath();c.stroke();c.fill();c.restore();}
export const drawBattleMap=drawTacticalMap;
export function commanderBox(u,camera){const p=camera.project(u);return {x:p.x-56,y:p.y-(81+(crownStack(crownCount(u)).height+12)*1.25)*camera.zoom-42,w:112,h:37};}
export function drawCommander(c,u,camera,side,actors,box,state={}){if(u.hp<=0)return;const p=camera.project(u),own=u.side===side,color=factionColor(u.side);
 c.save();c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,19,7,0,0,Math.PI*2);c.stroke();
 if(box){const x=box.x,y=box.y;c.fillStyle='#192b23dc';c.fillRect(x,y,box.w,box.h);actors.portrait(c,u,x+2,y+2,30);c.font='bold 9px sans-serif';c.textAlign='left';c.fillStyle=color;c.fillText((factionName(u.side)+' ')+u.name.slice(0,7),x+36,y+11);c.fillStyle='#485346';c.fillRect(x+36,y+16,72,5);c.fillStyle=color;c.fillRect(x+36,y+16,72*Math.max(0,u.hp/u.maxHP),5);c.font='9px monospace';c.fillStyle='#e9e9ce';c.fillText(sparringProtected(state,u)?'切磋保护':Math.ceil(u.hp)+' / '+Math.round(u.maxHP),x+36,y+32);}
 else {const y=p.y-(77+(crownStack(crownCount(u)).height+12)*1.25)*camera.zoom;c.fillStyle='#29392b';c.fillRect(p.x-21,y,42,4);c.fillStyle=color;c.fillRect(p.x-21,y,42*u.hp/u.maxHP,3);c.font='bold 9px sans-serif';c.textAlign='center';c.strokeStyle='#1b3027';c.lineWidth=3;const name=(factionName(u.side)+' ')+u.name;c.strokeText(name,p.x,y-5);c.fillText(name,p.x,y-5);}
 c.restore();}
import {crownCount,crownStack} from './crowns.mjs';
