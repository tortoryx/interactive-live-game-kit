export const WIDTH=4096,HEIGHT=2304,CELL=32,COLS=WIDTH/CELL,ROWS=HEIGHT/CELL;
export const CROSSINGS=[688,1152,1648];
export const TERRAIN={GRASS:0,ROAD:1,FOREST:2,HILL:3,WATER:4,ROCK:5,FORD:6,TREE:7,RUBBLE:8,BARRIER:9};
export function hash(x,y,seed=37){let h=Math.imul(x+374761393,668265263)^Math.imul(y+seed*17,2246822519);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
export const riverX=y=>2048+Math.sin((y-256)/240)*80+Math.sin((y-256)/99)*20;
const ellipses={forest:[[1010,738,150,90],[2038,1042,170,100],[670,380,330,240],[2360,1430,330,240],[930,1410,250,180],[2120,370,260,210]],hill:[[1040,610,340,180],[1990,1170,310,180],[520,1320,250,130],[2550,470,220,110]],rock:[[1260,630,90,58],[1790,1190,80,65],[850,230,65,45],[2200,1540,80,60]]};
for(const group of Object.values(ellipses))for(const e of group){e[0]+=512;e[1]+=256;}
const inside=(x,y,e)=>((x-e[0])/e[2])**2+((y-e[1])/e[3])**2<1;
export function terrainAt(x,y){
  if(x<32||y<32||x>WIDTH-32||y>HEIGHT-32)return TERRAIN.ROCK;
  const crossing=CROSSINGS.some(c=>Math.abs(y-c)<66),r=Math.abs(x-riverX(y));
  if(r<78)return crossing?TERRAIN.FORD:TERRAIN.WATER;
  if(ellipses.rock.some(e=>inside(x,y,e)))return TERRAIN.ROCK;
  const road=CROSSINGS.some(c=>Math.abs(y-(c+Math.sin((x-512)/200)*12))<27);
  if(road||(Math.abs(x-972)<30||Math.abs(x-3124)<30)&&y>596&&y<1736)return TERRAIN.ROAD;
  if(ellipses.forest.some(e=>inside(x,y,e)))return TERRAIN.FOREST;
  if(ellipses.hill.some(e=>inside(x,y,e)))return TERRAIN.HILL;
  return TERRAIN.GRASS;
}
export const WEIGHTS=[1,1,1.5,1.15,0,0,1.25,0,1.35,0];
export const BARRIERS=[{x:1808,y:1072},{x:2288,y:1072},{x:1808,y:1264},{x:2288,y:1264}];
// The map is immutable. Collision and sight checks share one tile lookup.
const tiles=Uint8Array.from({length:COLS*ROWS},(_,i)=>{const col=i%COLS,row=Math.floor(i/COLS);if(BARRIERS.some(p=>row===Math.floor(p.y/CELL)&&Math.abs(col-Math.floor(p.x/CELL))<=1))return TERRAIN.BARRIER;const t=terrainAt(col*CELL+CELL/2,row*CELL+CELL/2);return t===TERRAIN.FOREST&&hash(col-16,row-8)>.8?TERRAIN.TREE:t;});
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
export const CAMPS={demon:{x:972,y:1152},human:{x:3124,y:1152}};
export function scenery(){const items=[];for(let row=4;row<ROWS-3;row++)for(let col=4;col<COLS-3;col++){const t=gridTerrain(col,row),x=col*CELL+16,y=row*CELL+16,h=hash(x,y);if(t===TERRAIN.BARRIER)items.push({type:'barrier',x,y});else if(t===TERRAIN.TREE)items.push({type:'tree',x,y,variant:Math.floor(h*5)});else if(t===TERRAIN.ROCK&&h>.78)items.push({type:'rock',x,y,variant:Math.floor(h*4)});else if(t===TERRAIN.GRASS&&h>.991)items.push({type:'bush',x,y,variant:0});}return items;}
