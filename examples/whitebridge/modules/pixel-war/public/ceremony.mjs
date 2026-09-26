import {factionName,factionColor} from './faction-labels.mjs';
import {legacyPresentation} from './legacy-presentation.mjs';
import {ceremonyPerspective} from './ceremony-perspective.mjs';
import {crownCount,crownRite,drawInheritedCrowns} from './crowns.mjs';
import {battleScene,CINEMATIC} from './cinematic.mjs';
const color=s=>s==='demon'?'#efa179':'#a0e3df';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function ceremonyActor(u,state,side){const scene=battleScene(state);if(!scene||u.hp<=0)return u;
 const rite=crownRite(scene,u.side,state.time);if(u.kind==='hero'&&rite?.entry.successorId===u.id&&scene.phase==='arrival')return {...u,action:null,moving:rite.t<.36,crownPicking:rite.t>=.36&&rite.t<.65,crownBend:rite.bend,wornCrowns:rite.worn?rite.entry.count+1:1,crownSway:rite.worn?Math.sin((rite.t-.78)*24)*3:0};
 if(u.ceremonyExtra)return {...u,action:null};
 if(scene.dead.includes(side)&&u.side!==side)return {...u,action:null,moving:false,cinematicDim:.28};if(!u.ceremonyExtra&&['awards','execution','arrival'].includes(scene.phase)&&u.kind!=='hero')return {...u,cinematicDim:.32};const cheer=['celebrate','awards'].includes(scene.phase)&&u.side===scene.winner&&scene.winner===side;return cheer?{...u,action:null,celebrating:true,celebrationAt:scene.startedAt+scene.timing.fall}:{...u,action:null,moving:false};}
export function drawSummons(c,units,time){for(const u of units){if(u.summonedAt==null||u.hp<=0)continue;const age=(time-u.summonedAt)/1300;if(age<0||age>1)continue;c.save();c.translate(u.x,u.y);c.globalAlpha=1-age;c.strokeStyle=u.factionColor||color(u.side);c.fillStyle=u.factionColor||color(u.side);c.lineWidth=3;for(let r=0;r<2;r++){c.beginPath();c.ellipse(0,0,26+age*35+r*10,10+age*12+r*5,0,0,Math.PI*2);c.stroke();}for(let i=0;i<8;i++){const a=i*Math.PI/4+age*2;c.fillRect(Math.cos(a)*38,-15+Math.sin(a)*12-age*65,3,6);}c.restore();}}
export function drawDefeatedCommander(c,state,time,actors,side){const scene=battleScene(state);if(!scene||!['fall','celebrate','awards'].includes(scene.phase))return;for(const h of scene.fallen)actors.draw(c,{...h,action:null,moving:false,hp:0,deadAt:time-800,wornCrowns:crownCount(h)},time);}
export function drawExecution(c,state,time,actors){
 const s=battleScene(state),fallen=s?.fallen?.[0];if(!fallen||!['execution','arrival'].includes(s.phase))return;
 const t=(s.age-s.timing.celebrate)/1000,p=fallen;c.save();c.translate(p.x,p.y);
 if(s.phase==='execution')actors.draw(c,{...fallen,x:0,y:0,hp:0,deadAt:time-800,wornCrowns:t<.85?crownCount(fallen):0},time);
 if(s.phase==='arrival')actors.draw(c,{...fallen,x:0,y:0,hp:0,deadAt:time-800,wornCrowns:0,cinematicDim:Math.max(0,1-(s.age-s.timing.handoff)/1700)},time);
 // A heraldic execution: a blade, severed crown and sparks, without gore.
 if(t<1.5&&s.victor){const v=s.victor,at=s.startedAt+s.timing.celebrate;actors.draw(c,{...v,x:-56,y:5,hp:Math.max(1,v.hp),deadAt:null,face:0,moving:false,equipment:{...v.equipment,weapon:'sword',offhand:null},action:{type:'slash',started:at,contactAt:at+760,until:at+1450}},time);const strike=smooth((t-.6)/.4);if(strike>0&&strike<1){c.globalAlpha=(1-strike)*.8;c.strokeStyle='#fff0bd';c.lineWidth=7*(1-strike)+2;c.beginPath();c.moveTo(-65,-65);c.quadraticCurveTo(30,-75,46,20);c.stroke();c.globalAlpha=1;}}
 if(t>.85){const q=Math.min(2,t-.85);for(let i=0;i<18;i++){c.globalAlpha=Math.max(0,1-q/1.5);c.fillStyle=i%2?'#e6c88c':'#fff4c7';c.fillRect(Math.cos(i*2.4)*q*90,-12+Math.sin(i*2.4)*q*45-q*25,3,3);}}
 c.restore();
 for(const other of s.fallen.slice(1))actors.draw(c,{...other,hp:0,deadAt:time-800,wornCrowns:t<.85?crownCount(other):0,cinematicDim:s.phase==='arrival'?Math.max(0,1-(s.age-s.timing.handoff)/1700):1},time);
 drawInheritedCrowns(c,state,time,actors);
}
export function drawCeremony(c,state,camera){const scene=battleScene(state);if(!scene)return;const {phase,age}=scene,w=camera.screenW,h=camera.screenH,view=ceremonyPerspective(state,camera.side);c.save();
 if(view.tone==='defeat'||view.tone==='threat'){const edge=c.createRadialGradient(w/2,h*.53,h*.14,w/2,h*.53,w*.7);edge.addColorStop(0,'#45080d00');edge.addColorStop(.5,'#610e192d');edge.addColorStop(1,'#8b1328b0');c.fillStyle=edge;c.fillRect(0,0,w,h);if(view.tone==='defeat'){c.strokeStyle='#ed665766';c.lineWidth=2;for(const flip of [-1,1]){c.beginPath();c.moveTo(w/2+flip*w*.35,0);c.lineTo(w/2+flip*w*.29,h*.11);c.lineTo(w/2+flip*w*.32,h*.17);c.lineTo(w/2+flip*w*.27,h*.23);c.stroke();}}}

 if(['celebrate','awards','execution'].includes(phase)&&scene.winner&&view.won){
 if(phase!=='execution'){const glow=c.createRadialGradient(w/2,h*.45,10,w/2,h*.45,w*.42);glow.addColorStop(0,'#ffe2a022');glow.addColorStop(1,'#ffd27a00');c.fillStyle=glow;c.fillRect(0,0,w,h);c.save();c.translate(w/2,h*.45);c.rotate(age/18000);c.fillStyle='#ffdf9610';for(let i=0;i<12;i++){c.rotate(Math.PI/6);c.beginPath();c.moveTo(0,0);c.lineTo(-35,h);c.lineTo(35,h);c.closePath();c.fill();}c.restore();}
const p=camera.project(scene.victor),t=(age-scene.timing.fall)/1000;for(let i=0;i<72;i++){const speed=28+(i*19)%53,x=p.x+Math.sin(i*91.7)*(70+(i*13)%210)+Math.sin(t*2+i)*22,y=p.y-250+((t*speed+i*17)%330);c.fillStyle=['#ffe6a1',color(scene.winner),'#fff7d9'][i%3];c.globalAlpha=.85;c.fillRect(Math.round(x),Math.round(y),i%3+2,3+i%2);}}
 if(phase==='arrival'){const hero=view.focus,p=camera.project(hero),t=(age-scene.timing.handoff)/1000;c.globalAlpha=Math.max(0,.7-t*.45);c.strokeStyle=view.ownArrival?'#bcebad':'#ff786a';c.fillStyle=c.strokeStyle;c.lineWidth=3;for(let i=0;i<2;i++){const r=35+i*21+t*20;c.beginPath();c.ellipse(p.x,p.y,r,r*.3,0,0,7);c.stroke();}for(let i=0;i<28;i++)c.fillRect(p.x+Math.sin(i*3)*95,p.y-((t*95+i*13)%190),3,11);if(t<.25){c.globalAlpha=(1-t/.25)*.2;c.fillStyle='#ffd397';c.fillRect(0,0,w,h);}}
 c.globalAlpha=phase==='resume'?1-smooth((age-(scene.timing.briefing||scene.timing.arrival))/1000):1;c.fillStyle='#101b16';c.fillRect(0,0,w,20);c.fillRect(0,h-20,w,20);c.restore();}
export function ceremonyTitle(state,side){const s=battleScene(state);if(!s)return null;const view=ceremonyPerspective(state,side),loser=s.fallen.find(h=>h.side===side)||s.fallen[0],arrival=s.arrivals?.find(a=>a.side===side)||s.arrivals?.[0];
 const result=(title,detail='')=>({title,detail,tone:view.tone});
 if(s.phase==='fall')return result(factionName(loser.side)+'首领战败',loser.name+' · 王冠坠地');
 if(s.phase==='celebrate')return result(s.winner?factionName(s.winner)+'获胜！':'双方首领同陨',factionName(loser.side)+'王冠蒙尘 · 此仇未报');
 if(s.phase==='awards')return result(view.lost?factionName(loser.side)+'败北 · 援军正在赶来':factionName(s.winner)+'功臣');
 if(s.phase==='execution')return result(factionName(loser.side)+'王冠被斩落',factionName(loser.side)+'长辈正在赶来');
 if(s.phase==='arrival'){const rite=crownRite(s,arrival?.side,state.time);return result(factionName(arrival?.side)+'长辈赶到了！',arrival?arrival.name+(rite?(rite.worn?' · 王冠 ×'+(rite.entry.count+1):' · 拾起王冠'):''): '');}
 if(s.phase==='demonstration'){const show=legacyPresentation(state,side);return result(show?.phase==='march'?'援军进入战线':factionName(arrival?.side)+'新战术');}
 return result((view.ownArrival?'复仇开战 ':'交战倒数 ')+Math.max(1,Math.ceil((s.timing.end-s.age)/1000)),view.ownArrival?'新援已至 · 原有部队继续作战':'保留伤势 · 原有部队继续作战');
}
export {renderHonors} from './award-board.mjs';
