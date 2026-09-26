import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {BilibiliNormalizer} from './bilibili-events.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const variables=['BILI_OPEN_ACCESS_KEY_ID','BILI_OPEN_ACCESS_KEY_SECRET','BILI_OPEN_APP_ID','BILI_OPEN_ANCHOR_CODE','BILI_OPEN_ROOM_ID'];

// This is an owner-side observation adapter. It does not grant paid deployments
// or accept a source=real claim from a web request. The Python child is the only input.
export function startBilibiliReceiver({env=process.env,anonymousSecret,onEvent,onStatus=()=>{}}){
  if(typeof onEvent!=='function'||variables.some(key=>typeof env[key]!=='string'||!env[key]))throw new Error('bilibili_configuration_missing');
  const normalizer=new BilibiliNormalizer({roomId:Number(env.BILI_OPEN_ROOM_ID),secret:anonymousSecret});
  const childEnv=Object.fromEntries(variables.map(key=>[key,env[key]]));
  childEnv.PYTHONUNBUFFERED='1';childEnv.PYTHONUTF8='1';
  const child=spawn(`${root}.runtime/connectors-venv/bin/python`,[`${root}modules/connectors/bilibili_bridge.py`,'--live'],{
    cwd:root,env:childEnv,stdio:['ignore','pipe','pipe'],shell:false,
  });
  let authenticated=false,stopped=false,lastHeartbeat=Date.now();
  const status=state=>{onStatus({platform:'bilibili',state});};
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
    if(stopped)return;
    if(Buffer.byteLength(line)>8192){authenticated=false;status('bridge_frame_rejected');return;}
    let message;try{message=JSON.parse(line);}catch{authenticated=false;status('bridge_frame_rejected');return;}
    if(message.type==='status'){
      const state=message.state;
      if(state==='authenticated'){authenticated=true;lastHeartbeat=Date.now();}
      else if(state==='heartbeat'){lastHeartbeat=Date.now();}
      else{authenticated=false;}
      status(['authenticated','heartbeat','disconnected','stopped'].includes(state)?state:'not_ready');
      return;
    }
    if(!authenticated||message.type!=='event'||message.family!=='open-live-v2')return;
    const parsed=normalizer.parse(message.event);
    if(parsed.status==='accepted'){
      // Platform-to-faction mapping is fixed in v3, never selected by chat text.
      onEvent({...parsed.event,side:'demon',authorization:'platform_connection',deployment:'uncommitted'});
    }else if(parsed.status==='quarantine')status('event_requires_review');
  });
  child.stderr.on('data',()=>status('bridge_diagnostic')); // Never forward raw diagnostics.
  const monitor=setInterval(()=>{if(authenticated&&Date.now()-lastHeartbeat>65000){authenticated=false;status('heartbeat_timeout');}},5000);
  monitor.unref();
  child.on('error',()=>{authenticated=false;status('bridge_failed');});
  child.on('exit',()=>{authenticated=false;clearInterval(monitor);clearTimeout(forceStop);lines.close();status('stopped');});
  let forceStop;
  return {
    stop(){if(stopped)return;stopped=true;authenticated=false;clearInterval(monitor);child.kill('SIGTERM');
      forceStop=setTimeout(()=>child.kill('SIGKILL'),15000);forceStop.unref();},
  };
}
