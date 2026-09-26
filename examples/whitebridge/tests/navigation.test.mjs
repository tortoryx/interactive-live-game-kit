import test from 'node:test';
import assert from 'node:assert/strict';
import {ArenaNavigation} from '../modules/arena/navigation.mjs';

const arena=()=>new ArenaNavigation([
  {id:'west',x:0,y:0,width:40,height:100},
  {id:'top',x:40,y:0,width:120,height:25},
  {id:'bottom',x:40,y:75,width:120,height:25},
  {id:'east',x:160,y:0,width:40,height:100},
]);
test('a hero or soldier routes around the central obstruction instead of walking through it',()=>{
  const nav=arena();const route=nav.plan({x:20,y:50},{x:180,y:50});
  assert.ok(route.points.length>=4);assert.ok(route.distance>160);
  for(let i=1;i<route.points.length;i++)for(let t=0;t<=1;t+=.01){
    const a=route.points[i-1],b=route.points[i];const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    assert.ok(!(x>40&&x<160&&y>25&&y<75));
  }
  nav.destroy();
});
test('a blocked lane invalidates old plans, routes via the other lane, and never teleports when both close',()=>{
  const nav=arena(),start={x:20,y:50},end={x:180,y:50};const old=nav.plan(start,end);
  nav.setClosedZones(['top']);assert.equal(nav.isCurrent(old),false);
  const detour=nav.plan(start,end);assert.ok(detour.points.some(p=>p.y>=75));
  nav.setClosedZones(['top','bottom']);assert.equal(nav.plan(start,end),null);
  nav.setClosedZones([]);assert.ok(nav.plan(start,end));
  nav.destroy();
});
test('pickup selection ignores unreachable items; outside positions cannot snap across a wall',()=>{
  const nav=arena();nav.setClosedZones(['top','bottom']);
  const selected=nav.closestReachable({x:20,y:50},[{id:'across',x:180,y:50},{id:'wall',x:50,y:50},{id:'nearby',x:20,y:80}]);
  assert.equal(selected.id,'nearby');assert.equal(nav.plan({x:50,y:50},{x:20,y:50}),null);
  assert.throws(()=>nav.plan({x:NaN,y:2},{x:20,y:20}));nav.destroy();
});
