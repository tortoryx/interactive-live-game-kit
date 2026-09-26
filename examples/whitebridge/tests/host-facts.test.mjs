import test from 'node:test';import assert from 'node:assert/strict';
import {spokenObserverContext,conversationalViewerContext} from '../modules/live-runtime/host-facts.mjs';
test('ordinary commentary has no exact low-health ticker; real state remains untouched',()=>{
 const r={topic:{reading:{kind:'leader_risk',hpPercent:8,guardsNear:0,enemiesNear:3}},scene:{counts:{human:22},leaders:[{hpPercent:8}],clusters:[{side:'human',sector:'右',count:22,fighting:3,types:[['sword',22]]}],analysis:{readings:[]}}};
 const c=spokenObserverContext(r);assert.equal(c.topic.reading.health,'危急');assert(!('hpPercent' in c.topic.reading));assert(!('counts'in c.scene));assert.equal(r.topic.reading.hpPercent,8);assert.equal(r.scene.counts.human,22);
});
test('viewer can still ask for exact health, and unknown enemy health is not invented',()=>{
 const data={hp:123,maxHP:900,enemy:{name:'勇者'}};
 assert.equal(conversationalViewerContext(data,{text:'还剩多少血？'}).hp,123);
 const casual=conversationalViewerContext(data,{text:'你是不是太怂了'});assert(!('hp'in casual));assert.deepEqual(casual.enemy,{name:'勇者'});
});
