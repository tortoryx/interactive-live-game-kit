import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {campaignGuard,campaignGoal,formationHash} from '../modules/pixel-war/campaign.mjs';
import {prepareObserver,receiveView,applyObserver,tickObserver,OBSERVER_QUIET_MS} from '../modules/live-runtime/show-observer.mjs';
import {debatePresentation,HOST_ID} from '../modules/live-runtime/show-debate.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
import {tickAmbientBattle,battleDamageScale} from '../modules/pixel-war/ambient-battle.mjs';
import {UNITS} from '../modules/pixel-war/public/catalog.mjs';

test('surviving permanent guards cannot monopolize either army; rotating guard duty preserves player orders and stats',()=>{
 const g=new LiveGame();try{const w=g.world;w.units=[];w.time=100000;
 for(const side of ['demon','human'])for(let i=0,n=0;n<60;i++){const id=side+'-'+i;if(formationHash(id)%5!==0)continue;const u=w.fighter(side,'levy',UNITS.levy,10000,1000);u.id=id;w.units.push(u);n++;}
 const before=w.units.map(u=>[u.id,u.hp,u.attack,u.x,u.y]);
 for(const side of ['demon','human'])assert.equal(w.units.filter(u=>u.side===side&&campaignGuard(w,u)).length,12);
 const guards=new Set(w.units.filter(u=>campaignGuard(w,u)).map(u=>u.id));w.time+=18000;
 assert(w.units.filter(u=>campaignGuard(w,u)).some(u=>!guards.has(u.id)),'rotate duties, do not preserve invulnerable reserves');
 assert.deepEqual(w.units.map(u=>[u.id,u.hp,u.attack,u.x,u.y]),before);
 const ordered=w.units[0];ordered.viewerOrder={order:'retreat',until:w.time+30000};w.time+=1001;assert(!campaignGuard(w,ordered));
 const goal=campaignGoal(w,ordered,{order:'raid_grain'});assert.equal(goal.site.owner,'human');
 w.units=w.units.filter(u=>u.side==='human').slice(0,3);w.time+=1001;assert(w.units.every(u=>!campaignGuard(w,u)),'small squads must not leave their only soldier behind');
 }finally{g.close();}
});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;}play(){this.paused=false;this.onplaying?.();return Promise.resolve();}pause(){this.paused=true;this.onpause?.();}}
test('late prepared second sentence survives the old 30s cutoff and camera pans, followed by a real quiet interval',()=>{
 const g=new LiveGame({speechMode:'observer'});try{const w=g.world;w.paused=false;const now=Date.now();const v={side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900};receiveView(w,v,now);
 const r=prepareObserver(w,now);const lines=[{text:'这队老兵要是留得住，下一轮开场就有人能顶住。',emotion:'focused'},{text:'但也别一直舍不得派出去，花了力气养起来，总得让他们有点用。',emotion:'dry'}];
 assert(applyObserver(w,r,{ok:true,model:'deepseek-flash',decision:{requestId:r.id,lines}},now));const s=w.showDebate;
 w.time+=28000;for(const l of s.observerQueue)Object.assign(l,{audioMode:'full_read',audioUrl:'/voice/test.wav',audioDuration:10000});tickObserver(w);const first=w.speech.at(-1);
 const p=new SpeechPlayback({createAudio:()=>new Media()});p.update(g.snapshot(),{enabled:true});assert(p.presentation('empress'));
 const far={...v,x:v.x+4000};receiveView(w,far,now+1000);p.viewport=far;p.update(g.snapshot(),{enabled:true});assert(p.presentation('empress'),'do not cut a playing sentence on a camera pan');
 w.time+=10000;tickObserver(w);const last=w.speech.at(-1);assert.notEqual(last.id,first.id);assert(last.until>=w.time+10000,'validity covers actual audio duration');p.active[0].audio.onended();p.update(g.snapshot(),{enabled:true});assert.equal(p.presentation('empress').id,last.id);
 for(const l of [first,last]){debatePresentation(g,{id:l.id,field:w.fieldEpoch,persona:HOST_ID,event:'started'});debatePresentation(g,{id:l.id,field:w.fieldEpoch,persona:HOST_ID,event:'ended'});}
 const quiet=s.observerQuietUntil;assert(quiet>=Date.now()+OBSERVER_QUIET_MS-100);s.observerAt=0;
 receiveView(w,far,quiet-1);assert.equal(prepareObserver(w,quiet-1),null);
 receiveView(w,far,quiet+1);assert(prepareObserver(w,quiet+1),'resume only after actual playback silence');
 }finally{g.close();}
});

test('background recovery narrows a system-only deficit, without matching paid armies or altering wounds',()=>{
 const g=new LiveGame();try{const w=g.world;w.units=[];w.time=2000;
 for(const [side,n] of [['human',12],['demon',60]])for(let i=0;i<n;i++)w.units.push({...w.fighter(side,'levy',UNITS.levy,10000+i,1100),ambient:true,source:'system'});
 const old=w.units.map(u=>[u.id,u.hp]);tickAmbientBattle(w);assert.equal(w.units.filter(u=>u.side==='human').length,38);assert.equal(w.units.filter(u=>u.side==='demon').length,60);
 assert.deepEqual(w.units.slice(0,old.length).map(u=>[u.id,u.hp]),old);
 const player={...w.fighter('demon','colossus',UNITS.colossus,10000,1100),source:'bilibili',supporter:{id:'paid'}};
 const levy=w.units[0];assert.equal(battleDamageScale(levy,player),.45);assert.equal(battleDamageScale(player,levy),1);
 w.units=[player];w.time+=8000;tickAmbientBattle(w);assert.equal(w.units.filter(u=>u.kind==='levy'&&u.side==='human').length,10);assert.equal(w.units.filter(u=>u.kind==='levy'&&u.side==='demon').length,10,'paid giant must not cause compensating NPCs');
 }finally{g.close();}
});
