import {cueSpeech,tickLunaSpeech,speechState} from './luna-speech.mjs';
const other=s=>s==='demon'?'human':'demon';
function state(w){const d=w.warDrama??={};d.queue??=[];d.seenSupport??=[];d.history??=[];d.nextAt??=0;return d;}
function pair(w,kind,first,lines,receipt=null){const d=state(w),id=kind+':'+Object.values(w.heroes).map(h=>h.id).join(':')+(receipt?':'+receipt:'');d.queue.push(...[first,other(first)].map((side,i)=>({id:id+':'+i,side,persona:w.heroes[side].id,text:lines[i],kind,receipt})));d.queue=d.queue.slice(-6);}
export function onPlayerArrival(w,grant){if(!w.audienceBattle||!grant.supporter?.id)return;const d=state(w),key=w.heroes[grant.side].id;if(d.seenSupport.includes(key)){
 if(w.generatedSpeechOnly){d.reinforcements??={};const last=d.reinforcements[grant.side];if(last?.receipt===grant.receipt||last&&w.time-last.at<18000)return;
 const facts={owner:grant.supporter.name,reward:grant.key,receipt:grant.receipt};
 if(cueSpeech(w,grant.side,'reinforcement',facts,{priority:3,ttl:75000}))d.reinforcements[grant.side]={receipt:grant.receipt,at:w.time};
 }return;
 }d.reinforcements??={};d.reinforcements[grant.side]={receipt:grant.receipt,at:w.time};d.seenSupport=[...d.seenSupport,key].slice(-4);d.queue=d.queue.filter(q=>q.kind!=='opening');if(w.generatedSpeechOnly){const s=speechState(w);s.pending=s.pending.filter(q=>!['opening','opening_reply'].includes(q.cue));const facts={owner:grant.supporter.name,reward:grant.key,receipt:grant.receipt};cueSpeech(w,other(grant.side),'help_accuse',facts,{priority:3,ttl:75000});cueSpeech(w,grant.side,'help_boast',facts,{priority:3,ttl:75000});return;}const events={meteorstorm:['说好单挑，你连陨石都叫来了？','有本事你也叫，我又没拦着。'],beastRaid:['你往我身后放的什么东西？！','回头看看不就知道了。'],rift:['你这是打架还是拆地？','你站稳了再说话。'],tempest:['雷都往我这儿劈，你管这叫单挑？','别骂我，你先躲雷。'],supplyDrop:['单挑还带空投？','你也抢啊，我又没拦着。'],bloodrite:['你把月亮怎么了？','别光看天，挨打了。']};pair(w,'reinforcement',other(grant.side),events[grant.key]||['这还叫单挑？你居然摇人！','他自己来的。我人缘好，没办法。'],grant.receipt);}
export function tickWarDrama(w,{voice=false}={}){
 if(w.generatedSpeechOnly)return tickLunaSpeech(w,{voice});
 if(!w.audienceBattle||w.paused||['settlement','inspection'].includes(w.mode))return;
 const d=state(w),key=Object.values(w.heroes).map(h=>h.id).join(':');
 if(d.pair!==key){d.pair=key;d.queue=d.queue.filter(q=>q.kind==='reinforcement'&&q.persona===w.heroes[q.side].id);if(!d.queue.length)pair(w,'opening','demon',['就你？来，单挑。输了别喊人。','先管好你自己，别一挨打就叫你爹。']);d.nextAt=w.time+800;}
 d.queue=d.queue.filter(q=>q.persona===w.heroes[q.side].id&&w.heroes[q.side].hp>0);
 const previous=w.speech.find(s=>s.id===d.speaking);if(previous?.until>w.time||w.time<d.nextAt)return;
 if(Object.values(w.audienceSpeakingUntil||{}).some(t=>t>w.time))return;
 const next=d.queue.shift();if(!next)return;
 const line={...next,id:++w.serial,duologue:true,at:w.time,until:w.time+(voice?15000:5600),audio:null,spokenText:next.text,audioMode:voice?'synthesizing':'subtitle_only',conversationMode:'event_reaction',evidence:{kind:next.kind,receipt:next.receipt},model:null};
 w.speech.push(line);w.speech=w.speech.slice(-12);d.speaking=line.id;d.nextAt=line.until+350;w.sceneSpeakingUntil=line.until;
 d.history.push({id:line.id,side:line.side,kind:next.kind,text:line.text,receipt:next.receipt,at:w.time});d.history=d.history.slice(-4);
}
export function dramaContext(w){const d=state(w);return {recent:w.generatedSpeechOnly?speechState(w).history:d.history,rule:'这是两名角色之间已经发生的互呛，不是观众留言。可据真实援军、兵营和天灾接话；不要虚构礼物或付费。'};}
