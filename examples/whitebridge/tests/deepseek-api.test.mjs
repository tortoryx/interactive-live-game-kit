import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {ModelDirector,modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
import {tickAudience} from '../modules/live-runtime/audience.mjs';
import {receiveView,prepareObserver,applyObserver} from '../modules/live-runtime/show-observer.mjs';
import {modelAdmission} from '../modules/live-runtime/model-work.mjs';
import {createBroker} from '../modules/live-runtime/broker.mjs';
import {runtimeAvailability} from '../modules/live-runtime/availability.mjs';
function fixture(){
 const g=new LiveGame({speechMode:'observer'});g.world.paused=false;g.runtime.modelEnabled=true;g.runtime.model='deepseek-flash';
 const r=g.testChat({side:'demon',text:'你是谁'});tickAudience(g);const context=g.context('demon');
 return {g,context,decision:{strategy:'auto',tactic:'hold',lane:1,speech:'我是看两边打架的魔女。',continuations:[],memory:'',replyTo:r.id,audienceAction:'none'}};
}
const settings=()=>({enabled:true,profile:'deepseek-flash',keys:{'deepseek-flash':'fixture-secret-only-not-real'},hourUSD:1,dayUSD:5});
const response=d=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(d)}}],usage:{prompt_tokens:200,completion_tokens:100}});
test('DeepSeek sends only bounded text to a fixed endpoint, bills usage, and applies viewer replies',async()=>{
 const {g,context,decision}=fixture(),db=new DatabaseSync(':memory:');let request;
 const d=new ModelDirector({db,config:settings,fetcher:async(url,opts)=>{request={url,...opts,body:JSON.parse(opts.body)};return response(decision);}});
 try{
  const r=await d.decide(context);assert.equal(r.ok,true);assert.equal(r.model,'deepseek-flash');assert(g.applyDecision(context,r.decision,r.model));
  assert.equal(request.url,'https://api.deepseek.com/chat/completions');assert.equal(request.redirect,'error');assert.equal(request.body.thinking.type,'disabled');
  assert.equal(request.body.tools,undefined);assert.equal(request.body.input,undefined);assert.equal(request.body.service_tier,undefined);assert.equal(request.body.response_format.type,'json_object');
  assert.match(request.body.messages[0].content,/JSON Schema/);assert.match(request.body.messages[0].content,/魔女解说/);
  assert.equal(d.totals().hourUSD,.00018);assert.equal(g.meta.lastCommand?.demon,undefined);
 }finally{d.stop();db.close();g.close();}
});
test('camera commentary uses the same API adapter and is accepted by the existing voice queue',async()=>{
 const {g}=fixture(),db=new DatabaseSync(':memory:'),now=Date.now();
 receiveView(g.world,{side:'demon',field:g.world.fieldEpoch,x:g.world.heroes.demon.x,y:g.world.heroes.demon.y,w:1400,h:900},now);
 const pack=prepareObserver(g.world,now),c={...g.context('demon'),speechRequest:pack};assert(pack);
 const decision={requestId:pack.id,lines:[{text:'前面这队走得有点远，后头跟不上了。',emotion:'focused'},{text:'我想看看他会不会回来接人。',emotion:'dry'},{text:'别让后面那队白跑一趟。',emotion:'focused'}]};
 const d=new ModelDirector({db,config:settings,fetcher:async(u,o)=>{const b=JSON.parse(o.body);assert.equal(b.max_tokens,720);assert.equal(b.messages.length,2);return response(decision);}});
 try{const r=await d.decide(c);assert.equal(r.ok,true);assert(applyObserver(g.world,pack,r,now));assert.equal(g.world.showDebate.observerQueue.length,1);}finally{d.stop();db.close();g.close();}
});
test('one ambient generation leaves capacity for a viewer, cancellation invalidates both results',async()=>{
 const {g,context,decision}=fixture(),db=new DatabaseSync(':memory:'),pending=[];
 const d=new ModelDirector({db,config:settings,fetcher:async()=>new Promise(r=>pending.push(r))});
 try{
  const background=d.decide({...context,audience:undefined,performer:undefined});
  const viewer=d.decide(context);assert.equal(pending.length,2);assert.equal(d.snapshot().parallelism,2);
  assert.equal((await d.decide(context)).reason,'busy');assert(d.totals().hourUSD>0);
  d.stop();pending.forEach(r=>r(response(decision)));assert.equal((await background).ok,false);assert.equal((await viewer).ok,false);
  assert.equal(d.status.state,'disabled');assert.equal(d.flights.size,0);
 }finally{d.stop();db.close();g.close();}
});
test('a concurrent reservation counts towards the budget before the next request is sent',async()=>{
 const {g,context,decision}=fixture(),db=new DatabaseSync(':memory:'),cfg=settings();let resolve,calls=0;
 const d=new ModelDirector({db,config:()=>cfg,fetcher:()=>{calls++;return new Promise(r=>resolve=r);}});
 try{const first=d.decide(context);cfg.hourUSD=d.totals().hourUSD;assert.equal((await d.decide({...context,audience:{...context.audience,selected:{...context.audience.selected,id:'second'}}})).reason,'budget_limit');assert.equal(calls,1);resolve(response(decision));await first;}finally{d.stop();db.close();g.close();}
});
test('authentication/balance failure stops requests; 429 cools down without retrying the old message',async()=>{
 for(const status of [401,402,429]){
  const {g,context}=fixture(),db=new DatabaseSync(':memory:');let at=100000,calls=0;
  const d=new ModelDirector({db,config:settings,now:()=>at,fetcher:async()=>{calls++;return new Response('',{status});}});
  try{assert.equal((await d.decide(context)).reason,'upstream_'+status);await d.decide(context);assert.equal(calls,1);
   at+=31000;if(status===429){await d.decide(context);assert.equal(calls,2);}else{await d.decide(context);assert.equal(calls,1);}
  }finally{d.stop();db.close();g.close();}
 }
});
test('malformed output cannot become speech or game commands',()=>{
 const {g,context,decision}=fixture();try{
  for(const bad of [{...decision,extra:'x'},{...decision,replyTo:'forged'},{...decision,audienceAction:'advance'},{...decision,continuations:undefined}])assert.throws(()=>validateDecision(JSON.stringify(bad),context));
  assert.throws(()=>validateDecision('```json\n'+JSON.stringify(decision)+'\n```',context));
  const b=modelRequest('deepseek-flash',context);assert.equal(b.tools,undefined);
 }finally{g.close();}
});
test('truncated completion and unexpected tool calls are never published',async()=>{
 for(const extra of [{finish_reason:'length'},{finish_reason:'stop',tool_calls:[{name:'shell'}]}]){
  const {g,context,decision}=fixture(),db=new DatabaseSync(':memory:');
  const d=new ModelDirector({db,config:settings,fetcher:async()=>Response.json({choices:[{finish_reason:extra.finish_reason,message:{content:JSON.stringify(decision),tool_calls:extra.tool_calls}}],usage:{prompt_tokens:200,completion_tokens:100}})});
  try{assert.equal((await d.decide(context)).reason,'invalid_model_output');assert(!JSON.stringify(d.status).includes(decision.speech));assert(d.totals().hourUSD>0);}finally{d.stop();db.close();g.close();}
 }
});
test('API status reports capacity and redacts the stored key; paused state does not enable live fulfillment',async()=>{
 const b=await createBroker({port:19552,token:'fixture-token'});
 try{await b.configure({section:'models',values:{transport:'api',profile:'deepseek-flash',apiKey:'fixture-secret-only-123456',enabled:true,resumeOnRestart:true}});
  const s=b.status();assert.equal(s.models.transport,'api');assert.equal(s.models.model,'deepseek-flash');assert.equal(s.models.parallelism,2);assert.equal(s.models.resumeOnRestart,true);
  assert.equal(JSON.stringify(s).includes('fixture-secret-only'),false);assert.equal(s.bilibili.enabled,false);
  assert.equal(runtimeAvailability(s).modelEnabled,true);assert.equal(runtimeAvailability({...s,models:{...s.models,state:'upstream_402'}}).modelEnabled,false);
  assert(modelAdmission(s.models,1));assert(!modelAdmission(s.models,2));
 }finally{await b.close();}
});
