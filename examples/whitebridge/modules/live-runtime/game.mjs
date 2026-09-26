import {resolveClanEvent,refreshClanGrant} from './clan-membership.mjs';
import {factionFields,factionLeader} from '../pixel-war/public/allegiance.mjs';
import {initializeSummonerReactions,collectSummonerReactions} from './summoner-reactions.mjs';
import {observerSpoken} from './observer-topics.mjs';
import {recordViewerNotice,viewerNoticesSnapshot} from './viewer-notices.mjs';
import {applySpeechMode} from './speech-mode.mjs';
import {syncDebate} from './show-debate.mjs';
import {recruit,interactionFeedback,feedbackSnapshot} from './interaction-feedback.mjs';
import {troopEffectIdentity} from '../pixel-war/public/combat-focus.mjs';
import {creditRescue,reserveRescue,rescueSnapshot,rescueIntent,showRescue} from './rescue.mjs';
import {ViewerHistory} from './viewer-history.mjs';
import {migrateViewerHistory} from './history-migration.mjs';
import {BILI_GIFT_ROSTER,BILI_QUICK_GIFTS,BILI_GIFT_PRICE_LIMIT,WAR_INCANTATIONS,WAR_INCANTATION_COOLDOWN_MS,WAR_INCANTATION_SIDE_COOLDOWN_MS} from '../pixel-war/public/bili-gift-roster.mjs';
import {replyPacing,narrationExpired} from './audience-pacing.mjs';
import {MODEL_REPLY_AGE_MS} from './model-timing.mjs';
import {broadcastMode,modeStatus,configureBroadcast,tickOpponent,affiliationIntent,assignBiliFaction} from './broadcast-mode.mjs';
import {XHS_SCHEMA,opaqueId} from '../connectors/xiaohongshu-events.mjs';
import {crownCount,crownRite} from '../pixel-war/public/crowns.mjs';
import {chooseWarEvent} from './event-choice.mjs';
import {applyCommanderSupport} from '../pixel-war/commander-support.mjs';
import {speechParts,validSpeechTurn,publishMonologue,tickMonologues} from './speech-turn.mjs';
import {enableLunaSpeech,isCommanderModel} from '../pixel-war/luna-speech.mjs';
import {buildBarracks} from '../pixel-war/barracks.mjs';
import {launchOwnedEvent} from '../pixel-war/owned-events.mjs';
import {onPlayerArrival,tickWarDrama,dramaContext} from '../pixel-war/war-drama.mjs';
import {enableAudienceBattle} from '../pixel-war/audience-battle.mjs';
import {recordParticipation,updateParticipation} from './participation.mjs';
import {catalogGift,resolveGiftMapping,testRewardQuality} from './gift-catalog.mjs';
import {giftEntitlement} from '../pixel-war/public/gift-tiers.mjs';
import {reinforcementCopies} from '../pixel-war/public/gift-strength.mjs';
import {eligibleFallen,serviceExpired,leaderDeaths,retireTroops} from '../pixel-war/service-life.mjs';
import {conversationMode,validConversationSpeech} from './conversation.mjs';
import {supporterEvent} from '../pixel-war/supporter-events.mjs';
import {relationshipContext,spotlightSupporter,fitRelationshipContext,noteAudiencePresence,noteAudienceDeparture,noteViewerChat} from './relationships.mjs';
import {applyLegacy} from '../pixel-war/legacy.mjs';
import {legacyAvailability} from '../pixel-war/public/legacy-catalog.mjs';
import {STRATEGIES} from './models.mjs';
import {commandCampaign} from '../pixel-war/campaign.mjs';
import {TEST_VIEWERS,cleanChat,enlistIntent} from '../pixel-war/public/chat-commands.mjs';
import {audienceState,receiveChat,withdrawAudience,tickAudience,selectedAudience,replyAudience,audienceSnapshot,audienceItem,storePreparedReply,recoverAudiencePreparation} from './audience.mjs';
import {migrateWorld} from '../pixel-war/migrate.mjs';
import {displayName} from './public-profile.mjs';
import {DatabaseSync} from 'node:sqlite';
import {PixelWorld,SIDES,UNIT_KEYS} from '../pixel-war/world.mjs';
import {GIFTS,TACTICS} from '../pixel-war/public/gifts.mjs';
import {randomUUID,createHash} from 'node:crypto';

const own=(o,k)=>Object.hasOwn(o,k);
export class LiveGame {
 constructor({path=':memory:',seed=37,now=()=>Date.now(),audienceDriven=true,generatedSpeechOnly=true,speechMode='dual'}={}){
  this.now=now;this.mediaSession=randomUUID();this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS receipts_status ON receipts(status);
  CREATE INDEX IF NOT EXISTS receipts_transport ON receipts(platform,json_extract(payload,'$.transport.sessionId'),json_extract(payload,'$.transport.roomId'));`);
  this.viewerHistory=new ViewerHistory(this.db);
  this.world=new PixelWorld(seed,{audienceDriven});this.meta={queue:[],points:{demon:0,human:0},threshold:{demon:0,human:0},feed:[],mappings:{},cooldowns:{},epoch:0,personas:{},models:{demon:'offline_rules',human:'offline_rules'},lastDecision:{},liveEnabled:false};
  const saved=this.db.prepare("SELECT value FROM kv WHERE key='checkpoint'").get();if(saved){const s=JSON.parse(saved.value);if(s.version!==1)throw Error('checkpoint_version');this.restore(s);recoverAudiencePreparation(this);}
  this.atomic(()=>migrateViewerHistory(this));
  if(audienceDriven){enableAudienceBattle(this.world);updateParticipation(this);}
  this.speechMode=speechMode;applySpeechMode(this.world,speechMode);
  if(generatedSpeechOnly)enableLunaSpeech(this.world);
  // A restart never automatically resumes paid model work. Character identities persist.
  initializeSummonerReactions(this);audienceState(this);this.runtime={modelEnabled:false,voiceEnabled:false};this.meta.epoch++;this.meta.liveEnabled=false;this.dirty=true;this.lastSave=this.now();this.checkpoint();
 }
 resetForLaunch(){return this.atomic(()=>{
  const savedMode=broadcastMode(this),oldEpoch=this.meta.epoch,oldField=this.world.fieldEpoch,oldSerial=this.world.serial,mappings=this.meta.mappings,giftNames=this.meta.giftNames;
  const fresh=new PixelWorld(37,{audienceDriven:true}),run=randomUUID();fresh.paused=true;fresh.serial=Math.max(fresh.serial,oldSerial)+1;fresh.fieldEpoch=oldField+1;
  for(const side of SIDES)fresh.heroes[side].id=side+'-hero-'+(++fresh.serial);
  for(const key of Object.keys(this.world))delete this.world[key];Object.assign(this.world,fresh);this.world.nav.readChanges=()=>this.world.terrainChanges;
  this.meta={queue:[],points:{demon:0,human:0},threshold:{demon:0,human:0},feed:[],mappings:mappings||{},giftNames:giftNames||{},cooldowns:{},epoch:oldEpoch+1,personas:{},models:{demon:'offline_rules',human:'offline_rules'},lastDecision:{},liveEnabled:false,launchId:run};
  this.meta.broadcastMode=savedMode;applySpeechMode(this.world,this.speechMode);audienceState(this);enableLunaSpeech(this.world);updateParticipation(this);
  this.db.prepare("UPDATE receipts SET status='launch_reset' WHERE status IN ('queued','unmapped','accepted','message_queued')").run();
  return {ok:true,launchId:run,mode:this.world.mode,ranks:SIDES.map(s=>this.world.heroes[s].rank),units:this.world.units.length};
 });}
 capture(){const {nav,...world}=this.world;return structuredClone({version:1,world,meta:this.meta});}
 restore(s){this.world.audienceBattle=s.world.audienceBattle||null;Object.assign(this.world,migrateWorld(s.world));this.meta=s.meta;delete this.meta.eventChoices;for(const q of this.meta.queue||[])if(q.service)q.service.expiresAtDeath=null;}
 checkpoint(){const {nav,...world}=this.world;this.db.prepare("INSERT INTO kv VALUES('checkpoint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({version:1,world,meta:this.meta}));this.lastSave=this.now();this.dirty=false;}
 atomic(fn,{skipNoop=false}={}){if(this.inTransaction)return fn();const before=this.capture();this.db.exec('BEGIN IMMEDIATE');this.inTransaction=true;try{const out=fn();if(!skipNoop||out!==false)this.checkpoint();this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');this.restore(before);throw e;}finally{this.inTransaction=false;}}
 receiveBatch(events){if(!Array.isArray(events)||events.length>50)throw Error('batch_limit');if(!events.length)return [];return this.atomic(()=>events.map(e=>{this.receive(e);return e.id;}));}

 log(data){this.meta.feed.push({id:++this.world.serial,at:this.world.time,...data});this.meta.feed=this.meta.feed.slice(-12);}
 configureMappings(entries){if(!Array.isArray(entries)||entries.length>3000)throw Error('invalid_mappings');const map={};for(const e of entries){if(!e||!['bilibili','xiaohongshu'].includes(e.platform)||(e.platform==='bilibili'?(!Number.isSafeInteger(e.giftId)||e.giftId<1):!opaqueId(e.giftId))||!own(GIFTS,e.reward)||!Number.isInteger(e.multiplier)||e.multiplier<1||e.multiplier>10)throw Error('invalid_mapping');map[`${e.platform}:${e.giftId}`]={reward:e.reward,multiplier:e.multiplier};}return this.atomic(()=>{this.meta.mappings=map;this.retryUnmapped();return {ok:true};});}
 retryUnmapped(){let cursor=0;for(;;){const rows=this.db.prepare("SELECT rowid,id,payload FROM receipts WHERE status='unmapped' AND rowid>? ORDER BY rowid LIMIT 500").all(cursor);if(!rows.length)break;for(const row of rows){cursor=row.rowid;const e=JSON.parse(row.payload),mapping=resolveGiftMapping(this,e);if(mapping){creditRescue(this,e);const count=this.reward(e,mapping.reward,e.quantity*mapping.multiplier,mapping.quality);if(mapping.bonus&&mapping.bonus!=='revive'&&e.paid===true){const bonusCount=this.reward(e,mapping.bonus,1);if(bonusCount!==0)this.meta.queue.at(-1).points=0;}if(mapping.reward!=='revive'&&e.rescue?.creditedMilli)reserveRescue(this,e);this.db.prepare('UPDATE receipts SET status=?,payload=? WHERE id=?').run(count===0?(e.rescue?.creditedMilli?'rescue_progress':'no_fallen_troops'):'queued',JSON.stringify(e),row.id);}}}}
 liveSessionEvidence({sessionId,roomId}={},platform='bilibili'){if(!sessionId||!roomId)return {chat:null,gift:null};const rows=this.db.prepare("SELECT id,status,payload FROM receipts WHERE platform=? AND json_extract(payload,'$.transport.sessionId')=? AND json_extract(payload,'$.transport.roomId')=?").all(platform,sessionId,roomId);let chat=null,gift=null;for(const row of rows){const e=JSON.parse(row.payload);if(e.kind==='chat'&&['message_queued','commanded','recruited','deployed','faction_selected'].includes(row.status))chat={id:row.id};if(e.kind==='gift'&&row.status==='deployed'&&e.fulfillment?.applied>0)gift={id:row.id,applied:e.fulfillment.applied};}return {chat,gift};}
 receive(event,{test=false}={}){
  const e=structuredClone(event);if(!e||typeof e.id!=='string'||e.id.length>180||!['gift','like','join','leave','tactic','lane','unit','chat','withdraw'].includes(e.kind))throw Error('invalid_event');
  if(test){if(e.platform!=='test'||!SIDES.includes(e.side)||!e.id.startsWith('test:'))throw Error('invalid_test');}
  else if(e.platform==='xiaohongshu'){if(!e.id.startsWith('xiaohongshu:')||typeof e.actor!=='string'||!Number.isSafeInteger(e.at)||e.transport?.adapter!==XHS_SCHEMA||e.transport?.source!=='owner_relay'||!opaqueId(e.transport?.roomId)||!opaqueId(e.transport?.sessionId)||e.transport?.platformVerified!==false)throw Error('unverified_platform');e.side='human';}
  else {if(e.platform!=='bilibili'||!e.id.startsWith('bilibili:')||typeof e.actor!=='string'||!Number.isSafeInteger(e.at))throw Error('unverified_platform');e.side='demon';}
  if(test&&!Object.hasOwn(TEST_VIEWERS,e.actor))throw Error('invalid_test_viewer');
  e.supporter={id:createHash('sha256').update(e.platform+':'+e.actor).digest('hex').slice(0,24),name:test?TEST_VIEWERS[e.actor]:displayName(e.supporter?.name),platform:e.platform,avatarKey:!test&&/^[a-f0-9]{40}$/.test(e.supporter?.avatarKey||'')?e.supporter.avatarKey:null};
  if(e.kind==='gift'&&(!Number.isInteger(e.quantity)||e.quantity<1||e.quantity>100000||test&&!own(GIFTS,e.reward)))throw Error('invalid_gift');
  if(this.db.prepare('SELECT id FROM receipts WHERE id=?').get(e.id))return {ok:true,duplicate:true,id:e.id};
  return this.atomic(()=>{
   let status='accepted',interaction=null;
   const mixed=broadcastMode(this)==='bilibili-first';
   if(mixed&&e.platform==='xiaohongshu'){
    this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(e.id,e.platform,this.now(),JSON.stringify(e),'platform_paused');
    return {ok:true,id:e.id,status:'platform_paused'};
   }
   if(mixed&&e.platform==='bilibili'){
    const choice=e.kind==='chat'?affiliationIntent(e.text):null;
    const wasAssigned=!!this.meta.affiliations?.[e.supporter.id];e.side=assignBiliFaction(this,e);if(!wasAssigned&&!choice&&['chat','gift'].includes(e.kind))interactionFeedback(this,e,'faction_assigned');
    if(choice){if(this.meta.clanMembers)delete this.meta.clanMembers[e.supporter.id];recordViewerNotice(this,e,'faction_selected');interactionFeedback(this,e,'faction_selected');recordParticipation(this,e);noteViewerChat(this,e);this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(e.id,e.platform,this.now(),JSON.stringify(e),'faction_selected');return {ok:true,id:e.id,status:'faction_selected',interaction:{side:e.side}};}
   }
   const clanAction=resolveClanEvent(this,e);if(clanAction){recordViewerNotice(this,e,clanAction.status,clanAction);recordParticipation(this,e);this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(e.id,e.platform,this.now(),JSON.stringify(e),clanAction.status);return {ok:true,id:e.id,status:clanAction.status,interaction:clanAction};}
   recordParticipation(this,e);
   if(['gift','join','like'].includes(e.kind))noteAudiencePresence(this,e);
   if(e.kind==='leave')noteAudienceDeparture(this,e);
   if(e.kind==='gift'){
    if(!test&&e.giftName){this.meta.giftNames??={};this.meta.giftNames[e.platform+':'+e.giftId]=e.giftName.slice(0,40);}
    const mapping=test?{reward:e.reward,multiplier:e.testGiftMultiplier||1,quality:e.testGiftQuality||testRewardQuality(e.reward,e.quantity),bonus:e.testGiftBonus}:resolveGiftMapping(this,e);
    if(mapping)creditRescue(this,e,{test});
    if(!mapping){status='unmapped';this.log({side:e.side,source:e.platform,text:`未映射礼物 #${e.giftId} 已记账，等待绑定奖励`});}
    else {const count=this.reward(e,mapping.reward,e.quantity*mapping.multiplier,mapping.quality);status=count===0?'no_fallen_troops':'queued';
     // Bonus is additive to the troop entitlement, once per delivered gift transaction.
     if(mapping.bonus&&mapping.bonus!=='revive'&&(test||e.paid===true)){const bonusCount=this.reward(e,mapping.bonus,1);if(bonusCount!==0)this.meta.queue.at(-1).points=0;interaction={status:bonusCount===0?'no_fallen_troops':'event_queued',key:mapping.bonus};}
    }
    if(mapping&&mapping.reward!=='revive'&&e.rescue?.creditedMilli)reserveRescue(this,e);
    if(e.rescue?.creditedMilli&&status==='no_fallen_troops')status=e.rescue.reserved?'queued':'rescue_progress';
   }else if(e.kind==='chat'&&rescueIntent(e.text)){noteAudiencePresence(this,e);interaction=showRescue(this,e);status=interaction.status;}else if(e.kind==='chat'){const choice=chooseWarEvent(this,e);if(choice){noteAudiencePresence(this,e);interaction=choice;}else if(enlistIntent(e.text)){noteAudiencePresence(this,e);interaction=recruit(this,e,enlistIntent(e.text).corrected);}else interaction=receiveChat(this,e);status=interaction.status;}else if(e.kind==='withdraw'){interaction=withdrawAudience(this,e.messageIds||[]);status=interaction.status;}else this.freeAction(e,test);
   if(this.world.speechMode!=='observer'&&e.kind==='gift'&&e.paid&&Number.isSafeInteger(e.amountMilli)&&e.amountMilli>0){receiveChat(this,{...e,eventNotice:'gift',text:'送来'+(test?GIFTS[e.reward].name:'援军礼物')+'，撑住！'});}
   if(e.kind==='chat'&&status!=='rejected_text')noteViewerChat(this,e);
   recordViewerNotice(this,e,status,interaction);
   this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(e.id,e.platform,this.now(),JSON.stringify(e),status);
   return {ok:true,id:e.id,status,interaction};
  });
 }
 testGift({side,reward,giftId,quantity=1,lane=1,id,viewer='owner-test'}){if(![0,1,2].includes(lane)||quantity>10)throw Error('invalid_test_gift');let testGiftQuality,testGiftBonus,testGiftMultiplier,testRescueMilli=reward==='revive'?100*quantity:0;if(giftId!==undefined){const g=catalogGift(side==='demon'||broadcastMode(this)==='bilibili-first'?'bilibili':'xiaohongshu',giftId);if(!g)throw Error('unknown_platform_gift');const plan=giftEntitlement(g,quantity);reward=plan.reward;testGiftQuality=plan.quality;testGiftBonus=plan.bonus;testGiftMultiplier=plan.multiplier;testRescueMilli=g.coinType==='gold'?g.price*quantity:0;}return this.receive({id:id||`test:${randomUUID()}`,platform:'test',side,reward,testGiftQuality,testGiftBonus,testGiftMultiplier,testRescueMilli,quantity,lane,kind:'gift',actor:viewer,at:this.now()},{test:true});}
 testChat({side,text,viewer='owner-test',paid=0,id}){if(!cleanChat(text)||![0,1,10,100].includes(paid)||!Object.hasOwn(TEST_VIEWERS,viewer))throw Error('invalid_test_chat');return this.receive({id:id||`test:${randomUUID()}`,platform:'test',side,kind:'chat',actor:viewer,at:this.now(),text,amountMilli:paid*1000},{test:true});}
 reward(e,key,quantity,quality=null){
  if(key==='revive')return reserveRescue(this,e);
  if(this.meta.queue.length>=4096)throw Error('queue_capacity');const g=GIFTS[key],legacy=g.dynamic==='retinue'?legacyAvailability(this.world,e.side):null;if(g.dynamic&&!legacy&&e.platform==='test')throw Error('retinue_locked');this.meta.queue.push({awaitingLegacy:!!g.dynamic&&!legacy,legacy,quality,...(quality?.power?.version===1&&reinforcementCopies(quality.power.priceMilli)>1?{reinforcementWave:{size:quality.power.count,interval:4000,nextAt:0}}:{}),receipt:e.id,side:e.side,...factionFields(e),key,remaining:quantity*(legacy?.count||g.count||1),lane:[0,1,2].includes(e.lane)?e.lane:1,source:e.platform,points:quantity*g.points,credited:false,supporter:e.supporter});
   this.log({side:e.side,source:e.platform,text:`${e.supporter?.name||'观众'}：${legacy?.name||g.name} ×${quantity}`,reward:key});
 }
 freeAction(e,test){
  const key=`${e.platform}:${e.actor}:${e.kind}`,last=this.meta.cooldowns[key]||0;if(this.now()-last<10000)return;
  const entries=Object.entries(this.meta.cooldowns).filter(([,at])=>this.now()-at<60000);this.meta.cooldowns=Object.fromEntries(entries.slice(-4000));this.meta.cooldowns[key]=this.now();
  if(e.kind==='like'){const team=e.faction||e.side;this.meta.points[team]=(this.meta.points[team]||0)+1;this.log({side:e.side,source:e.platform,text:'点赞助力 +1'});}
  else if(['tactic','lane','unit'].includes(e.kind)){const text={focusEnemy:'攻击',protectHero:'守护',backline:'攻击',escort:'守护'}[e.value];if(text)receiveChat(this,{...e,text});}
  // Joining alone does not purchase a lethal battle or manufacture gift value.
 }
 engage(source){if(source!=='test'&&this.world.mode==='test_live'){this.world.mode='live';this.meta.epoch++;}if(this.world.mode==='sparring'){this.world.mode=source==='test'?'test_live':'live';this.world.round++;this.world.startedAt=this.world.time;this.meta.epoch++;}}
 drain(){if(this.world.paused||['inspection','settlement'].includes(this.world.mode))return false;let changed=false,deployed=0;
  for(const grant of this.meta.queue){if(deployed>=6)break;if(grant.remaining<=0)continue;if(grant.reinforcementWave?.nextAt>this.world.time)continue;if(grant.source==='xiaohongshu'&&broadcastMode(this)==='bilibili-first')continue;if(grant.source!=='test'&&!this.meta.liveEnabled)continue;
   refreshClanGrant(this,grant);const g=GIFTS[grant.key];if(g.effect==='commander_support'){this.engage(grant.source);const result=applyCommanderSupport(this.world,grant);if(result){grant.remaining--;grant.applied=(grant.applied||0)+Number(result.applied);grant.noEffect=(grant.noEffect||0)+Number(!result.applied);if(!grant.credited){this.meta.points[grant.faction||grant.side]=(this.meta.points[grant.faction||grant.side]||0)+grant.points;grant.credited=true;}changed=true;deployed++;}continue;}if(['barracks','war_event'].includes(g.effect)){this.engage(grant.source);const ok=g.effect==='barracks'?buildBarracks(this.world,grant):launchOwnedEvent(this.world,grant,grant.key);if(ok){if(g.effect==='war_event')onPlayerArrival(this.world,grant);if(!grant.credited){this.meta.points[grant.faction||grant.side]=(this.meta.points[grant.faction||grant.side]||0)+grant.points;grant.credited=true;}grant.remaining--;grant.applied=(grant.applied||0)+1;deployed++;changed=true;}continue;}if(g.effect==='revive'){while(grant.reviveIds.length){const id=grant.reviveIds[0],fallen=this.world.fallenTroops.find(u=>u.id===id&&u.reservedBy===grant.receipt);if(!fallen||serviceExpired(this.world,fallen)){grant.reviveIds.shift();grant.remaining--;grant.discarded=(grant.discarded||0)+1;changed=true;continue;}if(this.world.spawn(grant.side,fallen.kind,grant.lane,false,{...grant,reviveId:id})){grant.reviveIds.shift();grant.remaining--;grant.applied=(grant.applied||0)+1;changed=true;deployed++;this.world.emit('revive',{x:this.world.units.at(-1).x,y:this.world.units.at(-1).y,side:grant.side,target:id,...troopEffectIdentity(this.world.units.at(-1))});}break;}continue;}if(grant.awaitingLegacy){const legacy=legacyAvailability(this.world,grant.side);if(!legacy)continue;grant.legacy=legacy;grant.remaining*=legacy.count;grant.awaitingLegacy=false;changed=true;}this.engage(grant.source);
   if(!grant.credited){this.meta.points[grant.faction||grant.side]=(this.meta.points[grant.faction||grant.side]||0)+grant.points;grant.credited=true;changed=true;}
   if(g.effect==='shield'){const h=factionLeader(this.world,grant);if(!h)continue;if(h.shield>=600)continue;const amount=Math.min(180,600-h.shield);h.shield+=amount;supporterEvent(this.world,grant.side,grant.supporter,'shield_hero',{amount,critical:h.hp<h.maxHP*.35});grant.remaining--;grant.applied=(grant.applied||0)+1;this.world.emit('heal',{x:h.x,y:h.y,target:h.id,side:h.side,shield:true,amount:180});changed=true;deployed++;}
   // Each reserved wave remains deliverable across any number of commander deaths.
   else if(this.world.spawn(grant.side,grant.legacy?.unit||g.unit,grant.lane,false,grant.reinforcementWave?{...grant,service:undefined}:grant)){const unit=this.world.units.at(-1);if(!grant.reinforcementWave)grant.service??=structuredClone(unit.service);if(grant.legacy)applyLegacy(this.world,unit,grant.legacy);unit.source=grant.source;unit.receipt=grant.receipt;unit.supporter=grant.supporter||{name:'本机试玩',platform:grant.source,avatarKey:null};this.world.events.at(-1).source=grant.source;supporterEvent(this.world,grant.side,unit.supporter,'deployed');if(!grant.announced){grant.announced=true;onPlayerArrival(this.world,grant);if(!this.world.audienceBattle)this.world.react(grant.side,'Support',2);}grant.remaining--;grant.applied=(grant.applied||0)+1;if(grant.reinforcementWave&&grant.applied%grant.reinforcementWave.size===0)grant.reinforcementWave.nextAt=this.world.time+grant.reinforcementWave.interval;changed=true;deployed++;}
  }
  // A gift can own troop and bonus grants. Persist cumulative fulfillment and
  // keep its receipt queued until EVERY grant has finished, including delayed events.
  const completed=new Map();for(const g of this.meta.queue.filter(q=>q.remaining===0)){let list=completed.get(g.receipt);if(!list)completed.set(g.receipt,list=[]);list.push(g);}
  for(const [receipt,list] of completed){const row=this.db.prepare('SELECT payload FROM receipts WHERE id=?').get(receipt);if(!row)continue;
   const previous=JSON.parse(row.payload).fulfillment||{},applied=(previous.applied||0)+list.reduce((n,g)=>n+(g.applied||0),0),discarded=(previous.discarded||0)+list.reduce((n,g)=>n+(g.discarded||0),0),expired=!!previous.expired||list.some(g=>g.expired),noEffect=!!previous.noEffect||list.some(g=>g.noEffect);
   const components=previous.components||{};for(const g of list){const c=components[g.key]||{applied:0,discarded:0};c.applied+=g.applied||0;c.discarded+=g.discarded||0;if(g.expired)c.expired=true;if(g.noEffect)c.noEffect=true;components[g.key]=c;}
   const pending=this.meta.queue.some(g=>g.receipt===receipt&&g.remaining>0),status=pending?'queued':expired?(applied?'partially_deployed':'expired'):discarded?(applied?'partially_deployed':'no_fallen_troops'):noEffect&&!applied?'no_effect':'deployed';
   this.db.prepare("UPDATE receipts SET status=?,payload=json_set(payload,'$.fulfillment',json(?)) WHERE id=?").run(status,JSON.stringify({applied,discarded,components,...(expired?{expired}:{}),...(noEffect?{noEffect}:{})}),receipt);
  }
  this.meta.queue=this.meta.queue.filter(g=>g.remaining>0);
  for(const side of SIDES){const milestone=Math.floor(this.meta.points[side]/30);if(milestone>this.meta.threshold[side]){this.meta.threshold[side]++;const h=this.world.heroes[side];h.shield=Math.min(600,h.shield+120);this.world.emit('rally',{x:h.x,y:h.y,side});this.log({side,source:'system',text:'军团 30 点奖励：统帅护盾 +120'});changed=true;}}
  return changed;
 }
 configureBroadcast(mode){return configureBroadcast(this,mode);}
 step(ms=50){if(this.world.paused)return;if(this.world.time%1000<ms)updateParticipation(this);const prev=this.world.mode,front=this.world.campaign?.stage;this.world.step(ms);if(this.world.time%1000<ms)retireTroops(this.world);if(front!==this.world.campaign?.stage)this.meta.epoch++;if(prev==='settlement'&&this.world.mode!=='settlement'){for(const side of this.world.result.dead){delete this.meta.lastDecision[side];this.meta.models[side]='offline_rules';}const living=new Set(SIDES.map(s=>this.world.heroes[s].id));this.meta.personas=Object.fromEntries(Object.entries(this.meta.personas).filter(([id])=>living.has(id)));}if(prev!==this.world.mode)this.meta.epoch++;
  if(!['inspection','settlement'].includes(this.world.mode)&&this.world.time%250<ms&&(this.meta.queue.length||SIDES.some(s=>Math.floor(this.meta.points[s]/30)>this.meta.threshold[s])))this.atomic(()=>this.drain(),{skipNoop:true});
  if(prev==='settlement'){const a=audienceState(this);for(const m of [...a.pending,...Object.values(a.active)]){for(const k of ['at','expires','until'])if(Number.isFinite(m[k]))m[k]+=ms;}for(const s of SIDES){const relationship=this.meta.relationships?.[s];if(relationship){if(relationship.advice)relationship.advice.until+=ms;for(const e of relationship.pending)e.at+=ms;relationship.nextSpotlight+=ms;}if(Number.isFinite(a.nextFree[s]))a.nextFree[s]+=ms;if(Number.isFinite(this.world.audienceSpeakingUntil?.[s]))this.world.audienceSpeakingUntil[s]+=ms;}for(const line of this.world.speech)if(line.audienceId){line.at+=ms;if(Number.isFinite(line.until))line.until+=ms;}}
  if(this.world.time%1000<ms)tickOpponent(this);
  collectSummonerReactions(this,receiveChat);tickAudience(this);this.world.audienceWaiting=Object.fromEntries(SIDES.map(s=>[s,!!selectedAudience(this,s)]));tickMonologues(this.world);tickWarDrama(this.world,{voice:this.runtime.voiceEnabled});if(!(this.world.sceneSpeakingUntil>this.world.time))spotlightSupporter(this);this.world.audienceWaiting=Object.fromEntries(SIDES.map(s=>[s,!!selectedAudience(this,s)]));if(this.now()-this.lastSave>=2000)this.checkpoint();
 }
 action(fn){return this.atomic(()=>{const out=fn(this.world);this.meta.epoch++;return out;});}
 context(side,{audience:requestedAudience=null,prefetch=false}={}){const w=this.world,h=w.heroes[side],enemy=w.heroes[side==='demon'?'human':'demon'],groups=new Map();for(const u of w.units){if(u.hp<=0)continue;const key=(u.faction||u.side)+':'+(u.commander?'general':u.kind)+':'+u.lane;let g=groups.get(key);if(!g)groups.set(key,g={side:u.side,...factionFields(u),kind:u.commander?'general':u.kind,lane:u.lane,count:0});g.count++;}
  const selected=selectedAudience(this,side,requestedAudience),rite=w.mode==='settlement'?crownRite(w.result,side,w.time):null;const context={performer:w.speechMode==='observer'?'empress':side,...(w.speechMode==='observer'?{commentator:{recentSpoken:observerSpoken(w)}}:{}),interactionRules:{rescue:'观众部队无轮数限制，换代不补血。最近60秒阵亡可救援；有阵亡时，B站付费礼物照常派兵并按实付价值累积救援点，1元=100点。每兵复活费是原入场价值的一半，再按等级与复活次数增加；先救付得起的低价兵，余点保留到本次直播重置。报价只使用rescue字段，不编造金额。免费或背包礼物不加救援点。弹幕复活只查询本人进度，不会免费复活；不可宣称一朵小花复活全军。',broadcastMode:broadcastMode(this),factions:broadcastMode(this)==='bilibili-first'?'在B站发送完整弹幕加入人族或加入魔族即可选择阵营；发自立门户可创建自己的两字门户及头像将军，将军只有一命；发加入某族或加入某族#编号可以加入现存门户。独立阵营与其他所有阵营敌对，参战与礼物归属自己的门户，立即决定后续弹幕指挥和新增援军的归属；已在场的旧部队不会叛变。选择阵营是可选的；首次互动未选阵营时分到近5分钟活跃玩家人数较少的一方，人数相同随机分配。之后保持阵营，只有明确选边才切换；人数按观众算，不按小兵或系统军算。问能不能选边时明确说明可以，不能否认这项已实现规则。':'双平台模式由平台决定阵营；B站魔族、小红书人族。',events:{incantations:WAR_INCANTATIONS,rule:`完整咒语弹幕单独触发，不需要再送礼。每人${WAR_INCANTATION_COOLDOWN_MS/1000}秒、同阵营${WAR_INCANTATION_SIDE_COOLDOWN_MS/1000}秒冷却。带事件标记的小礼物也可独立释放对应事件，同时照常派兵。两族事件以对方阵地为中心，附近友军也会受伤；独立门户的事件以最近敌将为中心，对其他所有阵营生效，不伤本门户部队。`},giftBudget:`画面只展示6种礼物，单件不超过${BILI_GIFT_PRICE_LIMIT/1000}元；免费参战和免费咒语同样可用，不引导购买超过此限额的礼物或多件凑价。`,giftTroops:BILI_GIFT_ROSTER.filter(g=>BILI_QUICK_GIFTS.includes(g.name)).map(g=>({gift:g.name,reward:GIFTS[g.reward].name,bonus:g.bonus?GIFTS[g.bonus].name:null})),opponent:broadcastMode(this)==='bilibili-first'?'人族由系统军和自愿加入的真实玩家共同支援。系统军不是观众，不曾刷礼物；不可编造人气、赠礼或玩家留言。':'双方由各平台观众支援。',crowns:{worn:rite?.started&&!rite.worn?1:crownCount(h),inherited:rite?.entry.count||Math.max(0,h.rank),onGround:rite&&!rite.worn&&w.time>=rite.cutAt?rite.entry.count:0,action:rite?.started?(rite.worn?'wearing_inherited_crowns':'picking_up_crowns'):'none'},enlist:'每发送一条参战弹幕，免费派出一名剑士，没有冷却；不同消息分别派兵，同一平台消息的重复回调只计算一次。礼物派兵不变；只有裸词参展也按同音参战处理。',commands:'1前进，2后退，3攻击，4守护，5拾取附近护盾、治疗、狂怒等补给；只指挥发送者自己的军队。',summoning:'实际派兵和赠礼由引擎执行，台词不能召唤或改数值。'},duologue:dramaContext(w),playerWar:{clans:Object.values(w.clans||{}).map(c=>({name:c.name,number:c.number,founder:c.founder.name,status:c.status,hp:w.units.find(u=>u.id===c.leaderId)?.hp||0,join:'加入'+c.name+'#'+c.number})),barracks:(w.barracks||[]).filter(b=>b.hp>0).slice(0,8).map(b=>({side:b.side,...factionFields(b),owner:b.supporter.name,x:b.x,y:b.y,hp:b.hp,reserve:b.reserve,status:b.status})),events:(w.warEvents||[]).slice(-3).map(e=>({kind:e.kind,by:e.owner.name,side:e.actorSide,targetSide:e.targetSide,at:e.at}))},conversationMode:conversationMode(selected),retinue:legacyAvailability(w,side),campaign:w.campaign?{front:w.campaign.front,stage:w.campaign.stage,alarmVersion:w.campaign.alarmVersion?.[side]||0,response:w.campaign.responses?.[side],order:w.campaign.orders?.[side],signals:w.campaign.signals,number:w.campaign.number||1,homeWins:w.campaign.homeWins,conquest:w.campaign.conquest?{winner:w.campaign.conquest.winner,loser:w.campaign.conquest.loser,redeployed:w.campaign.conquest.redeployed}:null,lastConquest:w.campaign.lastConquest,retreatCost:'后撤会失去粮仓和兵工坊；两处失守8秒后战线退向家乡。最末防线失守则输掉本次战役，12秒结算后幸存部队在边境再战，首领身份和所有伤势不变，不是首领死亡或换代',sites:w.campaign.sites.map(p=>({id:p.id,assault:p.assault,presence:p.presence,kind:p.kind,owner:p.owner,controller:p.controller,x:p.x,y:p.y,contested:p.contested,progress:p.progress})),pending:w.campaign.pending}:null,rescue:rescueSnapshot(this).filter(r=>r.side===side&&(!selected?.supporter?.id||r.ownerId===selected.supporter.id)).slice(0,3),audience:{selected,prefetch,pacing:replyPacing(this),relationships:relationshipContext(this,side,selected?(requestedAudience||audienceState(this).active[side])?.supporter:null,requestedAudience),recent:[]},side,persona:h.id,epoch:this.meta.epoch,round:w.round,at:w.time,name:h.name,rank:h.rank,hp:Math.round(h.hp),maxHP:h.maxHP,position:{x:Math.round(h.x),y:Math.round(h.y)},commanderBuffs:Object.fromEntries(Object.entries(h.commanderBuffs||{}).map(([k,b])=>[k,{remainingMs:Math.max(0,b.until-w.time)}])),lastSupport:h.lastSupport?.until>w.time?h.lastSupport:null,skillReadyInMs:Math.max(0,(h.skillReadyAt||0)-w.time),enemy:{name:enemy.name,rank:enemy.rank,hp:Math.round(enemy.hp),maxHP:enemy.maxHP,x:Math.round(enemy.x),y:Math.round(enemy.y),distance:Math.round(Math.hypot(h.x-enemy.x,h.y-enemy.y))},ownPopulation:w.population(side),enemyPopulation:w.population(enemy.side),front:w.front(side),mission:h.mission,objectives:(w.objectives||[]).filter(o=>!o.claimedBy).map(o=>({kind:o.kind,lane:o.lane,x:o.x,y:o.y,contested:o.contested,remainingMs:o.until-w.time})),units:[...groups.values()],hazards:w.hazards.filter(v=>Math.hypot(v.x-h.x,v.y-h.y)<600).slice(0,6).map(v=>({kind:v.kind,x:v.x,y:v.y,radius:v.radius,impactInMs:v.impact-w.time})),recent:this.meta.feed.filter(f=>f.side===side&&f.source==='system').slice(-3).map(f=>({source:f.source,text:f.text})),memory:this.meta.battleMemory?.[h.id]?.slice(-6)||[]};return fitRelationshipContext(context);}

 applyDecision(c,d,model){if(this.runtime.model&&this.runtime.model!==model)return false;if(this.world.generatedSpeechOnly&&!isCommanderModel(model))return false;const plainReply=!!c.audience?.selected&&d.audienceAction==='none';if(!SIDES.includes(c.side)||this.world.paused||this.world.mode==='inspection'||this.world.mode==='settlement'&&!plainReply||c.persona!==this.world.heroes[c.side].id||this.world.heroes[c.side].hp<=0||c.epoch<0||!plainReply&&(c.epoch!==this.meta.epoch||c.round!==this.world.round)||this.world.time-c.at>(plainReply?MODEL_REPLY_AGE_MS:20000))return false;
  if(d.strategy!==undefined&&!STRATEGIES.includes(d.strategy)||!TACTICS.includes(d.tactic)||!Number.isInteger(d.lane)||![0,1,2].includes(d.lane)||typeof d.speech!=='string'||d.speech.length>110||typeof d.memory!=='string'||d.memory.length>140)return false;
  const selected=c.audience?.selected;if(this.world.speechMode==='observer'&&(!selected||c.performer!=='empress'||d.audienceAction!=='none'))return false;if(!validSpeechTurn(d,selected,validConversationSpeech))return false;if(!selected&&c.campaign?.alarmVersion!==undefined&&c.campaign.alarmVersion!==(this.world.campaign?.alarmVersion?.[c.side]||0))return false;
  const target=selected?audienceItem(this,c.side,selected.id):null;
  if(selected&&(d.strategy!==undefined&&d.strategy!=='auto'||!target||target.phase!=='waiting_model'||!c.audience.prefetch&&selectedAudience(this,c.side)?.id!==selected.id||narrationExpired(this,target)||d.replyTo!==selected.id||!['none',selected.advice].includes(d.audienceAction)))return false;
  if(c.audience?.prefetch)return this.atomic(()=>storePreparedReply(this,c,d,model));
  return this.atomic(()=>{if(!selected&&(this.world.showDebate?.active||this.world.sceneSpeakingUntil>this.world.time||Object.values(this.world.audienceWaiting||{}).some(Boolean)||this.meta.audience?.pending?.length))d={...d,speech:'',continuations:[]};if(selected){if(!replyAudience(this,selected.id,d.speech,{model,action:d.audienceAction,continuations:d.continuations}))return false;}else{if(d.strategy&&d.strategy!=='auto')commandCampaign(this.world,c.side,d.strategy,{source:'model'});else if(d.strategy==='auto'&&this.world.campaign?.orders?.[c.side]?.source==='model')delete this.world.campaign.orders[c.side];this.world.command(c.side,d.tactic,d.lane);if(d.speech)publishMonologue(this.world,c.side,speechParts(d),model,{voice:this.runtime.voiceEnabled});}this.meta.personas=Object.fromEntries(SIDES.map(s=>this.world.heroes[s].id).map(id=>[id,this.meta.personas[id]||[]]));this.meta.personas={};this.meta.battleMemory=Object.fromEntries(SIDES.map(s=>this.world.heroes[s].id).map(id=>[id,this.meta.battleMemory?.[id]||[]]));if(!selected)this.meta.battleMemory[c.persona]=[...(this.meta.battleMemory[c.persona]||[]),{strategy:d.strategy||'auto',tactic:d.tactic,lane:d.lane,at:this.world.time}].slice(-6);this.meta.models[c.side]=model;this.meta.lastDecision[c.side]=this.world.time;if(!selected||d.audienceAction?.includes('_')){this.meta.lastCommand??={};this.meta.lastCommand[c.side]={persona:c.persona,at:this.world.time,model,strategy:selected?d.audienceAction:d.strategy||'auto',tactic:d.tactic,lane:d.lane};}return true;});
 }
 snapshot(){const observerRevision=syncDebate(this.world).observerRevision||0;return {...this.world.snapshot(),speechMode:this.world.speechMode,mediaSession:this.mediaSession,observerRevision,rescues:rescueSnapshot(this),feedback:feedbackSnapshot(this),viewerEvents:viewerNoticesSnapshot(this),broadcastSetup:modeStatus(this),audience:audienceSnapshot(this),interaction:{points:this.meta.points,queue:SIDES.reduce((a,s)=>(a[s]=this.meta.queue.filter(q=>q.side===s).reduce((n,q)=>n+q.remaining,0),a),{}),feed:this.meta.feed,liveEnabled:this.meta.liveEnabled},models:SIDES.reduce((a,s)=>(a[s]=this.world.time-(this.meta.lastDecision[s]??-1e9)<60000?this.meta.models[s]:'offline_rules',a),{})};}
 receiptStatus(){return this.db.prepare('SELECT id,platform,at,status,payload FROM receipts ORDER BY at DESC,rowid DESC LIMIT 50').all().map(row=>{const e=JSON.parse(row.payload);return {id:row.id,platform:row.platform,at:row.at,status:row.status,kind:e.kind,name:e.supporter?.name||'观众',giftId:e.giftId||null,quantity:e.quantity||null,applied:e.fulfillment?.applied||0,source:e.transport?.source||null};});}
 ownerStatus(){return {rescues:rescueSnapshot(this),broadcast:modeStatus(this),replyTrace:this.meta.replyTrace||null,revivable:this.world.fallenTroops.filter(u=>!u.reservedBy&&!serviceExpired(this.world,u)&&this.world.time-u.at<=60000).map(u=>({ownerId:u.ownerId,side:u.side,remainingMs:Math.max(0,60000-(this.world.time-u.at))})),audience:audienceSnapshot(this),mappings:this.meta.mappings,receipts:this.db.prepare('SELECT status,COUNT(*) AS count FROM receipts GROUP BY status').all(),unmapped:this.db.prepare("SELECT payload FROM receipts WHERE status='unmapped' ORDER BY at DESC LIMIT 20").all().map(r=>{const e=JSON.parse(r.payload);return {platform:e.platform,giftId:e.giftId,quantity:e.quantity};}),liveEnabled:this.meta.liveEnabled};}
 close(){this.checkpoint();this.db.close();}
}
