import {cueSpeech} from './luna-speech.mjs';
import LINES from '../duel-preview/battle-lines.json' with {type:'json'};
export {LINES};
export function react(w,side,event,priority=1){
 if(w.generatedSpeechOnly){const cue=({Hurt:'hurt',Break:'destruction',Claim:'resource'})[event];return cue?cueSpeech(w,side,cue,null,{priority,ttl:7000}):false;}
 if(w.audienceBattle&&!w.units.some(u=>u.hp>0)&&['Ready','Duel','Hurt','Threat','Support'].includes(event))return false;
 if(w.warDrama?.queue?.length||w.sceneSpeakingUntil>w.time||w.audienceSpeakingUntil?.[side]>w.time)return false;
 const key=side+event,line=LINES[key],h=w.heroes[side];if(!line||h.hp<=0)return false;
 w.banter??={};const prior=w.banter[side]||{last:-1e9,keys:{}};
 if(w.time-prior.last<(priority>1?4500:7000)||w.time-(prior.keys[key]??-1e9)<24000)return false;
 prior.last=w.time;prior.keys[key]=w.time;w.banter[side]=prior;
 w.speech.push({id:++w.serial,side,persona:h.id,text:line.text,audio:key,at:w.time,priority,event});w.speech=w.speech.slice(-8);return true;
}
