import {localBubble} from '../pixel-war/local-bubbles.mjs';
// Performer policy is separate from the simulation's tactical controllers.
export function applySpeechMode(w,mode){
 w.speechMode=mode;
 if(mode!=='observer')return;
 if(w.showDebate){w.showDebate.queue=[];w.showDebate.request=null;w.showDebate.active=false;}
 if(w.lunaSpeech){w.lunaSpeech.pending=[];w.lunaSpeech.continuation=null;}
 w.leaderTurns={};w.sceneSpeakingUntil=0;
 w.speech=w.speech.filter(l=>l.side==='empress'||l.performer==='empress'||localBubble(l));
}
