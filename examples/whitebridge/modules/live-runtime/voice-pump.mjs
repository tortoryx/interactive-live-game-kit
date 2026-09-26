import {observerFresh} from './show-observer.mjs';
import {syncDebate,debateSpeaker} from './show-debate.mjs';
import {randomUUID} from 'node:crypto';
import {voiceCompleted,audienceReplyParts} from './audience.mjs';
import {speechDuration} from './speech-turn.mjs';
import {narrationExpired,narrationPriority} from './audience-pacing.mjs';

// Local character voices measured about 21 seconds from a cold worker. Share
// the viewer warm-up allowance instead of discarding the opening at 12 seconds.
// Observer camera deadlines still apply independently; stale commentary drops.
export const VOICE_WARMUP_WAIT_MS=60000;

export function wavDuration(b){let rate=0,size=0;for(let at=12;at+8<=b.length;){const id=b.toString('ascii',at,at+4),n=b.readUInt32LE(at+4);if(at+8+n>b.length)break;if(id==='fmt '&&n>=16)rate=b.readUInt32LE(at+16);if(id==='data')size+=n;at+=8+n+(n%2);}return rate&&size?Math.ceil(size/rate*1000)+350:null;}

export class VoicePump {
 constructor(){this.busy=false;this.attempted=new Set();}
 async pump(game,broker,audio,{closing=()=>false}={}){
  const w=game.world;
  if(this.busy||closing()||w.paused||!game.runtime.voiceEnabled)return;
  const candidates=w.speech.filter(s=>s.audioMode!=='silent'&&(w.speechMode!=='observer'||s.side==='empress'||s.performer==='empress')&&!s.debate&&(s.model||s.audienceId||s.community||s.duologue)&&!this.attempted.has(s.id)&&!s.audioUrl&&s.text&&s.persona===w.heroes[s.side]?.id&&w.heroes[s.side].hp>0&&(s.until==null||s.until>w.time)&&(s.audienceId?s.audioMode==='synthesizing':(w.time-s.at<12000||s.audioMode==='synthesizing'&&s.voiceWaitStartedAt))); 
  candidates.sort((a,b)=>(Number(!!b.audienceId)-Number(!!a.audienceId))||Number(a.eventNotice==='arrival')-Number(b.eventNotice==='arrival')||(b.amountMilli||0)-(a.amountMilli||0)||(a.seq||a.id)-(b.seq||b.id));
  const line=candidates[0];
  // Viewer voice wins. Camera commentary must not wait behind a stream of
  // incidental leader reactions or it expires before ever reaching TTS.
  if(line&&!line.audienceId&&syncDebate(w).observerQueue.some(l=>l.audioMode==='synthesizing')){const before=this.preparedSerial||0;await this.prepareDebate(game,broker,audio,{closing});if((this.preparedSerial||0)!==before)return;}
  if(!line){await this.prepareNext(game,broker,audio,{closing});if(!this.busy)return this.prepareDebate(game,broker,audio,{closing});return;}
  const item=game.meta.audience?.active?.[line.side],cached=item?.preparedVoice;
  if(cached&&cached.text===line.spokenText&&audio.has(cached.path)&&cached.persona===line.persona&&cached.field===w.fieldEpoch){delete item.preparedVoice;voiceCompleted(game,line,{audioUrl:cached.path,durationMs:cached.duration});return;}
  this.busy=true;this.attempted.add(line.id);while(this.attempted.size>256)this.attempted.delete(this.attempted.values().next().value);
  const field=w.fieldEpoch,hero=w.heroes[line.side],began=Date.now();
  line.audioMode='synthesizing';line.until=Math.max(line.until||0,w.time+23000);
  const extend=()=>{
   const turn=w.leaderTurns?.[line.side];if(turn?.currentLine===line.id)turn.nextAt=line.until+180;
   if(line.preloaded||line.duologue){if(w.warDrama?.speaking===line.id){w.warDrama.nextAt=line.until+350;if(w.lunaSpeech)w.lunaSpeech.nextAt=line.until+350;}}
   w.sceneSpeakingUntil=Math.max(w.sceneSpeakingUntil||0,line.until);
  };
  extend();let published=false,reason=null,warming=false;
  try{
   const result=await broker.request('/voice',{side:line.performer||line.side,text:line.spokenText||line.text,rank:line.performer==='empress'?0:hero.rank});
   if(closing()||w.paused||field!==w.fieldEpoch||hero.id!==w.heroes[line.side].id||hero.hp<=0||!w.speech.includes(line))return;
   if(['voice_warming','busy'].includes(result.reason)&&Date.now()-(line.voiceWaitStartedAt||began)<VOICE_WARMUP_WAIT_MS){
    line.voiceWaitStartedAt??=began;this.attempted.delete(line.id);warming=true;
    const item=game.meta.audience?.active?.[line.side];if(item?.id===line.audienceId){item.until=line.until;w.audienceSpeakingUntil[line.side]=line.until;}
    return;
   }
   const active=game.meta.audience?.active?.[line.side];
   const valid=!closing()&&!w.paused&&field===w.fieldEpoch&&hero.id===w.heroes[line.side].id&&hero.hp>0&&w.speech.includes(line)&&line.until>w.time&&(!line.audienceId||active?.id===line.audienceId&&active.phase==='synthesizing')&&(!line.duologue||w.warDrama?.speaking===line.id)&&(!(line.conversationMode==='monologue')||!w.audienceWaiting?.[line.side]&&!(w.audienceSpeakingUntil?.[line.side]>w.time));
   if(result.ok&&valid){
    const bytes=Buffer.from(result.wav,'base64'),duration=wavDuration(bytes);
    if(!duration||bytes.length>2*1024*1024||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')throw Error('invalid_audio');
    const path='/voice/'+randomUUID()+'.wav';audio.set(path,bytes);while(audio.size>24)audio.delete(audio.keys().next().value);
    if(line.audienceId)published=voiceCompleted(game,line,{audioUrl:path,durationMs:duration});
    else{line.audioUrl=path;line.audioMode='full_read';line.at=w.time;line.until=w.time+Math.max(4000,Math.min(60000,duration));published=true;}
    if(published){w.sceneSpeakingUntil=line.until;extend();}
   }else reason=result.reason||'stale_voice';
  }catch{reason='voice_connection_failed';}
  finally{
   if(warming){this.busy=false;game.meta.voiceActivity??={sides:{},played:0,failed:0};game.meta.voiceActivity.sides[line.side]={id:line.id,persona:line.persona,state:'warming',latencyMs:Date.now()-began,reason:'voice_warming'};return;}
   if(!published&&!closing()&&!w.paused&&field===w.fieldEpoch&&w.speech.includes(line)&&line.persona===w.heroes[line.side].id&&w.heroes[line.side].hp>0){
    if(line.audienceId&&line.audioMode==='synthesizing')voiceCompleted(game,line);
    else if(line.audioMode==='synthesizing'){line.audioMode='subtitle_only';line.until=w.time+speechDuration(line.text);w.sceneSpeakingUntil=line.until;extend();}
   }
   game.meta.voiceActivity??={sides:{},played:0,failed:0};
   game.meta.voiceActivity[published?'played':'failed']++;
   game.meta.voiceActivity.sides[line.side]={id:line.id,persona:line.persona,state:published?'audio_ready':'subtitle_only',latencyMs:Date.now()-began,reason};
   this.busy=false;
  }
 }
 async prepareDebate(game,broker,audio,{closing,standby=false}){
  const w=game.world,s=syncDebate(w);
  // Real viewer synthesis is always admitted before ambient voice preparation.
  if(this.busy||closing()||w.paused&&!standby||Object.values(game.meta.audience?.active||{}).some(m=>m?.phase==='synthesizing')||game.meta.audience?.pending?.some(m=>m.phase==='ready'&&!m.preparedVoice&&!m.voicePreparedAttempted))return;
  s.observerQueue=s.observerQueue.filter(l=>observerFresh(w,l)&&(l.audioMode!=='synthesizing'||l.until-w.time>7000));
  const needsVoice=l=>l.audioMode==='synthesizing'&&!this.attempted.has(l.id)&&!(l.voiceRetryAt>Date.now());
  const host=s.observerVoiceRetryAt>Date.now()?null:s.observerQueue.find(needsVoice),leader=w.speechMode==='observer'?null:s.queue.find(needsVoice);
  // Keep one host clip ready, then refill leaders. Synthesis stays serial;
  // independent playback does not create extra TTS model instances.
  const hostReady=s.observerQueue.some(l=>l.audioMode==='full_read');
  const line=host&&!hostReady&&(this.hostVoiceStreak||0)<2?host:leader||host;if(!line)return;
  const key=s.key,hero=debateSpeaker(w,line);if(!hero||hero.id!==line.persona)return;this.hostVoiceStreak=line.observer?(this.hostVoiceStreak||0)+1:0;this.preparedSerial=(this.preparedSerial||0)+1;
  this.busy=true;this.attempted.add(line.id);while(this.attempted.size>256)this.attempted.delete(this.attempted.values().next().value);
  try{
   const result=await broker.request('/voice',{side:line.side,text:line.text,rank:hero.rank});
   if(closing()||w.paused&&!standby||syncDebate(w).key!==key||!(line.observer?s.observerQueue:s.queue).includes(line)||line.observer&&!observerFresh(w,line))return;
   if(['voice_warming','busy'].includes(result.reason)){line.voiceWaitStartedAt??=Date.now();if(Date.now()-line.voiceWaitStartedAt>=VOICE_WARMUP_WAIT_MS)throw Error('voice_warming_timeout');line.voiceRetryAt=Date.now()+2000;if(line.observer)s.observerVoiceRetryAt=line.voiceRetryAt;this.attempted.delete(line.id);return;}
   if(!result.ok)throw Error(result.reason||'voice_failed');
   const bytes=Buffer.from(result.wav,'base64'),duration=wavDuration(bytes);
   if(!duration||bytes.length>2*1024*1024||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')throw Error('invalid_audio');
   const path='/voice/'+randomUUID()+'.wav';audio.set(path,bytes);while(audio.size>40)audio.delete(audio.keys().next().value);
   // wavDuration includes a safety tail for ordinary narration. Paired speech
   // uses the actual media duration so the next voice can take the last beat.
   line.audioUrl=path;line.audioDuration=Math.max(1,duration-350);line.audioMode='full_read';
  }catch(e){line.audioMode='subtitle_only';line.audioDuration=Math.max(2000,line.text.length*130);line.voiceFailure=e.message;}
  finally{this.busy=false;}
 }
 async prepareNext(game,broker,audio,{closing}){
  const w=game.world,a=game.meta.audience;
  // Keep at most one unpublished prefetched audio file. Other prepared work stays text.
  if(a?.pending.some(m=>m.preparedVoice&&!narrationExpired(game,m)))return;
  const item=a?.pending.filter(m=>m.phase==='ready'&&m.prepared&&!m.preparedVoice&&!m.voicePreparedAttempted&&!narrationExpired(game,m)).sort(narrationPriority)[0];
  if(!item)return;
  const text=audienceReplyParts(game,[item.prepared.decision.speech,...(item.prepared.decision.continuations||[])])[0];
  if(!text)return;
  const field=w.fieldEpoch,persona=item.persona,rank=w.heroes[item.side].rank;
  this.busy=true;item.voicePreparedAttempted=true;
  try{
   const result=await broker.request('/voice',{side:w.speechMode==='observer'?'empress':item.side,text,rank:w.speechMode==='observer'?0:rank});
   const owner=a.pending.find(m=>m===item)||a.active[item.side]?.id===item.id&&a.active[item.side];
   if(['voice_warming','busy'].includes(result.reason)){if(owner)owner.voicePreparedAttempted=false;return;}
   if(!result.ok||!owner||closing()||w.paused||field!==w.fieldEpoch||persona!==w.heroes[item.side].id||w.heroes[item.side].hp<=0||narrationExpired(game,item))return;
   const bytes=Buffer.from(result.wav,'base64'),duration=wavDuration(bytes);
   if(!duration||bytes.length>2*1024*1024||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WAVE')return;
   const path='/voice/'+randomUUID()+'.wav';audio.set(path,bytes);while(audio.size>24)audio.delete(audio.keys().next().value);
   owner.preparedVoice={text,path,duration,field,persona};
   // Preparation alone publishes neither a speech box nor a memory entry.
  }catch{}finally{this.busy=false;}
 }
}
