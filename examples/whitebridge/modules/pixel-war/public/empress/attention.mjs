const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Rendering only: coordinates are supplied by the game, never by model prose.
export function hostAttention(line,camera){
 if(line?.audienceId||line?.attention?.kind==='viewer')return {kind:'viewer',gaze:{x:0,y:.02},key:String(line.id)};
 const p=line?.attention;
 if(p?.kind==='battle'&&camera&&[p.x,p.y,camera.x,camera.y,camera.w,camera.h].every(Number.isFinite)&&camera.w>0&&camera.h>0){
  const sx=(p.x-camera.x)/camera.w+.5,sy=(p.y-camera.y)/camera.h+.5;
  if(sx>=0&&sx<=1&&sy>=0&&sy<=1)return {kind:'battle',gaze:{x:clamp((sx-.88)*1.1,-.85,.12),y:clamp((.78-sy)*.48,-.12,.35)},key:String(line.id)};
 }
 return {kind:'idle',gaze:{x:-.28,y:.1},key:line?String(line.id):null};
}
