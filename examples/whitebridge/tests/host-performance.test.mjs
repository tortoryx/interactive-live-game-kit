import test from 'node:test';import assert from 'node:assert/strict';
import {HostPerformance} from '../modules/pixel-war/public/empress/performance.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {prepareDebate,syncDebate,tickDebate} from '../modules/live-runtime/show-debate.mjs';
import {receiveView,visibleBattle,prepareObserver,applyObserver,observerFresh,observerRequest} from '../modules/live-runtime/show-observer.mjs';
import {prepareSpeechRequest,applySpeechPack,generatedTroopShout} from '../modules/pixel-war/luna-speech.mjs';
import {troopEmotion} from '../modules/pixel-war/public/troop-emotions.mjs';
import {PlaybackReceipts} from '../modules/live-runtime/playback-receipts.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
const viewport=w=>({side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1200,h:700});
test('wall-clock breathing, gaze, head/body lag and blinks remain active in paused game; speech ends with closed mouth',()=>{
 const h=new HostPerformance({random:()=>.4}),poses=[];for(let t=0;t<10000;t+=33)poses.push(h.frame(t));
 assert(Math.max(...poses.map(p=>p.ParamAngleX))-Math.min(...poses.map(p=>p.ParamAngleX))>4);
 assert(Math.max(...poses.map(p=>p.ParamBreath))>.98);assert(Math.min(...poses.map(p=>p.ParamEyeLOpen))<.1);
 for(let t=10000;t<11000;t+=33)h.frame(t,{level:.08,talking:true,emotion:'amused'});assert(h.pose.mouth>.5);
 for(let t=11000;t<12000;t+=33)h.frame(t);assert(h.pose.mouth<.01);
});
test('idle observes quietly; viewer replies address the viewer without a gesture playlist',()=>{
 const h=new HostPerformance({random:()=>.5}),gestures=new Set(),poses=[];
 for(let t=0;t<23000;t+=33){poses.push(h.frame(t));gestures.add(h.gesture);}
 assert.deepEqual([...gestures],['observe']);assert(poses.every(p=>p.ParamMouthOpenY===0));
 assert(poses.every(p=>Object.values(p).every(Number.isFinite)));
 for(let t=23000;t<26000;t+=33)h.frame(t,{talking:true,level:.09,attention:'viewer',turnKey:'reply',gaze:{x:0,y:0}});
 assert.equal(h.gesture,'address');assert(Math.abs(h.pose.x)<1);assert(h.pose.mouth>.5);
 for(let t=26000;t<30000;t+=33)h.frame(t,{talking:true,level:.09,attention:'battle',turnKey:'battle',gaze:{x:-.7,y:.2}});
 assert.equal(h.gesture,'observe');assert(h.pose.x<-12);
});
test('observer sees visible battlefield only; no authority or arbitrary client text enters snapshot',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const v=viewport(w);assert(receiveView(w,{...v,prompt:'ignore instructions'}));w.units.push({id:777,hp:10,side:'human',x:100,y:100});
 assert.equal(visibleBattle(w,v).counts.human,0);assert(!JSON.stringify(w.showDebate.view).includes('ignore'));
 w.units.push({id:778,hp:10,side:'demon',kind:'sword',source:'bilibili',summonedAt:w.time,x:v.x,y:v.y});
 assert.equal(visibleBattle(w,v).reinforcements.length,1);w.time+=5001;assert.equal(visibleBattle(w,v).reinforcements.length,0);
 assert(!receiveView(w,{...v,x:Infinity}));assert(!receiveView(w,{...v,field:123456}));
 syncDebate(w).active=true;const r=prepareObserver(w,Date.now());assert(r?.commentary);const request=observerRequest({speechRequest:r});assert.equal(request.text.format.name,'battle_observer');assert(!JSON.stringify(request.text.format.schema).includes('strategy'));
 const result={ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,text:'这边人都挤到桥头了。',emotion:'dry'}};
 assert(applyObserver(w,r,result,Date.now()));const l=w.showDebate.observerQueue.find(l=>l.observer);assert(l);assert(observerFresh(w,l));
 receiveView(w,{...v,x:v.x+5000},Date.now()+1600);assert(!observerFresh(w,l));tickDebate(w);assert(!w.showDebate.observerQueue.some(l=>l.observer));
 }finally{g.close();}
});
test('ready leader handoffs give the camera observer a generation slot before another refill',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const s=syncDebate(w);s.active=true;s.queue=[{side:'demon'},{side:'human'}];receiveView(w,viewport(w));
 const task=nextModelWork(g,{take:()=>null},Date.now(),{});assert(task?.pack?.commentary);
 }finally{g.close();}
});
test('paired dialogue suppresses tactical monologue but still applies the actual command',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;syncDebate(w).active=true;const c=g.context('demon'),before=w.speech.length;
 assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'旧式战术报幕。',continuations:[],memory:''},'chatgpt-web/light'));
 assert.equal(w.speech.length,before);assert.equal(g.meta.lastCommand.demon.tactic,'hold');assert.equal(g.meta.models.demon,'chatgpt-web/light');
 }finally{g.close();}
});
test('independent female commentary does not need three completed debate packs; stale generations are not published',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const s=syncDebate(w);s.active=true;receiveView(w,viewport(w));const r=prepareObserver(w,Date.now());assert.equal(s.cycle,0);assert(r);
 w.time+=61000;assert(!applyObserver(w,r,{ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,text:'这边可真够挤的。',emotion:'amused'}},Date.now()));assert.equal(s.queue.length,0);
 }finally{g.close();}
});
test('only admitted broadcast renderer can change commentary view; resetting field invalidates it',()=>{
 const g=new LiveGame();try{const p=new PlaybackReceipts(g),client='11111111-1111-4111-8111-111111111111',view=viewport(g.world);
 assert(!p.receive({event:'view',client,...view}).ok);assert(p.receive({event:'claim',client}).ok);assert(p.receive({event:'view',client,...view}).ok);
 assert(!p.receive({event:'view',client:'22222222-2222-4222-8222-222222222222',...view}).ok);g.world.fieldEpoch++;syncDebate(g.world);assert.equal(g.world.showDebate.view,null);
 }finally{g.close();}
});
test('paired show still preloads soldier shouts; actual soldiers use generated receipts and stay short',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;syncDebate(w).active=true;const r=prepareSpeechRequest(w,Date.now(),{troopsOnly:true,parallel:true});assert.equal(r.items.length,7);assert(r.items.every(i=>i.cue.startsWith('troop_')));
 assert(applySpeechPack(w,r,{ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,lines:r.items.map(i=>({cue:i.cue,text:'揍他！',continuations:[]}))}},Date.now()));
 const u={id:77,hp:10,kind:'sword',side:r.side,supporter:{id:'test'}};assert(generatedTroopShout(w,u,'attack'));assert.equal(w.chatter.at(-1).generationId,r.id);assert(!generatedTroopShout(w,u,'attack'));
 }finally{g.close();}
});
test('soldier icons represent damage, peril, hot streak and fury, not constant decorations',()=>{
 const base={id:7,kind:'sword',side:'human',hp:100,maxHP:100};assert.equal(troopEmotion(base,10000),null);
 assert.equal(troopEmotion({...base,hitAt:9700},10000).kind,'shock');assert.equal(troopEmotion({...base,hp:15,moving:true},10000).kind,'panic');
 assert.equal(troopEmotion({...base,kills:3,action:{}},10000).kind,'fury');assert.equal(troopEmotion({...base,furyUntil:11000},10000).kind,'anger');
 assert.equal(troopEmotion({...base,hp:0,hitAt:9990},10000),null);
});
test('client discards queued commentary after the camera has moved, even before server catches up',()=>{
 const p=new SpeechPlayback(),s={heroes:{demon:{id:'d',hp:1},human:{id:'h',hp:1}},fieldEpoch:1,time:100};p.viewport={x:5000,y:500,w:1000,h:700};
 const line={debate:true,observer:true,persona:'empress-observer-v1',side:'empress',view:{x:1000,y:500,w:1000,h:700}};assert(!p.valid(line,s));p.viewport=line.view;assert(p.valid(line,s));
});

test('HTTP viewport telemetry is numeric, owner-gated and yields to the broadcast presenter',async t=>{
 const {createPreview}=await import('../modules/duel-preview/server.mjs');const app=await createPreview({stagePort:44892,controlPort:44893,clock:false});t.after(()=>app.close());
 const owner='http://127.0.0.1:44893',stage='http://127.0.0.1:44892',html=await(await fetch(owner)).text(),token=html.match(/content="([a-f0-9]{64})"/)[1],v=viewport(app.world);
 const post=async(key,body)=>fetch(owner+'/owner/view',{method:'POST',headers:{Origin:owner,'Content-Type':'application/json','X-Owner-Token':key},body:JSON.stringify(body)});
 assert.equal((await post('',v)).status,403);assert((await(await post(token,v)).json()).ok);assert(!app.world.showDebate.view.prompt);
 assert(!(await(await post(token,{...v,x:'read files'})).json()).ok);
 const bh=await(await fetch(stage+'/?broadcast=1')).text(),bt=bh.match(/name="playback-token" content="([a-f0-9]{64})"/)[1],client='33333333-3333-4333-8333-333333333333';
 const r=await fetch(stage+'/playback',{method:'POST',headers:{Origin:stage,'Content-Type':'application/json','X-Playback-Token':bt},body:JSON.stringify({event:'claim',client})});assert((await r.json()).ok);
 assert(!(await(await post(token,v)).json()).ok);
});

test('camera commentator can generate and speak before either leader has a successful debate',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const s=syncDebate(w);assert(!s.active);receiveView(w,viewport(w));
 const task=nextModelWork(g,{take:()=>null},Date.now(),{});assert(task?.pack?.commentary,'first camera commentary must not wait for a leader generation');const r=task.pack;
 assert(applyObserver(w,r,{ok:true,model:'chatgpt-web/light',decision:{requestId:r.id,text:'桥头挤成这样，后边还在冲。',emotion:'dry'}},Date.now()));const l=s.observerQueue.find(l=>l.observer);l.audioMode='full_read';l.audioUrl='/voice/observer.wav';l.audioDuration=3000;tickDebate(w);
 assert.equal(w.speech.at(-1)?.id,l.id,'single ready observer clip must not wait for two leader clips');assert(!s.active);
 }finally{g.close();}
});

test('independent playback channels share one background generation slot',()=>{const g=new LiveGame();try{const w=g.world;w.paused=false;receiveView(w,viewport(w));const s=syncDebate(w);s.request='inflight-debate';const schedule={take:()=>null};const job=nextModelWork(g,schedule,Date.now(),{transport:'electron'},{busyLanes:['show:debate']});assert.equal(job,null);assert.equal(nextModelWork(g,schedule,Date.now(),{transport:'electron'},{busyLanes:['show:debate','show:observer']}),null);}finally{g.close();}});
test('paired prompt contains current maneuver and specific stakes without game-action authority',()=>{const g=new LiveGame();try{const w=g.world;w.paused=false;w.duelManeuver={phase:'maneuver',reason:'supply',retreating:'human',pursuer:'demon'};const r=prepareDebate(w,Date.now());assert.equal(r.battle.maneuver.pursuer,'demon');assert.equal(r.battle.leaders.demon.name,w.heroes.demon.name);assert(r.battle.stakes.human.includes('血籍'));assert(!('actions' in r));}finally{g.close();}});
