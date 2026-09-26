// One model generation can produce a connected train of thought. Only the
// currently displayed segment counts as something the character has said.
export function speechParts(decision){return [decision.speech,...(decision.continuations||[])].filter(Boolean);}
// Shared by immediate replies and preloaded scene lines, before display or TTS.
export function safePublishedText(text){return typeof text==='string'&&!!text.trim()&&!/https?:|www\.|[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/iu.test(text);}
// Keep Luna's exact words; shorter audio segments lower time to first sound.
export function voiceSegments(parts){return parts.flatMap(text=>{
 const out=[];let piece='';
 for(const char of text){piece+=char;if(piece.length>=10&&/[，。！？!?；;]/u.test(char)||piece.length>=24){out.push(piece);piece='';}}
 if(piece){if(out.length&&piece.length<5&&out.at(-1).length+piece.length<=24)out[out.length-1]+=piece;else out.push(piece);}
 return out;
});}
export function validSpeechTurn(d,selected,validate){
 if(d.continuations!==undefined&&(!Array.isArray(d.continuations)||d.continuations.length>3||d.continuations.some(s=>typeof s!=='string'||!s.trim())))return false;
 const parts=speechParts(d);return parts.join('').length<=300&&parts.every((s,i)=>safePublishedText(s)&&s.length<=(i===0&&!selected?110:80)&&validate(s,selected));
}
export const speechDuration=text=>Math.max(3300,Math.min(8500,1300+text.length*110));
export function publishMonologue(w,side,parts,model,{voice=false}={}){
 if(!parts.length)return;w.leaderTurns??={};w.leaderTurns[side]={persona:w.heroes[side].id,parts:voice?voiceSegments(parts):[...parts],index:0,model,voice,nextAt:w.time};tickMonologues(w);
}
export function tickMonologues(w){
 for(const [side,turn] of Object.entries(w.leaderTurns||{})){
  if(w.heroes[side]?.id!==turn.persona||w.heroes[side].hp<=0||w.mode==='settlement'||w.audienceWaiting?.[side]||(w.audienceSpeakingUntil?.[side]||0)>w.time){delete w.leaderTurns[side];continue;}
  if(w.paused||w.time<turn.nextAt)continue;
  const text=turn.parts[turn.index++],until=w.time+(turn.voice?23000:speechDuration(text));
  w.speech.push({id:++w.serial,side,persona:turn.persona,text,spokenText:text,model:turn.model,audioMode:turn.voice?'synthesizing':'subtitle_only',at:w.time,until,segment:turn.index,segments:turn.parts.length,conversationMode:'monologue'});w.speech=w.speech.slice(-12);w.sceneSpeakingUntil=until;turn.nextAt=until+180;turn.currentLine=w.serial;
  if(turn.index===turn.parts.length)delete w.leaderTurns[side];
 }
}
