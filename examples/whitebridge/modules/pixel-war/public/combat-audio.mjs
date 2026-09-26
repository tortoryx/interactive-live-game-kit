import {soundCue,soundPriority,lifeSoundAccent} from './audio-director.mjs';
import {isTroopLifeEvent} from './troop-life-fx.mjs';
const single=new Set(['heal','shield','summon']);
export class CombatAudio{
 constructor(ac,output){this.ac=ac;this.output=output;this.buffers=new Map();this.heard=new Set();this.cooldowns=new Map();this.active=[];this.played=0;this.dropped=0;this.closed=false;this.loads=this.load();}
 async load(){const keys=['impact-body','critical','thunder','stampede','swing','steel','arrow','arrow-hit','rifle','shotgun','cannon','explosion','meteor','quake','flame','crush','march','crown','heal','shield','summon'];const files=keys.flatMap(key=>single.has(key)?[key]:[0,1,2].map(n=>key+'-'+n));let index=0;await Promise.all(Array.from({length:3},async()=>{while(index<files.length&&!this.closed){const name=files[index++];try{const r=await fetch('/audio/score/'+name+'.ogg');if(!r.ok)throw Error('sfx_'+r.status);const b=await this.ac.decodeAudioData(await r.arrayBuffer());if(!this.closed)this.buffers.set(name,b);}catch(e){this.error=e.message;}}}));}
 play(key,{id=0,priority=1,pan=0,volume=1,delay=0}={}){
  const name=single.has(key)?key:key+'-'+Math.abs(Number(id)||0)%3,buffer=this.buffers.get(name);if(!buffer||this.closed)return false;
  if(this.active.length>=16){const victim=this.active.find(v=>v.priority<priority);if(!victim){this.dropped++;return false;}victim.source.stop();this.active=this.active.filter(v=>v!==victim);}
  const source=this.ac.createBufferSource(),gain=this.ac.createGain(),panner=this.ac.createStereoPanner();source.buffer=buffer;source.playbackRate.value=single.has(key)?1:1+((Number(id)||0)%7-3)*.009;panner.pan.value=Math.max(-.85,Math.min(.85,pan));gain.gain.value=volume;source.connect(gain);gain.connect(panner);panner.connect(this.output);
  const item={source,priority};this.active.push(item);source.onended=()=>{this.active=this.active.filter(v=>v!==item);source.disconnect();gain.disconnect();panner.disconnect();};source.start(this.ac.currentTime+delay);this.played++;return true;
 }
 effects(events,time,camera){
  const candidates=[];for(const e of events){if(this.heard.has(e.id)||e.at>time)continue;this.heard.add(e.id);if(time-e.at>300)continue;const cue=soundCue(e);if(cue)candidates.push({e,cue,priority:soundPriority(e)});}
  candidates.sort((a,b)=>b.priority-a.priority||b.e.at-a.e.at);
  for(const {e,cue,priority}of candidates.slice(0,8)){
   const life=isTroopLifeEvent(e),key=life?'life:'+e.type:priority>=3?(e.focus?.unitId||e.receipt||'summon')+':'+cue:priority===2?'heavy:'+cue:'ambient';if(time-(this.cooldowns.get(key)??-1e9)<(life?240:priority>=3?75:priority===2?160:210))continue;
   const x=Number.isFinite(e.x)?e.x:camera?.x||0,y=Number.isFinite(e.y)?e.y:camera?.y||0;
   const distance=camera?Math.hypot((x-camera.x)/(camera.w||1000),(y-camera.y)/(camera.h||700)):0;if(distance>1.3&&(priority<2||life))continue;
   const volume=(priority>=3?.92:priority===2?.72:.32)*Math.max(.16,1-distance*.55),pan=camera?(x-camera.x)/(camera.w*.55):0;
   if(this.play(cue,{id:e.id,priority,pan,volume})){this.cooldowns.set(key,time);if(priority>=2&&['explosion','meteor','quake','crush','cannon'].includes(cue)&&time-(this.lastBody??-1e9)>200){this.lastBody=time;this.play('impact-body',{id:e.id,priority,pan,volume:volume*.50,delay:.025});}const accent=lifeSoundAccent(e);if(accent)this.play(accent.cue,{id:e.id,priority,pan,volume:volume*accent.volume,delay:accent.delay});}
  }
  if(this.heard.size>2500)this.heard=new Set(events.map(e=>e.id));if(this.cooldowns.size>600)for(const [key,at]of this.cooldowns)if(time-at>4000)this.cooldowns.delete(key);
 }
 reset(){this.heard.clear();this.cooldowns.clear();for(const v of this.active)v.source.stop();this.active=[];}
 close(){this.closed=true;this.reset();this.buffers.clear();}
}
