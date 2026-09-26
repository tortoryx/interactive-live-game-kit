import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {Camera,overviewTarget} from '../modules/pixel-war/public/camera.mjs';
import {battleMapBox} from '../modules/pixel-war/public/view-rhythm.mjs';
import {drawLandscape,applyTerrainDamage,CHUNK_CACHE_BYTES} from '../modules/pixel-war/public/terrain-renderer.mjs';

test('overview includes both leaders and north/south landmarks without changing the simulation',()=>{
 const g=new LiveGame();try{const s=g.snapshot(),before=structuredClone(s);for(const side of ['human','demon']){
  const c=new Camera(side);for(let i=0;i<150;i++)c.follow(s,1/30);
  assert(Math.abs(c.zoom-.425)<1e-9);assert(c.w>2200&&c.w<2300);assert.equal(c.shot,'overview');
  for(const p of [...Object.values(s.heroes),...s.campaign.sites]){const q=c.project(p);assert(q.x>80&&q.x<880);assert(q.y>70&&q.y<500);}
 }assert.deepEqual(s,before);}finally{g.close();}
});
test('an event gets one smooth close-up and dwell, then returns to overview without replaying it',()=>{
 const g=new LiveGame();try{const s=g.snapshot(),c=new Camera('demon');c.follow(s,.03);const start={x:c.x,zoom:c.zoom};s.warEvents=[{id:'meteor',kind:'meteor',x:start.x+600,y:900,at:0,until:20000}];
 let highest=0,focus=0,previous={x:c.x,y:c.y,z:c.zoom};for(let i=0;i<450;i++){s.time=i*1000/30;c.follow(s,1/30);highest=Math.max(highest,c.zoom);if(c.zoom>.46)focus++;assert(Math.hypot(c.x-previous.x,c.y-previous.y)*c.zoom<18);assert(Math.abs(c.zoom-previous.z)<.02);previous={x:c.x,y:c.y,z:c.zoom};}
 assert(highest>.46);assert(focus>45);assert(Math.abs(c.zoom-start.zoom)<.001);assert.equal(c.shot,'overview');assert(Math.abs(c.x-start.x)<1);
 }finally{g.close();}
});
test('overview is 25 percent closer on narrow and wide screens and never retreats for scattered armies',()=>{
 const g=new LiveGame();try{const s=g.snapshot();for(const width of [678,960,1271]){
  const expected=1.25*Math.max(.20,Math.min(.34,width/2800,540/1500));
  assert.equal(overviewTarget(s,width,540).zoom,expected);
  const scattered={...s,units:[...s.units,{hp:100,x:20000,y:2250},{hp:100,x:100,y:20}]};
  assert.equal(overviewTarget(scattered,width,540).zoom,expected);
 }}finally{g.close();}
});
test('map and its alert header stay in the top-left; removed camera identity card is absent',()=>{
 for(const screenW of [640,960,1440])for(const expansion of [0,1]){const b=battleMapBox({screenW,screenH:540},expansion);assert(b.x<20);assert(b.y-44>=0);assert(b.y+b.h<220);assert(b.x+b.w<screenW*.32);}
 const html=readFileSync('modules/pixel-war/public/stage.html','utf8');assert(!html.includes('id="allegiance"'));assert(!html.includes('id="portrait"'));
});
test('wide terrain retains every visible chunk, invalidates destruction at both detail levels and stays memory bounded',()=>{
 const previous=global.document,ctx=new Proxy({},{get:()=>()=>{}});global.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
 try{const land={canvas:{getContext:()=>ctx},chunks:new Map(),changes:{},painted:0,chunkBytes:0};const c={x:10240,y:1152,w:4000,h:2000,zoom:.3};drawLandscape(ctx,land,c);const painted=land.painted;assert(painted>24);for(let i=0;i<20;i++)drawLandscape(ctx,land,c);assert.equal(land.painted,painted,'overview must not redraw an evicted visible chunk every frame');
 drawLandscape(ctx,land,{...c,w:1400,h:800,zoom:.7});assert(land.chunks.has('20:2:0.5'));assert(land.chunks.has('20:2:1'));
 const cell=33*640+321;applyTerrainDamage(land,{fieldEpoch:1,terrainRevision:1,terrainChanges:{[cell]:{at:1,kind:8}}});assert(!land.chunks.has('20:2:0.5'));assert(!land.chunks.has('20:2:1'));
 for(let x=3000;x<18000;x+=700)drawLandscape(ctx,land,{...c,x});assert(land.chunkBytes<=CHUNK_CACHE_BYTES);
 }finally{global.document=previous;}
});
