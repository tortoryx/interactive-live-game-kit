import {factionName,factionColor} from './faction-labels.mjs';
import {overlaps} from './label-layout.mjs';
// Display distance is in world metres: one tile (32 pixels) is two metres.
export const PIXELS_PER_METRE=16;
export function enemyIndicator(camera,enemy,own,w=960,h=540){
 const dx=(enemy.x-camera.x)*(camera.zoom||1),dy=(enemy.y-camera.y)*(camera.zoom||1);
 if(enemy.hp<=0||Math.abs(dx)<w/2-20&&dy>-h/2+58&&dy<h/2-12)return null;
 const x0=w/2,y0=h/2,left=28,right=w-28,top=105,bottom=h-125;
 const tx=dx>0?(right-x0)/dx:dx<0?(left-x0)/dx:Infinity,ty=dy>0?(bottom-y0)/dy:dy<0?(top-y0)/dy:Infinity;
 const t=Math.max(0,Math.min(tx,ty));
 return {x:x0+dx*t,y:y0+dy*t,angle:Math.atan2(dy,dx),metres:Math.max(1,Math.round(Math.hypot(enemy.x-own.x,enemy.y-own.y)/PIXELS_PER_METRE)),health:Math.max(0,Math.min(1,enemy.hp/enemy.maxHP))};
}
export function enemyCardBox(marker,w,h,occupied=[]){if(!marker)return null;const width=140,height=40,left=Math.max(12,Math.min(w-width-12,marker.x-(Math.cos(marker.angle)>.35?width+18:Math.cos(marker.angle)<-.35?-20:width/2))),top=Math.max(105,Math.min(h-124,marker.y-23));
 const candidates=[{x:left,y:top},...[-70,70,-140,140].map(d=>({x:left,y:top+d})),{x:w-width-20,y:105},{x:w/2-width/2,y:105}];
 for(const p of candidates){const b={...p,w:width,h:height};if(b.y<100||b.y+height>h-24||occupied.some(a=>overlaps(a,b)))continue;return b;}return {x:w-width-20,y:105,w:width,h:height};}
export function drawEnemyIndicator(c,marker,enemy,w=960,h=540,actors,box=enemyCardBox(marker,w,h)){
 if(!marker)return;c.save();c.translate(Math.round(marker.x),Math.round(marker.y));c.rotate(marker.angle);c.fillStyle=factionColor(enemy.side);c.strokeStyle='#332920';c.lineWidth=3;c.beginPath();c.moveTo(13,0);c.lineTo(-8,-8);c.lineTo(-4,0);c.lineTo(-8,8);c.closePath();c.stroke();c.fill();c.restore();
 const x=box.x,y=box.y;c.save();c.fillStyle='#15271ed9';c.fillRect(x,y,box.w,box.h);if(actors)actors.portrait(c,enemy,x+4,y+6,27);const tx=x+36;c.textAlign='left';c.font='bold 10px sans-serif';c.fillStyle='#ffd1a6';c.fillText(factionName(enemy.side)+' '+enemy.name.slice(0,7),tx,y+12,99);c.fillStyle='#455044';c.fillRect(tx,y+18,98,4);c.fillStyle=factionColor(enemy.side);c.fillRect(tx,y+18,98*marker.health,4);c.font='8px monospace';c.fillStyle='#e5dfbb';c.fillText(marker.metres+'米 · '+Math.ceil(enemy.hp)+'/'+Math.round(enemy.maxHP),tx,y+33,99);c.restore();
}
