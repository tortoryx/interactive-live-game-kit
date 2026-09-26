import AStar from 'javascript-astar';
import {CELL,COLS,ROWS,WEIGHTS,gridTerrain,passable,clearSegment,nearestGround} from './public/terrain.mjs';
export class FieldNavigation{
  constructor(readChanges=()=>null){this.readChanges=readChanges;this.refresh();}
  refresh(){const changes=this.readChanges();if(!this.graph){this.graph=new AStar.Graph(Array.from({length:COLS},(_,x)=>Array.from({length:ROWS},(_,y)=>WEIGHTS[gridTerrain(x,y,changes)])),{diagonal:false});}else{for(const key of new Set([...Object.keys(this.changes||{}),...Object.keys(changes||{})])){const x=Number(key)%COLS,y=Math.floor(Number(key)/COLS);if(this.graph.grid[x]?.[y])this.graph.grid[x][y].weight=WEIGHTS[gridTerrain(x,y,changes)];}}this.changes=changes;}

  plan(start,end){
    if(this.changes!==this.readChanges())this.refresh();
    const goal=nearestGround(end,this.changes);if(!goal||!passable(start.x,start.y,this.changes))return null;
    if(clearSegment(start,goal,this.changes))return[goal];
    const a=this.graph.grid[Math.floor(start.x/CELL)]?.[Math.floor(start.y/CELL)],b=this.graph.grid[Math.floor(goal.x/CELL)]?.[Math.floor(goal.y/CELL)];
    if(!a||!b||!a.weight||!b.weight)return null;
    const path=AStar.astar.search(this.graph,a,b).map(n=>({x:n.x*CELL+CELL/2,y:n.y*CELL+CELL/2}));
    if(!path.length&&a!==b)return null;path.push(goal);
    const result=[];let anchor=start;
    for(let i=0;i<path.length;){let last=i;while(last+1<path.length&&clearSegment(anchor,path[last+1],this.changes))last++;result.push(path[last]);anchor=path[last];i=last+1;}
    return result;
  }
}
