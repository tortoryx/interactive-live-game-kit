import {broadcastReceipts} from './playback-receipts.mjs';
import {battleScene} from './cinematic.mjs';
import {BattleMusic} from './music.mjs';
import {AudioMixer} from './audio-mixer.mjs';
import {SpeechPlayback} from './speech-playback.mjs';
import {InteractionAudio} from './interaction-audio.mjs';
import {CombatAudio} from './combat-audio.mjs';
export class BattleSound{
 constructor(button){this.button=button;this.wanted=sessionStorage.getItem('duel-sound')!=='off';this.context=null;this.voice=null;this.lastVoice=null;this.voiceLine=null;this.heardVoices=new Set();this.lastEffect=0;this.heard=new Set();this.played=0;this.shouts=0;this.lastShoutAt=-1e9;this.locked=true;this.receipts=broadcastReceipts();this.playback=new SpeechPlayback({onPresentation:(line,event)=>this.receipts.emit(line,event),connect:(audio,line)=>this.mixer?.media(audio,'voice',line?.side),onBlocked:()=>{this.locked=true;this.update();}});this.update();}
 update(){this.button.textContent=!this.wanted?'开启声音':this.locked?'点击开启声音':'静音';}
 async unlock(force=false){if(force){this.wanted=true;sessionStorage.setItem('duel-sound','on');}if(!this.wanted)return;try{this.context??=new AudioContext({sampleRate:32000,latencyHint:'interactive'});await this.context.resume();this.locked=this.context.state!=='running';if(!this.locked){this.mixer??=new AudioMixer(this.context);this.music??=new BattleMusic(this.context,new URLSearchParams(location.search).get('side'),this.mixer.music);this.combat??=new CombatAudio(this.context,this.mixer.fx);this.interactions??=new InteractionAudio(this.context,this.mixer.alert);}}catch{this.locked=true;}if(!this.locked)sessionStorage.setItem('duel-sound','on');this.update();}
 updateBattle(state,threats=[]){
  if(this.epoch!==state.fieldEpoch||this.lastTime>state.time){this.combat?.reset();this.epoch=state.fieldEpoch;}this.lastTime=state.time;if(state.paused&&!this.paused)this.combat?.reset();this.paused=state.paused;
  if(state.paused)this.cry?.pause();
  this.playback.update(state,{enabled:this.wanted&&!this.locked});this.voice=this.playback.current?.audio;this.voiceLine=this.playback.current?.line;this.played=this.playback.played;
  const speaking=this.playback.status().speaking;this.mixer?.duck(speaking);
  if(this.music){const scene=battleScene(state);this.scene=scene;this.music.update({state,threats,scene,paused:state.paused});
   if(scene&&!state.paused){const phase=scene.phase;
    if(['fall','arrival'].includes(phase))this.music.stinger(scene.startedAt+':'+phase,phase==='arrival'?scene.dead.includes(this.music.side):scene.winner===this.music.side,phase==='arrival'&&scene.dead.includes(this.music.side));
    this.crownHeard??=new Set();if(this.crownHeard.size>32)this.crownHeard.clear();for(const crown of scene.crowns||[]){const key=scene.startedAt+':crown:'+crown.side+':'+phase;if(['execution','arrival'].includes(phase)&&!this.crownHeard.has(key)){this.crownHeard.add(key);this.combat?.play('crown',{id:scene.startedAt,priority:2,volume:.45});}}
   }
  }
 }
 toggle(){this.cry?.pause();if(this.locked||!this.wanted)return this.unlock(true);this.wanted=false;sessionStorage.setItem('duel-sound','off');this.voice?.pause();this.context?.suspend();this.update();}
 speech(side,state){return this.playback.presentation(side,state);}
 audioStatus(){return {...this.playback.status(),wanted:this.wanted,locked:this.locked,context:this.context?.state||'uninitialized',...this.mixer?.levels(),interactionCues:this.interactions?.played||0};}
 chatter(state,side){if(state.speechMode==='observer'||!this.wanted||this.locked||state.paused||state.mode==='settlement'||state.time-this.lastShoutAt<3800)return;this.heardCries??=new Set();const line=state.chatter?.find(v=>v.side===side&&v.voiceKey==='attack'&&state.time-v.at<2500&&!this.heardCries.has(v.id));if(!line)return;this.heardCries.add(line.id);if(this.heardCries.size>64)this.heardCries.delete(this.heardCries.values().next().value);this.lastShoutAt=state.time;this.cry?.pause();this.cry=new Audio('/audio/'+side+'TroopAttack.wav');this.cryNode?.disconnect();this.cryNode=this.mixer?.media(this.cry,'fx');this.cry.volume=(this.voice&&!this.voice.ended&&!this.voice.paused)? .16 : .38;this.cry.playbackRate=.96+(line.id%3)*.04;this.cry.play().then(()=>this.shouts++).catch(()=>{});}
 interaction(row){if(!this.wanted||this.locked||this.context?.state!=='running')return;if(this.interactions?.play(row.kind))this.mixer?.accent();}
 effects(events,time,camera){if(!this.wanted||this.paused||this.context?.state!=='running')return;this.combat?.effects(events,time,camera);}
 close(){this.receipts.close();this.playback.clear();this.voice?.pause();this.cry?.pause();this.voiceNode?.disconnect();this.cryNode?.disconnect();this.interactions?.close();this.combat?.close();this.music?.close();this.mixer?.close();this.context?.close();}
}
