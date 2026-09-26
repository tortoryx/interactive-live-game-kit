export class AudioMixer{
 constructor(ac){
  this.ac=ac;this.master=ac.createGain();this.master.gain.value=.82;this.limiter=ac.createDynamicsCompressor();
  for(const [key,value]of Object.entries({threshold:-7,knee:5,ratio:10,attack:.003,release:.18}))this.limiter[key].value=value;
  this.master.connect(this.limiter);this.meter=ac.createAnalyser();this.meter.fftSize=512;this.samples=new Float32Array(512);this.limiter.connect(this.meter);this.meter.connect(ac.destination);this.voiceMeter=ac.createAnalyser();this.voiceMeter.fftSize=512;this.voiceSamples=new Float32Array(512);
  this.alert=ac.createGain();this.alert.gain.value=1;this.voice=ac.createGain();this.fx=ac.createGain();this.music=ac.createGain();this.voice.gain.value=1;this.fx.gain.value=.24;this.music.gain.value=.52;
  for(const bus of [this.voice,this.fx,this.music,this.alert])bus.connect(this.master);this.voice.connect(this.voiceMeter);
 }
 accent(){this.accentUntil=this.ac.currentTime+.65;this.duck(this.speaking);}
 duck(on){this.speaking=!!on;const accent=this.ac.currentTime<(this.accentUntil||0),key=on+':'+accent;if(this.ducked===key)return;this.ducked=key;const at=this.ac.currentTime;this.music.gain.setTargetAtTime(accent?(on?.25:.42):on?.30:.60,at,accent?.03:on?.045:.65);this.fx.gain.setTargetAtTime(on?.14:.24,at,on?.035:.35);}
 media(element,bus='voice',side=null){const source=this.ac.createMediaElementSource(element),pan=this.ac.createStereoPanner(),gain=this.ac.createGain(),meter=this.ac.createAnalyser(),data=new Float32Array(256);meter.fftSize=256;pan.pan.value=side==='demon'?-.20:side==='human'?.20:0;source.connect(meter);meter.connect(pan);pan.connect(gain);gain.connect(this[bus]);return {setGain:v=>gain.gain.setTargetAtTime(v,this.ac.currentTime,.12),level:()=>{meter.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length);},disconnect:()=>{source.disconnect();meter.disconnect();pan.disconnect();gain.disconnect();}};}
 levels(){this.meter.getFloatTimeDomainData(this.samples);this.voiceMeter.getFloatTimeDomainData(this.voiceSamples);const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),level=rms(this.samples),voiceLevel=rms(this.voiceSamples);if(level>.001)this.lastSignalAt=this.ac.currentTime;return {level,voiceLevel,signalRecent:this.lastSignalAt!==undefined&&this.ac.currentTime-this.lastSignalAt<2};}
 close(){for(const node of [this.voice,this.fx,this.music,this.alert,this.master,this.limiter,this.meter,this.voiceMeter])node.disconnect();}
}
