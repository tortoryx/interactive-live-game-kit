import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {customProfile,toCustomRequest} from '../modules/live-runtime/portable-ai.mjs';
import {ModelDirector,PROFILES,modelRequest} from '../modules/live-runtime/models.mjs';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {createBroker} from '../modules/live-runtime/broker.mjs';
import {createPreview} from '../modules/duel-preview/server.mjs';
import {isCommanderModel,tickLunaSpeech} from '../modules/pixel-war/luna-speech.mjs';

test('portable provider refuses credential-bearing or unencrypted remote endpoints',()=>{
 for(const AI_CHAT_URL of ['http://provider.example/v1/chat/completions','https://secret@provider.example/v1','https://provider.example/v1?key=secret','file:///tmp/provider'])assert.throws(()=>customProfile({AI_CHAT_URL}));
 const p=customProfile({AI_CHAT_URL:'http://127.0.0.1:11434/v1/chat/completions',AI_MODEL:'test-model',AI_INPUT_USD_PER_MILLION:'0',AI_OUTPUT_USD_PER_MILLION:'0'});
 assert.equal(p.model,'configured-api/test-model');assert.equal(p.input,0);assert(isCommanderModel(p.model));assert(!isCommanderModel('shell'));
 assert(Number.isNaN(customProfile({}).input),'missing rates must not silently mean free');
});

test('configured model response crosses validation into the current leader, never into its successor',async()=>{
 const db=new DatabaseSync(':memory:'),game=new LiveGame(),old=PROFILES['custom-api'];
 const p=customProfile({AI_CHAT_URL:'https://provider.example/v1/chat/completions',AI_MODEL:'test-model',AI_INPUT_USD_PER_MILLION:'1',AI_OUTPUT_USD_PER_MILLION:'2'});PROFILES['custom-api']=p;
 let sent;
 try{
  game.world.paused=false;game.world.mode='live';const context=game.context('demon');
  const decision={strategy:'auto',tactic:'advance',lane:1,speech:'桥还在，我就还守着。',continuations:[],memory:''};
  const config={enabled:true,profile:'custom-api',keys:{'custom-api':'synthetic-test-key-never-a-real-credential'},hourUSD:1,dayUSD:5};
  const director=new ModelDirector({db,config:()=>config,fetcher:async(url,opts)=>{sent={url,body:JSON.parse(opts.body)};return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(decision)}}],usage:{prompt_tokens:100,completion_tokens:30}}));}});
  const result=await director.decide(context);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(sent.body.model,'test-model');assert.equal(sent.body.response_format.type,'json_schema');assert.equal(sent.body.tools,undefined);assert.equal(sent.body.reasoning,undefined);assert.equal(sent.body.service_tier,undefined);
  game.runtime={model:p.model,modelEnabled:true,voiceEnabled:false};assert.equal(game.applyDecision(context,result.decision,result.model),true);
  game.meta.epoch++;game.world.heroes.demon.id='new-leader';assert.equal(game.applyDecision(context,result.decision,result.model),false);
  assert.equal((await director.decide(context)).reason,'cadence_limit');
 }finally{PROFILES['custom-api']=old;game.close();db.close();}
});

test('background speech uses the same custom endpoint request format and paused speech is safe',()=>{
 const g=new LiveGame();try{
  g.world.paused=true;assert.doesNotThrow(()=>tickLunaSpeech(g.world));
  const original={input:[{role:'system',content:'rules'},{role:'user',content:'data'}],text:{format:{name:'character_lines',schema:{type:'object'}}}};
  const request=toCustomRequest(original,{url:'https://provider.example/api',requestModel:'test'});assert.equal(request.response_format.json_schema.name,'character_lines');assert.equal(request.messages.length,2);
 }finally{g.close();}
});

test('offline broker status performs no provider or platform requests and never reveals credentials',async()=>{
 let calls=0;const token='t'.repeat(64);const b=await createBroker({port:4482,token,fetcher:async()=>{calls++;throw Error('unexpected_network');}});
 try{
  const r=await fetch('http://127.0.0.1:4482/status',{headers:{'x-bridge-token':token}});const s=await r.json();assert.equal(s.models.enabled,false);assert.equal(s.bilibili.enabled,false);assert.equal(calls,0);assert(!JSON.stringify(s).includes(token));
  assert.equal((await fetch('http://127.0.0.1:4482/status')).status,403);
 }finally{await b.close();}
});

test('stage cannot reach owner actions, private files or credentials; preview assets load',async()=>{
 const p=await createPreview({stagePort:4480,controlPort:4481,clock:false});
 try{
  for(const path of ['/settings.html','/control.html','/.env','/.local/connections.sqlite','/owner/status'])assert.equal((await fetch('http://127.0.0.1:4480'+path)).status,404,path);
  const art=await fetch('http://127.0.0.1:4480/gift-icons/reward-0.svg');assert.equal(art.status,200);assert.equal(art.headers.get('content-type'),'image/svg+xml');
  assert.equal((await fetch('http://127.0.0.1:4481/owner/status',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
  const html=await(await fetch('http://127.0.0.1:4481/')).text();assert(!html.includes('__OWNER_TOKEN__'));assert(html.includes('模拟礼物'));
 }finally{await p.close();}
});
