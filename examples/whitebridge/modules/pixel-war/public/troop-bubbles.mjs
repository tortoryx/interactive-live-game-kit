import {bodyBox,adjacentSlot,overlaps} from './label-layout.mjs';
import {troopEmotion,paintEmotion} from './troop-emotions.mjs';
export function drawTroopBubbles(c,state,units,camera,layout){
 const byId=new Map(units.filter(u=>u.hp>0).map(u=>[u.id,u])),boxes=[],emotions=[];c.save();c.font='bold 10px sans-serif';c.textAlign='center';
 const lines=(state.chatter||[]).filter(m=>m.until>state.time).sort((a,b)=>b.priority-a.priority||b.at-a.at);
 for(const line of lines){if(boxes.length>=5)break;const u=byId.get(line.unitId);if(!u)continue;const text=line.text,w=Math.ceil(c.measureText(text).width)+12,b=adjacentSlot(u,w,21,layout.occupied,camera,true);if(!b)continue;
  c.globalAlpha=Math.min(1,(line.until-state.time)/250);c.fillStyle=u.side==='demon'?'#f3d8bc':'#d9eee2';c.strokeStyle='#34433a';c.lineWidth=1;c.beginPath();c.roundRect(b.x,b.y,b.w,b.h,5);c.fill();c.stroke();const body=bodyBox(u,camera);if(b.y+b.h<body.y){c.beginPath();c.moveTo(b.x+b.w/2-3,b.y+b.h);c.lineTo(b.x+b.w/2,b.y+b.h+4);c.lineTo(b.x+b.w/2+3,b.y+b.h);c.fill();}c.fillStyle='#24372e';c.fillText(text,b.x+b.w/2,b.y+14);layout.occupied.push(b);boxes.push({...b,text,unitId:u.id});
 }
 c.globalAlpha=1;
 const reactions=units.map(u=>({u,e:troopEmotion(u,state.time)})).filter(v=>v.e).sort((a,b)=>(b.e.priority+Number(b.u.source!=='system')*2)-(a.e.priority+Number(a.u.source!=='system')*2));
 for(const {u,e}of reactions){if(emotions.length>=7)break;if(boxes.some(b=>b.unitId===u.id))continue;const b=adjacentSlot(u,22,22,layout.occupied,camera,true);if(!b)continue;paintEmotion(c,e.kind,b.x+11,b.y+11,14,e.color,state.time);layout.occupied.push(b);emotions.push({...b,unitId:u.id,kind:e.kind});}
 c.restore();return {visible:boxes.length,boxes,emotions,bodyOverlaps:[...boxes,...emotions].filter(b=>layout.bodies.some(body=>overlaps(b,body))).length};
}
