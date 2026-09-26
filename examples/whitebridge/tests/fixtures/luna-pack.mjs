// Synthetic transport result, exclusively for deterministic tests; not recorded as a live call.
import {CUES,applySpeechPack} from '../../modules/pixel-war/luna-speech.mjs';
export function mockPack(w,side,texts={}){
 const request={id:'fixture-pack-'+side,side,persona:w.heroes[side].id,items:Object.keys(CUES).map(cue=>({cue}))};
 applySpeechPack(w,request,{ok:true,model:'gpt-5.6-luna',decision:{requestId:request.id,lines:request.items.map(({cue})=>({cue,text:texts[cue]||'测试生成 '+cue.slice(0,5)}))}},Date.now());return request;
}
