import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';
import {CELL,COLS,TERRAIN,clearSegment} from '../modules/pixel-war/public/terrain.mjs';
import {campaignGoal,updateCampaign} from '../modules/pixel-war/campaign.mjs';
import {escortGoal,updateObjectives} from '../modules/pixel-war/strategy.mjs';
import {commandOwnedTroops} from '../modules/pixel-war/viewer-troops.mjs';

const NEVER=1e12,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function fixture(){
 const w=new PixelWorld(37,{audienceDriven:true});w.mode='test_live';
 for(const key of ['nextSpawn','nextGiant','nextWildlife','nextPickup','nextHazard','nextObjective','nextSurprise','nextAmbientWave','nextMuster'])w[key]=NEVER;
 w.nextSpeechBySide={demon:NEVER,human:NEVER};w.campaign.nextSignals=NEVER;w.campaign.sites=[];
 for(let y=30;y<=43;y++)for(let x=240;x<=310;x++)w.terrainChanges[y*COLS+x]={kind:TERRAIN.ROAD};
 w.nav.refresh();
 Object.assign(w.heroes.demon,{x:7800,y:1152,stunnedUntil:NEVER});
 Object.assign(w.heroes.human,{x:9700,y:1152,stunnedUntil:NEVER});
 return w;
}
function troop(w,{kind='militia',side='demon',id='demon-militia-42',x=8500,y=1152,...rest}={}){
 const u=w.fighter(side,kind,UNITS[kind],x,y);assert.equal(u.x,x);assert.equal(u.y,y);
 Object.assign(u,{id,source:'test',supporter:{id:'owner-a',platform:'test',name:'验证玩家'},receipt:'test:combat',life:1,lane:1,readyAt:0,healAt:NEVER,crit:0,speed:100,...rest});w.units.push(u);return u;
}
function heroAt(w,x,y=1152){const e=w.heroes.human;Object.assign(e,{x,y,radius:19});assert(w.open(x,y));return e;}
function site(w,{x=9200,y=1152,owner='human',kind='grain'}={}){
 const s={id:'site-'+owner+'-'+kind,owner,controller:owner,kind,x,y,progress:0,claimFor:null,presence:{demon:0,human:0}};w.campaign.sites.push(s);return s;
}
function steps(w,n){for(let i=0;i<n;i++)w.step(50);}

test('an in-range hero takes priority over the resource route and a closer but out-of-range soldier',()=>{
 for(const readyAt of [0,NEVER]){
  const w=fixture(),u=troop(w,{range:60,readyAt}),h=heroAt(w,8575),e=troop(w,{side:'human',id:'human-militia-43',x:8500,y:1222,radius:9,stunnedUntil:NEVER});site(w);
  assert(clearSegment(u,h,w.terrainChanges));assert(dist(u,e)>u.range+e.radius);
  w.step(50);assert.equal(u.x,8500);assert.equal(u.y,1152);assert.equal(u.action?.target,readyAt?undefined:h.id);
 }
});
test('ranged fire needs a clear shot, not a walking route; the real projectile hits',()=>{
 const w=fixture(),u=troop(w,{kind:'musketeer',range:180,minRange:0}),h=heroAt(w,8690);site(w);w.nav.plan=()=>null;
 const hp=h.hp;w.step(50);assert.equal(u.action?.target,h.id);assert.equal(u.action.type,UNITS.musketeer.action);
 steps(w,60);assert(h.hp<hp);assert(w.events.some(e=>e.type==='hit'&&e.source===u.id));
 assert.deepEqual([u.supporter.id,u.receipt,u.life,u.source],['owner-a','test:combat',1,'test']);assert.equal(w.units.length,1);
});
test('melee approaches a nearby hero behind it rather than leaving for the enemy house',()=>{
 const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8275);site(w);const hp=h.hp;
 steps(w,32);assert(dist(u,h)<80);assert.equal(u.action?.target,h.id);steps(w,25);assert(h.hp<hp);
});
test('at a resource post, a nearby hero remains a valid short approach',()=>{
 const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8275);site(w,{x:8570});
 assert(dist(campaignGoal(w,u),w.campaign.sites[0])<130);steps(w,32);assert.equal(u.action?.target,h.id);
});
test('blocked and excessive routes fall through to a reachable enemy; the resource path is replaced',()=>{
 for(const blocked of [true,false]){
  const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8680),e=troop(w,{side:'human',id:'human-militia-43',x:8500,y:1372,stunnedUntil:NEVER});
  // Use a reachable point on the fixture road; the path double controls only routing.
  e.y=1322;u.path=[{x:e.x+70,y:e.y}];u.repathAt=NEVER;const old=u.path,calls=[];
  w.nav.plan=(a,b)=>{calls.push(b.id);return b.id===h.id?(blocked?null:[{x:a.x-400,y:a.y},{x:b.x,y:b.y}]):[{x:b.x,y:b.y}];};
  w.step(50);assert.equal(u.localCombat.target,e.id);assert.notEqual(u.path,old);assert(u.y>1152);
  const count=calls.length;steps(w,10);assert.equal(calls.length,count);
 }
});
test('a moving target does not alternate between pursuit and the resource path',()=>{
 const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8700);site(w,{x:8000});w.step(50);
 for(let i=0;i<12;i++){h.x+=4;const x=u.x;w.step(50);assert(u.x>=x);}
});
test('failed combat searches are cached and an exhausted pursuit cannot roll across the map',()=>{
 const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8725);let plans=0;w.nav.plan=()=>{plans++;return null;};steps(w,15);assert.equal(plans,1);
 const moving=fixture(),v=troop(moving,{range:60}),e=heroAt(moving,8725);
 for(let i=0;i<200;i++){e.x=v.x+225;moving.step(50);}
 assert(v.x<=8500+185);assert.equal(v.action,null);
 // A later different encounter at another post gets a new local origin.
 v.x=9100;e.x=9325;v.path=null;moving.step(50);assert(v.x>9100);
});
test('personal retreat/guard retain ownership and precedence; expired orders release control',()=>{
 const w=fixture(),u=troop(w,{range:80}),h=heroAt(w,8575);
 assert.equal(commandOwnedTroops(w,'demon','someone-else','attack').status,'no_troops');
 commandOwnedTroops(w,'demon','owner-a','retreat');w.step(50);assert.equal(u.action,null);assert(u.x<8500);
 Object.assign(u,{x:8500,y:1152,path:null});commandOwnedTroops(w,'demon','owner-a','guard');w.step(50);assert.equal(u.action,null);
 u.viewerOrder.until=w.time;w.step(50);assert.equal(u.action?.target,h.id);
});
test('side-wide guard does not take the new autonomous chase branch',()=>{
 const w=fixture(),u=troop(w,{range:60}),h=heroAt(w,8725);assert(w.audienceCommand('demon','guard'));w.step(50);
 assert(!u.localCombat);assert(u.x<8500);assert.equal(u.action,null);assert(h.hp>0);
});
test('minimum-range weapons retreat off their old mission route and healers still heal',()=>{
 const w=fixture(),u=troop(w,{kind:'cannon',range:320,minRange:110}),h=heroAt(w,8570);
 u.path=[{x:8600,y:1152}];u.repathAt=NEVER;w.step(50);assert.equal(u.action,null);assert(u.x<8500);
 const healing=fixture(),medic=troop(healing,{kind:'healer',healAt:0}),friend=troop(healing,{id:'demon-militia-43',x:8450,hp:30,stunnedUntil:NEVER});heroAt(healing,8650);healing.step(50);
 assert(friend.hp>30);assert(!medic.localCombat);
});
test('resource arrival enters capture range and actually completes uncontested capture',()=>{
 const w=fixture(),s=site(w,{x:8700}),u=troop(w,{x:8566,range:30});w.mode='sparring';
 assert.equal(dist(u,s),134);w.step(50);assert(u.x>8566);steps(w,315);assert.equal(s.controller,'demon');
});
test('both factions and all offsets arrive within the capture margin, including grounding fallback',()=>{
 const w=fixture();site(w,{x:8700});site(w,{x:8300,owner:'demon'});
 for(const side of ['demon','human'])for(let i=0;i<5;i++){
  const u=troop(w,{side,id:side+'-militia-'+(41+i)}),g=campaignGoal(w,u);assert(dist(g,g.site)<125);
 }
 const u=w.units[0];w.ground=p=>({x:p.x+300,y:p.y+300});const g=campaignGoal(w,u);assert.equal(dist(g,g.site),0);
});
test('objective escort destinations support actual leader channeling',()=>{
 const w=fixture(),o={id:'o',x:8700,y:1152,kind:'ward',readyAt:0,until:NEVER,progress:{demon:0,human:0},claimedBy:null};w.objectives=[o];
 for(let i=0;i<4;i++){const u=troop(w,{id:'demon-militia-'+(41+i)});u.escort={objective:'o',until:NEVER};const g=escortGoal(w,u);assert(dist(g,o)<=65);Object.assign(u,g,{stunnedUntil:NEVER});}
 Object.assign(w.heroes.demon,{x:8550,y:1152});for(let i=0;i<50;i++){w.time+=50;updateObjectives(w,50);}assert.equal(o.claimedBy,'demon');
 o.claimedBy=null;w.ground=p=>({x:p.x+300,y:p.y+300});assert.deepEqual(escortGoal(w,w.units[0]),{x:o.x,y:o.y});
});
