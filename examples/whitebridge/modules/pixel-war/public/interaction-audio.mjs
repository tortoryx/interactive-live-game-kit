// A short foreground cue on its own bus; combat voice ducking cannot bury it.
export class InteractionAudio{
 constructor(ac,output){this.ac=ac;this.output=output;this.last=-100;this.lastMajor=-100;this.played=0;this.active=new Set();}
 play(kind){const ac=this.ac,at=ac.currentTime,major=['gift','recruit','spell'].includes(kind);if(at-(major?this.lastMajor:this.last)<.7)return false;this.last=at;if(major)this.lastMajor=at;
  const duration=major?.48:.23,base=kind==='gift'?440:kind==='spell'?330:kind==='recruit'?392:520;
  const bus=ac.createGain();bus.gain.setValueAtTime(0,at);bus.gain.linearRampToValueAtTime(major?.62:.30,at+.012);bus.gain.exponentialRampToValueAtTime(.001,at+duration);bus.connect(this.output);
  const nodes=[];for(const [ratio,level]of [[1,.7],[1.5,.24],[2,.13]]){const o=ac.createOscillator(),g=ac.createGain();o.type='triangle';o.frequency.setValueAtTime(base*ratio*.72,at);o.frequency.exponentialRampToValueAtTime(base*ratio,at+.075);g.gain.value=level;o.connect(g);g.connect(bus);o.start(at);o.stop(at+duration);nodes.push(o,g);}
  const low=ac.createOscillator(),lowGain=ac.createGain();low.frequency.setValueAtTime(155,at);low.frequency.exponentialRampToValueAtTime(58,at+.18);lowGain.gain.setValueAtTime(major?.7:.2,at);lowGain.gain.exponentialRampToValueAtTime(.001,at+.2);low.connect(lowGain);lowGain.connect(bus);low.start(at);low.stop(at+duration);nodes.push(low,lowGain);
  const item={nodes,bus};this.active.add(item);low.onended=()=>{for(const n of nodes)n.disconnect();bus.disconnect();this.active.delete(item);};this.played++;return true;
 }
 close(){for(const item of this.active){for(const n of item.nodes){try{n.stop?.();}catch{}n.disconnect();}item.bus.disconnect();}this.active.clear();}
}
