import {gridTerrain as baseGrid,hash} from './terrain-base.mjs';
export {hash};
export const WIDTH=20480,HEIGHT=2304,CELL=32,COLS=WIDTH/CELL,ROWS=HEIGHT/CELL;
export const CROSSINGS=[688,1152,1648];
export const TERRAIN={GRASS:0,ROAD:1,FOREST:2,HILL:3,WATER:4,ROCK:5,FORD:6,TREE:7,RUBBLE:8,BARRIER:9};
export const START_X=WIDTH/2,START_Y=1152,MAP_REVISION=3,MAP_SHIFT_X=8192;
export const REGION_NAMES=['魔族祖庭','玄石城郊','夜杉深林','灰烬山口','苔原猎场','暮色林地','魔族粮地','断壁丘陵','白桥盆地','王国前哨','金穗麦田','橡林牧地','石脊隘道','风车平野','人族村镇','王都城郊','人族家园'];
export const regionAt=x=>Math.max(0,Math.min(16,Math.round((x-START_X)/1024)+8));
export function biomeAt(x,y=1152){const region=regionAt(x),side=x<START_X-500?'demon':x>START_X+500?'human':'border',key=side==='border'?'border':side==='demon'?(region%4===1?'ash':region%4===0?'stone':'pine'):(region%4===1?'stone':region%4===3?'meadow':'wheat');return {key,side,name:REGION_NAMES[region],region};}
export const riverX=(y,section=2)=>2048+section*4096+Math.sin((y-256)/240)*80+Math.sin((y-256)/99)*20;
export const WEIGHTS=[1,.85,1.65,1.25,0,0,1.45,0,1.35,0];
export const BARRIERS=Array.from({length:5},(_,i)=>[{x:1808+i*4096,y:1072},{x:2288+i*4096,y:1072},{x:1808+i*4096,y:1264},{x:2288+i*4096,y:1264}]).flat();
export function terrainAt(x,y){
 if(x<32||y<32||x>WIDTH-32||y>HEIGHT-32)return TERRAIN.ROCK;
 const col=Math.floor(x/CELL),row=Math.floor(y/CELL),local=col%128;
 // The existing battlefield remains an exact collision island during migration.
 let t=baseGrid(Math.max(1,Math.min(126,local)),row);
 if(local===0||local===127)t=CROSSINGS.some(c=>Math.abs(y-c)<32)?TERRAIN.ROAD:TERRAIN.GRASS;
 if(x>=8192&&x<12288)return t;
 if([TERRAIN.WATER,TERRAIN.FORD,TERRAIN.ROAD,TERRAIN.BARRIER,TERRAIN.ROCK,TERRAIN.TREE].includes(t))return t;
 const n=hash(Math.floor(x/192),Math.floor(y/160)),region=regionAt(x);
 if(x<START_X&&n>.56)t=TERRAIN.FOREST;
 if([1,3,7,9,12,15].includes(region)&&n<.48)t=TERRAIN.HILL;
 // Ridges have three real passes; the north and south approaches differ from the centre.
 const ridge=256+(region%2)*64;if(Math.abs(x-(2048+(region-0)*1024+ridge))<44&&!CROSSINGS.some(c=>Math.abs(y-c)<110)&&y>260&&y<2060)t=TERRAIN.ROCK;
 return t===TERRAIN.FOREST&&hash(col,row)>.86?TERRAIN.TREE:t;
}
const tiles=Uint8Array.from({length:COLS*ROWS},(_,i)=>terrainAt((i%COLS)*CELL+16,Math.floor(i/COLS)*CELL+16));
export function terrainCombatMultiplier(source,target,changes){if(!source?.projectile)return 1;const a=gridTerrain(Math.floor(source.x/CELL),Math.floor(source.y/CELL),changes),b=gridTerrain(Math.floor(target.x/CELL),Math.floor(target.y/CELL),changes);return (a===TERRAIN.HILL&&b!==TERRAIN.HILL?1.15:1)*([TERRAIN.FOREST,TERRAIN.TREE].includes(b)?.75:1);}
export function terrainBenefit(x,y,changes){const t=gridTerrain(Math.floor(x/CELL),Math.floor(y/CELL),changes);return ({[TERRAIN.FOREST]:'林地掩护 · 远程减伤 25%',[TERRAIN.HILL]:'高地射击 · 远程增伤 15%',[TERRAIN.ROAD]:'道路行军 · 移动更快',[TERRAIN.FORD]:'涉水渡口 · 行军减速'})[t]||'';}
export function gridTerrain(col,row,changes){return col>=0&&row>=0&&col<COLS&&row<ROWS?(changes?.[row*COLS+col]?.kind??tiles[row*COLS+col]):TERRAIN.ROCK;}
export function passable(x,y,changes){if(!Number.isFinite(x)||!Number.isFinite(y)||x<32||y<32||x>=WIDTH-32||y>=HEIGHT-32)return false;return WEIGHTS[gridTerrain(Math.floor(x/CELL),Math.floor(y/CELL),changes)]>0;}
export function clearSegment(a,b,changes){
 if(!passable(a.x,a.y,changes)||!passable(b.x,b.y,changes))return false;
 let x=Math.floor(a.x/CELL),y=Math.floor(a.y/CELL);const endX=Math.floor(b.x/CELL),endY=Math.floor(b.y/CELL),dx=b.x-a.x,dy=b.y-a.y,sx=Math.sign(dx),sy=Math.sign(dy),stepX=dx?CELL/Math.abs(dx):Infinity,stepY=dy?CELL/Math.abs(dy):Infinity;
 let crossX=dx?((sx>0?(x+1)*CELL:x*CELL)-a.x)/dx:Infinity,crossY=dy?((sy>0?(y+1)*CELL:y*CELL)-a.y)/dy:Infinity;
 const open=(cx,cy)=>cx>=0&&cy>=0&&cx<COLS&&cy<ROWS&&WEIGHTS[gridTerrain(cx,cy,changes)]>0;
 for(let n=0;n<COLS+ROWS+4;n++){if(x===endX&&y===endY)return true;if(Math.abs(crossX-crossY)<1e-10){if(!open(x+sx,y)||!open(x,y+sy))return false;x+=sx;y+=sy;crossX+=stepX;crossY+=stepY;}else if(crossX<crossY){x+=sx;crossX+=stepX;}else{y+=sy;crossY+=stepY;}if(!open(x,y))return false;}return false;
}
export function nearestGround(p,changes){if(passable(p.x,p.y,changes))return {x:p.x,y:p.y};for(let r=16;r<256;r+=16)for(let i=0;i<16;i++){const q={x:p.x+Math.cos(i*Math.PI/8)*r,y:p.y+Math.sin(i*Math.PI/8)*r};if(passable(q.x,q.y,changes))return q;}return null;}
export const CAMPS={demon:{x:START_X-1076,y:1152},human:{x:START_X+1076,y:1152}};
export function scenery(){const items=[];for(let row=4;row<ROWS-3;row++)for(let col=4;col<COLS-3;col++){const t=gridTerrain(col,row),x=col*CELL+16,y=row*CELL+16,h=hash(x,y);if(t===TERRAIN.BARRIER)items.push({type:'barrier',x,y});else if(t===TERRAIN.TREE)items.push({type:'tree',x,y,variant:Math.floor(h*5)});else if(t===TERRAIN.ROCK&&h>.78)items.push({type:'rock',x,y,variant:Math.floor(h*4)});else if(t===TERRAIN.GRASS&&h>.991)items.push({type:'bush',x,y,variant:0});}return items;}
