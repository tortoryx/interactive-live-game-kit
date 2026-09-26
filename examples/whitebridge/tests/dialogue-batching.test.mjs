import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {prepareDebate,applyDebate,validateDebate,debateRequest,syncDebate,debateBufferMs} from '../modules/live-runtime/show-debate.mjs';
import {receiveView,prepareObserver,applyObserver} from '../modules/live-runtime/show-observer.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';

const model='chatgpt-web/light',idle={take:()=>null};
const lines=r=>Array.from({length:r.lineCount||6},(_,i)=>({side:i%2?(r.side==='demon'?'human':'demon'):r.side,text:'测试批次内容，只在本地测试。',interrupt:i===6}));
const result=r=>({ok:true,model,decision:{requestId:r.id,lines:lines(r)}});
function view(w,now){receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900},now);}

test('one request produces twelve alternating lines, with legacy six-line requests still accepted',()=>{
 const g=new LiveGame();try{g.world.paused=false;const r=prepareDebate(g.world,100000),c={speechRequest:r};
 assert.equal(r.lineCount,12);assert.equal(debateRequest(c,{}).text.format.schema.properties.lines.minItems,12);
 assert.equal(validateDebate(JSON.stringify(result(r).decision),c).lines[6].side,r.side);
 assert(applyDebate(g.world,r,result(r),100001));assert.equal(g.world.showDebate.queue.length,12);assert.equal(g.world.speech.length,0);
 const old={...r};delete old.lineCount;assert.equal(validateDebate(JSON.stringify(result(old).decision),{speechRequest:old}).lines.length,6);
 const short=result(r).decision;short.lines.pop();assert.throws(()=>validateDebate(JSON.stringify(short),c));
 }finally{g.close();}
});

test('refill waits for low buffered duration and minimum interval; failures cannot cause rapid retry',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const r=prepareDebate(w,100000);applyDebate(w,r,result(r),100100);
 assert(debateBufferMs(w)>20000);assert.equal(prepareDebate(w,150000),null);
 w.showDebate.queue=w.showDebate.queue.slice(-2);assert.equal(prepareDebate(w,144999),null);
 const next=prepareDebate(w,145000);assert(next);assert.equal(next.queuedScript.length,2);
 applyDebate(w,next,{ok:false,reason:'invalid_model_output'},146000);assert.equal(prepareDebate(w,160000),null);
 assert(prepareDebate(w,190000));w.heroes.human.id+='new';syncDebate(w);assert.equal(w.showDebate.queue.length,0);
 }finally{g.close();}
});

test('background admission spaces all batches, alternates slow performers, and never holds viewer replies',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const now=Date.now();view(w,now);
 const first=nextModelWork(g,idle,now,{});assert(first.pack.commentary);
 assert.equal(nextModelWork(g,idle,now+14000,{}),null);
 assert.equal(nextModelWork(g,idle,now+30000,{}, {busyLanes:['show:observer']}),null);
 assert.equal(nextModelWork(g,{take:({audienceWaiting})=>audienceWaiting?.human?'human':null},now+1000,{}),null);
 w.audienceWaiting={human:true};assert.equal(nextModelWork(g,{take:()=> 'human'},now+1001,{}, {busyLanes:['show:observer']}).side,'human');w.audienceWaiting={};
 applyObserver(w,first.pack,{ok:false},now+22000);view(w,now+23000);
 assert(nextModelWork(g,idle,now+23000,{}).pack.duet,'even a slow failed observer yields next background slot');
 const deadline=g.meta.backgroundPacing.nextAt;g.restore(g.capture());assert.equal(g.meta.backgroundPacing.nextAt,deadline);
 }finally{g.close();}
});

test('rapid camera changes cannot burst observer requests; late commentary still expires',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const now=Date.now();view(w,now);const r=prepareObserver(w,now);
 const output={ok:true,model,decision:{requestId:r.id,lines:Array.from({length:3},()=>({text:'测试当前镜头里的部队。',emotion:'focused'}))}};
 assert(applyObserver(w,r,output,now+100));w.showDebate.observerQueue=[];
 for(let t=500;t<18000;t+=500){view(w,now+t);assert.equal(prepareObserver(w,now+t),null);}
 view(w,now+18000);const next=prepareObserver(w,now+18000);assert(next);w.time+=31000;
 assert.equal(applyObserver(w,next,{...output,decision:{...output.decision,requestId:next.id}},now+20000),false);
 }finally{g.close();}
});

test('empty polls reserve no background capacity, while generation churn is bounded over ten minutes',()=>{
 const g=new LiveGame();try{const w=g.world;w.paused=false;const now=Date.now();
 syncDebate(w).active=true;assert.equal(nextModelWork(g,idle,now,{}, {watching:false}),null);assert.equal(g.meta.backgroundPacing.nextAt,0);
 const starts=[];
 for(let t=0;t<600000;t+=250){view(w,now+t);const job=nextModelWork(g,idle,now+t,{});if(!job)continue;starts.push(now+t);const r=job.pack;
  // Simulate failures/cache invalidation, never call a provider.
  if(r?.duet)applyDebate(w,r,{ok:false},now+t);else if(r?.commentary)applyObserver(w,r,{ok:false},now+t);
 }
 assert(starts.length<=40);assert(starts.length>1);for(let i=1;i<starts.length;i++)assert(starts[i]-starts[i-1]>=15000);
 }finally{g.close();}
});
