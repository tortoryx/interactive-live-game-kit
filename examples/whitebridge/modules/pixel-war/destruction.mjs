import {igniteObjects} from './objects.mjs';
import {CELL,COLS,ROWS,TERRAIN,gridTerrain} from './public/terrain.mjs';
export function breakGround(w,point,radius,power,side,cause='blast',focus=null){
 if(!Number.isFinite(power)||power<180||!Number.isFinite(radius)||radius<50)return [];
 if(cause==='flame'){igniteObjects(w,point,radius);return [];}if(cause==='meteor')igniteObjects(w,point,radius*1.3);
 const prior=w.terrainChanges||{},patch={},candidates=[];let room=Math.max(0,512-Object.keys(prior).length);
 for(let row=Math.max(1,Math.floor((point.y-radius)/CELL));row<Math.min(ROWS-1,Math.ceil((point.y+radius)/CELL));row++)for(let col=Math.max(1,Math.floor((point.x-radius)/CELL));col<Math.min(COLS-1,Math.ceil((point.x+radius)/CELL));col++){
  const x=col*CELL+16,y=row*CELL+16,d=Math.hypot(x-point.x,y-point.y),key=row*COLS+col,original=gridTerrain(col,row);if(d>radius||prior[key]||original===TERRAIN.WATER)continue;if(['burn','chop'].includes(cause)&&key!==Math.floor(point.y/CELL)*COLS+Math.floor(point.x/CELL))continue;
  const obstacle=[TERRAIN.ROCK,TERRAIN.TREE,TERRAIN.BARRIER].includes(original);if(!obstacle&&d>radius*.58)continue;
  candidates.push({key,x,y,original,d,obstacle});
 }
 // Clear actual obstacles first, then carve the impact centre; never spend the budget on a row-order corner.
 const selected=candidates.sort((a,b)=>Number(b.obstacle)-Number(a.obstacle)||a.d-b.d).slice(0,40),evicted=new Set();
 // Retire old cosmetic craters when full, never resurrect a destroyed solid obstacle.
 if(room<selected.length){const fading=Object.entries(prior).filter(([,v])=>![TERRAIN.ROCK,TERRAIN.TREE,TERRAIN.BARRIER].includes(v.original)).sort((a,b)=>a[1].at-b[1].at);for(const [key]of fading){if(room>=selected.length)break;evicted.add(key);room++;}}
 const cells=selected.slice(0,room);
 for(const {key,original} of cells)patch[key]={kind:[TERRAIN.ROAD,TERRAIN.FORD].includes(original)?original:TERRAIN.RUBBLE,original,at:w.time,cause,angle:w.objectDamage?.[key]?.angle||0,blast:['burn','chop'].includes(cause)?null:{x:point.x,y:point.y,r:radius*.62}};
 if(cells.length){w.terrainChanges={...Object.fromEntries(Object.entries(prior).filter(([key])=>!evicted.has(key))),...patch};w.terrainRevision=(w.terrainRevision||0)+1;w.emit('destruction',{x:point.x,y:point.y,radius,focus,side:side||'neutral',cells});if(['human','demon'].includes(side)&&cells.some(p=>p.obstacle))w.react(side,'Break',2);}
 return cells;
}
