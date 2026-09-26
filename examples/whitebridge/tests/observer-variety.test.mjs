import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {receiveView,prepareObserver,applyObserver} from '../modules/live-runtime/show-observer.mjs';
import {chooseObserverTopic,repeatedCommentary} from '../modules/live-runtime/observer-topics.mjs';
const scene=hp=>({analysis:{arrivals:[],readings:[{id:'demon-1',kind:'leader_risk',hpPercent:hp,enemiesNear:2,guardsNear:1,shield:0}]}});
test('unchanged low health rotates to other subjects; a real deterioration can interrupt them',()=>{
 const w={};assert.equal(chooseObserverTopic(w,scene(34),100000).kind,'battle');
 const topics=[];for(let n=1;n<7;n++)topics.push(chooseObserverTopic(w,scene(34),100000+n*18000));
 assert(topics.every(t=>t&&t.kind!=='battle'));assert.equal(new Set(topics.map(t=>t.key)).size,6);
 assert.equal(chooseObserverTopic(w,scene(34),218000),null,'do not force filler when topics are exhausted');
 assert.equal(chooseObserverTopic(w,scene(8),227000).kind,'battle');
});
test('one arrival cannot be repeatedly thanked in quiet samples',()=>{
 const w={},s={analysis:{readings:[],arrivals:[{receipt:'one',owner:'观众甲',source:'bilibili',gift:'小花花'}]}};
 assert.equal(chooseObserverTopic(w,s,1).kind,'arrival');assert.notEqual(chooseObserverTopic(w,s,18001).kind,'arrival');
});
test('punctuation and small numeric substitutions do not bypass repetition detection',()=>{
 assert(repeatedCommentary('魔王还剩301点血！',['魔王还剩300点血。']));
 assert(repeatedCommentary('他的护卫又快撑不住了。',['他的护卫快撑不住了。']));
 assert(!repeatedCommentary('我比较在意村民吃什么。',['魔王还剩300点血。']));
});
test('real observer request removes stale health focus and rejects a repeated generated batch',()=>{
 const g=new LiveGame();try{
  const w=g.world;w.paused=false;const now=Date.now(),v={side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900};
  receiveView(w,v,now);const first=prepareObserver(w,now);
  const response=r=>({ok:true,model:'deepseek-flash',decision:{requestId:r.id,lines:[{text:'这村子一年得交两份账。',emotion:'dry'}]}});
  assert(applyObserver(w,first,response(first),now));w.showDebate.observerQueue=[];
  receiveView(w,v,now+30000);const next=prepareObserver(w,now+30000);assert(next);
  assert.notEqual(first.topic.key,next.topic.key);assert(next.previous.includes('这村子一年得交两份账。'));
  assert(next.scene.leaders.every(h=>h.hpPercent===undefined));assert.deepEqual(next.scene.analysis.readings,[]);
  assert.equal(applyObserver(w,next,response(next),now+18000),false);assert.equal(w.showDebate.observerQueue.length,0);
  const remembered=w.commentatorEditorial.topics.length;w.heroes.demon.id+='next';
  receiveView(w,v,now+36000);prepareObserver(w,now+36000);
  assert(w.commentatorEditorial.topics.length>=remembered,'her topic memory survives a leader change');
 }finally{g.close();}
});

test('two routine battle topics yield to personality; a new critical injury can still interrupt',()=>{
 const w={},s=scene(34);s.analysis.readings=[];
 for(let i=0;i<3;i++)s.analysis.readings.push({id:'site'+i,kind:'objective',capturePercent:0,controller:'human',attacker:'demon',advantage:1});
 assert.equal(chooseObserverTopic(w,s,100000).kind,'battle');assert.equal(chooseObserverTopic(w,s,118000).kind,'battle');
 assert.notEqual(chooseObserverTopic(w,s,136000).kind,'battle');
 const urgent=scene(5);assert.equal(chooseObserverTopic(w,urgent,137000).kind,'battle');
});

test('grain capture jitter and new site IDs cannot monopolize commentary',()=>{
 const w={fieldEpoch:1};const grain=(id,progress,controller='human')=>({analysis:{arrivals:[],readings:[{id,kind:'objective',name:'粮仓',capturePercent:progress,controller,attacker:controller==='human'?'demon':'human',advantage:progress%2?1:-1}]}});
 assert.equal(chooseObserverTopic(w,grain('grain-1',10),100000).kind,'battle');
 for(let n=1;n<=6;n++)assert.notEqual(chooseObserverTopic(w,grain('grain-'+n,n*15),100000+n*18000)?.kind,'battle');
 assert.equal(chooseObserverTopic(w,grain('grain-1',80),226000).kind,'battle');
});
test('a real takeover can return sooner, but cannot chatter on successive captures',()=>{
 const w={fieldEpoch:1},r={id:'a',kind:'objective',name:'粮仓',capturePercent:70,controller:'human',attacker:'demon',advantage:2},s={analysis:{arrivals:[],readings:[r]}};
 chooseObserverTopic(w,s,100000);r.controller='demon';r.attacker='human';r.capturePercent=0;
 assert.notEqual(chooseObserverTopic(w,s,125000).kind,'battle');
 assert.equal(chooseObserverTopic(w,s,150000).kind,'battle');
 r.controller='human';r.attacker='demon';assert.notEqual(chooseObserverTopic(w,s,168000).kind,'battle');
});
test('ordinary requests use one passage while in-flight multi-part thoughts stay compatible',async()=>{
 const {observerRequest,validateObserver}=await import('../modules/live-runtime/show-observer.mjs');
 const g=new LiveGame({speechMode:'observer'});try{const w=g.world,now=Date.now();w.paused=false;
 receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900},now);const r=prepareObserver(w,now);
 const lines=[{text:'这队弓手的便宜要靠前排替他们争，光把弓拉得更满没用。',emotion:'focused'},{text:'先留住前面挡着的几个。',emotion:'dry'},{text:'真挡不住就撤，活着退回来的还能接着打。',emotion:'focused'}];
 assert(lines.some(l=>l.text.length>24));assert.equal(observerRequest({speechRequest:r}).text.format.schema.properties.lines.maxItems,1);
 const d=validateObserver(JSON.stringify({requestId:r.id,lines}),{speechRequest:r});
 assert(applyObserver(w,r,{ok:true,model:'deepseek-flash',decision:d},now));assert.equal(w.showDebate.observerQueue.length,1);
 }finally{g.close();}
});

test('off-topic grain commentary cannot sneak back through generated idle wording',async()=>{
 const {validateObserver}=await import('../modules/live-runtime/show-observer.mjs');
 const c={speechRequest:{id:'quiet',topic:{kind:'tactics'}}};
 assert.throws(()=>validateObserver(JSON.stringify({requestId:'quiet',lines:[{text:'我还是想聊粮仓，守住这里真的太重要了。',emotion:'focused'}]}),c),/repeated_objective_topic/);
});
