import {buildFrontlineField} from './frontline-field.mjs';
import {factionColor} from './faction-labels.mjs';
import {WIDTH,HEIGHT} from './terrain.mjs';
import {FACTIONS} from './battle-theme.mjs';

export const FRONTLINE_COLORS={human:FACTIONS.human.color,demon:FACTIONS.demon.color};
// Persistent influence: only geometry updates, never opacity.
export function frontlinePulse(){return 1;}
export function frontlinePaths(field,Path=Path2D){
 const n=field.teams?.length||3,fill=Array.from({length:n},(_,i)=>i?new Path():null),edge=Array.from({length:n},(_,i)=>i?new Path():null),counts=Array(n).fill(0);
 const {x,y,cellSize:s,cols,rows,cells}=field;
 for(let r=0;r<rows;r++)for(let q=0;q<cols;q++){
  const value=cells[r*cols+q];if(!value)continue;counts[value]++;
  const left=x+q*s,top=y+r*s;fill[value].rect(left,top,s,s);
  const segment=(ax,ay,bx,by)=>{edge[value].moveTo(ax,ay);edge[value].lineTo(bx,by);};
  if(q===0||cells[r*cols+q-1]!==value)segment(left,top,left,top+s);
  if(q===cols-1||cells[r*cols+q+1]!==value)segment(left+s,top,left+s,top+s);
  if(r===0||cells[(r-1)*cols+q]!==value)segment(left,top,left+s,top);
  if(r===rows-1||cells[(r+1)*cols+q]!==value)segment(left,top+s,left+s,top+s);
 }
 return {fill,edge,counts};
}
export class FrontlineOverlay {
 constructor(){this.updatedAt=-Infinity;this.field=null;this.epoch=null;}
 draw(c,units,camera,time,epoch,presentationTime=time){
  const alpha=frontlinePulse(presentationTime);
  if(this.epoch!==epoch||time<this.updatedAt){this.field=null;this.paths=null;this.updatedAt=-Infinity;this.epoch=epoch;}
  const outside=this.field&&(Math.max(0,camera.x-camera.w/2)<this.field.x||Math.max(0,camera.y-camera.h/2)<this.field.y||Math.min(WIDTH,camera.x+camera.w/2)>this.field.x+this.field.cols*this.field.cellSize||Math.min(HEIGHT,camera.y+camera.h/2)>this.field.y+this.field.rows*this.field.cellSize);
  if(!this.field||time-this.updatedAt>=250||outside){
   const began=performance.now();
   const field=buildFrontlineField({units,view:{x:camera.x,y:camera.y,w:camera.w+160,h:camera.h+160},cellSize:24,influence:150});
   this.field=field;this.paths=frontlinePaths(field);this.updatedAt=time;this.computeMs=performance.now()-began;
  }
  const stats={alpha,persistent:true,periodMs:0,flashes:0,teams:this.field.teams||[null,'human','demon'],humanCells:this.paths.counts[1],demonCells:this.paths.counts[2],cells:this.field.cells.length,cellSize:this.field.cellSize,computeMs:this.computeMs};
  if(alpha<=0)return stats;
  c.save();c.translate(-(camera.x-camera.w/2)*camera.zoom,-(camera.y-camera.h/2)*camera.zoom);c.scale(camera.zoom,camera.zoom);
  const paint=paths=>{
   if(!paths)return;
   c.lineJoin='round';
   for(const [value,side] of (this.field.teams||[null,'human','demon']).map((t,i)=>[i,t]).slice(1)){
    c.fillStyle=(FRONTLINE_COLORS[side]||factionColor(side));c.globalAlpha=alpha*.28;c.fill(paths.fill[value]);
    // Dark casing separates territory from roads, craters and attack flashes.
    c.strokeStyle='#172027';c.globalAlpha=alpha*.85;c.lineWidth=7.5/camera.zoom;c.stroke(paths.edge[value]);
   }
   for(const [value,side] of (this.field.teams||[null,'human','demon']).map((t,i)=>[i,t]).slice(1)){
    // Inset both borders into their own territory. At contact, orange must not
    // paint over blue just because it is rendered second.
    c.save();c.clip(paths.fill[value]);c.strokeStyle=(FRONTLINE_COLORS[side]||factionColor(side));
    c.globalAlpha=alpha*.92;c.lineWidth=6/camera.zoom;c.stroke(paths.edge[value]);
    c.strokeStyle=(FACTIONS[side]?.ink||factionColor(side));c.globalAlpha=alpha*.9;c.lineWidth=1.5/camera.zoom;c.stroke(paths.edge[value]);c.restore();
   }
  };
  paint(this.paths);c.restore();return stats;
 }
}
