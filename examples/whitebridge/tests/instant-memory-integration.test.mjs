import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {tickAudience,voiceCompleted,withdrawAudience} from '../modules/live-runtime/audience.mjs';
import {relationshipContext,noteAudienceDeparture} from '../modules/live-runtime/relationships.mjs';
import {nextModelWork} from '../modules/live-runtime/model-work.mjs';
import {DecisionSchedule} from '../modules/live-runtime/decision-schedule.mjs';
import {modelRequest} from '../modules/live-runtime/models.mjs';
const model='chatgpt-web/light';
function enable(g,voice=false){g.world.paused=false;g.world.mode='test_live';g.runtime={model,modelEnabled:true,voiceEnabled:voice};}
function incoming(g,text,viewer='owner-test',side='demon'){g.testChat({side,text,viewer});tickAudience(g);return g.context(side);}
function reply(g,c,text){return g.applyDecision(c,{strategy:'auto',tactic:'advance',lane:1,speech:text,continuations:[],memory:'',replyTo:c.audience.selected.id,audienceAction:'none'},model);}
test('published exchange survives active expiry and restart; fresh request gets paired historical evidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'live-viewer-history-')),path=join(root,'world.sqlite');let now=Date.UTC(2026,8,17),g=new LiveGame({path,now:()=>now});
 try{enable(g);const c=incoming(g,'我家猫叫芝麻，它把水杯推下去了');assert(reply(g,c,'芝麻这爪子挺准。水杯先往里挪点。'));const viewer=g.meta.audience.active.demon.supporter;
  noteAudienceDeparture(g,{side:'demon',supporter:viewer});assert.equal(relationshipContext(g,'demon',viewer).viewer,null);
  g.world.time+=120000;tickAudience(g);g.close();now+=30*86400000;g=new LiveGame({path,now:()=>now});enable(g);
  const back=incoming(g,'我那只猫叫什么？上次你怎么回的？');const history=back.audience.relationships.viewer.previousExchanges;
  assert(history.some(e=>e.viewerSaid.includes('芝麻')&&e.leaderReplied.includes('水杯')));assert(!history.some(e=>e.viewerSaid===back.audience.selected.text));assert(history.every(e=>/^2026-/.test(e.receivedAt)));
  const payload=JSON.parse(modelRequest('luna-max',back).input[1].content);assert(payload.audience.relationships.viewer.previousExchanges.some(e=>e.leaderReplied.includes('芝麻')));
  const other=incoming(g,'我养的猫叫什么？','viewer-b','human');assert.equal(other.audience.relationships.viewer.previousExchanges.length,0);
  g.world.heroes.demon=g.world.makeHero('demon',1);tickAudience(g);g.world.time+=120000;tickAudience(g);const next=incoming(g,'我养的猫叫什么？');assert.equal(next.audience.relationships.viewer.previousExchanges.length,0);
 }finally{g.close();rmSync(root,{recursive:true,force:true});}
});
test('TTS pending text is not remembered as delivered; withdrawn or unused continuation cannot become a past answer',()=>{
 const g=new LiveGame();try{enable(g,true);g.receive({id:'bilibili:history-one',messageId:'bilibili:message:history-one',kind:'chat',platform:'bilibili',actor:'history-one',at:Date.now(),text:'今天猫又闯祸了',supporter:{name:'小舟'}});tickAudience(g);const c=g.context('demon'),item=g.meta.audience.active.demon;
  assert(reply(g,c,'把桌边收一收，别让它再推了。'));
  const query={platform:item.supporter.platform,viewerId:item.supporter.id,side:'demon',persona:c.persona,text:'猫',now:Date.now()};
  assert.equal(g.viewerHistory.recall(query)[0].leaderReplied,null);
  voiceCompleted(g,g.world.speech.at(-1),{audioUrl:'/voice/test.wav',durationMs:4000});assert.match(g.viewerHistory.recall(query)[0].leaderReplied,/桌边/);
  withdrawAudience(g,['bilibili:message:history-one']);assert.equal(g.viewerHistory.recall(query).length,0);
 }finally{g.close();}
});
test('sampled free messages remain locally recorded as unanswered; commands do not create fictional replies',()=>{
 const g=new LiveGame();try{enable(g);g.testChat({side:'demon',text:'我的猫叫毛球'});g.testChat({side:'demon',text:'我的狗叫馒头'});g.testChat({side:'demon',text:'3'});tickAudience(g);const c=g.context('demon');assert(c.audience.relationships.viewer.previousExchanges.some(e=>e.viewerSaid==='我的猫叫毛球'&&e.leaderReplied===null));}finally{g.close();}
});
test('waiting viewer wins while background is occupied and blocks speculative replacement background',()=>{
 const g=new LiveGame();try{enable(g);incoming(g,'你是谁');g.world.audienceWaiting={demon:true};const s=new DecisionSchedule(),models={transport:'electron'};
 assert.equal(nextModelWork(g,s,100000,models,{backgroundBusy:true}).side,'demon');
 assert.equal(nextModelWork(g,s,101000,models,{backgroundBusy:true,excludeSides:['demon']}),null);
 }finally{g.close();}
});
