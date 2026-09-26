import {factionName,factionColor} from './faction-labels.mjs';
import {tacticalIcon,TONES} from './tactical-style.mjs';
import {LANDMARK_BOUNDS} from './landmark-art.mjs';
import {labelSlot} from './label-layout.mjs';
export function drawFieldSignals(c,state,camera,side,occupied=[]){const boxes=[];
 for(const s of state.campaign?.sites||[]){if(!camera.visible(s)||!(s.assault?.until>state.time))continue;const p=camera.project(s),b=LANDMARK_BOUNDS[s.kind],color=TONES[s.assault.defender===side?'danger':'success'].color;tacticalIcon(c,s.assault.defender===side?'alert':'clash',p.x+b.w*.42*camera.zoom,p.y-b.h*.6*camera.zoom,color,24);}
 const marches=(state.campaign?.signals?.marches||[]).filter(m=>camera.visible(m,0)).sort((a,b)=>b.count-a.count).slice(0,2);
 for(const m of marches){const p=camera.project(m),b=labelSlot({x:p.x,y:p.y-70},122,24,[...occupied,...boxes],camera.screenW,camera.screenH,140);if(!b)continue;const color=factionColor(m.side);c.save();c.fillStyle='#1e342be0';c.fillRect(b.x,b.y,b.w,b.h);tacticalIcon(c,'march',b.x+12,b.y+12,color,17);c.font='bold 10px sans-serif';c.textAlign='left';c.fillStyle=color;c.fillText((factionName(m.side)+'行军')+' ×'+m.count,b.x+27,b.y+16);c.restore();boxes.push(b);}
 return boxes;
}
