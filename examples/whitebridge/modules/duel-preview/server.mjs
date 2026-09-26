import {receiveView} from '../live-runtime/show-observer.mjs';
import {prepareDebate,applyDebate,recoverDebate} from '../live-runtime/show-debate.mjs';
import {PlaybackReceipts} from '../live-runtime/playback-receipts.mjs';
import {modelLane} from '../live-runtime/model-lanes.mjs';
import {viewerTurnKey} from '../live-runtime/audience-pacing.mjs';
import {applySpeechPack,prepareSpeechRequest} from '../pixel-war/luna-speech.mjs';
import {modelAdmission,nextModelWork,recordModelWork} from '../live-runtime/model-work.mjs';
import {runtimeAvailability} from '../live-runtime/availability.mjs';
import {launchReadiness} from '../live-runtime/readiness.mjs';
import {playMenu} from '../live-runtime/play-menu.mjs';
import {commandCampaign} from '../pixel-war/campaign.mjs';
import {launchSurprise} from '../pixel-war/surprises.mjs';
import {audienceModelStarted,audienceModelFailed,nextAudiencePreparation} from '../live-runtime/audience.mjs';
import {VoicePump} from '../live-runtime/voice-pump.mjs';
import {launchWildlife} from '../pixel-war/wildlife.mjs';
import {DecisionSchedule} from '../live-runtime/decision-schedule.mjs';
import {encodeFrame} from '../pixel-war/public/wire.mjs';
import http from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {mediaRange} from './media-range.mjs';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import {UNIT_KEYS,SIDES} from '../pixel-war/world.mjs';

import {LiveGame} from '../live-runtime/game.mjs';
import {SimulationClock} from '../live-runtime/simulation-clock.mjs';
import {environmentBroker} from '../live-runtime/client.mjs';

import {launchDisaster} from '../pixel-war/encounters.mjs';
const dir=fileURLToPath(new URL('../pixel-war/public/',import.meta.url));
const mime={'.svg':'image/svg+xml','.moc3':'application/octet-stream','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.json':'application/json; charset=utf-8'};
export async function createPreview({stagePort=4390,controlPort=4391,host='127.0.0.1',clock=true,statePath=':memory:',broker=null,speechMode='observer'}={}){
  const game=new LiveGame({path:statePath,speechMode}),world=game.world,token=randomBytes(32).toString('hex'),files=new Map(),liveAudio=new Map(),avatarCache=new Map(),streams=new Set();
  game.presentationRequired=true;const playbackToken=randomBytes(32).toString('hex'),playback=new PlaybackReceipts(game);
  let standbyPreloading=false;delete game.meta.preloading;
  async function preload(path=''){
    for(const entry of await readdir(dir+path,{withFileTypes:true})){
      if(entry.isDirectory())await preload(path+entry.name+'/');
      else if(entry.isFile()){const key='/'+path+entry.name,type=mime[key.slice(key.lastIndexOf('.'))]||'application/octet-stream';
        if(/^\/audio\/dj\/[a-z0-9_-]+\.(m4a|ogg|wav|mp3)$/.test(key)){const file=dir+path+entry.name;files.set(key,{path:file,size:(await stat(file)).size,type});}
        else files.set(key,{body:await readFile(dir+path+entry.name),type});}
    }
  }
  await preload();recoverDebate(world);for(const line of world.speech)delete line.audioUrl;
  const owned=(req,port)=>[`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host);
  function handler(control){return async(req,res)=>{
    const port=control?controlPort:stagePort;
    const base={
      'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'Permissions-Policy':'camera=(), microphone=(), display-capture=(), geolocation=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), clipboard-write=()',
      'Cross-Origin-Resource-Policy':'same-origin',
      'Content-Security-Policy':`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src http://127.0.0.1:${stagePort}; frame-ancestors ${control?"'none'":`http://127.0.0.1:${controlPort} http://localhost:${controlPort}`}`,
    };
    const send=(code,body,type='application/json; charset=utf-8')=>{res.writeHead(code,{...base,'Content-Type':type});res.end(typeof body==='object'&&!Buffer.isBuffer(body)?JSON.stringify(body):body);};
    if(!owned(req,port))return send(403,{error:'untrusted_host'});
    if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'cross_site'});
    const pathname=(req.url||'/').split('?')[0];
    if(pathname==='/favicon.ico'&&req.method==='GET')return send(204,'');
    // Source programs use a separate, revocable relay key. It grants no owner actions.
    if(pathname==='/integrations/xiaohongshu/events'&&control){
      if(req.method!=='POST')return send(405,{error:'method'});
      if(req.headers.origin||req.headers['sec-fetch-site']||req.headers['content-type']!=='application/json')return send(403,{error:'program_source_required'});
      const key=req.headers['x-relay-key'];if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return send(403,{error:'relay_key_required'});
      if(!broker)return send(503,{error:'connector_unavailable'});
      try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>18000)return send(413,{error:'body_limit'});}const result=await broker.request('/xiaohongshu/events',{key,event:JSON.parse(body)});return send(result.ok?200:result.status==='retry'?503:result.reason==='relay_not_authorized'?403:422,result);}
      catch{return send(503,{error:'receiver_unavailable'});}
    }
    if((pathname==='/action'||pathname.startsWith('/owner/'))&&control){
      if(req.method!=='POST')return send(405,{error:'method'});
      const origins=[`http://127.0.0.1:${controlPort}`,`http://localhost:${controlPort}`];
      if(!origins.includes(req.headers.origin)||req.headers['content-type']!=='application/json')return send(403,{error:'origin'});
      const submitted=Buffer.from(String(req.headers['x-owner-token']||'')),expected=Buffer.from(token);
      if(submitted.length!==expected.length||!timingSafeEqual(submitted,expected))return send(403,{error:'owner_token'});
      try{
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>20000)return send(413,{error:'body_limit'});}
        const a=JSON.parse(body);
        if(pathname.startsWith('/owner/')){
          if(pathname==='/owner/view')return send(200,{ok:!playback.status().connected&&receiveView(world,a)});
          if(pathname==='/owner/presentation')return send(200,playback.ownerPreview(a));
          if(pathname==='/owner/status')return send(200,{speechMode:world.speechMode,presentation:playback.status(),readiness:launchReadiness(game,broker?.status),game:game.ownerStatus(),connections:broker?.status||{models:{state:'unavailable'},bilibili:{state:'not_configured'},xiaohongshu:{state:'official_gift_transport_unverified'}}});
          if(pathname==='/owner/reset'&&a.confirmation==='restart_from_first_generation'){if(broker)await broker.request('/cancel',{}).catch(()=>{});return send(200,game.resetForLaunch());}
          if(pathname==='/owner/voice-warm'&&broker)return send(200,await broker.request('/voice/warm',{}));
          if(pathname==='/owner/preload'&&broker){
            if(!world.paused||world.time!==0||standbyPreloading)return send(409,{error:'standby_only'});
            standbyPreloading=true;const epoch=game.meta.epoch;
            try{
              const pack=prepareDebate(world,Date.now(),{standby:true});
              if(pack){let c=game.context(pack.side);c=Object.fromEntries(['side','persona','name','rank','hp','maxHP','enemy','ownPopulation','enemyPopulation'].map(k=>[k,c[k]]));c.speechRequest=pack;
                const result=await broker.request('/decision',c);
                if(!world.paused||world.time!==0||game.meta.epoch!==epoch)return send(409,{ok:false,reason:'stale_standby'});
                if(!game.atomic(()=>applyDebate(world,pack,result,Date.now())))return send(200,{ok:false,reason:result.reason||'invalid_pack'});
              }
              // Prepare playable audio before launch. The world stays frozen and
              // nothing is published or recorded as heard during preparation.
              const limit=Date.now()+85000;
              while(world.showDebate?.queue.some(l=>l.audioMode==='synthesizing')&&Date.now()<limit&&world.paused&&game.meta.epoch===epoch){
                await voicePump.prepareDebate(game,broker,liveAudio,{standby:true,closing:()=>closing});
                if(world.showDebate.queue.some(l=>l.audioMode==='synthesizing'))await new Promise(r=>setTimeout(r,250));
              }
              const ready=world.showDebate?.queue.filter(l=>l.audioMode==='full_read').length||0;
              return send(200,{ok:ready>=2,ready,results:['demon','human'].map(side=>({side,ok:world.showDebate?.queue.some(l=>l.side===side&&l.audioMode==='full_read')}))});
            }finally{standbyPreloading=false;}
          }
          if(pathname==='/owner/mode')return send(200,game.configureBroadcast(a.mode));
          if(pathname==='/owner/chat'){const result=game.testChat(a);return send(200,{...result,replyCapability:{available:game.runtime.modelEnabled,reason:game.runtime.modelReason||null},snapshot:game.snapshot()});}
          if(pathname==='/owner/gift'){const result=game.testGift(a);return send(200,{...result,snapshot:game.snapshot()});}
          if(pathname==='/owner/receipts')return send(200,{receipts:game.receiptStatus()});
          if(pathname==='/owner/mappings')return send(200,game.configureMappings(a.entries));
          if(pathname==='/owner/live'){if(typeof a.enabled!=='boolean')return send(400,{error:'invalid_enabled'});return send(200,game.atomic(()=>{game.meta.liveEnabled=a.enabled;return {ok:true};}));}
          if(pathname==='/owner/settings'&&broker){game.meta.epoch++;const result=await broker.request('/settings',a);if(broker.setStatus)broker.setStatus(result.status);else broker.status=result.status;game.runtime=runtimeAvailability(broker.status);return send(200,result);}
          return send(404,{error:'not_found'});
        }
        if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['type','side','kind','lane','rank','pose','speed','weapon','disaster','event'].includes(k)))return send(400,{error:'invalid_action'});
        let ok=true;
        game.action(()=>{switch(a.type){
          case 'wildlife':ok=!world.audienceBattle&&launchWildlife(world);break;
          case 'campaign':ok=commandCampaign(world,a.side,a.kind);break;
          case 'surprise':ok=!world.audienceBattle&&launchSurprise(world,a.event);break;
          case 'command':ok=world.audienceCommand(a.side,a.kind);break;
          case 'disaster':ok=!world.audienceBattle&&launchDisaster(world,a.disaster,world.heroes[SIDES.includes(a.side)?a.side:'human']);break;
          case 'showcase':ok=world.beginShowcase();break;
          case 'sparring':ok=world.resumeSparring();break;
          case 'pause':world.paused=!world.paused;if(!world.paused&&world.mode==='inspection')world.mode='sparring';break;
          case 'speed':ok=world.setSpeed(a.speed);break;
          case 'equip':ok=world.equip(a.side,a.weapon);break;
          case 'sortie':ok=world.mode!=='inspection'&&world.mode!=='settlement'&&world.sortie(a.side);break;
          case 'inspect':ok=world.inspect(a.rank,a.pose);break;
          case 'summon':ok=SIDES.includes(a.side)&&UNIT_KEYS.includes(a.kind)&&world.mode!=='inspection'&&world.mode!=='settlement'&&world.spawn(a.side,a.kind,a.lane);break;
          default:ok=false;
        }});
        if(a.type==='pause'&&world.paused&&broker)broker.request('/cancel',{}).catch(()=>{});
        return send(ok?200:400,{ok,snapshot:game.snapshot()});
      }catch{return send(400,{error:'invalid_json'});}
    }
    if(!control&&pathname==='/playback'){
      if(req.method!=='POST'||req.headers['content-type']!=='application/json'||![`http://127.0.0.1:${stagePort}`,`http://localhost:${stagePort}`].includes(req.headers.origin))return send(403,{error:'playback_origin'});
      const supplied=Buffer.from(String(req.headers['x-playback-token']||'')),expected=Buffer.from(playbackToken);
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(403,{error:'playback_key'});
      try{let body='';for await(const part of req){body+=part;if(Buffer.byteLength(body)>1024)return send(413,{error:'body_limit'});}return send(200,playback.receive(JSON.parse(body)));}catch{return send(400,{error:'invalid_receipt'});}
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'read_only'});
    if(!control&&/^\/avatar\/[a-f0-9]{40}$/.test(pathname)){const key=pathname.split('/').at(-1);if(![...game.world.units.map(u=>u.supporter),...Object.values(game.meta.audience?.active||{}).map(m=>m.supporter),...(game.world.result?.honors?.leaders||[]),...(game.world.result?.honors?.board||[]),game.world.result?.honors?.finisher].some(u=>u?.avatarKey===key))return send(404,{error:'unknown_avatar'});if(!avatarCache.has(key)&&broker){const data=await broker.request('/avatar',{key}).catch(()=>null);if(data?.base64&&data.base64.length<710000&&['image/png','image/jpeg'].includes(data.type)){avatarCache.set(key,{body:Buffer.from(data.base64,'base64'),type:data.type});while(avatarCache.size>48)avatarCache.delete(avatarCache.keys().next().value);}}const cached=avatarCache.get(key);return cached?send(200,cached.body,cached.type):send(404,{error:'avatar_unavailable'});}
    if(!control&&pathname==='/stream'){if(req.method==='HEAD')return send(200,'','text/event-stream');res.writeHead(200,{...base,'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('data: '+JSON.stringify(encodeFrame(game.snapshot()))+'\n\n');res.supportsTerrainReuse=new URL(req.url,'http://localhost').searchParams.get('terrain')==='1';streams.add(res);req.on('close',()=>streams.delete(res));return;}
    if(!control&&/^\/voice\/[a-f0-9-]{36}\.wav$/.test(pathname)){const audio=liveAudio.get(pathname);return audio?send(200,audio,'audio/wav'):send(404,{error:'expired_audio'});}
    if(pathname==='/play-menu')return send(200,playMenu(game,new URL(req.url,'http://localhost').searchParams.get('side')==='human'?'human':'demon',broker?.status));
    if(pathname==='/state')return send(200,{...game.snapshot(),platforms:{bilibili:broker?.status.bilibili?.state||'not_connected',xiaohongshu:'not_connected'}});
    if(pathname==='/health')return send(200,{ok:true,runtime:process.platform==='linux'&&process.env.DUEL_VM==='1'?'lima_vm':'local_process',model:broker?.status.models?.state||'offline_rules',broadcast:false});
    let key=pathname==='/'?(control?'/control.html':'/stage.html'):pathname;
    const allow=control?new Set(['/control.html','/control.js','/control.css','/reply-status.mjs','/deployment-feedback.mjs','/gift-picker.mjs','/bili-gift-roster.mjs','/connect.html','/connect.js','/connect.css','/settings.html','/settings.js','/settings.css','/catalog.mjs','/gifts.mjs','/chat-commands.mjs']):null;
    if(control&&!allow.has(key)&&!/^\/gift-icons\/[a-z0-9-]+\.(?:png|gif|webp|svg)$/.test(key)||!control&&['/control.html','/control.js','/control.css','/connect.html','/connect.js','/connect.css','/settings.html','/settings.js','/settings.css'].includes(key))return send(404,{error:'not_found'});
    const file=files.get(key);if(!file)return send(404,{error:'not_found'});
    if(file.path){const range=mediaRange(req.headers.range,file.size);if(!range){res.writeHead(416,{...base,'Content-Range':'bytes */'+file.size});return res.end();}
      const {start,end,status}=range;res.writeHead(status,{...base,'Content-Type':file.type,'Accept-Ranges':'bytes','Content-Length':end-start+1,...(status===206?{'Content-Range':`bytes ${start}-${end}/${file.size}`}:{})});
      if(req.method==='HEAD')return res.end();const stream=createReadStream(file.path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
    }
    let body=control&&['/control.html','/settings.html','/connect.html'].includes(key)?file.body.toString().replace('__OWNER_TOKEN__',token):file.body;
    if(key==='/stage.html')body=body.toString().replace('__PLAYBACK_TOKEN__',new URL(req.url,'http://localhost').searchParams.get('broadcast')==='1'?playbackToken:'');
    if(['/control.html','/control.js','/gift-picker.mjs'].includes(key))body=body.toString().replaceAll('127.0.0.1:4390','127.0.0.1:'+stagePort);
    if(['/stage.js','/play-menu.mjs'].includes(key))body=body.toString().replaceAll('127.0.0.1:4391','127.0.0.1:'+controlPort).replaceAll('localhost:4391','localhost:'+controlPort);
    return send(200,req.method==='HEAD'?'':body,file.type);
  };}
  const stage=http.createServer(handler(false)),control=http.createServer(handler(true));
  for(const server of [stage,control]){server.maxConnections=24;server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1500;}
  await new Promise((resolve,reject)=>stage.once('error',reject).listen(stagePort,host,resolve));
  try{await new Promise((resolve,reject)=>control.once('error',reject).listen(controlPort,host,resolve));}catch(e){stage.close();throw e;}
  let closing=false,pollBusy=false,modelBusy=new Set();const viewerBusy=new Set(),decisions=new DecisionSchedule(),voicePump=new VoicePump();
  async function pumpModels(){
    if(!broker||closing||!modelAdmission(broker.status.models,modelBusy.size)||world.paused||world.mode==='inspection'||!game.runtime.modelEnabled)return;
    const now=Date.now(),models=broker.status.models;
    const preparation=nextAudiencePreparation(game,{blockedViewers:viewerBusy});
    const work=preparation?{side:preparation.side,pack:null}:nextModelWork(game,decisions,now,models,{watching:streams.size>0,excludeSides:['demon','human'].filter(s=>{const m=game.meta.audience?.active?.[s];return m?.modelStarted||m&&viewerBusy.has(viewerTurnKey(m));}),backgroundBusy:modelBusy.has('background'),busyLanes:[...modelBusy]});if(!work)return;
    const {side,pack}=work;
    let context=game.context(side||pack.side,preparation?{audience:preparation.item,prefetch:preparation.prefetch}:{});const flightSide=['electron','api'].includes(broker.status.models?.transport)?modelLane(pack?{...context,speechRequest:pack}:context):side||pack.side;if(modelBusy.has(flightSide))return;modelBusy.add(flightSide);
    if(pack){context=Object.fromEntries(['side','persona','name','rank','hp','maxHP','enemy','ownPopulation','enemyPopulation'].map(k=>[k,context[k]]));context.speechRequest=pack;}
    const requestEpoch=game.meta.epoch,message=context.audience?.selected,requestStartedAt=Date.now();
    recordModelWork(game,context,{startedAt:requestStartedAt});
    const viewerKey=preparation?viewerTurnKey(preparation.item):null;
    if(viewerKey)viewerBusy.add(viewerKey);
    if(message)audienceModelStarted(game,side,message.id);
    try{
      const result=await broker.request('/decision',context);
      if(!closing){
        let applied=false;
        // Pause/settings can change the epoch while a page is generating. Even
        // then release this exact request, otherwise its slot stays occupied
        // forever and no new paired dialogue can be prepared after resuming.
        if(pack)applied=applySpeechPack(world,pack,requestEpoch===game.meta.epoch&&(!result.ok||game.runtime.model===result.model)?result:{ok:false,reason:'stale_decision'},Date.now());
        else if(result.ok){applied=game.applyDecision(context,result.decision,result.model);if(message)game.meta.replyTrace={id:message.id,applied,elapsedMs:Date.now()-requestStartedAt,gameAgeMs:world.time-context.at,mode:world.mode,personaMatches:context.persona===world.heroes[side].id,epochMatches:context.epoch===game.meta.epoch,roundMatches:context.round===world.round,replyToMatches:result.decision.replyTo===message.id,decision:result.decision,hp:world.heroes[side].hp,phase:game.meta.audience?.active?.[side]?.phase,model:result.model};if(!applied&&message)audienceModelFailed(game,side,message.id,'stale_decision');}
        else if(message)audienceModelFailed(game,side,message.id,result.reason);
        recordModelWork(game,context,{startedAt:requestStartedAt,finishedAt:Date.now(),applied,reason:applied?null:result.reason||'stale_decision',model:result.model});
      }
    }catch{if(!closing){recordModelWork(game,context,{startedAt:requestStartedAt,finishedAt:Date.now(),reason:'connection_failed'});if(pack)applySpeechPack(world,pack,{ok:false},Date.now());else if(message)audienceModelFailed(game,side,message.id,'connection_failed');}}
    finally{modelBusy.delete(flightSide);if(viewerKey)viewerBusy.delete(viewerKey);}
  }
  // At most two show jobs can borrow pages; a viewer always has the next admission.
  // Existing subscription ceilings are unchanged.
  const modelPump=broker?setInterval(()=>void pumpModels(),250):null;
  const integration=broker?setInterval(async()=>{
    if(closing)return;
    if(!pollBusy){pollBusy=true;try{await broker.poll(game);game.runtime=runtimeAvailability(broker.status);}catch{broker.status={...broker.status,unavailable:true};}finally{pollBusy=false;}}
    game.runtime=runtimeAvailability(broker.status);
    void pumpModels();

  },1000):null;
  // Refill audio independently of the one-second status poll.
  let nextVoiceWarm=0;
  const voiceClock=broker?setInterval(()=>{if(!world.paused&&game.runtime.voiceEnabled&&Date.now()>=nextVoiceWarm){nextVoiceWarm=Date.now()+30000;void broker.request('/voice/warm',{}).catch(()=>{});}void voicePump.pump(game,broker,liveAudio,{closing:()=>closing});},100):null;
  let terrainPublication=null;
  const publish=setInterval(()=>{if(!streams.size)return;const snapshot=game.snapshot(),now=Date.now(),reuseTerrain=terrainPublication&&now-terrainPublication.fullAt<2000&&terrainPublication.epoch===snapshot.fieldEpoch&&terrainPublication.revision===snapshot.terrainRevision;if(!reuseTerrain)terrainPublication={epoch:snapshot.fieldEpoch,revision:snapshot.terrainRevision,fullAt:now};const data='data: '+JSON.stringify(encodeFrame(snapshot,{reuseTerrain:!!reuseTerrain}))+'\n\n';let fullData=null;for(const response of streams){if(response.writableLength>256000){response.destroy();streams.delete(response);}else if(reuseTerrain&&!response.supportsTerrainReuse){fullData??='data: '+JSON.stringify(encodeFrame(snapshot))+'\n\n';response.write(fullData);}else response.write(data);}},100);
  const simulationClock=new SimulationClock(game);
  const interval=clock?setInterval(()=>{try{simulationClock.advance(performance.now());}catch{world.paused=true;}},25):null;
  return {world,game,stage,control,close:async()=>{closing=true;clearInterval(publish);for(const response of streams)response.end();streams.clear();clearInterval(interval);clearInterval(integration);clearInterval(modelPump);clearInterval(voiceClock);if(broker)await broker.request('/cancel',{}).catch(()=>{});while(pollBusy||modelBusy.size||voicePump.busy)await new Promise(r=>setTimeout(r,25));game.close();stage.closeIdleConnections();control.closeIdleConnections();await Promise.all([new Promise(r=>stage.close(r)),new Promise(r=>control.close(r))]);}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=await createPreview({statePath:process.env.DUEL_STATE_DB||':memory:',broker:environmentBroker()});console.log('Isolated duel ready on loopback ports 4390 / 4391. Connections require owner configuration.');
  const stop=async()=>{await app.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
