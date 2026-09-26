import test from 'node:test';import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {prepareSpeechRequest,applySpeechPack,tickLunaSpeech,cueSpeech,generatedTroopShout,enableLunaSpeech} from '../modules/pixel-war/luna-speech.mjs';
import {modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
import {replyAudience,tickAudience} from '../modules/live-runtime/audience.mjs';
import {selectedLeaderSpeech} from '../modules/pixel-war/public/leader-speech.mjs';
import {ceremonyTitle} from '../modules/pixel-war/public/ceremony.mjs';
import {mockPack} from './fixtures/luna-pack.mjs';
test('broadcast speech stays empty without Luna, including familiar chat, scripted banter, shouts and waiting text',()=>{
 const g=new LiveGame();try{const w=g.world;g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'你是谁'});tickAudience(g);assert.equal(selectedLeaderSpeech(g.snapshot(),'demon'),undefined);assert(!replyAudience(g,g.meta.audience.active.demon.id,'假回复'));w.say('demon','demonFather');w.react('demon','Hurt');g.testGift({side:'demon',reward:'rally'});g.drain();for(let i=0;i<200;i++)g.step(50);assert.equal(w.speech.length,0);assert.equal(w.chatter.length,0);
 w.speech.push({text:'旧台词'});w.chatter.push({text:'旧喊话',until:w.time+5000});assert.equal(w.snapshot().speech.length,0);assert.equal(w.snapshot().chatter.length,0);enableLunaSpeech(w);assert.equal(w.speech.length,0);
 }finally{g.close();}
});
test('preload request is bounded and validated, wrong source, wrong persona and malformed packs are not published',()=>{
 const g=new LiveGame();try{const w=g.world,r=prepareSpeechRequest(w,100000),c={...g.context(r.side),audience:null,speechRequest:r},request=modelRequest('luna-max',c);assert.equal(request.service_tier,'fast');assert.equal(request.reasoning.effort,'max');assert(request.input[0].content.includes('不是现在已发生'));const d={requestId:r.id,lines:r.items.map(i=>({cue:i.cue,text:'测试生成内容',continuations:[]}))};assert.deepEqual(validateDecision(JSON.stringify(d),c),d);assert.throws(()=>validateDecision(JSON.stringify({...d,lines:[...d.lines.slice(1),d.lines[1]]}),c));assert(!applySpeechPack(w,r,{ok:true,model:'local',decision:d},100000));assert.equal(w.speech.length,0);assert(applySpeechPack(w,r,{ok:true,model:'gpt-5.6-luna',decision:d},100000));assert.equal(w.speech.length,0);tickLunaSpeech(w);assert.equal(w.speech[0].cue,'opening');assert.equal(w.speech[0].model,'gpt-5.6-luna');w.heroes[r.side]=w.makeHero(r.side,2);assert(!applySpeechPack(w,r,{ok:true,model:'gpt-5.6-luna',decision:d},110000));
 }finally{g.close();}
});
test('preloaded event lines wait for a real cue; each soldier shout comes from generated cache',()=>{
 const g=new LiveGame();try{const w=g.world;w.lunaSpeech.pending=[];mockPack(w,'demon',{hurt:'测试受伤反应',troop_attack:'测试攻击喊声'});tickLunaSpeech(w);assert.equal(w.speech.length,0);cueSpeech(w,'demon','hurt');tickLunaSpeech(w);assert.equal(w.speech.at(-1).text,'测试受伤反应');g.testGift({side:'demon',reward:'rally'});g.drain();const u=w.units[0];assert(generatedTroopShout(w,u,'attack'));assert.equal(w.chatter[0].text,'测试攻击喊声');assert.equal(w.chatter[0].unitId,u.id);assert.equal(w.chatter[0].model,'gpt-5.6-luna');
 }finally{g.close();}
});
test('preloaded successor line is not spoken by the child and transfers once to the actual father',()=>{
 const g=new LiveGame();try{const w=g.world;w.lunaSpeech.pending=[];let now=100000,r;
 // Small preload batches fill the opening first, then future event coverage.
 for(let i=0;i<24;i++,now+=10001){r=prepareSpeechRequest(w,now);assert(r);assert(r.items.length===1);if(r.items.some(i=>i.cue==='arrival'))break;applySpeechPack(w,r,{ok:true,model:'gpt-5.6-luna',decision:{requestId:r.id,lines:r.items.map(i=>({cue:i.cue,text:'测试生成'}))}},now);}
 assert.equal(r.items.find(i=>i.cue==='arrival').delivery,'successor');w.lunaSpeech.cache=[];const d={requestId:r.id,lines:r.items.map(i=>({cue:i.cue,text:i.cue==='arrival'?'测试父辈登场':'测试生成'}))};applySpeechPack(w,r,{ok:true,model:'gpt-5.6-luna',decision:d},now);cueSpeech(w,r.side,'arrival');tickLunaSpeech(w);assert.equal(w.speech.length,0);w.heroes[r.side]=w.makeHero(r.side,1);w.mode='settlement';cueSpeech(w,r.side,'arrival',null,{priority:4});tickLunaSpeech(w);assert.equal(w.speech.at(-1).text,'测试父辈登场');assert.equal(w.speech.at(-1).persona,w.heroes[r.side].id);w.heroes[r.side]=w.makeHero(r.side,2);tickLunaSpeech(w);assert(!w.lunaSpeech.cache.some(c=>c.cue==='arrival'));
 }finally{g.close();}
});
test('viewer reply gets fresh text and cannot consume a preloaded monologue',()=>{
 const g=new LiveGame();try{const w=g.world;mockPack(w,'demon',{monologue:'缓存自言自语'});g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'你是谁'});g.step(50);assert.equal(w.speech.length,0);const c=g.context('demon');assert.equal(c.audience.selected.text,'你是谁');assert(!c.speechRequest);assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'测试当次身份回答',memory:'',replyTo:c.audience.selected.id,audienceAction:'none'},'gpt-5.6-luna'));assert.equal(w.speech.at(-1).spokenText,'测试当次身份回答');assert(!w.speech.at(-1).preloaded);
 }finally{g.close();}
});
test('ordinary viewer reply survives unrelated field changes; tactical orders and retired personas remain fenced',()=>{
 const g=new LiveGame();try{g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'你是谁'});g.step(50);const c=g.context('demon');g.meta.epoch++;g.world.mode='settlement';const d={strategy:'auto',tactic:'hold',lane:1,speech:'测试本代身份回答',memory:'',replyTo:c.audience.selected.id,audienceAction:'none'};assert(g.applyDecision(c,d,'gpt-5.6-luna'));assert.equal(g.world.speech.at(-1).text,d.speech);g.world.heroes.demon=g.world.makeHero('demon',3);assert(!g.applyDecision(c,d,'gpt-5.6-luna'));
 }finally{g.close();}
});
test('transient login/status refresh waits for recovery without emitting or executing a local fallback',()=>{
 const g=new LiveGame();try{g.runtime={modelEnabled:false,modelReason:'codex_login_unavailable'};g.testChat({side:'demon',text:'你是谁'});g.step(50);assert.equal(g.meta.audience.active.demon.phase,'waiting_model');assert.equal(g.world.speech.length,0);g.runtime={modelEnabled:true};const c=g.context('demon');assert(g.applyDecision(c,{strategy:'auto',tactic:'hold',lane:1,speech:'测试恢复后的回答',memory:'',replyTo:c.audience.selected.id,audienceAction:'none'},'gpt-5.6-luna'));
 }finally{g.close();}
});
test('an older in-flight status poll cannot undo acknowledged settings',async()=>{
 const {BrokerClient}=await import('../modules/live-runtime/client.mjs');const b=new BrokerClient({token:'fixture'});let resolve;b.request=path=>path==='/status'?new Promise(r=>{resolve=r;}):Promise.resolve([]);const pending=b.poll({receiveBatch:()=>[]});b.setStatus({models:{enabled:true,authenticated:true}});resolve({models:{enabled:false,authenticated:false}});await pending;assert.equal(b.status.models.enabled,true);assert.equal(b.status.models.authenticated,true);
});
test('valid generated dialogue can contain semicolons without being treated as a shell or chat command',()=>{
 const g=new LiveGame();try{g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'你是谁'});g.step(50);const c=g.context('demon'),d={strategy:'auto',tactic:'hold',lane:1,speech:'我是索恩；对面是阿岚。',continuations:[],memory:'',replyTo:c.audience.selected.id,audienceAction:'none'};assert.doesNotThrow(()=>validateDecision(JSON.stringify(d),c));assert(g.applyDecision(c,d,'gpt-5.6-luna'));assert.equal(g.world.speech.at(-1).text,d.speech);assert(!g.world.heroes.demon.viewerAdvice);
 }finally{g.close();}
});
