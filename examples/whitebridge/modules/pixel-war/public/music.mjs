import {DJMusic} from './dj-music.mjs';
import {AudioDirector,MUSIC_LAYERS} from './audio-director.mjs';
export class BattleMusic{
 constructor(ac,side,output=ac.destination){
  this.output=output;this.ac=ac;this.side=side==='human'?'human':'demon';this.enabled=sessionStorage.getItem('duel-music')!=='off';this.gain=ac.createGain();this.gain.gain.value=0;this.gain.connect(output);
  this.director=new AudioDirector();this.nodes=new Map();this.buffers=new Map();this.sources=[];this.notes=0;this.ready=false;this.error=null;this.closed=false;this.dj=new DJMusic(ac,output);this.loads=this.load();
 }
 async load(){try{
  await this.dj.load();
  if(this.dj.configured){this.ready=this.dj.ready;this.error=this.dj.error;this.notes=0;this.apply();return;}
  await Promise.all([...MUSIC_LAYERS,'victory','defeat','arrival'].map(async key=>{const file=key;const response=await fetch('/audio/score/'+file+'.ogg');if(!response.ok)throw Error('score_'+response.status);const buffer=await this.ac.decodeAudioData(await response.arrayBuffer());if(!this.closed)this.buffers.set(key,buffer);}));
  if(this.closed)return;const first=this.buffers.get('theme');for(const key of MUSIC_LAYERS){const b=this.buffers.get(key);if(b.length!==first.length||b.sampleRate!==first.sampleRate)throw Error('score_alignment');}
  this.loopDuration=first.duration;this.startedAt=this.ac.currentTime+.08;
  for(const key of MUSIC_LAYERS){const node=this.ac.createGain(),source=this.ac.createBufferSource();node.gain.value=0;source.buffer=this.buffers.get(key);source.loop=true;source.loopStart=0;source.loopEnd=first.duration;source.connect(node);node.connect(this.gain);source.start(this.startedAt);this.sources.push(source);this.nodes.set(key,node);}
  this.ready=true;this.notes=MUSIC_LAYERS.length;this.apply();
 }catch(e){this.error=e.message;}}
 update({state,threats=[],scene=null,paused=false,intensity=0}={}){this.paused=paused;this.frame=state?this.director.update({...state,threats,scene,side:this.side}):this.frame;this.intensity=this.frame?.energy||intensity;this.dj.update({enabled:this.enabled,paused,energy:this.intensity,scene});this.apply();}
 apply(){const now=this.ac.currentTime,level=this.enabled&&!this.paused&&!this.dj.configured?.64:0;if(level!==this.level){this.level=level;this.gain.gain.setTargetAtTime(level,now,.16);}for(const key of MUSIC_LAYERS){const node=this.nodes.get(key),value=this.frame?.gains[key]??({theme:.70,drums:.32,drive:.30}[key]||0);if(node&&node.target!==value){node.target=value;node.gain.setTargetAtTime(value,now,value>node.gain.value?.32:1.0);}}}
 stinger(key,won,arrival=false){if(!this.enabled||!this.ready||this.paused||this.lastStinger===key||!this.buffers.has(arrival?'arrival':won?'victory':'defeat'))return;this.lastStinger=key;const source=this.ac.createBufferSource(),gain=this.ac.createGain();source.buffer=this.buffers.get(arrival?'arrival':won?'victory':'defeat');gain.gain.value=.62;source.connect(gain);gain.connect(this.output);source.start();source.onended=()=>{source.disconnect();gain.disconnect();};}
 toggle(){this.enabled=!this.enabled;sessionStorage.setItem('duel-music',this.enabled?'on':'off');this.apply();this.dj.update({enabled:this.enabled,paused:this.paused,energy:this.intensity});return this.enabled;}
 status(){return {ready:this.ready,error:this.error,dj:this.dj.status(),loopDuration:this.loopDuration||0,mood:this.frame?.mood||'对峙',intensity:this.intensity||0,layers:this.frame?.gains||{},phase:this.startedAt==null?0:Math.max(0,this.ac.currentTime-this.startedAt)%(this.loopDuration||1)};}
 close(){this.closed=true;this.dj.close();for(const source of this.sources){source.stop();source.disconnect();}for(const node of this.nodes.values())node.disconnect();this.buffers.clear();this.gain.disconnect();}
}
