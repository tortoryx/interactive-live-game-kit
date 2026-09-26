import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {updateCampaign,ensureCampaign,commandCampaign,fieldCamp,campaignGoal,reinforcementCount,campaignDamageMultiplier,PUSH_MS} from '../modules/pixel-war/campaign.mjs';
import {migrateWorld} from '../modules/pixel-war/migrate.mjs';
import {launchDisaster} from '../modules/pixel-war/encounters.mjs';
import {holdBattleClocks} from '../modules/pixel-war/settlement.mjs';
import {commandOwnedTroops,viewerTroopStep} from '../modules/pixel-war/viewer-troops.mjs';
import {chatIntent} from '../modules/pixel-war/public/chat-commands.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {WIDTH,START_X,MAP_SHIFT_X,COLS,TERRAIN,gridTerrain,passable,clearSegment,terrainCombatMultiplier,biomeAt} from '../modules/pixel-war/public/terrain.mjs';
import {gridTerrain as oldTile} from '../modules/pixel-war/public/terrain-base.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
function empty(){const w=new PixelWorld();w.units=[];w.wildlife=[];w.mode='test_live';for(const [i,h] of Object.values(w.heroes).entries())Object.assign(h,{x:START_X+(i?1500:-1500),y:1152});return w;}
function tick(w,ms){for(let n=0;n<ms;n+=50){w.time+=50;updateCampaign(w,50);}}
function occupy(w,side,site){const u=w.fighter(side,'shield',UNITS.shield,site.x,site.y);w.units.push(u);return u;}
function held(w,side){for(const s of w.campaign.sites.filter(p=>p.owner!==side))s.controller=side;}

test('unguarded supply is captured; a living defender blocks capture and can retake it',()=>{
 const w=empty(),site=w.campaign.sites.find(s=>s.owner==='human'&&s.kind==='grain'),attacker=occupy(w,'demon',site),defender=occupy(w,'human',site);
 tick(w,20000);assert.equal(site.controller,'human');assert.equal(site.contested,true);
 defender.hp=0;tick(w,15000);assert.equal(site.controller,'demon');assert.equal(reinforcementCount(w,'demon',3),4);assert.equal(reinforcementCount(w,'human',3),2);
 attacker.hp=0;defender.hp=100;tick(w,15000);assert.equal(site.controller,'human');assert.equal(reinforcementCount(w,'human',3),3);
});
test('retreat lets two enemy squads push the front; identities, wounds, troops and destruction survive',()=>{
 const w=empty();for(const s of w.campaign.sites.filter(p=>p.owner==='human'))occupy(w,'demon',s);
 w.heroes.demon.hp=1234;w.heroes.human.hp=2345;w.terrainChanges[200]={kind:8,original:7,at:1};
 const before={heroes:Object.values(w.heroes).map(h=>[h.id,h.hp,h.x,h.y]),troops:w.units.map(u=>[u.id,u.hp,u.x,u.y])};
 tick(w,15000);assert.equal(w.campaign.front,0);assert.equal(w.campaign.pending.side,'demon');tick(w,PUSH_MS);
 assert.equal(w.campaign.front,1);assert.equal(w.campaign.stage,1);assert.equal(fieldCamp(w,'human').x,START_X+1024+1076);
 assert.deepEqual(Object.values(w.heroes).map(h=>[h.id,h.hp,h.x,h.y]),before.heroes);assert.deepEqual(w.units.map(u=>[u.id,u.hp,u.x,u.y]),before.troops);assert.equal(w.terrainChanges[200].original,7);
 assert(w.announcements.some(e=>e.kind==='frontline'));assert(w.campaign.sites.every(s=>s.controller===s.owner));
 held(w,'demon');tick(w,PUSH_MS+50);assert.equal(w.campaign.front,2);
 held(w,'human');for(const s of w.campaign.sites.filter(p=>p.owner==='human'))s.controller='human';tick(w,PUSH_MS+50);assert.equal(w.campaign.front,1);
});
test('counterattack cancels the push and simultaneous mutual captures do not pick an arbitrary winner',()=>{
 const w=empty();held(w,'demon');tick(w,50);const deadline=w.campaign.pending.at;
 w.campaign.sites.find(p=>p.owner==='human').controller='human';tick(w,PUSH_MS+50);assert.equal(w.campaign.pending,null);assert.equal(w.campaign.front,0);assert(w.time>deadline);
 held(w,'demon');held(w,'human');tick(w,PUSH_MS*2);assert.equal(w.campaign.front,0);assert.equal(w.campaign.pending,null);
});
test('campaign clocks pause through ceremonies and saves; unstaffed sparring cannot take a homeland',()=>{
 const g=new LiveGame();try{const w=g.world;w.units=[];w.mode='test_live';held(w,'human');tick(w,50);const deadline=w.campaign.pending.at;
 w.mode='settlement';w.time+=5000;holdBattleClocks(w,5000);updateCampaign(w,5000);assert.equal(w.campaign.pending.at,deadline+5000);assert.equal(w.campaign.stage,0);
 w.mode='test_live';w.paused=true;updateCampaign(w,1e6);assert.equal(w.campaign.stage,0);w.paused=false;g.restore(g.capture());tick(w,PUSH_MS);assert.equal(w.campaign.front,-1);
 const saved=g.capture();g.restore(saved);tick(w,50);assert.equal(w.campaign.stage,1);
 w.mode='sparring';held(w,'human');tick(w,PUSH_MS*2);assert.equal(w.campaign.front,-1);assert.equal(w.campaign.pending,null);
 }finally{g.close();}
});
test('seventeen fronts have reachable sites and camps; terminal victories are bounded and deduplicated',()=>{
 for(const side of ['demon','human']){const w=empty();for(let i=0;i<9;i++){held(w,side);tick(w,PUSH_MS+50);for(const s of w.campaign.sites){assert(passable(s.x,s.y));assert(s.x>32&&s.x<WIDTH-32);const home=fieldCamp(w,s.owner);assert(w.nav.plan(w.ground(home),s)?.length,'route to '+s.id);}}
 assert.equal(Math.abs(w.campaign.front),8);assert.equal(w.campaign.homeWins[side],1);tick(w,20000);assert.equal(w.campaign.homeWins[side],1);assert.equal(w.campaign.stage,9);assert.equal(w.campaign.front,0);assert.equal(w.campaign.number,2);assert.equal(w.campaign.conquest,null);
 }
});
test('free strategic commands move only the summoner troops and last long enough to reach another wing',()=>{
 const w=empty();for(const [side,id]of [['demon','a'],['demon','b'],['human','a']])w.spawn(side,'militia',0,false,{source:'test',supporter:{id,name:id,platform:'test'}});
 assert.deepEqual(chatIntent('抢粮仓'),{type:'troops',order:'raid_grain'});assert.equal(commandOwnedTroops(w,'demon','a','raid_grain').count,1);
 const u=w.units.find(u=>u.side==='demon'&&u.supporter.id==='a'),goal=campaignGoal(w,u,{order:'raid_grain'}),before=Math.hypot(u.x-goal.x,u.y-goal.y);assert.equal(u.viewerOrder.until-w.time,45000);
 for(let i=0;i<100;i++){w.time+=50;viewerTroopStep(w,u,null,.05);}assert(Math.hypot(u.x-goal.x,u.y-goal.y)<before-50);assert(w.units.filter(x=>x!==u).every(x=>!x.viewerOrder));
 assert(commandCampaign(w,'demon','defend_forge'));assert.equal(campaignGoal(w,w.heroes.demon,{leader:true}).site.kind,'forge');assert(!commandCampaign(w,'demon','read_files'));
});
test('equipment advantage is limited, high ground and cover affect ranged hits only',()=>{
 const w=empty();assert.equal(campaignDamageMultiplier(w,{side:'demon'}),1);held(w,'demon');assert.equal(campaignDamageMultiplier(w,{side:'demon'}),1.08);assert.equal(campaignDamageMultiplier(w,{side:'neutral'}),1);
 const source={side:'demon',projectile:true,x:1008,y:1008},target={x:1040,y:1008},a=31*COLS+31,b=31*COLS+32,changes={[a]:{kind:TERRAIN.HILL},[b]:{kind:TERRAIN.FOREST}};
 assert(Math.abs(terrainCombatMultiplier(source,target,changes)-1.15*.75)<1e-8);assert.equal(terrainCombatMultiplier({...source,projectile:false},target,changes),1);
 const road=w.fighter('demon','militia',UNITS.militia,START_X-500,1152),forest={...road,id:'forest',y:road.y+96,path:null};w.terrainChanges={};for(const [u,kind]of [[road,TERRAIN.ROAD],[forest,TERRAIN.FOREST]])for(let dx=0;dx<8;dx++)w.terrainChanges[Math.floor(u.y/32)*COLS+Math.floor(u.x/32)+dx]={kind};
 const x=road.x;w.move(road,{x:x+150,y:road.y},.5);w.move(forest,{x:x+150,y:forest.y},.5);assert(road.x-x>(forest.x-x)*1.5);
 assert.notEqual(biomeAt(2048).key,biomeAt(18432).key);
});
test('v15 migration keeps collision, aliased projectiles, destruction and identity; removes retired flood data',()=>{
 const key=28*128+40,h={id:'persona',x:1300,y:896,hp:731,rank:19,action:{sceneryKey:key},slowUntil:1000},saved={mapRevision:2,heroStatsRevision:2,heroes:{demon:h},units:[],missiles:[{x:1350,y:900,source:h}],terrainChanges:{[key]:{kind:8,original:7,blast:{x:1300,y:896,r:100}}},objectDamage:{[key]:{key,x:1296,y:912}},hazards:[{kind:'flood',x:1200,y:900}],announcements:[{kind:'flood'}],speech:[{text:'洪水来了',audio:'demonFlood'},{text:'守住粮仓'}],fieldEpoch:3};
 migrateWorld(saved);const next=28*COLS+40+256;assert.equal(h.x,1300+MAP_SHIFT_X);assert.equal(saved.missiles[0].source,h);assert.equal(saved.missiles[0].x,1350+MAP_SHIFT_X);assert.equal(saved.terrainChanges[next].blast.x,h.x);assert.equal(h.action.sceneryKey,next);assert.equal(saved.objectDamage[next].key,next);assert.equal(h.hp,731);assert.equal(h.rank,19);assert.equal(h.slowUntil,0);assert.equal(saved.hazards.length,0);assert.equal(saved.announcements.length,0);assert.deepEqual(saved.speech,[{text:'守住粮仓'}]);
 migrateWorld(saved);assert.equal(h.x,1300+MAP_SHIFT_X);assert.equal(saved.fieldEpoch,4);
 for(let y=1;y<71;y++)for(let x=1;x<127;x++)assert.equal(gridTerrain(x+256,y),oldTile(x,y));
 assert.equal(launchDisaster(empty(),'flood',{x:START_X,y:1152}),false);
});
test('AI receives capturable sites and a front change rejects a decision made for the old region',()=>{
 const g=new LiveGame();try{const w=g.world;w.units=[];w.mode='test_live';const c=g.context('demon');assert.equal(c.campaign.sites.length,4);held(w,'demon');w.campaign.pending={side:'demon',at:w.time};g.step(50);assert.equal(w.campaign.stage,1);assert(g.meta.epoch>c.epoch);assert(!g.applyDecision(c,{tactic:'retreat',lane:1,speech:'撤退',memory:'旧战场'},'fixture'));}finally{g.close();}
});
test('strategic commander actions require owner token and never become broadcast mutation endpoints',async()=>{
 const app=await createPreview({stagePort:20690,controlPort:20691,clock:false});try{const origin='http://127.0.0.1:20691',html=await(await fetch(origin)).text(),token=html.match(/name="owner-token" content="([^"]+)/)[1],headers={Origin:origin,'Content-Type':'application/json','X-Owner-Token':token},body=JSON.stringify({type:'campaign',side:'demon',kind:'raid_grain'});
 assert.equal((await fetch(origin+'/action',{method:'POST',headers,body})).status,200);assert.equal((await fetch(origin+'/action',{method:'POST',headers:{...headers,'X-Owner-Token':'invalid'},body})).status,403);assert.equal((await fetch('http://127.0.0.1:20690/action',{method:'POST',headers,body})).status,405);assert(!html.includes('data-disaster="flood"'));
 }finally{await app.close();}
});
