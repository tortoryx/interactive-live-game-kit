import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {syncDebate} from '../modules/live-runtime/show-debate.mjs';
import {VoicePump,VOICE_WARMUP_WAIT_MS} from '../modules/live-runtime/voice-pump.mjs';

test('a cold local voice retains the opening after 12 seconds and publishes the same words when ready',async()=>{
 const game=new LiveGame();
 try{
  const w=game.world;w.paused=false;game.runtime.voiceEnabled=true;
  const s=syncDebate(w),line={id:++w.serial,side:'demon',persona:w.heroes.demon.id,opponents:s.key,text:'给我站住。',audioMode:'synthesizing',voiceWaitStartedAt:Date.now()-21000,until:w.time+180000};s.queue=[line];
  const pump=new VoicePump(),audio=new Map();
  await pump.pump(game,{request:async()=>({ok:false,reason:'voice_warming'})},audio);
  assert.equal(line.audioMode,'synthesizing');assert.equal(line.voiceFailure,undefined);assert(!pump.attempted.has(line.id));assert(line.voiceRetryAt>Date.now());assert.equal(audio.size,0);
  line.voiceRetryAt=0;
  const bytes=Buffer.alloc(8044);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(8000,40);
  await pump.pump(game,{request:async()=>({ok:true,wav:bytes.toString('base64')})},audio);
  assert.equal(line.audioMode,'full_read');assert.equal(line.text,'给我站住。');assert.equal(audio.size,1);
 }finally{game.close();}
});

test('an unresponsive local voice still has a bounded wait and cannot hold the show forever',async()=>{
 const game=new LiveGame();
 try{
  const w=game.world;w.paused=false;game.runtime.voiceEnabled=true;
  const s=syncDebate(w),line={id:++w.serial,side:'human',persona:w.heroes.human.id,text:'往后退。',audioMode:'synthesizing',voiceWaitStartedAt:Date.now()-VOICE_WARMUP_WAIT_MS-1000};s.queue=[line];
  await new VoicePump().pump(game,{request:async()=>({ok:false,reason:'voice_warming'})},new Map());
  assert.equal(line.audioMode,'subtitle_only');assert.equal(line.voiceFailure,'voice_warming_timeout');assert(line.audioDuration>0);
 }finally{game.close();}
});
