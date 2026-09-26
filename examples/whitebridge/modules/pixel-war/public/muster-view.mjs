import {musterActive,formationSlots} from './muster-catalog.mjs';
import {FACTIONS} from './battle-theme.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
function line(c,points,close=false){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));if(close)c.closePath();c.stroke();}
// Eight distinct silhouettes, drawn as translucent standards above their ranks.
// These are reusable vector paths, not generated illustrations or extra sprites.
function crest(c,shape){
 c.lineJoin='round';c.lineCap='round';c.lineWidth=5;
 if(shape==='dragon'||shape==='serpent'){
  c.beginPath();c.moveTo(-80,45);c.bezierCurveTo(-145,-10,70,15,-2,-40);c.bezierCurveTo(-75,-93,40,-128,78,-76);c.stroke();
  line(c,[[67,-91],[113,-115],[99,-65],[127,-48],[76,-37],[65,-68]],true);
  line(c,[[80,-98],[63,-133],[92,-116]]);line(c,[[12,-50],[-8,-78],[-24,-59]]);
  if(shape==='dragon'){line(c,[[-8,4],[19,23],[47,9]]);line(c,[[-48,34],[-45,65],[-17,49]]);line(c,[[98,-47],[142,-28],[152,-46]]);}
  else {line(c,[[-80,45],[-115,81],[-50,58]]);line(c,[[98,-65],[112,-59],[101,-56]],true);}
 }else if(shape==='tiger'){
  line(c,[[-70,-80],[-82,-121],[-31,-99],[0,-109],[31,-99],[82,-121],[70,-80],[90,-36],[60,8],[0,35],[-60,8],[-90,-36]],true);
  line(c,[[-55,-65],[-16,-51],[-39,-38]]);line(c,[[55,-65],[16,-51],[39,-38]]);line(c,[[-24,-14],[0,-2],[24,-14],[0,22],[-24,-14]]);
  for(const x of [-38,0,38])line(c,[[x,-96],[x*.6,-75]]);
  for(const d of [-1,1])for(let i=0;i<3;i++)line(c,[[d*(57+i*7),-15+i*14],[d*(104+i*7),-8+i*18]]);
 }else if(shape==='turtle'){
  line(c,[[-55,-87],[0,-116],[55,-87],[79,-32],[52,17],[0,34],[-52,17],[-79,-32]],true);
  line(c,[[-26,-73],[26,-73],[43,-29],[26,4],[-26,4],[-43,-29]],true);
  for(const d of [-1,1]){line(c,[[d*55,-87],[d*100,-113],[d*88,-65]]);line(c,[[d*52,17],[d*92,42],[d*79,-8]]);}
  line(c,[[-17,-116],[-12,-144],[12,-144],[17,-116]]);line(c,[[0,34],[21,63],[-20,70]]);
 }else if(shape==='wings'){
  for(const d of [-1,1])line(c,[[0,-44],[d*58,-103],[d*125,-145],[d*104,-73],[d*122,-19],[d*75,-38],[d*48,9],[0,33],[0,-44]],true);
  line(c,[[-23,-58],[-28,-91],[0,-69],[28,-91],[23,-58]],true);
 }else if(shape==='claw'){
  for(const d of [-1,0,1])line(c,[[d*61-16,-135],[d*62+16,-75],[d*42+10,5],[d*42-14,36],[d*42-7,-60]],true);
 }else if(shape==='fangs'){
  for(const d of [-1,1])line(c,[[d*22,-111],[d*88,-128],[d*74,-47],[d*36,32],[d*32,-58]],true);
  line(c,[[-88,-128],[0,-147],[88,-128]]);
 }else{
  for(const x of [-56,0,56]){line(c,[[x,44],[x,-65]]);line(c,[[x-24,-62],[x,-126],[x+24,-62]],true);}
 }
}
export async function loadMusterFont(){
 if(typeof FontFace==='undefined')return false;
 try{const face=new FontFace('MusterBrush','url(/fonts/MaShanZheng-Regular.ttf)');await face.load();document.fonts.add(face);wordmarks.clear();return true;}catch{return false;}
}
function groupsAt(state,units,time){
 const m=musterActive({...state,time});if(!m)return [];
 const byId=new Map(units.filter(u=>u.hp>0).map(u=>[u.id,u]));
 return m.groups.map(g=>{
  const members=g.units.map(id=>byId.get(id)).filter(Boolean),n=members.length,follow=time>=m.marchAt;
  const x=n&&follow?members.reduce((v,u)=>v+u.x,0)/n:g.x,y=n&&follow?members.reduce((v,u)=>v+u.y,0)/n:g.y;
  return {...g,x,y,n,m};
 }).filter(g=>!g.m.deployed||g.n);
}
export function musterPresentation(m,time){
 const phase=time<m.deployAt?'camera':time<m.landAt?'descent':time<m.titleHoldAt?'title-impact':time<m.marchAt?'title-hold':'combat';
 const drop=clamp((time-m.titleAt)/(m.titleHoldAt-m.titleAt));
 return {phase,titleVisible:time>=m.titleAt&&time<m.marchAt,titleScale:1+1.65*(1-drop)**3,titleAlpha:clamp((m.marchAt-time)/160),entry:clamp((time-m.deployAt)/(m.landAt-m.deployAt)),overlayAlpha:clamp((time-m.at)/700)*clamp((m.marchAt+650-time)/650)};
}
function polygon(c,r,n,rotation=0,ratio=.7){return Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2+rotation;return [Math.cos(a)*r,Math.sin(a)*r*ratio];});}
export function drawMusterGround(c,state,units,time){
 for(const g of groupsAt(state,units,time)){
  const show=musterPresentation(g.m,time);if(!show.overlayAlpha)continue;const color=FACTIONS[g.side],human=g.side==='human',age=time-g.m.at;
  c.save();c.translate(g.x,g.y);c.scale(g.dir,1);c.strokeStyle=color.color;c.fillStyle=color.color;c.globalAlpha=show.overlayAlpha*.3;c.lineWidth=3;
  const slots=formationSlots(g.formation);
  for(const p of slots){c.beginPath();c.moveTo(p.x-9,p.y);c.lineTo(p.x,p.y-6);c.lineTo(p.x+9,p.y);c.lineTo(p.x,p.y+6);c.closePath();c.fill();}
  // One large landing sigil wraps one entire formation. No unrelated map regions.
  c.globalAlpha=show.overlayAlpha*(time<g.m.landAt?.6:.25);c.lineWidth=4;
  line(c,polygon(c,370,human?6:8,age/5000),true);line(c,polygon(c,395,human?6:8,-age/9000),true);
  const impact=(time-g.m.landAt)/650;
  if(impact>=0&&impact<1){c.globalAlpha=(1-impact)*.75;c.lineWidth=11*(1-impact)+2;line(c,polygon(c,150+impact*490,human?12:8,Math.PI/8),true);
   for(let i=0;i<18;i++){const a=i*Math.PI*2/18,r=160+impact*410;c.fillRect(Math.cos(a)*r,Math.sin(a)*r*.65-impact*55,7,4);}}
  c.restore();
 }
}
const wordmarks=new Map();
function wordmark(name,side){
 const key=side+':'+name;if(wordmarks.has(key))return wordmarks.get(key);
 const tile=document.createElement('canvas');tile.width=900;tile.height=240;const c=tile.getContext('2d'),human=side==='human';
 c.translate(450,142);if(!human)c.transform(1,0,-.09,1,0,0);c.textAlign='center';c.textBaseline='alphabetic';c.lineJoin='round';c.font='124px MusterBrush, KaiTi, serif';
 const width=c.measureText(name).width;const colors=human?['#ffffff','#f5e6a5','#a2cddd','#bf9850']:['#fff6d0','#ffdc8d','#ff813e','#b5241d'];
 c.strokeStyle='#111e25';c.lineWidth=20;c.shadowColor='#080e14';c.shadowBlur=13;c.shadowOffsetY=8;c.strokeText(name,0,0);c.shadowBlur=0;c.shadowOffsetY=0;
 c.lineWidth=8;c.strokeStyle=human?'#587b97':'#691c14';c.strokeText(name,0,9);c.strokeStyle=human?'#dbb669':'#ffb555';c.lineWidth=6;c.strokeText(name,0,0);
 const grad=c.createLinearGradient(0,-112,0,9);colors.forEach((v,i)=>grad.addColorStop(i/(colors.length-1),v));c.fillStyle=grad;c.fillText(name,0,0);
 c.strokeStyle=human?'#c7e8ff':'#ff9356';c.lineWidth=4;
 if(human){line(c,[[-width/2-28,19],[-width/2-10,29],[width/2+10,29],[width/2+28,19]]);line(c,[[-width/2-15,34],[0,42],[width/2+15,34]]);}
 else {for(let i=0;i<3;i++)line(c,[[-width/2-30+i*16,30],[-width/2+8+i*16,-12]]);line(c,[[-width/2+70,23],[width/2-15,35],[width/2+37,6]]);}
 const result={tile,width:width+95,height:200};wordmarks.set(key,result);return result;
}
export function drawMusterStandards(c,state,units,time,camera){
 const groups=groupsAt(state,units,time);
 for(const g of groups){
  if(!camera.visible(g,430))continue;
  const show=musterPresentation(g.m,time),color=FACTIONS[g.side],human=g.side==='human';
  c.save();c.translate(g.x,g.y);c.strokeStyle=color.color;c.fillStyle=color.color;
  if(show.phase==='descent'){
   const fade=Math.sin(Math.PI*show.entry),beam=c.createLinearGradient(0,-780,0,0);beam.addColorStop(0,human?'#96ddff00':'#ff752200');beam.addColorStop(1,human?'#96ddff':'#ff7522');c.globalAlpha=fade*.25;c.fillStyle=beam;
   c.beginPath();c.moveTo(-430,-780);c.lineTo(430,-780);c.lineTo(335,0);c.lineTo(-335,0);c.closePath();c.fill();
   c.strokeStyle=human?'#ecf9ff':'#fff1bd';c.globalAlpha=fade*.65;c.lineWidth=4;for(let i=0;i<9;i++){const x=(i-4)*72;line(c,[[x,-650],[x,0]]);}
  }
  if(time>=g.m.landAt&&show.overlayAlpha){c.translate(0,-35);c.scale(1.9,1.9);c.globalAlpha=show.overlayAlpha*.5;c.shadowColor=color.color;c.shadowBlur=13;crest(c,g.shape);}
  c.restore();
 }
}
export function drawMusterTitles(c,state,units,time,camera){
 const result=[];
 for(const g of groupsAt(state,units,time)){
  if(!camera.visible(g,430))continue;const show=musterPresentation(g.m,time);
  let titleBox=null;
  if(show.titleVisible){
   const p=camera.project({x:g.x,y:g.y-345}),fontSize=Math.max(40,Math.min(64,camera.screenW*.048)),scale=fontSize/124*show.titleScale,mark=wordmark(g.name,g.side),y=Math.max(110,p.y);
   c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=show.titleAlpha;c.translate(p.x,y);c.scale(scale,scale);c.drawImage(mark.tile,-450,-142);c.restore();
   titleBox={x:p.x-mark.width*scale/2,y:y-142*scale,w:mark.width*scale,h:mark.height*scale,fontSize,scale:show.titleScale};
  }
  result.push({name:g.name,side:g.side,count:g.n,x:g.x,y:g.y,phase:show.phase,titleBox});
 }
 return result;
}
