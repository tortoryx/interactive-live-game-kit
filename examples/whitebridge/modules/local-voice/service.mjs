import {referenceProfile} from './reference-profile.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {freemem,totalmem} from 'node:os';
import {createInterface} from 'node:readline';
import {existsSync,realpathSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
let memorySample={at:0,level:4,availableBytes:0};
// macOS keeps reusable pages outside os.freemem(). A cold Qwen worker was
// measured at 4.6 GiB; reserve another 1.9 GiB before admitting a load.
export function voiceMemoryAdmission(level,freeBytes,light=false,{availableBytes,loaded=false}={}){
 if(light)return [1,2].includes(level)&&freeBytes>64*1024**2;
 if(Number.isFinite(availableBytes))return [1,2].includes(level)&&availableBytes>(loaded?2:6.5)*1024**3;
 return level===1&&freeBytes>512*1024**2;
}
function memoryReady(light=false,loaded=false){
 if(Date.now()-memorySample.at>3000){let level=4,availableBytes=0;
  try{level=Number(execFileSync('/usr/sbin/sysctl',['-n','kern.memorystatus_vm_pressure_level'],{encoding:'utf8',timeout:1000}).trim());
   const report=execFileSync('/usr/bin/memory_pressure',['-Q'],{encoding:'utf8',timeout:1000});
   const percentage=report.match(/System-wide memory free percentage:\s*(\d+)%/);
   if(percentage)availableBytes=totalmem()*Number(percentage[1])/100;
  }catch{}
  memorySample={at:Date.now(),level,availableBytes};
 }
 return voiceMemoryAdmission(memorySample.level,freemem(),light,{availableBytes:memorySample.availableBytes,loaded});
}
export class LocalVoice {
 constructor({memoryProbe,engine}={}){this.light=engine==='kokoro'&&existsSync(join(root,'.runtime/models/kokoro-int8-multi-lang-v1_1/model.int8.onnx'));this.referenceError=null;try{this.reference=this.light?null:referenceProfile(root);}catch(e){this.referenceError=e.message;this.reference=null;}this.memoryProbe=memoryProbe||(()=>memoryReady(this.light,!!this.child));this.python=join(root,'.runtime/voice-venv/bin/python');this.worker=join(root,'modules/local-voice/'+(this.light?'kokoro_worker.py':'worker.py'));this.modelDir=join(root,'.runtime/models/'+(this.light?'kokoro-int8-multi-lang-v1_1':this.reference?'qwen3-base':'qwen3-tts'));this.cache=join(root,'.runtime/local-voice-cache');this.available=!this.referenceError&&process.platform==='darwin'&&existsSync(this.python)&&existsSync(this.modelDir);this.state='idle';this.calls=0;this.seq=0;}
 status(){const memoryReady=this.available&&this.memoryProbe();return {available:this.available,memoryReady,state:this.referenceError||(!this.available?'local_voice_unavailable':memoryReady?this.state:'local_voice_memory_pressure'),calls:this.calls,lastLatencyMs:this.lastLatencyMs,peakBytes:this.peakBytes,provider:'local',engine:this.light?'Kokoro-v1.1-zh-int8':this.reference?'Qwen3-TTS-Reference-6bit':'Qwen3-TTS-CustomVoice-6bit',cpuThreads:this.light?2:null,roleMastering:this.light?2:0,actors:this.light?{demon:'Kokoro-58',human:'Kokoro-60'}:this.reference?{demon:null,human:null,empress:this.reference.id}:{demon:'Uncle_Fu',human:'Uncle_Fu',empress:'Vivian'},referenceError:this.referenceError,performanceVersion:this.light?2:10,apiBilling:false,loaded:!!this.child,ready:!!this.workerReady,bootStage:this.bootStage||null,bootStageAt:this.bootStageAt||null,lastStopReason:this.lastStopReason||null,lastWorkerExit:this.lastWorkerExit||null,protocolErrors:this.protocolErrors||0};}
 start(){if(this.child)return;mkdirSync(this.cache,{recursive:true,mode:0o700});const q=JSON.stringify,python=realpathSync(this.python),profile=`(version 1)(allow default)
(deny file-read-data (subpath "/Users") (subpath "/Volumes") (subpath "/private/var/folders"))
(allow file-read-data (subpath ${q(dirname(dirname(python)))}) (subpath ${q(join(root,'.runtime/voice-venv'))}) (subpath ${q(this.modelDir)}) (subpath ${q(this.cache)}) (literal ${q(this.worker)}) (literal ${q(dirname(this.worker))}) (literal ${q(join(root,'modules/local-voice/role_audio.py'))}) (literal ${q(join(root,'modules/local-voice/performance.py'))}) ${this.reference?'(subpath '+q(this.reference.folder)+')':''} (literal ${q(python)}))
(deny file-write* (subpath "/"))(allow file-write* (subpath ${q(this.cache)}) (literal "/dev/null"))
(deny process-exec (subpath "/"))(allow process-exec (literal ${q(python)}) (literal ${q(this.python)}))
(deny network-outbound)(deny network-inbound)`;
 this.child=spawn('/usr/bin/sandbox-exec',['-p',profile,this.python,'-u',this.worker],{cwd:this.cache,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',TMPDIR:this.cache,PYTHONDONTWRITEBYTECODE:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',LOCAL_VOICE_REFERENCE:this.reference?'1':'0'},stdio:['pipe','pipe','pipe']});this.workerReady=false;this.audioWarm=false;this.pressureWatch=setInterval(()=>{if(!this.memoryProbe())this.stop('local_voice_memory_pressure');},3000);this.pressureWatch.unref();this.state='warming';this.warmTimer=setTimeout(()=>{this.stop('voice_warm_timeout');this.state='voice_warm_timeout';},this.light?60000:120000);this.warmTimer.unref();this.child.stderr.on('data',()=>{});this.lines=createInterface({input:this.child.stdout});this.lines.on('line',raw=>{if(raw.length>2900000){this.stop();return;}try{const r=JSON.parse(raw);if(r.type==='warming'&&['import_performance','import_mlx','import_soundfile','import_tts','load_model','compile_voice'].includes(r.stage)){this.bootStage=r.stage;this.bootStageAt=Date.now();return;}if(r.type==='ready'){clearTimeout(this.warmTimer);this.workerReady=true;this.audioWarm=r.primed===true;this.state='ready';return;}if(r.id===this.pending?.id)this.pending.resolve(r);}catch{this.protocolErrors=(this.protocolErrors||0)+1;}});this.child.on('error',e=>{this.lastWorkerExit=e.code||'spawn_error';this.stop('worker_error');});this.child.on('exit',(code,signal)=>{this.lastWorkerExit={code,signal};this.stop('worker_exit');});}
 warm(){if(!this.available)return {ok:false,reason:'local_voice_unavailable'};if(!this.memoryProbe())return {ok:false,reason:'local_voice_memory_pressure'};if(!this.child)this.start();clearTimeout(this.idle);this.idle=setTimeout(()=>this.stop(),120000);this.idle.unref();return {ok:!!this.workerReady,reason:this.workerReady?null:'voice_warming'};}
 async speak(r){if(!this.available)return {ok:false,reason:'local_voice_unavailable'};if(this.pending)return {ok:false,reason:'busy'};if(this.reference&&r?.side!=='empress')return {ok:false,reason:'voice_role_disabled'};if(!r||Object.keys(r).some(k=>!['side','text','rank'].includes(k))||!['demon','human','empress'].includes(r.side)||typeof r.text!=='string'||r.text.length<1||r.text.length>260||/[\u0000-\u001f]/.test(r.text)||!Number.isInteger(r.rank)||r.rank<0||r.rank>10000)return {ok:false,reason:'invalid_speech'};
 if(!this.memoryProbe()){this.stop();this.state='local_voice_memory_pressure';return {ok:false,reason:this.state};}
 if(!this.workerReady){if(!this.child)this.start();return {ok:false,reason:'voice_warming'};}
 clearTimeout(this.idle);const began=Date.now();this.state='synthesizing';let timer;try{const result=await new Promise(resolve=>{this.pending={id:++this.seq,resolve};timer=setTimeout(()=>this.stop('local_voice_timeout'),this.audioWarm?Math.min(42000,Math.max(35000,r.text.length*1000)):45000);this.start();this.child.stdin.write(JSON.stringify({id:this.seq,...r})+'\n');});this.state=result.ok?'ready':'local_voice_failed';if(result.ok){this.audioWarm=true;this.calls++;this.lastLatencyMs=Date.now()-began;this.peakBytes=result.peakBytes;}return result;}catch{return {ok:false,reason:'local_voice_failed'};}finally{clearTimeout(timer);clearTimeout(this.idle);this.pending=null;this.idle=setTimeout(()=>this.stop(),this.light?180000:120000);this.idle.unref();}}
 stop(reason='local_voice_stopped'){this.lastStopReason=reason;clearInterval(this.pressureWatch);clearTimeout(this.idle);clearTimeout(this.warmTimer);this.workerReady=false;this.pending?.resolve({ok:false,reason});this.pending=null;const child=this.child;this.child=null;this.lines?.close();if(child){child.removeAllListeners('exit');child.stdin.destroy();child.kill('SIGTERM');const hard=setTimeout(()=>child.kill('SIGKILL'),1000);hard.unref();}this.state='idle';}
}
