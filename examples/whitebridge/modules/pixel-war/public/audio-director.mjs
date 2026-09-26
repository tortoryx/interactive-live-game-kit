import {isTroopLifeEvent} from './troop-life-fx.mjs';
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export const MUSIC_LAYERS=['theme','drums','drive'];
// Presentation state only; never writes gameplay or spends model tokens.
export class AudioDirector{
 constructor(){this.energy=0;this.last=null;this.holdUntil=0;this.stage=0;this.epoch=null;}
 update({time=0,paused=false,fieldEpoch,events=[],heroes={},threats=[],scene=null,side='demon'}={}){
  if(this.epoch!==fieldEpoch||this.last!==null&&time<this.last){this.energy=0;this.last=null;this.holdUntil=0;this.stage=0;this.epoch=fieldEpoch;}
  const dt=this.last===null?0:Math.min(1,Math.max(0,(time-this.last)/1000));this.last=time;
  let hits=0,heavy=0;for(const e of events){if(e.at>time||time-e.at>1800||e.protected)continue;
   if(e.type==='hit'&&(e.amount>0||e.absorbed>0))hits+=e.focus?1.3:1;
   if(['meteor','quake','explosion','slam'].includes(e.type))heavy+=1;
  }
  const own=heroes[side],enemy=heroes[side==='demon'?'human':'demon'];
  const danger=own?.hp>0&&own.hp/Math.max(1,own.maxHP)<.28&&hits>0?.2:0;
  const duel=own?.hp>0&&enemy?.hp>0&&Math.hypot(own.x-enemy.x,own.y-enemy.y)<260&&hits>0?.22:0;
  const threat=Math.min(.18,threats.reduce((n,t)=>n+Math.max(0,t.severity||0),0)*.015);
  const target=clamp(hits/22+Math.min(.55,heavy*.18)+danger+duel+(hits?threat:0));
  if(!paused)this.energy+=(target-this.energy)*(1-Math.exp(-dt/(target>this.energy?.55:4)));
  const thresholds=[.12,.32,.55,.78];let desired=thresholds.filter(t=>this.energy>=t).length;
  if(desired>this.stage){this.stage=desired;this.holdUntil=time+4000;}
  else if(desired<this.stage&&time>this.holdUntil&&this.energy<thresholds[this.stage-1]-.07){this.stage=desired;this.holdUntil=time+1800;}
  // The complete theme and a rhythm are present from the first bar.
  // Actual combat immediately opens the drums; sustained intensity adds bite.
  const engaged=hits>0||heavy>0;
  const gains={theme:[.70,.80,.87,.94,1][this.stage],drums:Math.max(engaged?.70:0,[.32,.70,.82,.92,1][this.stage]),drive:Math.max(engaged?.55:0,[.30,.55,.68,.84,1][this.stage])};
  let mood=['对峙','交锋','激战','冲锋','决战'][this.stage];
  if(scene){const ownLoss=scene.dead.includes(side);mood=ownLoss?'败北':'胜势';Object.assign(gains,{theme:ownLoss?.30:.68,drums:ownLoss?.12:.48,drive:ownLoss?.10:.50});if(['arrival','demonstration','resume'].includes(scene.phase)){mood='援军赶来';Object.assign(gains,{theme:.85,drums:.82,drive:.70});}}
  if(paused)for(const key of MUSIC_LAYERS)gains[key]=0;
  return {energy:this.energy,stage:this.stage,mood,gains};
 }
}
export function soundCue(e){
 if(e.protected)return null;const style=e.style||'';
 if(isTroopLifeEvent(e))return e.type==='revive'?'summon':e.machine?'explosion':'crush';
 if(e.type==='release')return ({bullet:'rifle',pellet:'shotgun',shell:'cannon',grenade:'cannon',arrow:'arrow',bolt:'arrow',orb:'shield'})[style]||null;
 if(e.type==='windup'&&['slash','thrust','crush'].includes(style))return 'swing';
 if(e.type==='hit')return e.amount>0||e.absorbed>0?(e.critical?'critical':['bullet','pellet','arrow','bolt'].includes(style)?'arrow-hit':['crush','slam'].includes(style)?'crush':'steel'):null;
 if(e.type==='muster')return 'march';
 if(e.type==='muster_land')return 'crush';
 if(e.type==='volley')return 'thunder';
 if(e.type==='wildlife_arrival')return 'stampede';
 if(['explosion','meteor','quake','flame'].includes(e.type))return e.type;
 if(['slam','burst'].includes(e.type)&&(!style||style==='crush'))return 'crush';
 if(['heal','pickup','commander_support'].includes(e.type))return e.kind==='shield'?'shield':'heal';
 if(e.type==='summon'&&e.source&&e.source!=='system'&&!e.revived)return 'summon';
 return null;
}
export const soundPriority=e=>e.focus&&isTroopLifeEvent(e)?4:e.focus||e.type==='summon'&&e.source!=='system'?3:['meteor','quake','explosion','slam','wildlife_arrival','volley','muster','muster_land'].includes(e.type)?2:e.critical?1:0;
export function lifeSoundAccent(e){return e.focus&&isTroopLifeEvent(e)?e.type==='revive'?{cue:'heal',delay:.3,volume:.36}:{cue:'steel',delay:.075,volume:.24}:null;}
