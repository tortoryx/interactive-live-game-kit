import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {updateCampaign,CAPTURE_MS,captureSpeed} from '../modules/pixel-war/campaign.mjs';
import {scavengeStep} from '../modules/pixel-war/scavenging.mjs';
import {chatIntent} from '../modules/pixel-war/public/chat-commands.mjs';
import {captureStatus} from '../modules/pixel-war/public/campaign-view.mjs';
import {awardAttack} from '../modules/pixel-war/progression.mjs';
import {projectileImpact} from '../modules/pixel-war/ordnance.mjs';
import {SpatialGrid} from '../modules/pixel-war/public/spatial.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {START_X,COLS,TERRAIN} from '../modules/pixel-war/public/terrain.mjs';
import {decodeFrame,encodeFrame} from '../modules/pixel-war/public/wire.mjs';
import {holdBattleClocks} from '../modules/pixel-war/settlement.mjs';
import {commandOwnedTroops} from '../modules/pixel-war/viewer-troops.mjs';

function quiet(g){const w=g.world;w.mode='test_live';w.units=[];w.wildlife=[];w.barracks=[];w.pickups=[];w.hazards=[];w.objectives=[];w.fieldProps={stage:w.campaign.stage,items:[]};w.nextSpawn=w.nextGiant=w.nextPickup=w.nextObjective=w.nextHazard=w.nextSurprise=w.nextWildlife=1e12;w.fieldEpoch++;for(const [i,h]of Object.values(w.heroes).entries())Object.assign(h,{x:START_X+(i?1400:-1400),y:1152,stunnedUntil:1e12});
 w.terrainChanges={};for(let y=26;y<=46;y++)for(let x=Math.floor(START_X/32)-18;x<=Math.floor(START_X/32)+18;x++)w.terrainChanges[y*COLS+x]={kind:TERRAIN.ROAD};return w;}
function fighter(w,side='demon',kind='militia',x=START_X,y=1152){const u=w.fighter(side,kind,UNITS[kind],x,y);w.units.push(u);return u;}
function tickCampaign(w,ms){w.time+=ms;updateCampaign(w,ms);}
function melee(w,u,target){w.attack(u,target,'slash');w.time=u.action.contactAt;const hits=w.tickActions(w.allAlive());for(const hit of hits)w.resolveHit(...hit);return hits;}

test('local headcount majority captures through living defenders, tie freezes and defenders reverse progress',()=>{const g=new LiveGame();try{const w=quiet(g),s=w.campaign.sites.find(s=>s.owner==='human');const a=fighter(w,'demon','militia',s.x,s.y),b=fighter(w,'demon','militia',s.x+25,s.y),d=fighter(w,'human','shield',s.x-25,s.y);
 tickCampaign(w,1000);assert.equal(s.progress,1000);assert.deepEqual(s.presence,{demon:2,human:1});assert.equal(s.captureSide,'demon');assert.equal(s.contested,true);assert.equal(captureStatus(s),'占领 ×1');
 b.hp=0;tickCampaign(w,1500);assert.equal(s.progress,1000);assert.equal(captureStatus(s),'僵持');
 const defender=fighter(w,'human','colossus',s.x,s.y+30);tickCampaign(w,500);assert.equal(s.progress,500);assert.equal(captureStatus(s),'回稳 ×1');
 b.hp=100;defender.hp=0;tickCampaign(w,CAPTURE_MS);assert.equal(s.controller,'demon');assert(d.hp>0&&a.hp>0);
 a.hp=b.hp=0;tickCampaign(w,CAPTURE_MS);assert.equal(s.controller,'human');
}finally{g.close();}});

test('capture speed grows with numerical advantage and ignores hero weight, buildings, neutral, dead and distant units',()=>{const g=new LiveGame();try{const w=quiet(g),s=w.campaign.sites.find(s=>s.owner==='human');Object.assign(w.heroes.human,{x:s.x,y:s.y});for(let i=0;i<3;i++)fighter(w,'demon','militia',s.x+i*20,s.y);const dead=fighter(w,'human','colossus',s.x,s.y);dead.hp=0;fighter(w,'human','colossus',s.x+150,s.y);w.barracks.push({id:'building',kind:'barracks',side:'human',hp:100,x:s.x,y:s.y});w.wildlife.push({id:'beast',kind:'boar',side:'neutral',hp:100,x:s.x,y:s.y});
 tickCampaign(w,1000);assert.deepEqual(s.presence,{demon:3,human:1});assert.equal(s.progress,1250);assert.equal(s.captureRate,1.25);assert(captureSpeed(1)<captureSpeed(5));assert.equal(captureSpeed(100),3);
 g.restore(g.capture());const restored=g.world.campaign.sites.find(p=>p.id===s.id);tickCampaign(g.world,1000);assert.equal(restored.progress,2500);g.world.paused=true;tickCampaign(g.world,5000);assert.equal(restored.progress,2500);
}finally{g.close();}});

test('chat 5 commands only its owner squad, divides reachable pickups and really applies three buffs without teleporting',()=>{const g=new LiveGame();try{const w=quiet(g);g.testGift({side:'demon',reward:'rally'});for(let i=0;i<6;i++)g.drain();w.units=w.units.slice(0,3);const own=[...w.units];for(const [i,u]of own.entries())Object.assign(u,{x:START_X-40+i*40,y:1152,hp:u.maxHP-100,path:null,exitGoal:null});const stranger=fighter(w,'demon','militia',START_X-500,1152);stranger.source='test';stranger.supporter={id:'stranger',platform:'test',name:'其他玩家'};const enemy=fighter(w,'human','militia',START_X+500,1152);enemy.supporter=own[0].supporter;enemy.source='test';enemy.stunnedUntil=1e12;stranger.stunnedUntil=1e12;
 const drops=['heal','shield','fury'].map((kind,i)=>({id:'drop-'+i,kind,x:START_X-90+i*90,y:1280,until:w.time+30000}));w.pickups=drops;
 const r=g.testChat({side:'demon',text:'5'});assert.equal(r.status,'commanded');assert.equal(r.interaction.count,3);assert(!stranger.viewerOrder&&!enemy.viewerOrder);assert.equal(g.meta.audience?.pending.length||0,0);assert.equal(chatIntent('五').order,'scavenge');
 g.step(50);assert.equal(new Set(own.map(u=>u.scavenge.pickupId)).size,3);
 for(let n=0;n<100;n++){const old=own.map(u=>({x:u.x,y:u.y}));g.step(50);for(let i=0;i<own.length;i++)assert(Math.hypot(own[i].x-old[i].x,own[i].y-old[i].y)<25);}
 assert(drops.every(p=>p.used));assert(own.some(u=>u.shield>0));assert(own.some(u=>u.furyUntil>w.time));assert(own.some(u=>u.hp===u.maxHP));
 assert(g.context('demon').interactionRules.commands.includes('5拾取'));
}finally{g.close();}});

test('ordinary troops seek nearby useful shields, and ordered squads skip unavailable terrain without repeated per-frame searches',()=>{const g=new LiveGame();try{const w=quiet(g),u=fighter(w);w.pickups=[{id:'shield',kind:'shield',x:u.x+100,y:u.y,until:1e6}];for(let i=0;i<35;i++)g.step(50);assert(u.shield>0);
 u.viewerOrder={kind:'scavenge',ownerId:'a',origin:{x:u.x,y:u.y},until:w.time+20000};u.supporter={id:'a'};u.scavenge=null;w.pickups=[{id:'blocked',kind:'fury',x:u.x+200,y:u.y,until:1e6},{id:'too-far',kind:'haste',x:u.x+800,y:u.y,until:1e6}];let plans=0;w.nav.plan=()=>{plans++;return null;};for(let i=0;i<20;i++){w.time+=50;assert.equal(scavengeStep(w,u,.05,{ordered:true}),false);}assert(plans<=2);assert(w.pickups.every(p=>!p.used));
}finally{g.close();}});

test('blocked pickups do not starve reachable ones; live orders and gathering clocks survive a ceremony and restart',()=>{const g=new LiveGame();try{let w=quiet(g),u=fighter(w);u.source='test';u.supporter={id:'owner',platform:'test'};commandOwnedTroops(w,'demon','owner','scavenge');w.pickups=Array.from({length:5},(_,i)=>({id:'p'+i,kind:'fury',x:u.x+80+i*30,y:u.y,until:1e6}));const realPlan=w.nav.plan.bind(w.nav);let calls=0;w.nav.plan=(a,b)=>{calls++;return b.id==='p4'?realPlan(a,b):null;};assert(!scavengeStep(w,u,.05,{ordered:true}));w.time+=1000;assert(scavengeStep(w,u,.05,{ordered:true}));assert.equal(u.scavenge.pickupId,'p4');assert.equal(calls,5);const until=u.viewerOrder.until,expires=u.scavenge.expires;w.time+=8000;holdBattleClocks(w,8000);assert.equal(u.viewerOrder.until,until+8000);assert.equal(u.scavenge.expires,expires+8000);g.restore(g.capture());w=g.world;u=w.units[0];assert.equal(u.scavenge.pickupId,'p4');assert.equal(u.viewerOrder.kind,'scavenge');commandOwnedTroops(w,'demon','owner','guard');assert.equal(u.scavenge,null);assert.equal(u.viewerOrder.kind,'guard');
}finally{g.close();}});

test('effective melee attacks gain one XP, shields count, empty swings do not; a kill remains far more valuable',()=>{const g=new LiveGame();try{const w=quiet(g),u=fighter(w),v=fighter(w,'human','militia',START_X+20);u.crit=0;u.xp=29;u.hp=80;v.hp=v.maxHP=50000;v.shield=1000;melee(w,u,v);assert.equal(u.xp,30);assert.equal(u.level,2);assert.equal(u.hp,80);assert.equal(u.kills,0);assert(w.events.some(e=>e.type==='level_up'&&e.target===u.id));assert.equal(v.hp,50000);
 const before=u.xp;v.x=START_X+900;melee(w,u,v);assert.equal(u.xp,before);v.x=START_X+20;v.hp=1;v.shield=0;melee(w,u,v);assert.equal(u.xp-before,1+Math.round(12*Math.sqrt(v.pop)));assert.equal(u.kills,1);const xp=u.xp;w.resolveHit(u,v,100);assert.equal(u.xp,xp);
 const frame=decodeFrame(encodeFrame(w.snapshot()));assert.equal(frame.units.find(v=>v.id===u.id).xp,xp);
}finally{g.close();}});

test('one ranged volley yields one attack XP across bullets, splash and a real save/restore',()=>{const g=new LiveGame();try{let w=quiet(g),u=fighter(w,'demon','repeater'),v=fighter(w,'human','shield',START_X+200);v.hp=v.maxHP=1e6;w.attack(u,v,'shoot');w.time=u.action.contactAt;w.tickActions(w.allAlive());assert.equal(w.missiles.length,3);assert.equal(new Set(w.missiles.map(m=>m.attackId)).size,1);
 const land=(m)=>{const hits=[];projectileImpact(w,m,v,new SpatialGrid(w.allAlive()),hits);for(const h of hits)w.resolveHit(...h);};land(w.missiles[0]);assert.equal(u.xp,1);g.restore(g.capture());w=g.world;u=w.units.find(x=>x.id===u.id);v=w.units.find(x=>x.id===v.id);land(w.missiles[1]);land(w.missiles[2]);assert.equal(u.xp,1);assert.equal(u.kills,0);
 assert(!awardAttack(w,u,u,30,'friendly'));assert(!awardAttack(w,u,v,0,'zero'));assert(!awardAttack(w,{...u,life:99},v,30,'old-life'));assert.equal(u.xp,1);
}finally{g.close();}});
