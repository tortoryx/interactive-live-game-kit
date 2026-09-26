// Boundaries are elapsed simulation milliseconds; the result stores its own schedule.
export const LEGACY_CINEMATIC={fall:2200,awards:5600,celebrate:15500,handoff:19200,arrival:25500,end:28500};
export const PREVIOUS_CINEMATIC={fall:3000,awards:7000,celebrate:27000,handoff:31000,arrival:36000,briefing:48000,end:52000};
export const DEMO_CYCLE=2400;
export const CINEMATIC={fall:1000,awards:2400,celebrate:8800,handoff:10700,arrival:13900,briefing:18700,end:19200};
export const ceremonyTiming=result=>result?.timing||(result?.ceremonyVersion>=3?CINEMATIC:result?.ceremonyVersion===2?PREVIOUS_CINEMATIC:LEGACY_CINEMATIC);
export function battleScene(state){
 const r=state.result;if(!r||state.mode!=='settlement')return null;const timing=ceremonyTiming(r),age=Math.max(0,state.time-(r.startedAt??state.time));if(age>=timing.end)return null;
 const phase=age<timing.fall?'fall':age<timing.awards?'celebrate':age<timing.celebrate?'awards':age<timing.handoff?'execution':age<timing.arrival?'arrival':timing.briefing&&age<timing.briefing?'demonstration':'resume';
 return {...r,timing,age,phase,progress:Math.min(1,age/timing.end)};
}
export function awardRevealAt(index){return index<3?index*800:index<10?2300+(index-3)*120:3140+(index-10)*45;}
export function awardRevealCount(age,count){let n=0;while(n<Math.min(50,count)&&age>=awardRevealAt(n))n++;return n;}

export function settlementTiming(honors,winner){
 const credit=honors?.finisher?.viewer===true||honors?.finishers?.some(f=>f.finisher?.viewer===true);
 const board=winner===null?[]:honors?.boards?.[winner]||(honors?.board||honors?.leaders||[]),count=Math.min(50,board.length);
 const awards=CINEMATIC.fall+(credit?1400:0),duration=count?Math.ceil(Math.max(2600,awardRevealAt(count-1)+1500)/50)*50:0;
 const celebrate=awards+duration,handoff=celebrate+1900,arrival=handoff+3200,briefing=arrival+DEMO_CYCLE*2;
 return {fall:CINEMATIC.fall,awards,celebrate,handoff,arrival,briefing,end:briefing+500};
}
