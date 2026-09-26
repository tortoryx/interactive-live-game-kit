import test from 'node:test';
import assert from 'node:assert/strict';
import {frontlinePulse,frontlinePaths,FRONTLINE_COLORS,FrontlineOverlay} from '../modules/pixel-war/public/frontline-view.mjs';
class Path {rects=[];segments=[];rect(...v){this.rects.push(v);}moveTo(...v){this.segments.push(v);}lineTo(...v){this.segments.push(v);}}
test('frontline remains visible across the old pulse boundaries and while paused',()=>{
 for(const t of [0,400,1000,1550,4000,10000,15000,100000])assert.equal(frontlinePulse(t),1);
});
test('region boundaries omit same-side internal grid lines and use fixed faction colors',()=>{
 const r=frontlinePaths({x:100,y:200,cols:3,rows:1,cellSize:24,cells:new Uint8Array([1,1,2])},Path);
 assert.deepEqual(r.counts,[0,2,1]);assert.equal(r.edge[1].segments.length,12);assert.equal(r.edge[2].segments.length,8);
 assert.equal(FRONTLINE_COLORS.human,'#328fff');assert.equal(FRONTLINE_COLORS.demon,'#ff8a2c');
});
test('presentation follows a changing army without mutating units, and clears a dead army',()=>{
 const old=globalThis.Path2D;globalThis.Path2D=Path;
 try{
  const overlay=new FrontlineOverlay(),units=[{id:'a',side:'demon',kind:'sword',x:1000,y:1000,hp:1}],input=JSON.stringify(units),camera={x:1200,y:1000,w:1000,h:800,zoom:.5};
  const context={save(){},restore(){},translate(){},scale(){},fill(){},stroke(){},clip(){}};
  assert(overlay.draw(context,units,camera,300,1).demonCells>0);assert.equal(JSON.stringify(units),input);
  assert.equal(overlay.draw(context,[],camera,600,1).demonCells,0);
  assert.equal(overlay.draw(context,[],camera,300,2).humanCells,0);
  assert(overlay.draw(context,units,camera,300,2,400).alpha>0);
  assert.equal(overlay.draw(context,units,camera,300,2,4000).alpha,1);
  const wide={x:10240,y:1152,w:4800,h:2700,zoom:.4};overlay.draw(context,units,wide,1000,2);const cached=overlay.field;overlay.draw(context,units,wide,1010,2);assert.equal(overlay.field,cached); // pausing simulation must not strand a colored overlay
 }finally{globalThis.Path2D=old;}
});

test('updating a moving frontline never fades either faction or paints an old translucent layer',()=>{
 const old=globalThis.Path2D;globalThis.Path2D=Path;
 try{
  const overlay=new FrontlineOverlay(),camera={x:1200,y:1000,w:1000,h:800,zoom:.5};
  const units=[{id:'d',side:'demon',kind:'sword',x:1000,y:1000,hp:1},{id:'h',side:'human',kind:'sword',x:1400,y:1000,hp:1}];
  const fills=[],ctx={save(){},restore(){},translate(){},scale(){},clip(){},stroke(){},fill(p){fills.push({alpha:this.globalAlpha,path:p});}};
  for(const t of [0,250,275,340,430,500,625]){units[0].x=1000+t/10;fills.length=0;overlay.draw(ctx,units,camera,t,1,t);assert.equal(fills.length,2);assert(fills.every(f=>f.alpha===.28),'territory opacity must remain constant during movement');assert.equal(fills[0].path,overlay.paths.fill[1]);assert.equal(fills[1].path,overlay.paths.fill[2]);}
 }finally{globalThis.Path2D=old;}
});
