import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveGame} from '../modules/live-runtime/game.mjs';
import {assignBiliFaction} from '../modules/live-runtime/broadcast-mode.mjs';
import {playMenu} from '../modules/live-runtime/play-menu.mjs';
import {PLATFORM_GIFTS} from '../modules/live-runtime/gift-catalog.mjs';
import {BILI_GIFT_ROSTER,withinBiliGiftBudget} from '../modules/pixel-war/public/bili-gift-roster.mjs';
import {quickGiftRows} from '../modules/pixel-war/public/gift-legend.mjs';
const packet=(actor,id,text='参战')=>({id:'bilibili:'+id,platform:'bilibili',actor,at:1800000000000,kind:'chat',text,supporter:{name:actor}});
const saved=(g,id)=>JSON.parse(g.db.prepare('SELECT payload FROM receipts WHERE id=?').get('bilibili:'+id).payload);
test('new viewers alternate to the smaller active faction; repeated messages, duplicate receipts and restore retain their side',()=>{
 let now=1800000000000;const g=new LiveGame({now:()=>now});try{g.configureBroadcast('bilibili-first');
 const counts={human:0,demon:0};
 for(let i=0;i<20;i++){g.receive(packet('v'+i,'join'+i));counts[saved(g,'join'+i).side]++;assert(Math.abs(counts.human-counts.demon)<=1);}
 const old=saved(g,'join0');g.restore(g.capture());assert(g.receive(packet('v0','join0')).duplicate);
 now+=1000;g.receive(packet('v0','again','你是谁'));assert.equal(saved(g,'again').side,old.side);
 const other=old.side==='human'?'demon':'human';g.receive(packet('v0','switch','加入'+(other==='human'?'人族':'魔族')));g.receive(packet('v0','gift'));assert.equal(saved(g,'gift').side,other);assert.equal(g.meta.queue.find(q=>q.receipt==='bilibili:join0').side,old.side);
 }finally{g.close();}
});
test('auto balance excludes departed/inactive people and system troops; random tie branches work without reallocating returns',()=>{
 let now=1800000000000;const g=new LiveGame({now:()=>now});try{const e=(id,kind='chat',text='参战')=>({supporter:{id},kind,text});
 assert.equal(assignBiliFaction(g,e('a'),()=>1),'human');assert.equal(assignBiliFaction(g,e('b'),()=>1),'demon');
 assignBiliFaction(g,e('a','leave'));assert.equal(assignBiliFaction(g,e('c'),()=>0),'human');
 now+=301000;assert.equal(assignBiliFaction(g,e('d'),()=>0),'demon');assert.equal(assignBiliFaction(g,e('a'),()=>0),'human');
 assert.equal(assignBiliFaction(g,e('a','chat','加入魔族')),'demon');
 }finally{g.close();}
});
test('current panel enforces inclusive 30 RMB ceiling and six distinct real quick gifts; other paid receipts are still fulfilled',()=>{
 const g=new LiveGame();try{const gifts=BILI_GIFT_ROSTER.map(r=>PLATFORM_GIFTS.bilibili.find(g=>g.name===r.name&&g.coinType==='gold'));
 const cruise=PLATFORM_GIFTS.bilibili.find(g=>g.name==='梦幻邮轮'),letter=gifts.find(g=>g.name==='情书');
 const rows=[...gifts.filter(g=>g.name!=='情书'),{...letter,price:30000},cruise,{...letter,id:'invalid',price:NaN}];g.meta.liveEnabled=true;const connections={bilibili:{state:'authenticated',roomId:42},giftPanels:{bilibili:{state:'ready',roomId:42,expiresAt:g.now()+1000,gifts:rows}}};
 const menu=playMenu(g,'demon',connections),quick=quickGiftRows(menu.gifts);assert.equal(quick.length,6);assert(menu.gifts.every(withinBiliGiftBudget));assert(quick.some(g=>g.price===30000));assert.equal(menu.giftPriceLimitMilli,30000);assert.equal(new Set(quick.map(g=>g.reward)).size,6);
 assert(!quickGiftRows([{...letter,price:30001}]).length);assert(!quickGiftRows([{...letter,price:NaN}]).length);
 const result=g.receive({...packet('paid','unadvertised'),kind:'gift',giftId:cruise.giftId,paid:true,amountMilli:cruise.price,quantity:1});assert.equal(result.status,'queued');assert(g.meta.queue.some(q=>q.receipt===result.id));
 }finally{g.close();}
});
