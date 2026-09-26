import {factionName,factionColor} from './faction-labels.mjs';
const clamp=n=>Math.max(0,Math.min(1,n));
export function conquestScene(state,side){
 const r=state.campaign?.conquest;if(!r)return null;
 const elapsed=state.time-r.startedAt,transfer=r.redeployAt-r.startedAt;
 return {id:r.id,tone:side===r.winner?'victory':'defeat',title:r.redeployed?'边境反攻':factionName(r.loser)+'家乡失守',detail:r.redeployed?'幸存部队就位 · 伤势保留':factionName(r.winner)+'赢得第'+r.number+'次战役',remaining:Math.max(0,Math.ceil((r.until-state.time)/1000)),veil:elapsed<transfer?clamp((elapsed-transfer+550)/350):1-clamp((elapsed-transfer-300)/650),board:elapsed>1800&&!r.redeployed?(r.honors.boards?.[side]||[]).slice(0,5):[],color:factionColor(side),redeployed:r.redeployed};
}
export function renderConquest(el,state,side){
 const scene=conquestScene(state,side);el.hidden=!scene;if(!scene){el.replaceChildren();return;}
 el.dataset.tone=scene.tone;el.style.setProperty('--veil',scene.veil);el.style.setProperty('--conquest-color',scene.color);
 if(el.dataset.id!==scene.id){el.dataset.id=scene.id;el.replaceChildren();const veil=document.createElement('div');veil.className='conquestVeil';const panel=document.createElement('section');panel.className='conquestPanel';for(const tag of ['strong','p','ol','small'])panel.append(document.createElement(tag));el.append(veil,panel);}
 const panel=el.querySelector('section');panel.querySelector('strong').textContent=scene.title;panel.querySelector('p').textContent=scene.detail;panel.querySelector('small').textContent=scene.redeployed?scene.remaining+' 秒后交战':'边境重新集结 · '+scene.remaining+' 秒';
 const board=panel.querySelector('ol'),key=scene.board.map(e=>e.id).join('|');if(board.dataset.key!==key){board.dataset.key=key;board.replaceChildren();for(const e of scene.board){const li=document.createElement('li');li.textContent=e.rank+'  '+e.name+' · '+e.score.toLocaleString()+' 战功';board.append(li);}}
 board.hidden=!scene.board.length;
}
