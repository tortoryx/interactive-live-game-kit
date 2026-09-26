import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalVoice,voiceMemoryAdmission} from '../modules/local-voice/service.mjs';
test('the default live voice uses the original character actors without silent Kokoro fallback',()=>{
 const voice=new LocalVoice({memoryProbe:()=>true});
 assert.equal(voice.light,false);assert.deepEqual(voice.status().actors,voice.reference?{demon:null,human:null,empress:voice.reference.id}:{demon:'Uncle_Fu',human:'Uncle_Fu',empress:'Vivian'});
 assert.equal(voice.status().apiBilling,false);assert.equal(voice.status().performanceVersion,10);voice.stop();
});
test('Qwen admission reserves peak load and headroom; critical pressure always blocks',()=>{
 const GiB=1024**3;
 assert(voiceMemoryAdmission(2,100e6,false,{availableBytes:7*GiB}));
 assert(!voiceMemoryAdmission(2,100e6,false,{availableBytes:6*GiB}));
 assert(voiceMemoryAdmission(2,100e6,false,{availableBytes:3*GiB,loaded:true}));
 assert(!voiceMemoryAdmission(2,100e6,false,{availableBytes:1.9*GiB,loaded:true}));
 assert(!voiceMemoryAdmission(4,GiB,false,{availableBytes:12*GiB,loaded:true}));
 assert(!voiceMemoryAdmission(2,100e6,false,{availableBytes:0}));
});
