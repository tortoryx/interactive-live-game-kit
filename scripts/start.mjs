import {mkdir,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createBroker} from '../examples/whitebridge/modules/live-runtime/broker.mjs';
import {BrokerClient} from '../examples/whitebridge/modules/live-runtime/client.mjs';
import {createPreview} from '../examples/whitebridge/modules/duel-preview/server.mjs';
process.umask(0o077);
const root=fileURLToPath(new URL('../.local/',import.meta.url));
await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
// Fail on occupied ports; never kill another process or resume an old broadcast.
const ports={stage:Number(process.env.STAGE_PORT||4390),control:Number(process.env.CONTROL_PORT||4391),broker:Number(process.env.BROKER_PORT||4392)};
for(const p of Object.values(ports))if(!Number.isInteger(p)||p<1024||p>65535)throw Error('Invalid local port');
if(new Set(Object.values(ports)).size!==3)throw Error('Ports must be distinct');
const token=randomBytes(32).toString('hex');let broker,preview;
async function close(){await preview?.close();await broker?.close();}
try{
 broker=await createBroker({path:root+'connections.sqlite',token,port:ports.broker});
 if(process.env.DEEPSEEK_API_KEY)await broker.configure({section:'models',values:{transport:'api',profile:'deepseek-flash',apiKey:process.env.DEEPSEEK_API_KEY,enabled:false,resumeOnRestart:false}});
 // Credentials are read locally, never printed or embedded into the stage HTML.
 if(process.env.AI_API_KEY){
  const {customProfile}=await import('../examples/whitebridge/modules/live-runtime/portable-ai.mjs');const p=customProfile();
  if(!p.url||!p.requestModel||![p.input,p.output].every(n=>Number.isFinite(n)&&n>=0))throw Error('AI configuration needs endpoint, model and both rates');
  await broker.configure({section:'models',values:{transport:'api',profile:'custom-api',apiKey:process.env.AI_API_KEY,enabled:false,resumeOnRestart:false}});
 }
 const client=new BrokerClient({token,port:ports.broker});client.setStatus(broker.status());
 preview=await createPreview({statePath:root+'game.sqlite',broker:client,stagePort:ports.stage,controlPort:ports.control});
 preview.world.paused=true;
 if(!preview.game.meta.broadcastMode)preview.game.configureBroadcast('bilibili-first');
 console.log(`Interactive Live Game Kit — Human–Demon example, stopped, local only.\nOpen http://127.0.0.1:${ports.control}/ to play.\nOptional settings: http://127.0.0.1:${ports.control}/settings.html\nCapture only: http://127.0.0.1:${ports.stage}/?side=demon&broadcast=1\nNothing is broadcasting. AI and platform fulfillment require explicit enablement. Ctrl+C stops this process.`);
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{if(closing)return;closing=true;await close();process.exit(0);});
}catch(error){await close();console.error('Start failed:',error.code||error.message);process.exitCode=1;}
