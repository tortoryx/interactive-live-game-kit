import {connectionLabel,replyReceipt,modelReasonText} from './reply-status.mjs';
import {installGiftPicker} from './gift-picker.mjs';
import {TEST_VIEWERS} from './chat-commands.mjs';
import {GIFTS} from './gifts.mjs';
import {deploymentFeedback,battleModeLabel} from './deployment-feedback.mjs';
const el=id=>document.getElementById(id),token=document.querySelector('meta[name="owner-token"]').content;
let side=new URLSearchParams(location.search).get('side')==='human'?'human':'demon',lane=1,state,noticeTimer,polling=false,lastChatId=null,receiptKey=null;
const trackedDeployments=new Map();
const labels=Object.fromEntries(Object.entries(GIFTS).map(([key,g])=>[key,[g.unit||g.dynamic||g.effect?g.description.split(' \u00b7 ')[0]:'统帅护盾',g.description.split(' \u00b7 ')[1]||g.name]]));
function notify(message){el('feedback').textContent=message;el('feedback').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el('feedback').hidden=true,3500);}
function trackDeployment(id,count,label){trackedDeployments.set(id,{id,count,label,key:null});renderDeployment();}
function renderDeployment(){if(!state)return;const updates=[];for(const [id,request] of trackedDeployments){const r=deploymentFeedback(state,request);if(r.key===request.key)continue;request.key=r.key;updates.push(r);if(r.done)trackedDeployments.delete(id);}if(!updates.length)return;notify(updates.map(r=>r.text).join('；'));if(updates.some(r=>r.done)){clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el('feedback').hidden=true,7500);}}
async function post(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify(data)});const out=await r.json();if(!r.ok)throw Error(r.status===403?'服务已重启，请刷新页面。':'当前操作未完成，请查看战局状态。');if(out.snapshot){state=out.snapshot;render();}return out;}
function render(){if(!state)return;document.querySelector('[data-side="human"]').textContent=state.broadcastSetup?.mode==='bilibili-first'?'B站 · 人族':'小红书 · 勇者';renderReply();renderDeployment();const mine=state.units.filter(u=>u.side===side&&u.hp>0&&u.supporter?.name===TEST_VIEWERS[el('viewer').value]&&u.source==='test');el('myArmy').textContent='我的部队 '+mine.length+' 人'+((state.barracks||[]).some(b=>b.hp>0&&b.supporter?.name===TEST_VIEWERS[el('viewer').value]&&b.side===side)?' · 兵营 '+state.barracks.filter(b=>b.hp>0&&b.supporter?.name===TEST_VIEWERS[el('viewer').value]&&b.side===side).length+' 座':'');el('pause').textContent=state.paused?'继续':'暂停';el('status').textContent=battleModeLabel(state);const retinue=state.legacies?.[side],rb=document.querySelector('[data-reward=retinue]');if(rb){rb.disabled=!retinue;rb.querySelector('strong').textContent=retinue?retinue.count+' × '+retinue.name:'本代援军 · 等待长辈';rb.querySelector('span').textContent=retinue?retinue.skill:'长辈登场后解锁';}const i=state.interaction;if(i)el('queue').textContent=(side==='demon'?'魔族':'勇者')+' · 军团 '+i.points[side]+' 点'+(i.queue[side]?' · '+i.queue[side]+' 份援军排队':' · 点击即可派兵');}
function chooseSide(next){if(next!==side){trackedDeployments.clear();lastChatId=null;receiptKey=null;el('chatStatus').textContent='弹幕由魔女解说回应';el('chatStatus').title='';el('chatStatus').dataset.kind='waiting';el('feedback').hidden=true;}side=next;el('reinforceTarget').textContent=side==='demon'?'为魔族派兵':'为勇者派兵';document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===side)));const url='http://127.0.0.1:4390/?side='+side+'&operator=1';if(el('stage').src!==url)el('stage').src=url;el('stage').title=(side==='demon'?'魔族':'勇者')+'战场';history.replaceState(null,'','/?side='+side);render();}
document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>chooseSide(b.dataset.side));document.querySelectorAll('[data-lane]').forEach(b=>b.onclick=()=>{lane=Number(b.dataset.lane);document.querySelectorAll('[data-lane]').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.lane)===lane)));});
for(const [key,g] of Object.entries(GIFTS)){const b=document.createElement('button');b.dataset.reward=key;b.dataset.group=g.group||({longbow:'archery',arrows:'archery',titan:'siege',breaker:'siege',raid:'light',arcane:'support',mercy:'support',aegis:'support'}[key]||'frontline');const name=document.createElement('strong'),desc=document.createElement('span');name.textContent=labels[key][0];desc.textContent=labels[key][1];b.title=g.description+'；免费测试，不扣费';b.append(name,desc);b.onclick=async()=>{try{const sentSide=side,sentLane=lane;const result=await post('/owner/gift',{side:sentSide,reward:key,lane:sentLane,viewer:el('viewer').value,id:'test:'+crypto.randomUUID()});if(result.interaction?.status==='event_triggered'){notify(result.interaction.message);return;}if(key==='revive'){notify(result.status==='no_fallen_troops'?'最近一分钟没有可复活的部队':'全军复活已受理');return;}if(g.unit||g.dynamic)trackDeployment(result.id,g.dynamic?(state.legacies?.[sentSide]?.count||1):(g.count||1),labels[key][0]);else notify(labels[key][0]+' 已受理');}catch(e){notify(e.message);}};el('gifts').append(b);}
el('pause').onclick=()=>post('/action',{type:'pause'}).catch(e=>notify(e.message));el('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{notify('此浏览器不支持全屏，可使用窗口最大化。');}};
async function poll(){if(polling)return;polling=true;try{const r=await fetch('/state');if(!r.ok)throw Error();state=await r.json();render();}catch{el('status').textContent='连接中断';}finally{polling=false;}}
chooseSide(side);await poll();setInterval(poll,700);

window.addEventListener('pointerdown',e=>{if(!e.target.closest('#audioControl,#musicControl'))el('stage').contentWindow.postMessage({type:'game-interaction'},'http://127.0.0.1:4390');});

document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>sendChat(b.dataset.command));


async function connectionStatus(){try{const s=await post('/owner/status',{}),m=s.connections.models||{},label=connectionLabel(s,side);el('connection').textContent=label.text;el('connection').dataset.tone=label.tone;el('connection').title=label.title+' 已完成 '+(m.calls||0)+' 次；本小时尝试 '+(m.hourCalls||0)+'/'+(m.hourLimitCalls||'—')+'，24 小时尝试 '+(m.dayCalls||0)+'/'+(m.dayLimitCalls||'—')+'。'+(m.quota?.length?'订阅剩余 '+Math.min(...m.quota.map(q=>q.remainingPercent))+'%。':'')+'直播消息'+(s.connections.bilibili?.state==='authenticated'?'已连接 B站。':'尚未接通。');}catch{el('connection').textContent='AI 状态未知';el('connection').dataset.tone='paused';}}

await connectionStatus();setInterval(connectionStatus,5000);
async function sendWarGift(reward){try{await post('/owner/gift',{side,reward,viewer:el('viewer').value,lane,id:'test:'+crypto.randomUUID()});notify(GIFTS[reward].name+' 已受理 · 归属当前试玩身份');}catch{notify('尚未受理，请检查战场连接');}}
el('meteor').onclick=()=>sendWarGift('meteorstorm');
el('wildlife').onclick=()=>sendWarGift('beastRaid');

const statuses={recruited:'已派出 1 名剑士，可继续发参战或用 1 / 2 / 3 / 4 / 5 指挥',recruit_cooldown:'参战尚未受理，你仍可指挥已有部队',commanded:'已指挥',no_troops:'你还没有存活部队；派援军后即可免费指挥',command_cooldown:'指令太快，稍等一秒',battle_paused:'战斗暂停中',message_queued:'留言已排队',queue_full:'留言太多，本条未进入朗读队列',rejected_text:'这条留言不适合在战场显示'};
function renderReply(){const r=replyReceipt(state,lastChatId);if(!r)return;el('chatStatus').textContent=r.text;el('chatStatus').title=r.detail||r.text;el('chatStatus').dataset.kind=r.kind;const key=lastChatId+':'+r.kind;if(r.final&&key!==receiptKey){receiptKey=key;notify(r.text);}}
async function sendChat(text){const id='test:'+crypto.randomUUID();lastChatId=id;receiptKey=null;try{const r=await post('/owner/chat',{side,text,viewer:el('viewer').value,id}),i=r.interaction;el('chatStatus').textContent=i?.status==='recruit_cooldown'&&i.remainingMs?'还剩 '+Math.ceil(i.remainingMs/1000)+' 秒，可以继续指挥已有部队':i?.message||(i?.status==='commanded'?'已指挥你的 '+i.count+' 名士兵':statuses[i?.status]||statuses[r.status]||'已收到');el('chatStatus').title=el('chatStatus').textContent;el('chatStatus').dataset.kind='waiting';if(r.status==='recruited')trackDeployment(id,i?.count||1,'你的剑士');if(r.status==='message_queued'){const available=r.replyCapability?.available;el('chatStatus').textContent=available?'已排队 · 等待 解说 AI 抽选':'AI 暂停 · 本条暂无回复';el('chatStatus').title=available?'免费留言按队列抽选，收到回复后显示来源。':modelReasonText(r.replyCapability?.reason);if(!available)notify('解说 AI 未调用：'+modelReasonText(r.replyCapability?.reason));}renderReply();}catch{el('chatStatus').textContent='弹幕未发送';el('chatStatus').title='限 80 字，不接受链接或电脑操作';notify('弹幕未发送，请检查输入或连接。');}}
el('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=el('chatText'),value=input.value;if(!value.trim())return;await sendChat(value);input.value='';});
el('viewer').onchange=()=>{lastChatId=null;receiptKey=null;el('chatStatus').textContent=TEST_VIEWERS[el('viewer').value]+'：礼物与指令都绑定此身份';render();};

const eventMenu=el("eventMenu");el("surprises").onclick=()=>{eventMenu.hidden=!eventMenu.hidden;el("surprises").setAttribute("aria-expanded",String(!eventMenu.hidden));};
document.querySelectorAll("[data-surprise],[data-disaster],[data-support]").forEach(b=>b.onclick=async()=>{eventMenu.hidden=true;el("surprises").setAttribute("aria-expanded","false");await sendWarGift(b.dataset.support||(b.dataset.disaster?'rift':({supply:'supplyDrop',bloodmoon:'bloodrite',storm:'tempest'})[b.dataset.surprise]));});

document.querySelectorAll('[data-campaign]').forEach(b=>b.onclick=()=>post('/action',{type:'campaign',side,kind:b.dataset.campaign}).then(()=>notify('首领已转移部署目标，镜头会跟随他前往。')).catch(e=>notify(e.message)));

for(const [key,name] of Object.entries({legacy:'本代援军',gunpowder:'枪械 / 爆破',siege:'巨人 / 攻城',archery:'弓箭 / 重弩',light:'轻装 / 机动',frontline:'步兵 / 重甲',support:'法术 / 支援',construction:'玩家兵营',events:'大型事件'})){const b=document.createElement('button');b.textContent=name;b.dataset.unitGroup=key;b.onclick=()=>{for(const x of el('unitGroups').children)x.setAttribute('aria-pressed',String(x===b));for(const x of el('gifts').children)x.hidden=x.dataset.group!==key;};el('unitGroups').append(b);}el('unitGroups').querySelector('[data-unit-group=frontline]').click();

for(const [id,type]of [['audioControl','audio-toggle'],['musicControl','music-toggle']])el(id).onclick=()=>el('stage').contentWindow.postMessage({type},'http://127.0.0.1:4390');

installGiftPicker({side:()=>side,viewer:()=>el('viewer').value,lane:()=>lane,post,notify,openButton:el('allGifts')});

// The visible owner controls reflect the actual iframe audio state.
window.addEventListener('message',e=>{
 if(e.source!==el('stage').contentWindow||e.origin!=='http://127.0.0.1:4390'||e.data?.type!=='game-audio-state')return;
 const on=e.data.on===true,music=on&&e.data.music===true;
 el('audioControl').textContent=on?(e.data.signal?'声音有输出':'声音已开 · 暂无信号'):'开启声音';el('audioControl').setAttribute('aria-pressed',String(on));
 el('audioControl').title=on?(e.data.error?'语音播放失败，音乐与战斗音效单独检测；点击静音':e.data.signal?'已检测到游戏音频信号；直播端仍需检查采集电平':'音频通道已开启，正在等待实际声音信号；点击静音'):'点击开启魔女语音、战斗音效';
 el('musicControl').textContent=music?'音乐已开':'音乐未开';el('musicControl').setAttribute('aria-pressed',String(music));
});

// Only our own game iframe may report a numeric viewport; no viewer text or
// game action is accepted by this path. Broadcast telemetry takes precedence.
window.addEventListener('message',e=>{
 if(e.source!==el('stage').contentWindow||e.origin!=='http://127.0.0.1:4390'||e.data?.type!=='game-viewport')return;
 const {x,y,w,h,field}=e.data;void post('/owner/view',{x,y,w,h,field,side}).catch(()=>{});
});
window.addEventListener('message',e=>{
 if(e.source!==el('stage').contentWindow||e.origin!=='http://127.0.0.1:4390'||e.data?.type!=='game-presentation')return;
 const {id,field,persona,event}=e.data;if(!Number.isSafeInteger(id)||!Number.isSafeInteger(field)||typeof persona!=='string'||!['started','ended','failed'].includes(event))return;
 void post('/owner/presentation',{id,field,persona,event}).catch(()=>{});
});
