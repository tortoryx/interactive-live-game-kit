// Game-event subtitles. These are never model work, voice work or viewer memory.
const lines={
 opening:['过桥。粮仓的账还没算。','拦在这儿？那就连你一起收拾。'],
 opening_reply:['先把你的人带走。','少废话，桥这边你别想碰。'],
 help_accuse:['还摇人？你倒是不客气。','行啊，打不过就叫人。'],
 help_boast:['来得正好，跟我压过去。','有人肯帮我，你气什么？'],
 reinforcement:['援军到了，别挤在一块。','新来的，盯住他侧面。'],
 support:['这口补给来得及时。','接着顶，我还在。'],
 hurt:['嘶……下手挺黑啊。','行，这一下我记着了。'],
 destruction:['都躲开，别站废墟里。','房子都砸了，你够狠。'],
 resource:['东西拿上，别在这儿发呆。','补给到手，接着走。'],
 arrival:['打了小的？现在轮到我了。','谁动的我家小子？'],
 defeat:['妈的……让你捡着了。','这账，我家里有人接。'],
 victory:['地盘留下，你滚。','刚才那股劲呢？'],
 attack:['别挡路，给我让开。','站这么近，找揍呢。'],
 retreat:['先退开，别硬顶。','别追散了，跟我回去。'],
 advance:['跟紧，别落单。','往前压，留个人看后面。']
};
export const localBubble=l=>l?.origin==='battle-rule'&&l?.audioMode==='silent';
export function localLeaderCue(w,side,cue){
 if(w.speechMode!=='observer'||w.paused)return false;
 const h=w.heroes[side],options=lines[cue];if(!h||h.hp<=0&&cue!=='defeat'||!options)return false;
 const book=w.localBubbles??={};let b=book[side];if(!b||b.persona!==h.id)b=book[side]={persona:h.id,next:0,seen:{},count:0};
 const urgent=['arrival','defeat','help_accuse','help_boast'].includes(cue);
 if(w.time<b.next&&!urgent||w.time-(b.seen[cue]??-Infinity)<(urgent?5000:16000))return false;
 b.seen[cue]=w.time;b.next=w.time+5500;
 w.speech.push({id:++w.serial,side,persona:h.id,text:options[(b.count++)%options.length],cue,origin:'battle-rule',audioMode:'silent',at:w.time,until:w.time+3800});
 w.speech=w.speech.slice(-32);return true;
}
export function tickLocalBubbles(w){
 if(w.speechMode!=='observer'||w.paused||['inspection','settlement'].includes(w.mode))return;
 for(const side of ['demon','human']){
  const h=w.heroes[side],known=w.localBubbles?.[side];
  if(!known||known.persona!==h.id){localLeaderCue(w,side,h.rank?'arrival':side==='demon'?'opening':'opening_reply');continue;}
  if(w.time<known.next)continue;
  if(h.action&&h.action.until>w.time)localLeaderCue(w,side,'attack');
  else if(h.moving)localLeaderCue(w,side,h.withdrawal||h.viewerAdvice?.kind==='retreat'?'retreat':'advance');
 }
}
