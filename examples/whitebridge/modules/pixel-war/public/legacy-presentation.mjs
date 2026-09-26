import {battleScene,DEMO_CYCLE} from './cinematic.mjs';

// Preview only: package facts never mint actors, unlock a gift or retire a persona.
export function legacyPresentation(state,side){
 const s=battleScene(state);if(!s)return null;
 const own=s.dead.includes(side),entry=(s.retinues||[]).find(r=>r.side===side)||(s.upcoming||[]).find(r=>r.side===side)||(s.retinues||[])[0]||(s.upcoming||[])[0];
 if(!entry)return null;
 const early=own&&s.ceremonyVersion>=3&&s.timing.celebrate-s.timing.awards>=DEMO_CYCLE;
 if(early&&s.phase==='awards'){
  const elapsed=s.age-s.timing.awards;
  return {entry,early:true,unlocked:false,phase:elapsed<DEMO_CYCLE?'demo':'approach',pass:1,passes:2,age:Math.min(elapsed,DEMO_CYCLE),elapsed};
 }
 if(!['demonstration','resume'].includes(s.phase))return null;
 const elapsed=s.age-s.timing.arrival,passes=early?1:2;
 if(s.phase==='resume'||elapsed>=passes*DEMO_CYCLE)return {entry,early:false,unlocked:true,phase:'march',pass:2,passes:2,age:DEMO_CYCLE,elapsed};
 return {entry,early:false,unlocked:true,phase:'demo',pass:(early?1:0)+Math.floor(elapsed/DEMO_CYCLE)+1,passes:2,age:elapsed%DEMO_CYCLE,elapsed};
}
