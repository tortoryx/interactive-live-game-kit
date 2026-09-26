import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {beginSettlement,advanceSettlement} from '../modules/pixel-war/settlement.mjs';
import {retinueActors} from '../modules/pixel-war/public/legacy-view.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';

test('the giant shown during the sixth handoff becomes the same live actor and survives checkpoint restore',()=>{
 const g=new LiveGame();try{
  const w=g.world;g.testGift({side:'human',reward:'sentinel',id:'test:preserve-viewer'});for(let i=0;i<3;i++)g.drain();const playerIds=w.units.map(u=>u.id);
  w.ranks.demon=5;w.heroes.demon=w.makeHero('demon',5);w.heroes.human.hp=3123;w.mode='test_live';w.heroes.demon.hp=0;beginSettlement(w,['demon']);
  w.time=w.result.startedAt+w.result.timing.handoff;advanceSettlement(w,0);const shown=w.result.retinues[0].units;assert.equal(shown.length,1);assert.equal(shown[0].kind,'colossus');
  w.time=w.result.startedAt+w.result.timing.arrival+1000;const display=retinueActors(g.snapshot());assert(display.some(u=>u.id===shown[0].id));
  g.restore(g.capture());w.time=w.result.startedAt+w.result.timing.end;advanceSettlement(w,0);g.step(50);
  const unit=w.units.find(u=>u.id===shown[0].id);assert(unit,'the shown giant must not vanish at resume');assert.equal(unit.kind,'colossus');assert.equal(unit.legacy.key,'quake');assert(Math.hypot(unit.x-shown[0].x,unit.y-shown[0].y)<60);
  assert.equal(w.heroes.human.hp,3123);assert(playerIds.every(id=>w.units.some(u=>u.id===id)));
  const wire=decodeFrame(encodeFrame(g.snapshot()));assert(wire.units.some(u=>u.id===unit.id&&u.kind==='colossus'));
  g.restore(g.capture());g.step(50);assert.equal(w.units.filter(u=>u.id===unit.id).length,1);assert.equal(retinueActors(g.snapshot()).length,0);
 }finally{g.close();}
});
