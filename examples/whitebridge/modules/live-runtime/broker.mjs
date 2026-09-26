import {biliSetup} from './platform-setup.mjs';
import {XhsReceiver,xhsConfig} from './xiaohongshu.mjs';
import {RoomGiftPanels} from './room-gifts.mjs';
import {AvatarStore} from './avatars.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ModelDirector,PROFILES} from './models.mjs';
import {CodexConnection} from './codex.mjs';
import {CharacterVoice} from './tts.mjs';
import {BiliConnection} from './bilibili.mjs';
const defaults={models:{enabled:false,transport:'api',profile:'deepseek-flash',hourUSD:1,dayUSD:5,keys:{}},bilibili:{enabled:false},voice:{enabled:false,provider:'local',region:'beijing',hourCharacters:10000,dayCharacters:30000,demonVoice:'Eldric Sage',humanVoice:'Ethan'}};
export async function createBroker({port=4392,host='127.0.0.1',path=':memory:',token=randomBytes(32).toString('hex'),fetcher=fetch,WebSocketClass=WebSocket}={}){
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,event TEXT NOT NULL);`);
 let config=JSON.parse(db.prepare("SELECT value FROM settings WHERE key='config'").get()?.value||JSON.stringify(defaults));
 // Platform fulfillment still requires re-enabling. Model/voice restart recovery is an explicit owner option; saved credentials never leave this process.
 config.models.transport='api';config.models.enabled=false;config.bilibili.enabled=false;config.xiaohongshu={...config.xiaohongshu,enabled:false};config.voice={...defaults.voice,...config.voice,provider:config.voice?.provider||(config.voice?.apiKey?'cloud':'local'),enabled:false};
 const salt=db.prepare("SELECT value FROM settings WHERE key='actor_salt'").get()?.value||randomBytes(32).toString('hex');db.prepare("INSERT OR IGNORE INTO settings VALUES('actor_salt',?)").run(salt);
 const models=new ModelDirector({db,config:()=>config.models,fetcher});
 const codex=new CodexConnection({token,fetcher,transport:config.models.transport});
 const voice=new CharacterVoice({db,config:()=>config.voice,fetcher,localRequest:(c,signal)=>codex.speak(c,signal),localCancel:()=>codex.stopVoice()});
 const giftPanels=new RoomGiftPanels({fetcher});
 const avatars=new AvatarStore({db,fetcher});
 const enqueue=event=>{if(event.supporter){event.supporter.avatarKey=event.supporter.avatarImage?avatars.registerInline(event.supporter.avatarImage):avatars.register(event.supporter.avatarSource);delete event.supporter.avatarImage;if(event.supporter.avatarKey)avatars.get(event.supporter.avatarKey).catch(()=>{});delete event.supporter.avatarSource;}if(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n>=20000)throw Error('outbox_full');db.prepare('INSERT OR IGNORE INTO outbox VALUES(?,?)').run(event.id,JSON.stringify(event));};
 db.exec('CREATE TABLE IF NOT EXISTS bili_seen(id TEXT PRIMARY KEY,at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS platform_quarantine(at INTEGER NOT NULL,detail TEXT NOT NULL)');
 const bili=new BiliConnection({config:()=>config.bilibili,secret:salt,fetcher,WebSocketClass,onEvent:event=>{
  if(db.prepare('SELECT 1 FROM bili_seen WHERE id=?').get(event.id))return false;
  db.exec('BEGIN IMMEDIATE');try{enqueue(event);db.prepare('INSERT INTO bili_seen VALUES(?,?)').run(event.id,Date.now());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  db.prepare('DELETE FROM bili_seen WHERE at<?').run(Date.now()-86400000);return true;
 },onQuarantine:detail=>{db.prepare('INSERT INTO platform_quarantine VALUES(?,?)').run(detail.at,JSON.stringify(detail));db.exec('DELETE FROM platform_quarantine WHERE rowid NOT IN (SELECT rowid FROM platform_quarantine ORDER BY rowid DESC LIMIT 100)');}});
 const xhs=new XhsReceiver({db,config:()=>config.xiaohongshu,secret:salt,enqueue});
 const status=()=>({giftPanels:{bilibili:giftPanels.snapshot(),xiaohongshu:{state:'room_unverified',gifts:[]}},voice:{state:voice.state,enabled:config.voice.enabled,resumeOnRestart:config.voice.resumeOnRestart===true,configured:config.voice.provider==='local'?!!codex.status.localVoice?.available:Boolean(config.voice.apiKey),provider:config.voice.provider,engine:config.voice.provider==='local'?(codex.status.localVoice?.engine||'本机角色音色'):'Qwen3-TTS 云端',local:config.voice.provider==='local'?codex.status.localVoice:null,...voice.usage(),hourLimit:config.voice.hourCharacters,dayLimit:config.voice.dayCharacters},models:['codex','electron'].includes(config.models.transport)?{...codex.status,enabled:config.models.enabled,resumeOnRestart:config.models.resumeOnRestart===true,profile:config.models.transport==='electron'?'instant':'luna-max',transport:config.models.transport,billing:config.models.transport==='electron'?'chatgpt_web_subscription':'chatgpt_subscription'}:{...models.snapshot(),transport:'api',billing:'api',resumeOnRestart:config.models.resumeOnRestart===true,profile:config.models.profile,requestedTier:PROFILES[config.models.profile]?.serviceTier||'default',enabled:config.models.enabled,hourLimitUSD:config.models.hourUSD,dayLimitUSD:config.models.dayUSD,keys:Object.fromEntries(Object.keys(PROFILES).map(k=>[k,Boolean(config.models.keys[k])])),museRates:config.models.museRates||null},bilibili:{...bili.state,setup:biliSetup(config.bilibili,bili.state),recentQuarantine:db.prepare('SELECT detail FROM platform_quarantine ORDER BY rowid DESC LIMIT 10').all().map(r=>JSON.parse(r.detail)),enabled:config.bilibili.enabled,roomId:config.bilibili.roomId||null,configured:Boolean(config.bilibili.accessKeyId&&config.bilibili.accessKeySecret&&config.bilibili.appId&&config.bilibili.anchorCode&&config.bilibili.roomId)},xiaohongshu:xhs.status(),outbox:db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n});
 async function configure(a){
  if(!a||!['models','bilibili','voice','xiaohongshu'].includes(a.section)||!a.values||typeof a.values!=='object')throw Error('invalid_config');const next=structuredClone(config),v=a.values;if('resumeOnRestart'in v&&typeof v.resumeOnRestart!=='boolean')throw Error('invalid_resume');
  if(a.section==='models'){
   if(Object.keys(v).some(k=>!['enabled','resumeOnRestart','transport','profile','hourUSD','dayUSD','apiKey','museRates'].includes(k)))throw Error('invalid_fields');
   if('transport'in v&&v.transport!=='api')throw Error('invalid_transport');
   if(v.transport)next.models.transport=v.transport;
   if(v.apiKey!==undefined&&!v.transport)next.models.transport='api'; // Explicit legacy API configuration only.
   for(const k of ['hourUSD','dayUSD'])if(k in v&&(!Number.isFinite(v[k])||v[k]<.01||v[k]>50))throw Error('invalid_budget');
   if('profile'in v&&!Object.hasOwn(PROFILES,v.profile))throw Error('invalid_profile');
   if('enabled'in v&&typeof v.enabled!=='boolean')throw Error('invalid_enabled');
   if('museRates'in v&&(!v.museRates||Object.keys(v.museRates).sort().join(',')!=='input,output'||![v.museRates.input,v.museRates.output].every(n=>Number.isFinite(n)&&n>=0&&n<=100)))throw Error('invalid_rates');
   for(const k of ['enabled','resumeOnRestart','profile','hourUSD','dayUSD','museRates'])if(k in v)next.models[k]=v[k];
   if(v.apiKey!==undefined){if(typeof v.apiKey!=='string'||v.apiKey.length<20||v.apiKey.length>512||/\s/.test(v.apiKey))throw Error('invalid_key');next.models.keys[next.models.profile]=v.apiKey;}
   if(['codex','electron'].includes(next.models.transport)){next.models.profile='luna-max';if(next.models.enabled){await codex.refresh();if(!codex.status.authenticated||codex.status.transport!==next.models.transport)throw Error('commander_transport_unavailable');}}
   if(next.models.transport==='api'&&next.models.enabled&&!next.models.keys[next.models.profile])throw Error('api_key_required');
   if(next.models.transport==='api'&&next.models.enabled&&next.models.profile==='muse-spark'&&!next.models.museRates)throw Error('pricing_required');
   models.stop();codex.stop();codex.transport=next.models.transport;
  }else if(a.section==='voice'){
   if(Object.keys(v).some(k=>!['enabled','resumeOnRestart','provider','apiKey','region','hourCharacters','dayCharacters'].includes(k)))throw Error('invalid_fields');
   if('provider'in v&&!['local','cloud'].includes(v.provider))throw Error('invalid_provider');
   if('enabled'in v&&typeof v.enabled!=='boolean'||'region'in v&&!['beijing','singapore'].includes(v.region))throw Error('invalid_voice_config');
   for(const k of ['hourCharacters','dayCharacters'])if(k in v&&(!Number.isInteger(v[k])||v[k]<100||v[k]>100000))throw Error('invalid_voice_budget');
   if('apiKey'in v&&(typeof v.apiKey!=='string'||v.apiKey.length<20||v.apiKey.length>512||/\s/.test(v.apiKey)))throw Error('invalid_key');
   Object.assign(next.voice,v);if(next.voice.enabled){if(next.voice.provider==='local'){await codex.refresh();if(!codex.status.localVoice?.available)throw Error('local_voice_unavailable');}else if(!next.voice.apiKey)throw Error('voice_key_required');}voice.stop();
  }else if(a.section==='xiaohongshu'){next.xiaohongshu=xhsConfig(config.xiaohongshu,v);
  }else{
   if(Object.keys(v).some(k=>!['enabled','roomId','appId','accessKeyId','accessKeySecret','anchorCode'].includes(k)))throw Error('invalid_fields');
   if('enabled'in v&&typeof v.enabled!=='boolean')throw Error('invalid_enabled');
   for(const k of ['roomId','appId'])if(k in v&&(!Number.isSafeInteger(v[k])||v[k]<1))throw Error('invalid_id');
   for(const k of ['accessKeyId','accessKeySecret','anchorCode'])if(k in v&&(typeof v[k]!=='string'||v[k].length<2||v[k].length>512||/[\r\n]/.test(v[k])))throw Error('invalid_credentials');
   Object.assign(next.bilibili,v);if(next.bilibili.enabled&&!['accessKeyId','accessKeySecret','anchorCode','appId','roomId'].every(k=>next.bilibili[k]))throw Error('credentials_required');await bili.stop();
  }
  db.prepare("INSERT INTO settings VALUES('config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(next));config=next;
  if(a.section==='xiaohongshu')xhs.reset();if(a.section==='bilibili'&&config.bilibili.enabled)bili.start().catch(()=>{});return {ok:true,status:status()};
 }
 const server=http.createServer(async(req,res)=>{
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const actual=Buffer.from(String(req.headers['x-bridge-token']||'')),expected=Buffer.from(token);if(req.headers.host!==`127.0.0.1:${port}`||actual.length!==expected.length||!timingSafeEqual(actual,expected))return send(403,{error:'private_service'});
  try{
   if(req.method==='GET'&&req.url==='/status'){if(config.bilibili.enabled)void giftPanels.refresh(config.bilibili.roomId);if(config.voice.enabled&&config.voice.provider==='local')await codex.refresh();return send(200,status());}
   if(req.method==='GET'&&req.url==='/events')return send(200,db.prepare('SELECT event FROM outbox LIMIT 50').all().map(r=>JSON.parse(r.event)));
   if(req.method!=='POST')return send(404,{error:'not_found'});
   let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>20000)return send(413,{error:'body_limit'});}const a=JSON.parse(raw);
   if(req.url==='/xiaohongshu/events')return send(200,xhs.receive(a));
   if(req.url==='/settings')return send(200,await configure(a));
   if(req.url==='/decision')return send(200,config.models.enabled?(['codex','electron'].includes(config.models.transport)?await codex.decide(a):await models.decide(a)):{ok:false,reason:'disabled'});
   if(req.url==='/avatar')return send(200,await avatars.get(a.key));
   if(req.url==='/voice/warm')return send(200,config.voice.enabled&&config.voice.provider==='local'?await codex.request('/voice/warm',{}):{ok:false,reason:'disabled'});
   if(req.url==='/voice')return send(200,await voice.speak(a));
   if(req.url==='/cancel'){models.stop();codex.stop();voice.stop();return send(200,{ok:true});}
   if(req.url==='/ack'){if(!Array.isArray(a.ids)||a.ids.length>50||a.ids.some(id=>typeof id!=='string'||id.length>180))throw Error('invalid_ids');for(const id of a.ids)db.prepare('DELETE FROM outbox WHERE id=?').run(id);return send(200,{ok:true});}
   return send(404,{error:'not_found'});
  }catch{return send(400,{error:'request_rejected'});}
 });server.requestTimeout=51000;server.headersTimeout=5000;server.maxConnections=12;
 await new Promise((r,j)=>server.once('error',j).listen(port,host,r));return {server,models,bili,xhs,status,configure,db,close:async()=>{models.stop();voice.stop();await bili.stop();await new Promise(r=>server.close(r));db.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const app=await createBroker({path:process.env.DUEL_BROKER_DB||'/var/lib/duel-connectors/broker.sqlite',token:readFileSync(process.env.DUEL_BRIDGE_TOKEN||'/etc/duel-preview/bridge-token','utf8').trim()});
 console.log('Private connector broker ready. Model and platform connections disabled until owner enables them.');
 for(const sig of ['SIGTERM','SIGINT'])process.once(sig,async()=>{await app.close();process.exit(0);});
}
