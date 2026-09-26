import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {chooseObserverTopic,rememberObserverOffer,rememberObserverSpoken,observerConversation} from '../modules/live-runtime/observer-topics.mjs';
import {receiveView,prepareObserver,observerRequest,validateObserver,applyObserver,tickObserver} from '../modules/live-runtime/show-observer.mjs';
import {syncDebate,debatePresentation,HOST_ID} from '../modules/live-runtime/show-debate.mjs';
import {SpeechPlayback} from '../modules/pixel-war/public/speech-playback.mjs';
const quiet=(region='白桥盆地')=>({region,canTellStory:true,fighting:false,analysis:{readings:[],arrivals:[]}});
const remembered=w=>{rememberObserverSpoken(w,'后排离得这么近，先别让弓手往前凑。');rememberObserverSpoken(w,'这支老兵我有点舍不得拿去换。');};
const storyLines=[
 {text:'说起这座桥，人类雷恩曾带着药从这里过境。',emotion:'focused'},
 {text:'魔族维萨尔放他过去救人，他后来却奉命封桥收粮。',emotion:'dry'},
 {text:'维萨尔当初放行时，恐怕没想到会有这一天。',emotion:'amused'},
];
function setup(){
 const g=new LiveGame({speechMode:'observer'}),w=g.world;w.paused=false;
 const now=Date.now(),v={side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900};
 receiveView(w,v,now);const r=prepareObserver(w,now);remembered(w);r.topic=chooseObserverTopic(w,quiet(),now+18000);assert.equal(r.topic.kind,'story');
 w.showDebate.observerRequestKind='story';return {g,w,r,now,v,s:syncDebate(w)};
}
const response=r=>({ok:true,model:'deepseek-flash',decision:{requestId:r.id,lines:structuredClone(storyLines)}});
const ready=l=>Object.assign(l,{audioMode:'full_read',audioUrl:'/voice/fixture.wav',audioDuration:5000});

test('unrelated quiet scenes never draw isolated lore; a story requires an observed entrance and real prior speech',()=>{
 const w={};rememberObserverOffer(w,['你可能从未听到这条，不能当成已介绍背景。']);
 for(let n=0;n<25;n++)assert.notEqual(chooseObserverTopic(w,quiet('橡林牧地'),n*18000)?.kind,'story');
 assert.notEqual(chooseObserverTopic(w,quiet(),500000)?.kind,'story');remembered(w);
 assert.notEqual(chooseObserverTopic(w,{...quiet(),fighting:true},520000)?.kind,'story');
 const t=chooseObserverTopic(w,quiet(),540000);assert.equal(t.kind,'story');assert.equal(t.story.beats.length,3);
 assert(t.anchor);assert(t.story.facts.includes('雷恩'));assert(!t.story.facts.includes('修房子'));
});
test('story must be generated as a whole; incomplete or partially duplicate passages are never spliced into playback',()=>{
 const {g,w,r,now,s}=setup();try{
  const schema=observerRequest({speechRequest:r}).text.format.schema;assert.equal(schema.properties.lines.minItems,3);
  assert.throws(()=>validateObserver(JSON.stringify({requestId:r.id,lines:storyLines.slice(1)}),{speechRequest:r}));
  rememberObserverOffer(w,[storyLines[0].text]);assert.equal(applyObserver(w,r,response(r),now),false);assert.equal(s.observerQueue.length,0);
 }finally{g.close();}
});
test('story waits for one continuous performance, survives camera movement and keeps viewer replies first',()=>{
 const {g,w,r,now,v,s}=setup();try{
  assert(applyObserver(w,r,response(r),now));assert.equal(s.observerQueue.length,1);tickObserver(w);assert.equal(w.speech.filter(l=>l.observer).length,0);
  ready(s.observerQueue[0]);receiveView(w,{...v,x:v.x+4000},now+1000);
  w.audienceWaiting={demon:true};tickObserver(w);assert.equal(w.speech.filter(l=>l.observer).length,0);
  w.audienceWaiting={};tickObserver(w);assert.equal(w.speech.at(-1).storyIndex,0);
  receiveView(w,{...v,x:v.x+4000},now+19000);assert.equal(prepareObserver(w,now+19000),null,'no unrelated topic can be inserted into a prepared story');
  assert.equal(w.speech.at(-1).text,storyLines.map(l=>l.text).join(''));assert.equal(s.observerQueue.length,0);
  assert.equal(chooseObserverTopic(w,quiet(),now+700000)?.kind==='story',false,'do not retell the same old story after its cooldown');
  w.paused=true;syncDebate(w);assert.equal(s.observerQueue.length,0);assert(!w.speech.some(l=>l.observer));
 }finally{g.close();}
});
test('real prompt separates played, unfinished and merely generated context',()=>{
 const {g,w,r,now,s}=setup();try{
  assert(applyObserver(w,r,response(r),now));s.observerQueue.forEach(ready);tickObserver(w);const line=w.speech.at(-1);
  assert(observerConversation(w).unplayed.includes(line.text));
  const receipt={id:line.id,field:w.fieldEpoch,persona:HOST_ID,event:'started'};
  debatePresentation(g,receipt);assert.equal(observerConversation(w).spoken.at(-1).playback,'started');
  debatePresentation(g,{...receipt,event:'ended'});assert.equal(observerConversation(w).spoken.at(-1).playback,'completed');
  assert(!observerConversation(w).unplayed.includes(line.text));
  s.observerQueue=[];w.speech=[];s.observerAt=0;s.observerQuietUntil=0;const next=prepareObserver(w,now);assert(next.conversation.spoken.some(l=>l.text===line.text&&l.playback==='completed'));
  assert(!next.conversation.unplayed.includes(storyLines[2].text));
 }finally{g.close();}
});
class Media{constructor(){this.paused=true;this.ended=false;this.currentTime=0;}play(){this.paused=false;this.onplaying?.();return Promise.resolve();}pause(){this.paused=true;this.onpause?.();}}
test('browser keeps coherent story during camera changes, then hands off to a viewer at sentence end',()=>{
 const {g,w,r,now,s}=setup();try{
  assert(applyObserver(w,r,response(r),now));s.observerQueue.forEach(ready);tickObserver(w);
  const p=new SpeechPlayback({createAudio:()=>new Media()}),state={...g.snapshot(),speech:w.speech};
  p.update(state,{enabled:true});assert(p.presentation('empress'));
  p.viewport={x:9000,y:100,w:500,h:400};state.observerRevision=99;p.update(state,{enabled:true});assert(p.presentation('empress'));
  const reply={id:999999,side:'demon',performer:'empress',persona:w.heroes.demon.id,audienceId:'viewer',text:'你问的是刚才那个人类雷恩吧。',audioMode:'full_read',audioUrl:'/voice/reply.wav',at:w.time,until:w.time+20000};
  state.speech=[...state.speech,reply];p.update(state,{enabled:true});assert.equal(p.active.length,1);
  p.active[0].audio.onended();assert.equal(p.presentation('empress').audienceId,'viewer');
  state.paused=true;p.update(state,{enabled:true});assert.equal(p.presentation('empress'),null);
 }finally{g.close();}
});
