// Editorial memory belongs to the commentator, not to a leader's lifetime.
// Topics contain grounded facts/directions, never canned spoken lines.
const AMBIENT = [
 {id:'commitment',kind:'tactics',facts:'观众指挥的是自己的兵；一方人数多不代表已占领，玩家部队跨回合存活但不会回满血。',angle:'聊一支队伍什么时候该继续顶、什么时候值得保下来。拿一个明确的选择把理由讲透，也说明什么情况会让你改变主意；不是报地名，不念指令表。'},
 {id:'reinforcement_timing',kind:'tactics',facts:'援军入场后仍需走到交战位置；前排、远程、治疗有不同作用。多一支队伍不保证获胜。',angle:'聊增援为什么不是到了就能救场：挑前排保护、远程站位或治疗接应中的一个，讲清什么搭配才值得期待。只能谈可能性，不编已经发生的配合。'},
 {id:'retinue',kind:'tactics',facts:'观众可用1前进、2后退、3攻击、4守护、5补给指挥自己的兵。玩家部队能跨回合存活，换首领不会给它们回满血。',angle:'聊你自己会怎么保住一支打出感情的队伍，只挑一个选择，不念菜单，不假装已经替玩家操作。'},
 {id:'family',kind:'character',facts:'一方首领倒下后，由他的父亲来接班；上一任掉落的皇冠会被接班者捡起来继续叠戴。',angle:'像旁观熟人一样聊这家人的护短、面子或继承习惯，别重复描述观众能看见的皇冠，也别假装已经战败。'},
 {id:'soft_spot',kind:'character',facts:'你是旁观的魔女，没有军队的控制权。你可以有自己的好恶，也可以对打出感情的小兵心软。',angle:'聊自己在战斗里什么事最看不下去，或者舍不得放弃一支队伍的心情。别编一支不存在的队伍，别自问自答，别替观众表态。'},
 {id:'choice',kind:'invitation',facts:'观众每发一条参战，免费派出一名剑士，无冷却；可选人族或魔族，也可只聊天。',angle:'偶尔抛一个你自己真的感兴趣的阵营或救谁的选择，让观众接话。没人回答就别假装有人接话，不催礼物。'},
];
const EXTRA_ANGLES={
 commitment:['聊追到一半该不该停：追着首领走和保护自己的远程之间有什么取舍；不要假装当前正在追。','聊一支活下来的队伍在下一代还能派什么用场，同时把不回满血这件事带进选择里。'],
 reinforcement_timing:['聊近战到得比远程快时，为什么一味往前冲可能吃亏；不要假定眼前已经发生。','聊治疗兵能争取的是继续打的时间，什么时候还是得后撤；别保证必救得回来。'],
 retinue:['聊养出一支老兵后舍不舍得让它冲在前面；只是你的选择，不是假装有这支队伍。','从后退和补给里挑一个你会用的指令，说你为什么会舍不得这支队伍；不要念教学清单。'],
 family:['聊这家人接班时继承了什么烂摊子；只能根据已知家族设定，不虚构本轮结果。','聊你对这种父亲替儿子撑腰的做法有什么偏心；别解释皇冠梗。'],
 soft_spot:['聊自己更在意一场输赢还是一支活下来的队伍；说自己的选择，不讲道理。','从莽撞、嘴硬或护短里挑一个让你忍不住偏心的毛病；不要假称看到了新事件。'],
 choice:['偶尔聊你会选哪一边，再把话留给观众；没有回复就不自己接一个虚构答案。','选护住老兵还是继续往前冲这一个话题邀观众接话；不要求他送礼，也不替他选。'],
};
// A story is an entire prepared passage, never an isolated lore verdict.
const BRIDGE_STORY={
 id:'border-medicine',
 facts:'旧事：人类雷恩曾带药救两族居民；魔族维萨尔允许他过境；后来雷恩又奉命封桥征粮。未记载具体年份、病人姓名、双方当时对白或维萨尔后来的反应。',
 beats:[
  '从眼前的桥自然带入一件早年的过境旧事；介绍雷恩是带药救人的人类，维萨尔是放行的魔族。不能假定观众认识这两个名字。',
  '接着把事情讲清：雷恩带药救的是两族居民，维萨尔让他过境；后来雷恩奉命封桥征粮。不要把这件往事当成当前画面的事件。',
  '接前一句收住这个具体矛盾，可以说你自己的看法；不要新开话题、补一段道理或编人物的反应。'
 ]
};
function editorial(w){
 const m=w.commentatorEditorial??={topics:[],offered:[],turn:0};
 m.spoken??=[];m.readings??=[];m.topicTurns??={};m.storyOffers??=[];return m;
}
// Keep a baseline per subject, not an expiring permission to repeat its state.
// Small health jitter must not sound like a new crisis every few minutes.
function changedReading(previous,r){
 if(!previous)return true;
 if(r.kind==='leader_risk')return Math.abs(r.hpPercent-previous.hpPercent)>=10||
  (r.hpPercent<=10&&previous.hpPercent>10)||Boolean(r.shield)!==Boolean(previous.shield)||
  (r.guardsNear>0)!==(previous.guardsNear>0)||(r.enemiesNear>0)!==(previous.enemiesNear>0);
 if(r.kind==='objective')return r.controller!==previous.controller||r.attacker!==previous.attacker||
  Math.abs(r.capturePercent-previous.capturePercent)>=25||Math.sign(r.advantage)!==Math.sign(previous.advantage);
 return (r.enemiesNear>0)!==(previous.enemiesNear>0)||(r.guardsNear>0)!==(previous.guardsNear>0);
}
function fingerprint(r){
 if(r.kind==='leader_risk')return JSON.stringify([r.kind,r.id,Math.floor(r.hpPercent/10),r.enemiesNear>0,r.guardsNear>0,r.shield>0]);
 if(r.kind==='objective')return JSON.stringify([r.kind,r.id,r.controller,r.attacker,Math.floor(r.capturePercent/25),Math.sign(r.advantage)]);
 return JSON.stringify([r.kind,r.id,r.enemiesNear>0,r.guardsNear>0]);
}
const subject=r=>r.kind==='objective'?'objective:'+(r.name||r.id):r.kind+':'+(r.side||r.id);
export function chooseObserverTopic(w,scene,now){
 const m=editorial(w);m.topics=m.topics.filter(t=>now-t.at<600000).slice(-32);
 const available=(key,ms)=>!m.topics.some(t=>t.key===key&&now-t.at<ms);
 let selected;
 // In host-only mode the audience queue owns arrival reactions, including
 // their priority and receipt identity. Ambient sampling must not thank twice.
 const arrival=w.speechMode==='observer'?null:scene.analysis.arrivals.find(a=>a.gift&&available('arrival:'+a.receipt,600000));
 if(arrival)selected={key:'arrival:'+arrival.receipt,kind:'arrival',arrival,angle:'对这位刚到场的支援者说话，讲这次选择哪里有意思；不得假装这是他发来的问题。'};
 const battleStreak=m.topics.slice(-2).length===2&&m.topics.slice(-2).every(t=>t.kind==='battle');
 if(!selected){const r=scene.analysis.readings.find(r=>{
   const last=m.readings.find(p=>p.field===w.fieldEpoch&&p.reading.kind===r.kind&&p.reading.id===r.id);
   const urgent=r.kind==='leader_risk'&&r.hpPercent<=10&&(!last||last.reading.hpPercent>10);
   const takeover=r.kind==='objective'&&last&&r.controller!==last.reading.controller;
   const discussed=m.topics.filter(t=>t.subject===subject(r)),recent=discussed.at(-1);
   // A new site ID, camera shift or small capture swing is not a new topic.
   // Even actual captures get a short minimum gap; repeated grain contests
   // cannot consume every other commentary slot.
   const gap=urgent||r.kind==='leader_risk'?20000:takeover?45000:r.kind==='objective'?120000:60000;
   const budget=!recent||now-recent.at>=gap;
   return budget&&changedReading(last?.reading,r)&&(!last||urgent||now-last.at>=20000)&&(!battleStreak||urgent);
  });
  if(r){
   const previous=m.readings.find(p=>p.field===w.fieldEpoch&&p.reading.kind===r.kind&&p.reading.id===r.id);
   selected={key:fingerprint(r),subject:subject(r),kind:'battle',reading:r,previousReading:previous?.reading||null,angle:'接这个变化说出你现在的反应或判断。如果和刚才聊的是一件事，接着说结果有没有朝你想的方向走；无需每次完整分析，不重报画面和数值。'};
   m.readings=m.readings.filter(p=>p!==previous);m.readings.push({field:w.fieldEpoch,at:now,reading:{...r}});m.readings=m.readings.slice(-128);
  }
 }
 // Only use an actual bridge scene as an entrance, after viewers have heard
 // some commentary. Quiet time elsewhere is not permission to recite lore.
 if(!selected&&scene.canTellStory&&scene.region?.includes('白桥')&&!scene.fighting&&
    m.spoken.length>=2&&!m.storyOffers.includes(BRIDGE_STORY.id)&&
    !m.topics.some(t=>t.kind==='story'&&now-t.at<600000)){
  selected={key:'story:'+BRIDGE_STORY.id,kind:'story',story:BRIDGE_STORY,
   anchor:'镜头在白桥一带，可以从过桥提起早年的过境旧事；不能声称现在桥被封住了，也没有证据说旧事发生在同一座桥。',
   angle:'一次写完一段有来由的旧事，三句连续讲，不输出脱离上下文的制度评价。'};
 }
 if(!selected){
  const candidates=AMBIENT.filter(t=>available(t.id,t.kind==='invitation'?180000:120000));
  const topic=candidates[0];
  if(topic){const angles=[topic.angle,...(EXTRA_ANGLES[topic.id]||[])],turn=m.topicTurns[topic.id]||0;
   selected={...topic,key:topic.id,angle:angles[turn%angles.length]};m.topicTurns[topic.id]=turn+1;}
 }
 if(!selected)return null; // A short breathing space beats repeating a spent topic.
 m.topics.push({key:selected.key,subject:selected.subject,kind:selected.kind,at:now});m.turn++;
 return {...selected,turn:m.turn,avoid:m.topics.slice(-6,-1).map(t=>t.kind),recentSubjects:m.topics.slice(-8,-1).map(t=>t.subject).filter(Boolean)};
}
export function rememberObserverStory(w,id){const m=editorial(w);m.storyOffers=[...new Set([...m.storyOffers,id])].slice(-16);}
export function observerConversation(w){
 const m=editorial(w),spoken=m.spoken.slice(-8).map(s=>typeof s==='string'?{text:s,playback:'published'}:{text:s.text,playback:s.playback||'published'});
 return {spoken,unplayed:m.offered.filter(text=>!m.spoken.some(s=>(typeof s==='string'?s:s.text)===text)).slice(-8)};
}
export function completeObserverSpoken(w,text){const m=editorial(w),line=[...m.spoken].reverse().find(s=>s.text===text);if(line)line.playback='completed';}
export function observerOffered(w){return editorial(w).offered.slice(-24);}
export function rememberObserverOffer(w,texts){const m=editorial(w);m.offered=[...m.offered,...texts].slice(-24);}
export function observerSpoken(w){return editorial(w).spoken.slice(-6).map(s=>typeof s==='string'?s:s.text);}
export function rememberObserverSpoken(w,text,{audienceId=null,messageId=null,playback='published'}={}){
 const m=editorial(w);m.spoken=[...m.spoken,{text,audienceId,messageId,playback}].slice(-12);
}
export function forgetObserverSpoken(w,ids){
 const removed=new Set(ids),m=editorial(w);m.spoken=m.spoken.filter(s=>!removed.has(s.messageId)&&!removed.has(s.audienceId));
}
const clean=t=>t.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'').replace(/\d+(?:\.\d+)?/g,'#');
export function repeatedCommentary(text,history){
 const a=clean(text);if(!a)return true;
 const grams=t=>new Set(Array.from({length:Math.max(0,t.length-1)},(_,i)=>t.slice(i,i+2)));
 return history.some(prior=>{const b=clean(prior);if(a===b)return true;if(Math.min(a.length,b.length)<8)return false;
  const x=grams(a),y=grams(b),common=[...x].filter(g=>y.has(g)).length;
  return 2*common/(x.size+y.size)>=.72;
 });
}
