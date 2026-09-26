import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionLabel} from '../modules/pixel-war/public/reply-status.mjs';
test('navigation interruptions are distinguished from login proof and uncertain prompts are not promised a replay',()=>{
 const label=connectionLabel({connections:{models:{transport:'electron',authenticated:true,pages:{ready:0,busy:0,preparing:0,failureKind:'navigation_interrupted'}}}});
 assert(label.text.includes('跳转中断'));assert(label.title.includes('尚未发送'));assert(label.title.includes('不重发结果不明'));
});
test('a usable new page clears the connection failure UI',()=>{
 const label=connectionLabel({connections:{models:{transport:'electron',authenticated:true,state:'ready',pages:{ready:1,busy:0}}},readiness:{ai:{available:true}}},'demon');
 assert.equal(label.text,'解说 AI · 对话可用');assert.equal(label.tone,'ready');
});
test('rate limiting takes priority over thinking, login and warming labels',()=>{
 const label=connectionLabel({connections:{models:{transport:'electron',authenticated:true,state:'electron_rate_limited',retryAt:Date.now()+300000,pages:{ready:0,busy:1,preparing:1,failureKind:'rate_limited'}}},readiness:{ai:{available:false}}});
 assert(label.text.includes('网页限流'));assert(!label.text.includes('思考'));assert(label.title.includes('暂停新对话'));
});
test('voice character cap is visible even while text model is usable',()=>{
 const label=connectionLabel({connections:{models:{state:'ready'},voice:{enabled:true,state:'character_budget_limit'}},readiness:{ai:{available:true}}});assert(label.text.includes('语音达到字符上限'));
});

test('provider unusual-activity restriction never masquerades as thinking or login expiry',()=>{
 const label=connectionLabel({connections:{models:{state:'electron_access_restricted',pages:{ready:3}}},readiness:{ai:{available:true}}});assert(label.text.includes('异常活动'));assert(!label.text.includes('思考'));assert(label.title.includes('尚未获得新对白'));
});
