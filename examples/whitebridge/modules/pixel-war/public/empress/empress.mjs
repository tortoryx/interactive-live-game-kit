import {HostPerformance} from './performance.mjs';
import {hostAttention} from './attention.mjs';
// User-selected witch Cubism model; autonomous performance, no webcam input.
export class Empress {
 constructor(root,sound){this.root=root;this.sound=sound;this.performance=new HostPerformance();this.ready=false;this.error=null;this.load();}
 async load(){try{
  const response=await fetch('/empress/config.json');if(!response.ok){this.root.hidden=true;return;}
  const config=await response.json();if(!config.enabled){this.root.hidden=true;return;}
  if(typeof config.model!=='string'||!config.model.startsWith('/empress/custom/')||config.model.includes('..'))throw Error('invalid_host_model');
  for(const src of ['/empress/vendor/live2dcubismcore.min.js','/empress/vendor/pixi.min.js','/empress/vendor/unsafe-eval.min.js','/empress/vendor/cubism4.min.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});
  const PIXI=globalThis.PIXI;if(!PIXI?.live2d)throw Error('live2d_runtime');
  this.app=new PIXI.Application({view:this.root.querySelector('canvas'),width:640,height:480,backgroundAlpha:0,antialias:true,resolution:1,autoDensity:false,powerPreference:'low-power'});this.app.ticker.maxFPS=30;
  this.model=await PIXI.live2d.Live2DModel.from(config.model,{autoInteract:false,autoFocus:false});
  // Keep the upper-body scale; reserve transparent space for BOTH sleeves,
  // the hat and autonomous sway instead of clipping them at the canvas edge.
  const m=this.model;m.anchor.set(.5,0);m.scale.set((Number(config.height)||900)/m.internalModel.originalHeight);m.position.set(320,Number(config.offsetY)||0);this.app.stage.addChild(m);this.ready=true;
  // Apply the driver BEFORE the physics pass. Applying after physics made
  // hair/clothes see a neutral pose every frame despite moving face values.
  m.internalModel.on('afterMotionUpdate',()=>this.pose());this.root.dataset.ready='true';
 }catch(e){this.error=e.message;this.root.hidden=true;}}
 update(state,camera){this.state=state;this.camera=camera;this.root.classList.toggle('ceremony',state.mode==='settlement');}
 pose(){
  // Wall clock keeps idle animation alive while the battlefield is paused.
  const ms=performance.now(),voice=this.sound.playback.active.find(c=>(c.line.performer||c.line.side)==='empress'&&c.show&&!c.audio.subtitle&&!c.audio.paused&&!c.audio.ended);
  const line=voice?.line,attention=hostAttention(line,this.camera);
  this.talking=!!voice;this.emotion=line?.emotion||'focused';this.attention=attention.kind;
  const params=this.performance.frame(ms,{level:voice?.node?.level?.()||0,talking:this.talking,emotion:this.emotion,gaze:attention.gaze,attention:attention.kind,turnKey:attention.key});
  for(const [id,value]of Object.entries(params))this.model.internalModel.coreModel.setParameterValueById(id,value);
  this.mouth=params.ParamMouthOpenY;this.angles=[params.ParamAngleX,params.ParamAngleY,params.ParamBodyAngleX];
  this.root.dataset.speaking=String(this.talking);this.root.dataset.emotion=this.emotion;
 }
 status(){return {ready:this.ready,error:this.error,talking:this.talking,mouth:this.mouth,emotion:this.emotion,angles:this.angles,frames:this.performance.frames,gesture:this.performance.gesture,attention:this.attention,model:'魔女',renderer:'Cubism moc3',fpsLimit:30,clock:'wall',physicsDriven:true};}
 close(){this.app?.destroy(false,{children:true,texture:true,baseTexture:true});}
}
