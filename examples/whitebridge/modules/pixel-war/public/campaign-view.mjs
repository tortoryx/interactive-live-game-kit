import {factionName,factionColor} from './faction-labels.mjs';
import {drawLandmark,drawHomeBadge,LANDMARK_BOUNDS} from './landmark-art.mjs';
import {TONES,tacticalIcon} from './tactical-style.mjs';
import {bodyBox,overlaps} from './label-layout.mjs';
import {biomeAt,terrainBenefit,START_X} from './terrain.mjs';
const sideColor=factionColor,title={grain:'粮仓',forge:'兵工坊'};
const rect=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
// Keep commanders and viewer-owned units readable behind tall landmarks.
const structureFades=new Map();
function structureOpacity(o,kind,state,time){
 const b=LANDMARK_BOUNDS[kind],important=[...Object.values(state.heroes||{}),...(state.units||[]).filter(u=>u.supporter?.id)];
 const obscured=important.some(u=>u.hp>0&&u.y<=o.y&&u.y>o.y-b.h&&Math.abs(u.x-o.x)<b.w/2+18);
 const key=kind+':'+o.x+':'+o.y,target=obscured?.22:1,previous=structureFades.get(key);
 const dt=previous?Math.max(0,Math.min(250,time-previous.time)):250,alpha=previous?previous.alpha+(target-previous.alpha)*(1-Math.exp(-dt/100)):target;
 if(structureFades.size>64)structureFades.clear();structureFades.set(key,{alpha,time});return alpha;
}
export function campaignObjects(state){const s=state.campaign;return s?[...s.sites.map(site=>({kind:'campaignSite',x:site.x,y:site.y,site})),...Object.entries(s.camps).map(([side,p])=>({...p,kind:'fieldCamp',side})),...Object.entries(s.homes).map(([side,p])=>({...p,kind:'homeland',side}))]:[];}
export function drawCampaignStructure(c,o,state,time,viewSide='demon'){const kind=o.kind==='homeland'?'home':o.kind==='fieldCamp'?'camp':o.site.kind;c.save();c.globalAlpha*=structureOpacity(o,kind,state,time);drawLandmark(c,kind,o.site?.owner||o.side,o.x,o.y);c.restore();
 if(o.site){const s=o.site,color=factionColor(s.controller);c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.ellipse(o.x,o.y+10,57,13,0,0,7);c.stroke();if(s.assault?.until>time){c.strokeStyle=(s.assault.defender===viewSide?TONES.danger:TONES.success).color;c.globalAlpha=.4+.2*Math.sin(time/180);c.strokeRect(o.x-83,o.y-7,166,24);c.globalAlpha=1;}}
}
export function siteLabelLayout(state,camera,units){
 const occupied=[...units.filter(u=>u.hp>0).map(u=>bodyBox(u,camera)),{x:0,y:0,w:camera.screenW*.31,h:190},{x:camera.screenW*.32,y:0,w:camera.screenW*.38,h:120},{x:camera.screenW*.72,y:0,w:camera.screenW*.28,h:110},{x:camera.screenW-205,y:camera.screenH-207,w:205,h:207}];
 const visible=(state.campaign?.sites||[]).filter(s=>camera.visible(s,0));
 for(const s of visible){const p=camera.project(s),b=LANDMARK_BOUNDS[s.kind];occupied.push({x:p.x-b.w/2*camera.zoom,y:p.y-b.h*camera.zoom,w:b.w*camera.zoom,h:(b.h+24)*camera.zoom});}
 const labels=[];for(const s of visible){const p=camera.project(s),h=s.progress>0||s.contested?49:30;for(const b of [{x:p.x-74,y:p.y-LANDMARK_BOUNDS[s.kind].h*camera.zoom-h-6,w:148,h},{x:p.x+78*camera.zoom+6,y:p.y-110*camera.zoom,w:148,h},{x:p.x-78*camera.zoom-154,y:p.y-110*camera.zoom,w:148,h}]){if(b.x<5||b.x+b.w>camera.screenW-5||b.y<110||b.y+b.h>camera.screenH-30||occupied.some(o=>overlaps(o,b)))continue;labels.push({...b,site:s});occupied.push(b);break;}}return labels;
}
export function captureStatus(site){
 if(!site.captureSide)return site.contested?'僵持':'无人驻守';
 if(site.captureSide===site.controller)return site.progress>0?'回稳 ×'+site.captureRate:'守住';
 return '占领 ×'+site.captureRate;
}
export function drawSiteLabels(c,state,camera,side,labels){c.save();for(const b of labels){
 const s=b.site,center=b.x+b.w/2;rect(c,'#1b252ded',b.x,b.y,b.w,b.h);rect(c,factionColor(s.controller),b.x,b.y,3,b.h);c.font='bold 12px sans-serif';c.textAlign='center';c.fillStyle=factionColor(s.controller);c.fillText(factionName(s.owner)+title[s.kind]+(s.controller===s.owner?'':' · 已被夺'),center,b.y+19);
 if(s.progress>0||s.contested){rect(c,'#4f5c45',b.x+8,b.y+26,132,4);if(s.progress>0)rect(c,sideColor(s.claimFor),b.x+8,b.y+26,132*s.progress/14000,4);c.font='10px sans-serif';c.textAlign='left';c.fillStyle=TONES.success.color;c.fillText('我'+(s.presence?.[side]||0),b.x+8,b.y+43);c.fillStyle=TONES.danger.color;c.fillText('敌'+(s.presence?.[side==='demon'?'human':'demon']||0),b.x+40,b.y+43);c.textAlign='right';c.fillStyle='#ffe1ad';c.fillText(captureStatus(s),b.x+b.w-8,b.y+43);}
 }c.restore();}


export function updateCampaignHUD(el,state,side){const s=state.campaign;if(!s){el.hidden=true;return;}el.hidden=state.mode==='settlement';const h=state.heroes[side],place=s.conquest&&!s.conquest.redeployed?s.conquest.focus:h,region=biomeAt(place.x,place.y),heritage=region.side==='border'?'两国交界':factionName(region.side)+'领地',mine=s.sites.filter(p=>p.owner===side),lost=mine.filter(p=>p.controller!==side),threat=mine.filter(p=>p.presence?.[side==='demon'?'human':'demon']>0);const info=lost.length?factionName(side)+lost.map(p=>title[p.kind]).join('、')+'已失守':threat.length?'快守住'+threat.map(p=>title[p.kind]).join('、'):'夺取粮仓和工坊，推进战线';
 const terminal=Math.abs(s.front)>=8;const pending=s.pending?(terminal?'家园告急':s.pending.side===side?'即将推进':'即将失守')+' · '+Math.max(0,Math.ceil((s.pending.at-state.time)/1000))+'秒':'';
 el.querySelector('strong').textContent=region.name+' · '+heritage;const status=el.querySelector('.campaignStatus');status.textContent=s.conquest?factionName(s.conquest.loser)+'家园失守':pending||info;status.dataset.active=String(!!s.conquest||!!s.pending||!!threat.length||!!lost.length);el.dataset.campaign=String(s.number||1);el.querySelector('.terrainBenefit').textContent=terrainBenefit(place.x,place.y,state.terrainChanges);
 for(const owner of ['demon','human']){const badge=el.querySelector('[data-home='+owner+']');if(badge){drawHomeBadge(badge,owner);badge.parentElement.classList.toggle('breached',s.conquest?.loser===owner);badge.parentElement.title=factionName(owner)+' · 战役胜利 '+(s.homeWins?.[owner]||0)+' 次';}}
 const bar=el.querySelector('.frontTrack');if(bar.dataset.front!==String(s.front)){bar.dataset.front=s.front;bar.replaceChildren();for(let i=-8;i<=8;i++){const dot=document.createElement('i');dot.className=(i<s.front?'demon':i>s.front?'human':'front');dot.title=i===s.front?'当前战线':'';bar.append(dot);}}
 const fighting=(s.signals?.clashes||[]).length>0||(s.sites||[]).some(p=>p.contested||p.assault?.until>state.time);bar.classList.toggle('fighting',fighting);for(const dot of bar.children){dot.textContent=dot.classList.contains('front')?(fighting?'⚔':'◆'):'';dot.setAttribute('aria-label',dot.classList.contains('front')?(fighting?'当前战线正在交战':'当前战线'):'战线区段');}

}
