import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {updateCampaign,CONQUEST_REDEPLOY_MS,CONQUEST_END_MS} from '../modules/pixel-war/campaign.mjs';
import {recordContribution,recordCampaignCapture} from '../modules/pixel-war/honors.mjs';
import {conquestScene} from '../modules/pixel-war/public/campaign-outcome.mjs';
import {Camera,overviewTarget} from '../modules/pixel-war/public/camera.mjs';
import {START_X,START_Y,passable} from '../modules/pixel-war/public/terrain.mjs';
function setup(side){const w=new PixelWorld(37,{audienceDriven:true});w.mode='test_live';w.units=[];w.campaign.front=side==='demon'?8:-8;for(const s of w.campaign.sites)s.controller=side;w.campaign.pending={side,at:w.time};return w;}
function advance(w,ms){for(let i=0;i<ms;i+=50)w.step(50);}
const identity=u=>({id:u.id,side:u.side,hp:u.hp,maxHP:u.maxHP,rank:u.rank,xp:u.xp,level:u.level,supporter:u.supporter});
for(const winner of ['demon','human'])test(winner+' conquest preserves heroes, troops, injuries, XP and rescue opportunity across a covered redeploy',()=>{
 const w=setup(winner),side=winner,p={id:'player',name:'真实玩家',platform:'bilibili'};
 w.spawn(side,'militia',1,false,{source:'bilibili',supporter:p});const u=w.units[0];Object.assign(u,{hp:71,xp:22,level:3,readyAt:w.time+5000,viewerOrder:{kind:'attack',until:w.time+45000,origin:{x:15000,y:100}},path:[{x:15000,y:1500}],mission:{id:'stale'}});
 w.heroes.demon.hp=1234;w.heroes.human.hp=2345;w.heroes.demon.x=13700;w.heroes.human.x=2700;
 w.fallenTroops=[{id:'fallen',at:w.time-20000}];const rescueAt=w.fallenTroops[0].at;
 recordContribution(w,u,w.heroes[side==='demon'?'human':'demon'],60,0);recordCampaignCapture(w,side,p);
 const before=[...Object.values(w.heroes),...w.units].map(identity),ranks={...w.ranks};updateCampaign(w,50);const r=w.campaign.conquest;assert(r);assert.equal(r.honors.finishers.length,0);assert.equal(r.honors.boards[side][0].score,720);
 assert.equal(conquestScene(w,side).tone,'victory');assert.equal(conquestScene(w,side==='demon'?'human':'demon').tone,'defeat');
 const camera=new Camera(side);camera.follow(w.snapshot(),.05);assert.equal(camera.shot,'campaign');
 advance(w,CONQUEST_REDEPLOY_MS);assert.equal(r.redeployed,true);assert.equal(w.campaign.front,0);assert.equal(w.campaign.homeWins[side],1);assert.equal(w.campaign.number,2);assert(conquestScene(w,side).veil===1,'relocation is fully covered');camera.follow(w.snapshot(),.05);assert(Math.abs(camera.x-START_X)<500,'camera cuts beneath cover rather than sweeping across the world');
 assert.deepEqual([...Object.values(w.heroes),...w.units].map(identity),before);assert.deepEqual(w.ranks,ranks);assert.equal(u.path,null);assert.equal(u.mission,null);assert.equal(u.viewerOrder.kind,'attack');assert.equal(u.viewerOrder.origin.x,u.x);assert.equal(u.viewerOrder.origin.y,u.y);assert(!Object.hasOwn(w.snapshot().campaign,'merit'));for(const v of [...w.units,...Object.values(w.heroes)]){assert(Math.abs(v.x-START_X)<1200);assert(passable(v.x,v.y,w.terrainChanges));}
 advance(w,CONQUEST_END_MS-CONQUEST_REDEPLOY_MS);assert.equal(w.campaign.conquest,null);assert.equal(w.campaign.lastConquest.winner,side);assert.equal(w.fallenTroops[0].at,rescueAt+CONQUEST_END_MS);assert.equal(u.readyAt,5000+CONQUEST_END_MS);assert.deepEqual([...Object.values(w.heroes),...w.units].map(identity),before);assert(w.campaign.sites.every(s=>s.owner===s.controller));
 w.step(50);assert.equal(w.campaign.homeWins[side],1);assert.equal(w.campaign.pending,null);
});
test('already breached legacy saves settle once without awarding the victory a second time; replay is resumable',()=>{
 const g=new LiveGame();try{const w=setup('human');w.campaign.homeClaimed='human';w.campaign.homeWins.human=4;Object.assign(g.world,w);updateCampaign(g.world,50);advance(g.world,CONQUEST_REDEPLOY_MS-100);const saved=g.capture();g.restore(saved);advance(g.world,100);const snapshot=g.capture();g.restore(snapshot);advance(g.world,5000);assert.equal(g.world.campaign.homeWins.human,4);assert.equal(g.world.campaign.number,2);assert.equal(g.world.campaign.conquest,null);}finally{g.close();}
});
test('war contribution survives a leader ceremony, but starts fresh after campaign settlement',()=>{const w=setup('demon'),u={id:'x',side:'demon',supporter:{id:'a',name:'a',platform:'test'}},enemy={id:'h',side:'human',kind:'hero',hp:900,deadAt:null};recordContribution(w,u,enemy,10);w.honors={entries:{},finishers:{}};recordContribution(w,u,enemy,20);updateCampaign(w,50);assert.equal(w.campaign.conquest.honors.board[0].score,60);advance(w,CONQUEST_END_MS);assert.deepEqual(w.campaign.merit.entries,{});});
test('split commanders never pull the overview midpoint to empty land',()=>{const w=setup('human'),s=w.snapshot();s.campaign=null;s.heroes.demon.x=13700;s.heroes.human.x=2700;s.units=[];for(const side of ['demon','human']){const p=overviewTarget(s,960,540,side);assert(Math.abs(p.x-s.heroes[side].x)<300);const c=new Camera(side);c.follow(s,.05);assert(c.visible(s.heroes[side],0));const q=c.project(s.heroes[side]);assert(q.x>100&&q.x<860);assert(q.y>110&&q.y<500);}});

test('a normal northern battlefield fills the viewport instead of revealing a dark strip beyond the map',()=>{const w=setup('human'),s=w.snapshot();s.heroes.demon.x=13700;s.heroes.demon.y=540;s.heroes.human.x=2700;s.campaign=null;const c=new Camera('demon',672,540);c.follow(s,.05);assert(c.y-c.h/2>=0);assert(c.project(s.heroes.demon).y>=120);});

test('conquest relocation clears old camera momentum once; ordinary following remains smooth',()=>{
 for(const winner of ['demon','human']){
  const w=setup(winner);updateCampaign(w,50);const c=new Camera(winner,1920,1080);c.follow(w.snapshot(),1/30);
  c.vx=320;c.vy=-90;c.vz=.1;advance(w,CONQUEST_REDEPLOY_MS);const s=w.snapshot();c.follow(s,1/30);
  assert(c.visible(s.heroes.demon,0)&&c.visible(s.heroes.human,0));assert.deepEqual([c.vx,c.vy,c.vz],[0,0,0]);
  const settled={x:c.x,y:c.y,z:c.zoom};for(let i=0;i<30;i++)c.follow(s,1/30);
  assert(Math.hypot(c.x-settled.x,c.y-settled.y)<1);assert.equal(c.zoom,settled.z);
  // The same redeployment marker must not cause a fresh snap every frame.
  s.heroes[winner].x+=600;const x=c.x;c.follow(s,1/30);assert(Math.abs(c.x-x)<5);
 }
});
test('a background tab that misses the whole conquest resumes at the new battle, not the old homeland',()=>{
 for(const winner of ['demon','human']){
  const w=setup(winner);updateCampaign(w,50);const c=new Camera(winner);c.follow(w.snapshot(),1/30);
  advance(w,CONQUEST_END_MS);assert.equal(w.campaign.conquest,null);const s=w.snapshot();c.follow(s,1/30);
  assert(c.visible(s.heroes.demon,0)&&c.visible(s.heroes.human,0));assert(Math.abs(c.x-START_X)<500);
 }
});
