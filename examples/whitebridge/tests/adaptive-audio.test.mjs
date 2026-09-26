import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AudioDirector,soundCue,soundPriority} from '../modules/pixel-war/public/audio-director.mjs';
import {BattleMusic} from '../modules/pixel-war/public/music.mjs';
import {CombatAudio} from '../modules/pixel-war/public/combat-audio.mjs';
import {AudioMixer} from '../modules/pixel-war/public/audio-mixer.mjs';

test('actual combat drives layers, hysteresis holds crescendos, idle armies do not fake battle',()=>{
 const d=new AudioDirector();let f;
 for(let time=0;time<4000;time+=100)f=d.update({time,events:[],threats:[{severity:100}]});
 assert.equal(f.stage,0);
 for(let time=4000;time<6500;time+=100)f=d.update({time,events:Array.from({length:28},(_,id)=>({id,at:time,type:'hit',amount:10}))});
 assert.equal(f.stage,4);assert.equal(f.gains.drive,1);
 f=d.update({time:6600,events:[]});assert.equal(f.stage,4);
 for(let time=6700;time<26000;time+=100)f=d.update({time,events:[]});
 assert.equal(f.stage,0);assert(f.gains.drums>0&&f.gains.drums<.5);
 const paused=d.update({time:26000,paused:true});assert(Object.values(paused.gains).every(v=>v===0));
 f=d.update({time:100,fieldEpoch:2});assert.equal(f.stage,0);
});

test('losing viewpoint never uses victory music; retinue arrival lifts the score',()=>{
 const d=new AudioDirector(),scene={dead:['demon'],winner:'human',phase:'awards'};
 assert.equal(d.update({scene,side:'demon'}).mood,'败北');
 assert.equal(d.update({scene,side:'human'}).mood,'胜势');
 assert.equal(d.update({scene:{...scene,phase:'arrival'},side:'demon'}).mood,'援军赶来');
});

test('release and impact are distinct, player events outrank system noise, protected hits stay silent',()=>{
 assert.equal(soundCue({type:'release',style:'bullet'}),'rifle');
 assert.equal(soundCue({type:'hit',style:'bullet',amount:20}),'arrow-hit');
 assert.equal(soundCue({type:'hit',amount:0,protected:true}),null);
 assert.equal(soundCue({type:'summon',source:'system'}),null);
 assert.equal(soundPriority({type:'hit',focus:{unitId:1}}),3);
 assert(soundPriority({type:'hit',focus:{}})>soundPriority({type:'explosion'}));
});

function context(){
 const starts=[],nodes=[];const param=()=>({value:0,calls:[],setTargetAtTime(...a){this.calls.push(a);this.value=a[0];}});
 const node=()=>{const n={gain:param(),pan:param(),playbackRate:param(),connect(){},disconnect(){this.disconnected=true;},start(at=0){starts.push({at,node:this});},stop(){this.stopped=true;this.onended?.();}};nodes.push(n);return n;};
 return {starts,nodes,currentTime:10,destination:{},createGain:node,createBiquadFilter:()=>Object.assign(node(),{frequency:param(),Q:param()}),createAnalyser:()=>Object.assign(node(),{getFloatTimeDomainData(a){a.fill(.02);}}),createBufferSource:node,createStereoPanner:node,createMediaElementSource:node,createDynamicsCompressor:()=>Object.assign(node(),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()]))),decodeAudioData:async()=>({length:1024000,sampleRate:32000,duration:32})};
}
test('all stems start on exactly one clock; muting ramps gain without restarting music',async()=>{
 const priorFetch=global.fetch,priorStorage=global.sessionStorage;global.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});global.sessionStorage={getItem:()=>null,setItem(){}};
 const ac=context(),m=new BattleMusic(ac,'demon');try{
  await m.loads;assert(m.ready);assert.equal(ac.starts.length,3);assert.equal(new Set(ac.starts.map(v=>v.at)).size,1);
  m.toggle();assert.equal(m.level,0);m.toggle();assert.equal(ac.starts.length,3);
  m.update({paused:true});const count=ac.starts.length;m.stinger('paused',true);assert.equal(ac.starts.length,count);
  m.close();assert(ac.starts.every(s=>s.node.stopped));
 }finally{global.fetch=priorFetch;global.sessionStorage=priorStorage;}
});

test('player sound steals an ambient slot; duplicate frames and stale events cannot replay',async()=>{
 const priorFetch=global.fetch;global.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
 const ac=context(),fx=new CombatAudio(ac,ac.destination);try{
  await fx.loads;for(let i=0;i<16;i++)assert(fx.play('steel',{id:i,priority:0}));
  assert(fx.play('rifle',{priority:3}));assert.equal(fx.active.length,16);assert(ac.nodes.some(n=>n.stopped));
  fx.reset();const e={id:500,type:'release',style:'bullet',at:1000,x:0,y:0,focus:{unitId:'owner'}};
  fx.effects([e],1000);const played=fx.played;fx.effects([e],1010);assert.equal(fx.played,played);
  fx.effects([{...e,id:501}],2000);assert.equal(fx.played,played);fx.close();assert.equal(fx.active.length,0);
 }finally{global.fetch=priorFetch;}
});

test('speech ducking rapidly clears the voice channel and releases smoothly',()=>{
 const ac=context(),m=new AudioMixer(ac);m.duck(true);assert.equal(m.music.gain.value,.30);assert.equal(m.fx.gain.value,.14);
 const calls=m.music.gain.calls.length;m.duck(true);assert.equal(m.music.gain.calls.length,calls);
 m.duck(false);assert.equal(m.music.gain.value,.60);assert(m.music.gain.calls.at(-1)[2]>.4);m.close();
});

test('delivered music stems have equal decoded length, real asset hashes and bounded peaks',async()=>{
 const root=new URL('../modules/pixel-war/public/audio/score/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',root)));
 for(const key of ['theme','drums','drive']){const a=m.assets[key];assert.equal(a.frames,m.loopFrames);assert.equal(a.sampleRate,m.sampleRate);assert(a.rms>.008);assert(a.peak<1);}
 for(const [key,a]of Object.entries(m.assets)){const file=await readFile(new URL(key+'.ogg',root));assert.equal(file.subarray(0,4).toString(),'OggS');assert.equal(createHash('sha256').update(file).digest('hex'),a.sha256);}
});

// A single real hit must expose the complete battle rhythm immediately, even
// before the smoothed energy threshold has had time to change stage.
test('combat never waits through an intro and theme survives quiet passages',()=>{
 const d=new AudioDirector();
 const calm=d.update({time:0});assert(calm.gains.theme>=.7);assert(calm.gains.drums>0);
 const hit=d.update({time:100,events:[{type:'hit',at:100,amount:10}]});
 assert(hit.gains.drums>=.7);assert(hit.gains.drive>=.55);
 const dead=d.update({time:200,side:'human',scene:{dead:['human'],phase:'awards'}});
 assert(dead.gains.drums<hit.gains.drums);
});
