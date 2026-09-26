// Operator-selected recordings, streamed from this stage only. One current
// media element and one metadata preload; never decode the full playlist.
// Preserve the selected recording: battle events may duck gain, never its spectrum or speed.
export function validDJTrack(t){return t&&typeof t.file==='string'&&/^\/audio\/dj\/[a-z0-9_-]+\.(ogg|mp3|wav|m4a)$/.test(t.file)&&Number.isFinite(t.duration)&&t.duration>4&&t.duration<=600;}
export class DJMusic {
 constructor(ac,output,{createAudio=url=>new Audio(url)}={}){Object.assign(this,{ac,output,createAudio});this.closed=false;this.currentIndex=-1;this.mix=ac.createGain();this.mix.gain.value=0;this.mix.connect(output);this.ready=false;this.configured=false;this.failed=new Set();}
 async load(){try{const r=await fetch('/audio/dj/playlist.json');if(!r.ok)return false;const m=await r.json();this.configured=m.mode==='dj';if(!this.configured||!Array.isArray(m.tracks))return false;this.tracks=m.tracks.filter(validDJTrack).slice(0,120);if(!this.tracks.length)throw Error('dj_empty_playlist');if(this.closed)return false;this.playlistTitle=m.title||null;this.select(0);this.ready=true;return true;}catch(e){this.error=e.message;return false;}}
 release(media){if(!media)return;media.onended=media.onerror=media.onplaying=media.onloadedmetadata=null;media.pause();media.removeAttribute('src');media.load();}
 select(index){
  if(this.closed)return;this.source?.disconnect();this.release(this.media);
  const track=this.tracks[index];this.media=this.preloadIndex===index?this.preload:this.createAudio(track.file);if(this.preload!==this.media)this.release(this.preload);this.preload=null;
  const media=this.media;this.currentIndex=index;this.duration=track.duration;media.preload='auto';media.loop=this.tracks.length===1;media.volume=1;this.starting=false;
  this.source=this.ac.createMediaElementSource(media);this.source.connect(this.mix);
  media.onloadedmetadata=()=>{if(this.media===media&&track.startAt>0)media.currentTime=Math.min(media.duration-1,track.startAt);};
  media.onplaying=()=>{if(this.media===media){this.error=null;this.failed.clear();}};
  media.onended=()=>{if(this.media===media)this.advance();};
  media.onerror=()=>{if(this.media!==media)return;this.error='dj_media_error';this.failed.add(index);this.advance();};
  this.preloadIndex=(index+1)%this.tracks.length;if(this.preloadIndex!==index){this.preload=this.createAudio(this.tracks[this.preloadIndex].file);this.preload.preload='metadata';}
  this.syncPlayback();
 }
 advance(){if(this.failed.size>=this.tracks.length){this.ready=false;this.error='dj_playlist_unavailable';return;}let i=this.currentIndex;do{i=(i+1)%this.tracks.length;}while(this.failed.has(i));this.select(i);}
 syncPlayback(){const media=this.media;if(!media||this.closed)return;if(!this.enabled||this.paused){media.pause();return;}if(!media.paused||this.starting)return;this.starting=true;Promise.resolve(media.play()).catch(e=>{if(this.media===media)this.error=e.name==='NotAllowedError'?'dj_audio_locked':'dj_playback_failed';}).finally(()=>{if(this.media===media)this.starting=false;});}
 update({enabled,paused,energy=0,scene}={}){this.enabled=!!enabled;this.paused=!!paused;if(!this.ready)return;const now=this.ac.currentTime,level=enabled&&!paused?.74:0;this.mix.gain.setTargetAtTime(level,now,.10);this.energy=energy;this.syncPlayback();}
 status(){return {ready:this.ready,error:this.error||null,title:this.tracks?.[this.currentIndex]?.title||null,source:this.tracks?.[this.currentIndex]?.source||null,playlist:this.playlistTitle,count:this.tracks?.length||0,index:this.currentIndex,mode:'dj',duration:this.duration||0,currentTime:this.media?.currentTime||0,playing:!!this.media&&!this.media.paused,energy:this.energy||0};}
 close(){this.closed=true;this.source?.disconnect();this.release(this.media);this.release(this.preload);this.mix.disconnect();}
}
