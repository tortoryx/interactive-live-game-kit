// Autonomous Cubism performance, driven by actual playback and its subject.
// No webcam, microphone, mouse tracking or fixed gesture playlist.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class HostPerformance {
 constructor({random=Math.random}={}){this.random=random;this.last=null;this.nextLook=0;this.nextBlink=1;this.blinkAt=-10;this.target={x:-.28,y:.1,z:0};this.pose={x:0,y:0,z:0,body:0,mouth:0,mood:0};this.frames=0;this.gesture='observe';this.turn=null;this.nextAccent=0;this.accentAt=-10;this.lastLevel=0;this.settleAt=-10;}
 frame(ms,{level=0,talking=false,emotion='focused',gaze=null,attention='idle',turnKey=null}={}){
  const t=ms/1000,dt=this.last===null?1/30:clamp(t-this.last,0,.08);this.last=t;
  const speech=clamp(Number.isFinite(level)?level*8:0,0,1),p=this.pose;
  if(talking&&turnKey!==this.turn){this.turn=turnKey;this.settleAt=t;this.nextLook=t;}
  if(!talking)this.turn=null;
  this.gesture=talking?(attention==='viewer'?'address':emotion==='shock'?'react':emotion==='amused'?'smile':'observe'):'observe';
  if(t>=this.nextLook){
   const jitter=talking?.035:.14;
   this.target={x:clamp((gaze?.x??-.28)+(this.random()-.5)*jitter,-.9,.2),y:clamp((gaze?.y??.1)+(this.random()-.5)*jitter,-.2,.4),z:(this.random()-.5)*(talking?3:1.5)};
   this.nextLook=t+(talking?.35+this.random()*.55:2.8+this.random()*3);
  }
  if(t>=this.nextBlink){this.blinkAt=t;this.nextBlink=t+2.4+this.random()*4.5;this.doubleBlink=this.random()<.1;}
  const b=t-this.blinkAt,blink=b<.16?Math.sin(b/.16*Math.PI):this.doubleBlink&&b>.29&&b<.43?Math.sin((b-.29)/.14*Math.PI):0;
  // An occasional stress beat can produce a small nod. Constant volume cannot
  // produce metronomic head bobbing, and a paused clip cannot move the mouth.
  if(talking&&speech>.35&&speech-this.lastLevel>.1&&t>=this.nextAccent){this.accentAt=t;this.nextAccent=t+1.7+this.random()*1.6;}
  this.lastLevel=speech;
  const a=t-this.accentAt,accent=talking&&a>=0&&a<.5?Math.sin(a/.5*Math.PI):0;
  const settling=talking?Math.exp(-Math.max(0,t-this.settleAt)*2):0;
  const shocked=talking&&emotion==='shock',amused=talking&&emotion==='amused',dry=talking&&emotion==='dry';
  const s=1-Math.exp(-dt*4);
  p.x+=(this.target.x*21-p.x)*s;p.y+=(this.target.y*13+accent*2+(shocked?3:0)-p.y)*s;
  p.z+=(this.target.z+(dry?-2:amused?1.5:0)-p.z)*s;
  p.body+=(p.x*.32+(attention==='viewer'&&talking?settling*1.5:0)-p.body)*(1-Math.exp(-dt*1.8));
  p.mouth+=((talking?speech:0)-p.mouth)*(1-Math.exp(-dt*(speech>p.mouth?24:15)));
  p.mood+=((amused?.45:dry?-.12:.03)-p.mood)*(1-Math.exp(-dt*4));this.frames++;
  const eye=shocked?1:amused?.84:.95;
  return {ParamAngleX:p.x+Math.sin(t*.51)*.7,ParamAngleY:p.y+Math.sin(t*.67)*.45,ParamAngleZ:p.z+Math.sin(t*.43)*.45,
   ParamBodyAngleX:p.body,ParamBodyAngleY:Math.sin(t*.82)*.65,ParamBodyAngleZ:p.z*.3,
   ParamBreath:(1+Math.sin(t*1.55+Math.sin(t*.2)*.3))/2,ParamEyeLOpen:eye*(1-blink),ParamEyeROpen:eye*(1-blink),ParamEyeLSmile:amused?.28:0,ParamEyeRSmile:amused?.28:0,
   ParamEyeBallX:clamp(this.target.x-p.x/45,-1,1),ParamEyeBallY:this.target.y,ParamMouthOpenY:p.mouth,ParamMouthForm:p.mood,
   ParamBrowLY:shocked?.5:dry?-.16:amused?.15:0,ParamBrowRY:shocked?.5:dry?.18:amused?.15:0,ParamBrowLAngle:dry?-.2:0,ParamBrowRAngle:dry?.15:0,ParamCheek:amused?.08:0,MouseToggle:0,
   Param28:attention==='viewer'&&talking?accent*3:0,Param30:attention==='viewer'&&talking?accent*2:0,
   ParamBrowLForm:dry?-.15:shocked?.4:0,Param67:0,Param68:0,Param69:0,Param59:0,Param60:0};
 }
}
