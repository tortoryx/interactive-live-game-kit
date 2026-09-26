import test from 'node:test';import assert from 'node:assert/strict';
import {quickGiftRows,quickGiftLegend,BILI_QUICK_GIFTS} from '../modules/pixel-war/public/gift-legend.mjs';
test('Bili on-screen gift guide is fixed, small and restricted to actual supplied gifts',()=>{
 const rows=[...BILI_QUICK_GIFTS,'心动盲盒','小电视飞船'].map((name,i)=>({id:'bilibili:'+i,name,price:100,coinType:'gold',label:i<3?'基础 · 2 × 剑士':'礼物'+i,quality:{name:'基础',tier:1}}));
 rows.push({...rows[0],id:'bilibili:duplicate'});
 const guide=quickGiftLegend(rows);assert.equal(guide.flatMap(x=>x.gifts).length,6);assert(guide.every(row=>row.gifts.length===1));assert.equal(guide[0].label,'2 × 剑士');assert.deepEqual(quickGiftRows(rows).map(x=>x.name),BILI_QUICK_GIFTS);assert.deepEqual(quickGiftLegend(rows),guide);
 assert.deepEqual(quickGiftRows(rows.filter(x=>x.name==='小花花')).map(x=>x.name),['小花花']);assert.equal(quickGiftLegend([]).length,0);
});
