import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {teamOf,hostile,allied} from '../modules/pixel-war/public/allegiance.mjs';
import {createClan,clanName,updateClans,clanSpawnPoint} from '../modules/pixel-war/clans.mjs';
import {warEventPlan,launchOwnedEvent} from '../modules/pixel-war/owned-events.mjs';
import {applyCommanderSupport} from '../modules/pixel-war/commander-support.mjs';
import {rememberFallen,reviveIdentity} from '../modules/pixel-war/viewer-troops.mjs';
import {updateEncounters} from '../modules/pixel-war/encounters.mjs';
import {buildBarracks,updateBarracks} from '../modules/pixel-war/barracks.mjs';
import {WAR_INCANTATIONS} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {buildFrontlineField} from '../modules/pixel-war/public/frontline-field.mjs';
import {encodeFrame,decodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
let serial=0;
const event=(actor,text,name=actor)=>({id:'bilibili:clan-test-'+(++serial),platform:'bilibili',kind:'chat',actor,text,at:Date.now(),supporter:{name,avatarKey:'a'.repeat(40)}});
const fixture=()=>{const g=new LiveGame();g.meta.broadcastMode='bilibili-first';g.meta.liveEnabled=true;g.world.paused=false;return g;};
const chat=(g,actor,text,name)=>g.receive(event(actor,text,name));
const clanFor=(g,actor)=>Object.values(g.world.clans).find(c=>c.founder.name===actor);
const ticks=(g,n)=>{for(let i=0;i<n;i++)g.step(50);};
test('chat creates a one-life avatar general, joins its faction, deduplicates receipts and preserves it on restore',()=>{
 const g=fixture();try{const e=event('alpha','自立门户','阿山'),r=g.receive(e);assert.equal(r.status,'clan_created');assert(g.receive(e).duplicate);assert.equal(Object.keys(g.world.clans).length,1);
 const c=clanFor(g,'阿山'),h=g.world.units.find(u=>u.id===c.leaderId);assert.equal(c.name,'阿族');assert(h.oneLife&&h.commander);assert.equal(h.name,'阿山');assert.equal(h.supporter.avatarKey,'a'.repeat(40));assert.equal(h.hp,h.maxHP);
 assert.equal(chat(g,'joiner','加入阿族','同伴').status,'clan_joined');chat(g,'joiner','参战','同伴');assert.equal(g.meta.queue.at(-1).faction,c.id);ticks(g,8);const troop=g.world.units.find(u=>u.supporter?.name==='同伴');assert(troop);assert(allied(troop,h));assert.equal(troop.factionColor,h.factionColor);
 const wire=decodeFrame(encodeFrame(g.snapshot())),decoded=wire.units.find(u=>u.id===h.id);assert.equal(decoded.faction,c.id);assert.equal(decoded.commander,true);assert.deepEqual(decoded.equipment,h.equipment);assert.equal(decoded.scale,h.scale);
 h.hp-=317;const saved=g.capture();g.restore(saved);const restored=g.world.units.find(u=>u.id===h.id);assert.equal(restored.hp,h.hp);assert.equal(restored.maxHP,h.maxHP);assert.equal(restored.attack,h.attack);assert.equal(g.world.clans[c.id].leaderId,h.id);assert.equal(playMenu(g,'demon').clans[0].name,'阿族');
 assert.equal(chat(g,'joiner','加入人族','同伴').status,'faction_selected');chat(g,'joiner','参战','同伴');assert(!g.meta.queue.at(-1).faction);assert.equal(g.meta.queue.at(-1).side,'human');assert.equal(troop.faction,c.id,'existing troops never defect');
 }finally{g.close();}
});
test('two-character names, reserved names and duplicate initials remain addressable with numbered join commands',()=>{
 assert.equal([...clanName('ßtest')].length,2);assert.equal(clanName('🌙王小明'),'王族');assert.equal([...clanName('𠮷野')].length,2);
 const g=fixture();try{chat(g,'a','自立门户','王一');chat(g,'b','自立门户','王二');chat(g,'c','自立门户','人间');const cs=Object.values(g.world.clans);assert.equal(new Set(cs.map(c=>c.color)).size,3);
 const r=chat(g,'j','加入王族');assert.equal(r.status,'clan_rejected');assert(r.interaction.message.includes('#'));
 assert.equal(chat(g,'j','加入王族#'+cs[1].number).status,'clan_joined');assert.equal(chat(g,'j','加入人族#'+cs[2].number).status,'clan_joined');assert.equal(chat(g,'j','加入人族').status,'faction_selected');
 }finally{g.close();}
});
test('all four allegiances fight one another; attacks and splash never harm their own clan',()=>{
 const g=fixture();try{chat(g,'a','自立门户','阿甲');chat(g,'b','自立门户','波乙');const w=g.world,clans=Object.values(w.clans),[a,b]=clans.map(c=>w.units.find(u=>u.id===c.leaderId)),actors=[w.heroes.human,w.heroes.demon,a,b];
 for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.equal(hostile(actors[i],actors[j]),i!==j);assert(hostile('human','clan-1'));
 const ally={...w.fighter(a.side,'militia',UNITS.militia,a.x+15,a.y),faction:a.faction};w.units.push(ally);w.attack(a,ally);assert.equal(a.action,null);
 const target=w.heroes[a.side];Object.assign(a,{x:10240,y:1152,range:80,readyAt:0,crit:0});Object.assign(target,{x:10285,y:1152});w.attack(a,target,'slash');assert(a.action);w.time=a.action.contactAt;for(const hit of w.tickActions(w.allAlive()))w.resolveHit(...hit);assert(target.hp<target.maxHP);
 const enemyBefore=b.hp,allyBefore=ally.hp;Object.assign(b,{x:a.x,y:a.y+30});Object.assign(ally,{x:a.x+15,y:a.y});w.hazards=[{id:123,kind:'meteor',x:a.x,y:a.y,radius:180,impact:w.time,until:w.time+2000,nextPulse:w.time,sourceSnapshot:a,sourceId:a.id,hit:false}];const pending=[];updateEncounters(w,w.allAlive(),pending);for(const hit of pending)w.resolveHit(...hit);assert(b.hp<enemyBefore);assert.equal(ally.hp,allyBefore);
 }finally{g.close();}
});
test('gifts, spells, commander healing and free orders use the clan general and actual allegiance',()=>{
 const g=fixture();try{chat(g,'a','自立门户','阿甲');const w=g.world,c=Object.values(w.clans)[0],h=w.units.find(u=>u.id===c.leaderId);chat(g,'b','加入阿族','伙伴');
 g.configureMappings([{platform:'bilibili',giftId:98765,reward:'rally',multiplier:1}]);g.receive({...event('b','','伙伴'),kind:'gift',giftId:98765,quantity:1,paid:true,amountMilli:100});assert.equal(g.meta.queue.at(-1).faction,c.id);ticks(g,15);assert(w.units.some(u=>u.faction===c.id&&!u.commander));
 const order=chat(g,'b','3','伙伴');assert.equal(order.status,'commanded');assert(w.units.filter(u=>u.supporter?.name==='伙伴').every(u=>u.viewerOrder?.kind==='attack'));
 const grant={side:c.side,faction:c.id,factionName:c.name,factionColor:c.color,supporter:c.founder,source:'bilibili',receipt:'gift-test'},plan=warEventPlan(w,grant,'meteorstorm');assert(plan);assert.notEqual(plan.targetSide,c.id);assert.equal(plan.source.faction,c.id);
 h.hp-=2000;const original=w.heroes[c.side].hp;const r=applyCommanderSupport(w,{...grant,key:'fieldMedic'});assert(r.applied);assert(h.hp>h.maxHP-2000);assert.equal(w.heroes[c.side].hp,original);
 }finally{g.close();}
});
test('general death cannot resurrect or recreate it, survivors retain wounds and undelivered gifts are not lost',()=>{
 const g=fixture();try{chat(g,'a','自立门户','阿甲');const w=g.world,c=Object.values(w.clans)[0],h=w.units.find(u=>u.id===c.leaderId);chat(g,'b','加入阿族','伙伴');chat(g,'b','参战','伙伴');ticks(g,8);const t=w.units.find(u=>u.supporter?.name==='伙伴');t.hp=77;
 chat(g,'b','参战','伙伴');const receipt=g.meta.queue.at(-1).receipt;w.resolveHit(w.heroes.human,h,1e8,false,'test');updateClans(w);assert.equal(c.status,'fallen');assert(!w.fallenTroops.some(f=>f.id===h.id));assert.equal(t.hp,77);assert.equal(t.faction,c.id);assert.equal(clanSpawnPoint(w,{...t}),null);
 assert.equal(chat(g,'a','自立门户','阿甲').status,'clan_rejected');assert.equal(chat(g,'c','加入阿族').status,'clan_rejected');ticks(g,10);assert(w.units.some(u=>u.receipt===receipt&&!u.faction),'pending entitlement delivered to fallback side');assert.equal(w.units.filter(u=>u.commander&&u.hp>0).length,0);
 }finally{g.close();}
});
test('multiple frontlines stay local, preserve faction colors and remain bounded and order independent at 600 units',()=>{
 const units=Array.from({length:600},(_,i)=>({id:''+i,side:i%2?'human':'demon',faction:i%3?'clan-'+(i%16+1):null,hp:10,x:10000+(i%30)*30,y:400+Math.floor(i/30)*50}));
 const config={units,view:{x:10400,y:1152,w:6000,h:2304},cellSize:24,influence:150},f=buildFrontlineField(config),r=buildFrontlineField({...config,units:[...units].reverse()});assert(f.teams.length>4);assert(f.cells.length<=24000);assert.deepEqual(f.cells,r.cells);assert(f.cells.includes(0));assert.equal(f.cells[0],0);assert(f.cells.some(c=>c>2));
});
test('an independent army slaying an original boss receives the win instead of the other original faction',()=>{
 const g=fixture();try{chat(g,'alpha','自立门户','阿甲');const w=g.world,c=Object.values(w.clans)[0],h=w.units.find(u=>u.id===c.leaderId);w.resolveHit(h,w.heroes.human,1e9,false,'slash');w.step(50);assert.equal(w.mode,'settlement');assert.equal(w.result.winner,c.id);assert.equal(w.result.victor.id,h.id);assert.equal(w.wins.demon,0);assert.equal(w.wins[c.id],1);assert.equal(w.result.honors.boards[c.id][0].name,'阿甲');
 const life=h.id,hp=h.hp,end=w.result.startedAt+w.result.timing.end;while(w.time<end+100)w.step(50);assert.equal(h.id,life);assert.equal(h.hp,hp);assert.equal(w.ranks.human,1);
 }finally{g.close();}
});

test('real incantation dispatch and barracks production retain the selected clan; founder death closes production',()=>{
 const g=fixture();try{chat(g,'a','自立门户','阿甲');const w=g.world,c=Object.values(w.clans)[0],h=w.units.find(u=>u.id===c.leaderId);
 const r=chat(g,'a',WAR_INCANTATIONS[0].text,'阿甲');assert.equal(r.status,'event_queued');assert.equal(g.meta.queue.at(-1).faction,c.id);
 assert(buildBarracks(w,{side:c.side,faction:c.id,factionName:c.name,factionColor:c.color,source:'bilibili',supporter:c.founder,receipt:'barracks-clan'}));
 const b=w.barracks.at(-1);w.time=b.nextProduceAt;updateBarracks(w);const soldier=w.units.find(u=>u.barracksId===b.id);assert(soldier);assert.equal(soldier.faction,c.id);assert.equal(soldier.supporter.id,c.founder.id);
 h.hp=0;updateClans(w);const count=b.produced;w.time+=10000;updateBarracks(w);assert.equal(b.produced,count);assert.equal(b.status,'closed');
 }finally{g.close();}
});
test('a paid reserved resurrection can be rerouted after its clan falls without stealing another owner identity',()=>{
 const g=fixture();try{chat(g,'a','自立门户','阿甲');chat(g,'a','参战','阿甲');ticks(g,8);const w=g.world,c=Object.values(w.clans)[0],t=w.units.find(u=>u.faction===c.id&&!u.commander);
 w.resolveHit(w.heroes.human,t,1e9);const f=w.fallenTroops.find(u=>u.id===t.id);assert(f);f.reservedBy='reserved-rescue';w.time+=70000;
 const side=t.side==='human'?'demon':'human',u=w.fighter(side,t.kind,UNITS[t.kind],10000,1100),grant={receipt:f.reservedBy,reviveId:t.id,source:'bilibili',supporter:t.supporter};
 assert.equal(reviveIdentity(w,u,{...grant,supporter:{...t.supporter,id:'intruder'}}),false);assert.equal(reviveIdentity(w,u,grant),true);assert.equal(u.id,t.id);assert.equal(u.life,2);assert.equal(u.side,side);assert.equal(u.faction,undefined);
 }finally{g.close();}
});
