// Same body-adjacent layout used by the two original bosses. The avatar here
// is repeated in the HP card; Actors also paints it in place of the sprite head.
export function drawClanCommander(c,u,camera,supporters,layout){
 const p=camera.project(u),color=u.factionColor,slot=layout.commanders.get(u.id);
 const box=slot||{x:Math.max(5,Math.min(camera.screenW-153,p.x-74)),y:Math.max(75,p.y-65*(u.scale||1)*camera.zoom-48),w:148,h:41};
 if(p.x<0||p.x>camera.screenW||p.y<60||p.y>camera.screenH)return null;
 c.save();c.fillStyle='#162029ed';c.fillRect(box.x,box.y,box.w,box.h);c.fillStyle=color;c.fillRect(box.x,box.y,3,box.h);
 supporters.badge(c,u.supporter,box.x+7,box.y+5,29,color);c.textAlign='left';c.font='bold 10px sans-serif';c.fillStyle=color;
 c.fillText(u.factionName+' · '+u.name,box.x+41,box.y+12,box.w-45);c.fillStyle='#45505a';c.fillRect(box.x+41,box.y+17,box.w-47,6);c.fillStyle=color;c.fillRect(box.x+41,box.y+17,(box.w-47)*Math.max(0,Math.min(1,u.hp/u.maxHP)),6);
 c.font='9px monospace';c.fillStyle='#eee8dc';c.fillText(Math.ceil(u.hp)+' / '+u.maxHP+' · 一命',box.x+41,box.y+35,box.w-45);c.restore();return box;
}
