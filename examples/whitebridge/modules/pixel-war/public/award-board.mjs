import {factionName,factionColor} from './faction-labels.mjs';
import {ceremonyPerspective,perspectiveHonors} from './ceremony-perspective.mjs';
import {battleScene,awardRevealAt,awardRevealCount} from './cinematic.mjs';
const text=(tag,value,cl)=>{const n=document.createElement(tag);n.textContent=value;if(cl)n.className=cl;return n;};
const number=n=>Math.round(n||0).toLocaleString('en-US');
function face(a){if(a.avatarKey&&/^[a-f0-9]{40}$/.test(a.avatarKey)){const im=document.createElement('img');im.src='/avatar/'+a.avatarKey;im.alt='';im.onerror=()=>{im.replaceWith(text('i',a.name?.slice(0,1)||'援','awardAvatar'));};return im;}return text('i',a.name?.slice(0,1)||'援','awardAvatar');}
export function renderHonors(el,state,side){
 const s=battleScene(state),board=perspectiveHonors(s,side),credited=s?.honors?.finishers?.filter(f=>f.finisher?.viewer)||[],visible=!!s&&ceremonyPerspective(state,side).showAwards&&(s.phase==='awards'?board.length>0:s.phase==='celebrate'&&(s.honors?.finisher?.viewer||credited.length>0));el.hidden=!visible;if(!visible){el.replaceChildren();for(const key of ['key','phase','spotlight','revealed'])delete el.dataset[key];return;}
 const entries=board.slice(0,50),key=s.startedAt+':'+s.phase+':'+side;el.dataset.phase=s.phase;el.dataset.compact=String(entries.length<=10);
 if(el.dataset.key!==key){el.dataset.key=key;el.replaceChildren();
  if(s.phase==='celebrate'&&credited.length>1){el.append(text('span','双将同陨','awardKicker'));for(const f of credited)el.append(text('strong',f.targetName+' · '+(f.finisher?.name||'未记录最后一击'),'finisherName'));return;}
  if(s.phase==='celebrate'){el.append(text('span','最后一击','awardKicker'),text('strong',s.honors?.finisher?.name||credited[0]?.finisher?.name,'finisherName'),text('p',s.honors?.finisher?.source==='test'?'本机模拟贡献':'斩将之功，记在你的名下。','finisher'));return;}
  const header=document.createElement('header');header.append(text('strong',factionName(side)+'战功榜'),text('span',`${entries.length} 位${factionName(side)}功臣`));el.append(header);
  if(!entries.length){el.append(text('p','这一仗尚无观众援军贡献。\n派出自己的部队，下一次在这里留下名字。','noHonors'));return;}
  const spotlight=document.createElement('section');spotlight.className='awardSpotlight';el.append(spotlight);const grid=document.createElement('div');grid.className='awardGrid';grid.style.setProperty('--rows',Math.min(10,entries.length));
  for(const [i,a] of entries.entries()){const row=document.createElement('article');row.style.gridRow=String(i%10+1);row.style.gridColumn=String(Math.floor(i/10)+1);row.className='awardCard '+(i===0?'champion':i<3?'podium':i<10?'topTen':'regular')+(a.side===side?' allied':' enemy');row.append(text('b',String(i+1),'medal'),face(a));const body=document.createElement('div');body.append(text('strong',a.name),text('span',(Object.keys(a.sides||{}).length>1?'两军':a.side==='demon'?'魔族':'人族')+(a.source==='test'?' · 模拟':'')+' · '+number(a.score)));row.append(body);row.title=`第 ${i+1} 名 ${a.name}｜有效伤害 ${number(a.damage)}｜首领伤害 ${number(a.leaderDamage)}｜治疗 ${number(a.healing)}｜击杀 ${a.kills||0}`;grid.append(row);}el.append(grid,text('small','战功＝有效伤害＋首领伤害＋有效治疗 · 模拟贡献已标注'));
 }
 if(s.phase!=='awards'||!entries.length)return;const age=s.age-s.timing.awards,reveal=awardRevealCount(age,entries.length),spotIndex=Math.min(2,entries.length-1,Math.floor(Math.max(0,age)/800)),spot=el.querySelector('.awardSpotlight');el.dataset.spotlight=String(age<2400);el.dataset.revealed=String(reveal);
 if(spot.dataset.rank!==String(spotIndex)){spot.dataset.rank=String(spotIndex);const a=entries[spotIndex];spot.replaceChildren();if(a){spot.append(text('span',['首功 · 第一名','战功 · 第二名','战功 · 第三名'][spotIndex],'spotTitle'),face(a),text('strong',a.name),text('b',number(a.score)+' 战功'),text('p',`伤害 ${number(a.damage)} · 治疗 ${number(a.healing)} · 击杀 ${a.kills||0}${a.source==='test'?' · 本机模拟':''}`));}}
 for(const [i,row] of [...el.querySelectorAll('.awardCard')].entries()){const a=Math.max(0,Math.min(1,(age-awardRevealAt(i))/230));row.style.opacity=String(a);row.style.transform=`translateY(${(1-a)*8}px)`;row.setAttribute('aria-hidden',String(!a));row.classList.toggle('spotlit',age<2400&&i===spotIndex);}
}
