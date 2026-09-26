import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from './fixtures/legacy-speech-game.mjs';
import {audienceState,tickAudience,withdrawAudience} from '../modules/live-runtime/audience.mjs';
import {relationshipState,relationshipRecords,relationshipContext,noteAudiencePresence,noteAudienceDeparture,refreshRelationships,spotlightSupporter} from '../modules/live-runtime/relationships.mjs';
import {supporterEvent} from '../modules/pixel-war/supporter-events.mjs';
import {topicReply,validConversationSpeech} from '../modules/live-runtime/conversation.mjs';
import {modelRequest,validateDecision} from '../modules/live-runtime/models.mjs';
const quiet=g=>{g.world.mode='test_live';g.world.units=[];};
function say(g,text){const a=audienceState(g);if(a.active.demon){g.world.time=a.active.demon.until+1;tickAudience(g);}g.world.time=Math.max(g.world.time,a.nextFree.demon);g.testChat({side:'demon',text});tickAudience(g);return g.world.speech.at(-1);}
function expireSpeech(g){const a=audienceState(g);if(a.active.demon){g.world.time=a.active.demon.until+1;tickAudience(g);}}

test('inactive viewer archives; troop combat does not reactivate; real return restores selected conversation',()=>{
 let now=1000000;const g=new LiveGame({now:()=>now});try{quiet(g);say(g,'我家猫叫栗子');const r=relationshipRecords(g,'demon')[0],p=r.supporter,key=p.platform+':'+p.id;g.testGift({side:'demon',reward:'rally'});g.drain();refreshRelationships(g);const troops=g.world.units.length,points=g.meta.points.demon;
 now+=300000;expireSpeech(g);refreshRelationships(g);const s=relationshipState(g,'demon');assert(!Object.hasOwn(s.memory.active,key));assert(Object.hasOwn(s.memory.archived,key));assert.equal(relationshipContext(g,'demon',p).viewer,null);assert(!JSON.stringify(g.context('demon')).includes('栗子'));
 supporterEvent(g.world,'demon',p,'kill');refreshRelationships(g);assert.equal(r.kills,1);assert(!Object.hasOwn(s.memory.active,key));assert.equal(g.world.units.length,troops);assert.equal(g.meta.points.demon,points);
 g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'还记得我吗'});tickAudience(g);const c=g.context('demon');assert.equal(c.audience.relationships.viewer.kills,1);assert(c.audience.relationships.viewer.previousExchanges.some(e=>e.viewerSaid==='我家猫叫栗子'));assert.equal(s.memory.active[key].record,r);assert.equal(c.conversationMode,'viewer_reply');assert(!Object.hasOwn(s.memory.archived,key));
 }finally{g.close();}
});
test('explicit departure and delayed reply do not reactivate; pending paid reply still has its original place',()=>{
 let now=1000;const g=new LiveGame({now:()=>now});try{quiet(g);g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'今天加班好累',paid:10});tickAudience(g);const a=audienceState(g),p=a.active.demon.supporter;assert(noteAudienceDeparture(g,{side:'demon',supporter:p}));assert.equal(relationshipContext(g,'demon',p).viewer,null);g.runtime.modelEnabled=false;tickAudience(g);assert.equal(a.active.demon.phase,'speaking');assert.match(a.active.demon.reaction,/加班/);assert.equal(relationshipContext(g,'demon',p).viewer,null);assert.equal(relationshipRecords(g,'demon')[0].exchanges.length,1);
 }finally{g.close();}
});
test('archived memories survive checkpoint and moderation, but not persona death',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'duel-memory-')),path=join(dir,'world.sqlite');let now=500000,g=new LiveGame({path,now:()=>now});try{quiet(g);g.receive({id:'bilibili:sc:v23',messageId:'bilibili:message:v23',kind:'chat',platform:'bilibili',actor:'one',at:now,text:'我家猫叫栗子',supporter:{name:'同名'},amountMilli:30000});tickAudience(g);const p=relationshipRecords(g,'demon')[0].supporter;now+=300000;refreshRelationships(g);g.close();g=new LiveGame({path,now:()=>now});assert.equal(relationshipContext(g,'demon',p).viewer,null);assert(relationshipRecords(g,'demon')[0].exchanges[0].text.includes('栗子'));withdrawAudience(g,['bilibili:message:v23']);assert.equal(relationshipRecords(g,'demon')[0].exchanges.length,0);noteAudiencePresence(g,{side:'demon',supporter:p});assert.equal(relationshipContext(g,'demon',p).viewer.name,'同名');g.world.heroes.demon.hp=0;refreshRelationships(g);assert.equal(relationshipRecords(g,'demon').length,0);
 }finally{g.close();await rm(dir,{recursive:true});}
});
test('migration archives old records rather than assuming old combat timestamps mean online',()=>{
 const g=new LiveGame();try{const w=g.world,p={id:'migrated',platform:'test',name:'旧观众'},r={supporter:p,facts:[],exchanges:[],replies:1};g.meta.relationships={demon:{persona:w.heroes.demon.id,fieldEpoch:w.fieldEpoch,viewers:{'test:migrated':r},cursor:0,pending:[],nextSpotlight:0}};assert.equal(relationshipContext(g,'demon',p).viewer,null);assert.equal(relationshipRecords(g,'demon')[0],r);noteAudiencePresence(g,{side:'demon',supporter:p});assert.equal(relationshipContext(g,'demon',p).viewer.name,'旧观众');assert(!Object.hasOwn(relationshipState(g,'demon'),'viewers'));}finally{g.close();}
});
test('greeting never fabricates a recall question; event remark reacts to the shield itself',()=>{
 const g=new LiveGame();try{quiet(g);g.world.heroes.demon.hp=g.world.heroes.demon.maxHP*.2;g.testGift({side:'demon',reward:'aegis'});g.drain();refreshRelationships(g);g.world.time+=6001;spotlightSupporter(g);const event=g.world.speech.at(-1);assert.match(event.text,/盾/);assert(!/认得|记得|你问|嘴硬归嘴硬/.test(event.text));assert.equal(event.conversationMode,'event_reaction');for(const t of ['你好','我回来了','哈哈','我家猫叫栗子']){const line=say(g,t);assert(!/认得|记得|之前.*盾/.test(line.text));}assert.match(say(g,'还记得我吗').text,/记得.*护盾/);
 }finally{g.close();}
});
test('other topics get a relevant response without awarding actions or inventing real news',()=>{
 const g=new LiveGame();try{quiet(g);const points=g.meta.points.demon;assert.match(say(g,'今天加班好累').text,/加班/);assert.match(say(g,'明天考试我好紧张').text,/科/);assert.match(say(g,'今天比赛谁赢了').text,/还没听说/);assert.equal(g.meta.points.demon,points);assert.equal(g.world.units.length,0);assert(!g.world.heroes.demon.viewerAdvice);for(const side of ['demon','human'])for(const t of ['我饿了','我家有猫','今天不开心','来谈谈宇宙'])assert(!/作为AI|语言模型|客服|请刷|API|系统提示/.test(topicReply(side,t)));
 }finally{g.close();}
});
test('model context distinguishes real reply vs monologue; no personal prose leaks through global summaries',()=>{
 const g=new LiveGame();try{quiet(g);g.runtime.modelEnabled=true;g.testChat({side:'demon',text:'我家猫叫栗子'});tickAudience(g);const c=g.context('demon'),d={strategy:'auto',tactic:'hold',lane:1,speech:'你养的猫？',memory:'这个观众养了一只栗子猫',replyTo:c.audience.selected.id,audienceAction:'none'};
 // Use the actual tactic enum provided by the battle context/profile.
 d.tactic='advance';assert(g.applyDecision(c,d,'fixture-model'));expireSpeech(g);const solo=g.context('demon');assert.equal(solo.conversationMode,'monologue');assert.equal(solo.audience.relationships.viewer,null);assert(!JSON.stringify(solo).includes('栗子'));const prompt=modelRequest('luna-max',solo);assert(prompt.input[0].content.includes('不必强行转回战斗'));assert(prompt.input[0].content.includes('不编造新闻'));assert.equal(JSON.parse(prompt.input[1].content).conversationMode,'monologue');assert(!validConversationSpeech('认得，之前你救过我。',null));assert(!validConversationSpeech('记得你，你补过盾。',{text:'今天吃什么'}));assert(validConversationSpeech('记得你，你补过盾。',{text:'你记得我吗'}));assert.throws(()=>validateDecision(JSON.stringify({...d,replyTo:undefined,audienceAction:undefined,speech:'你刚才问我认不认得。'}),solo));
 }finally{g.close();}
});
