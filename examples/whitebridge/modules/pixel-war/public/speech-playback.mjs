import {overlappingView} from './view-context.mjs';
// Media playback is the subtitle clock. The commentator has an independent
// lane; at most two voices overlap and a viewer response owns the floor.
export class SpeechPlayback {
 constructor({createAudio=url=>new Audio(url),connect=()=>null,onBlocked=()=>{},onPresentation=()=>{},now=()=>performance.now()}={}) {
  Object.assign(this,{createAudio,connect,onBlocked,onPresentation,now});this.pending=[];this.prepared=new Map();this.seen=new Set();this.active=[];this.played=0;this.errors=0;this.dropped=0;this.enabled=false;this.paused=false;
 }
 get current(){return this.active.find(c=>!c.line.observer)||this.active[0]||null;}
 valid(line,state){
  if(line.audioMode==='silent')return false;
  if(state.speechMode==='observer'&&line.side!=='empress'&&line.performer!=='empress')return false;
  if(line.observer&&(state.paused||['inspection','settlement'].includes(state.mode)||Object.values(state.heroes).some(h=>h.hp<=0)||!line.observerStory&&!line.observerCommitted&&((line.observerRevision??0)!==(state.observerRevision||0)||this.viewport&&!overlappingView(this.viewport,line.view))))return false;
  if(line.debate&&line.opponents!==undefined&&line.opponents!==[state.heroes.demon?.id,state.heroes.human?.id].join('|')+':'+state.fieldEpoch)return false;
  return (line.side==='empress'?line.debate&&line.persona==='empress-observer-v1':line.persona===state.heroes[line.side]?.id&&state.heroes[line.side]?.hp>0)&&!(line.audienceId&&state.audience?.revoked?.includes(line.audienceId));
 }
 fresh(line,state=this.state){
  if(!this.valid(line,state)||line.observer&&state.time-line.observedAt>=(line.observerCommitted?120000:line.observerStory?60000:45000))return false;
  if(line.audienceId&&Number.isFinite(line.deadline)){
   const liveNow=(state.audience?.clock||0)+Math.max(0,this.now()-(this.receivedAt||0));
   if(line.deadline<=liveNow||state.audience?.active?.[line.side]?.id!==line.audienceId)return false;
  }
  if(line.debate&&Number.isFinite(line.playBy)&&state.time>=line.playBy)return false;
  return state.time-line.at<45000;
 }
 update(state,{enabled,paused=state.paused}={}) {
  if(this.epoch!==undefined&&(this.epoch!==state.fieldEpoch||state.time<this.lastTime||this.mediaSession!==state.mediaSession)){this.clear();this.seen.clear();}
  this.mediaSession=state.mediaSession;this.epoch=state.fieldEpoch;this.lastTime=state.time;this.state=state;this.receivedAt=this.now();this.enabled=enabled;this.paused=paused;
  if(paused){for(const c of [...this.active])if(c.line.observer)this.finish(c);this.pending=this.pending.filter(l=>!l.observer);}
  this.pending=this.pending.filter(line=>this.fresh(line,state));
  for(const current of [...this.active])if(!this.valid(current.line,state)||!current.started&&!this.fresh(current.line,state))this.finish(current);
  for(const line of state.speech||[]){
   if(!line.text||!(line.audioUrl||line.audio||line.audioMode==='subtitle_only')||this.seen.has(line.id)||!this.fresh(line,state)||line.until<=state.time)continue;
   this.seen.add(line.id);this.pending.push({...line});
  }
  while(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
  this.pending.sort((a,b)=>Number(!!b.audienceId)-Number(!!a.audienceId)||(b.amountMilli||Number(!!b.quote?.paid))-(a.amountMilli||Number(!!a.quote?.paid))||(a.seq||a.id)-(b.seq||b.id));
  const cap=this.pending.some(l=>l.debate)?8:2;let hostCount=0,mainCount=0;
  this.pending=this.pending.filter(l=>{const keep=l.observer?++hostCount<=2:++mainCount<=cap;if(!keep)this.dropped++;return keep;});
  this.preload();
  // Do not talk over a viewer's answer. Finish the short current sentence, then reply.
  for(const current of [...this.active]){
   if(!enabled||paused){current.audio.pause();current.show=false;}
   else if(current.audio.paused&&!current.audio.ended&&!current.starting)this.start(current);
   if(current.audio.subtitle&&current.show&&current.audio.currentTime*1000>=current.line.audioDuration){this.onPresentation(current.line,'ended');this.finish(current);}
   if(current.bufferingAt!=null&&enabled&&!paused&&this.now()-current.bufferingAt>15000)this.fail(current,'buffer_timeout');
  }
  this.drain();
 }
 canInterrupt(line){
  if(this.active.length!==1||!line?.debate||!line.interrupt||line.side==='empress'||this.active[0].line.observer)return false;
  const c=this.current,duration=c.line.audioDuration/1000||c.audio.duration;
  return c.line.debate&&c.line.side!==line.side&&c.line.side!=='empress'&&c.show&&Number.isFinite(duration)&&duration-c.audio.currentTime<=.52;
 }
 preload(){
  const eligible=this.pending.filter(l=>l.audioMode!=='subtitle_only'),next=this.enabled&&!this.paused?[...eligible.filter(l=>!l.observer).slice(0,2),...eligible.filter(l=>l.observer).slice(0,1)]:[];
  for(const [id,audio]of this.prepared)if(!next.some(l=>l.id===id)){audio.pause();audio.removeAttribute?.('src');audio.load?.();this.prepared.delete(id);}
  for(const line of next)if(!this.prepared.has(line.id)){const audio=this.createAudio(line.audioUrl||'/audio/'+line.audio+'.wav');audio.preload='auto';audio.load?.();this.prepared.set(line.id,audio);}
 }
 drain(){
  if(!this.enabled||this.paused||!this.pending.length)return;
  this.pending=this.pending.filter(line=>this.fresh(line));
  const audience=this.pending.find(l=>l.audienceId);
  if(audience){for(const c of [...this.active])if(!c.line.audienceId&&!c.show)this.finish(c);if(!this.active.length)this.playLine(audience);return;}
  if(this.active.some(c=>c.line.audienceId))return;
  const main=this.pending.find(l=>!l.observer),foreground=this.active.filter(c=>!c.line.observer);
  if(main&&(!foreground.length||this.canInterrupt(main)))this.playLine(main);
  const host=this.pending.find(l=>l.observer);
  if(host&&this.active.length<2&&!this.active.some(c=>c.line.observer))this.playLine(host);
  this.balance();
 }
 balance(){const host=this.active.some(c=>c.line.observer);for(const c of this.active){const volume=host&&!c.line.observer? .55:1;if(c.node?.setGain)c.node.setGain(volume);else c.audio.volume=volume;}}
 playLine(line){
  this.pending=this.pending.filter(l=>l!==line);if(line.audioMode==='subtitle_only'&&!Number.isFinite(line.audioDuration))line.audioDuration=Math.max(2500,Math.min(8000,1000+line.text.length*150));
  const audio=line.audioMode==='subtitle_only'?this.subtitleAudio():this.prepared.get(line.id)||this.createAudio(line.audioUrl||'/audio/'+line.audio+'.wav');this.prepared.delete(line.id);audio.preload='auto';audio.volume=1;
  const current={line,audio,node:audio.subtitle?null:this.connect(audio,line),show:false,starting:false,started:false,bufferingAt:null};this.active.push(current);
  audio.onplaying=()=>{if(!this.active.includes(current))return;if(!this.enabled||this.paused||!this.valid(line,this.state)||!current.started&&!this.fresh(line)){this.finish(current);this.drain();return;}current.show=true;current.bufferingAt=null;if(!current.started){current.started=true;this.played++;this.onPresentation(current.line,'started');}this.error=null;};
  audio.onwaiting=()=>{current.show=false;current.bufferingAt=this.now();};audio.onpause=()=>{current.show=false;};
  audio.onended=()=>{this.onPresentation(current.line,'ended');this.finish(current);this.drain();};audio.onerror=()=>this.fail(current,'media_error');this.start(current);
 }
 subtitleAudio(){const now=this.now;let began=0,elapsed=0;return {subtitle:true,paused:true,ended:false,get currentTime(){return (elapsed+(this.paused?0:now()-began))/1000;},play(){if(this.paused)began=now();this.paused=false;this.onplaying?.();return Promise.resolve();},pause(){if(!this.paused)elapsed+=now()-began;this.paused=true;this.onpause?.();}};}
 start(current){current.starting=true;current.bufferingAt=this.now();Promise.resolve(current.audio.play()).then(()=>{current.starting=false;}).catch(error=>{
  if(!this.active.includes(current))return;current.starting=false;
  if(error?.name==='NotAllowedError'){this.enabled=false;this.onBlocked();current.show=false;}else this.fail(current,'playback_error');
 });}
 fail(current,reason){if(!this.active.includes(current))return;this.errors++;this.error=reason;this.onPresentation(current.line,'failed');this.finish(current);this.drain();}
 finish(current){if(!this.active.includes(current))return;current.audio.onplaying=current.audio.onwaiting=current.audio.onpause=current.audio.onended=current.audio.onerror=null;current.audio.pause();current.node?.disconnect();this.active=this.active.filter(c=>c!==current);this.balance();}
 presentation(side,state=this.state){const current=this.active.find(c=>(c.line.performer||c.line.side)===side);
  if(current?.bufferingAt!=null&&this.enabled&&!this.paused&&this.now()-current.bufferingAt>15000)this.fail(current,'buffer_timeout');
  if(!current||!this.active.includes(current)||!current.show||!this.enabled||this.paused||current.audio.paused||current.audio.ended)return null;
  return {...current.line,at:state.time-current.audio.currentTime*1000,until:state.time+1000};
 }
 status(){return {played:this.played,queued:this.pending.length,lineId:this.current?.line.id||null,side:this.current?.line.side||null,speaking:this.active.some(c=>c.show),voices:this.active.filter(c=>c.show).map(c=>({side:c.line.performer||c.line.side,id:c.line.id})),currentTime:this.current?.audio.currentTime||0,error:this.error||null,errors:this.errors,dropped:this.dropped};}
 clear(){for(const c of [...this.active])this.finish(c);this.pending=[];this.preload();}
}
