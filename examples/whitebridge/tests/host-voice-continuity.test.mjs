import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {receiveView,prepareObserver,applyObserver,observerRequest,validateObserver} from '../modules/live-runtime/show-observer.mjs';
import {VoicePump} from '../modules/live-runtime/voice-pump.mjs';
import {audienceReplyParts} from '../modules/live-runtime/audience.mjs';
import {modelRequest} from '../modules/live-runtime/models.mjs';
import {tickAudience} from '../modules/live-runtime/audience.mjs';
function wav(){const b=Buffer.alloc(1644);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);return b.toString('base64');}
test('one thought with several sentences reaches the actual TTS pump as one performance',async()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;g.runtime.voiceEnabled=true;
  receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900});const r=prepareObserver(w,Date.now());
  const lines=[{text:'先别急着往前冲，后面的弓箭手还没跟上。',emotion:'focused'},{text:'等他们站好了再打，至少不会让前面几个白挨打。',emotion:'amused'}];
  assert(applyObserver(w,r,{ok:true,model:'deepseek-flash',decision:{requestId:r.id,lines}},Date.now()));
  const calls=[],pump=new VoicePump(),broker={request:async(path,body)=>{calls.push({path,...body});return {ok:true,wav:wav()};}};
  await pump.prepareDebate(g,broker,new Map(),{closing:()=>false});await pump.prepareDebate(g,broker,new Map(),{closing:()=>false});
  assert.equal(calls.length,1);assert.equal(calls[0].side,'empress');assert.equal(calls[0].text,lines.map(l=>l.text).join(''));assert.equal(w.showDebate.observerQueue[0].audioMode,'full_read');
 }finally{g.close();}
});
test('host viewer replies keep load limits but do not recast the voice at each sentence',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  g.runtime.voiceEnabled=true;const parts=['我在这儿看两边打架呢。','你也可以直接跟我聊天。'];
  assert.deepEqual(audienceReplyParts(g,parts),[parts.join('')]);
  g.meta.audience={active:{},pending:Array.from({length:8},(_,i)=>({id:i,expires:100000,receivedAt:g.now()}))};
  assert.deepEqual(audienceReplyParts(g,parts),[parts[0]],'crowded chat still receives one short response');
 }finally{g.close();}
});
test('plain spoken language applies to both commentary and viewer interaction prompts',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  const w=g.world;w.paused=false;receiveView(w,{side:'demon',field:w.fieldEpoch,x:w.heroes.demon.x,y:w.heroes.demon.y,w:1400,h:900});const r=prepareObserver(w,Date.now());
  const ambient=observerRequest({speechRequest:r}).input[0].content;
  g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'为什么他们还不冲'});tickAudience(g);const c=g.context('demon');assert(c.audience.selected);const direct=modelRequest('luna-max',c).input[0].content;
  for(const prompt of [ambient,direct]){assert.match(prompt,/不看字幕也要能听懂/);assert.match(prompt,/大白话/);assert.match(prompt,/不靠字形/);assert.match(prompt,/不撒娇/);}
 }finally{g.close();}
});
test('continuous host audio stays within a bounded full-thought budget',()=>{
 const g=new LiveGame({speechMode:'observer'});try{
  g.runtime.voiceEnabled=true;
  const sentences=['先别急着往前冲，后面的弓箭手还没跟上。','等他们站好了再打，至少不会让前面几个白挨打。','要是后面的人还没赶来，那就先退几步，别自己硬撑着。'];
  const parts=audienceReplyParts(g,sentences);assert.equal(parts.length,1);assert(parts[0].length<=64);assert.equal(parts[0],sentences.slice(0,2).join(''));
  assert.throws(()=>validateObserver(JSON.stringify({requestId:'bounded',lines:Array.from({length:3},()=>({text:'先别急着往前冲，等到后面射箭的人跟上，再过去。',emotion:'focused'}))}),{speechRequest:{id:'bounded'}}),/speech_passage_too_long/);
 }finally{g.close();}
});
