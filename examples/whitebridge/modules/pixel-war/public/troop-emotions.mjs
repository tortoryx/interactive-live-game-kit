// Short visual reactions to actual unit state, not invented spoken dialogue.
export function troopEmotion(u,time){
 if(u.kind==='hero'||u.hp<=0||u.side==='neutral')return null;
 if(time-u.hitAt>=0&&time-u.hitAt<1100)return {kind:'shock',color:'#ffeaa2',priority:4};
 if(u.hp/u.maxHP<.22&&(u.moving||u.action))return {kind:'panic',color:'#86e7ff',priority:3};
 if(u.kills>=3&&u.action)return {kind:'fury',color:'#ffcf57',priority:5};
 if(u.furyUntil>time||u.empowered)return {kind:'anger',color:'#ff755c',priority:3};
 if(u.action&&Math.floor(time/1700+Number(u.id||0))%4===0)return {kind:'anger',color:'#ff755c',priority:1};
 return null;
}
export function paintEmotion(c,kind,x,y,size,color,time){
 c.save();c.translate(x,y+Math.sin(time/100)*.65);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2;c.lineCap='round';const r=size/2;
 c.shadowColor='#192326';c.shadowBlur=2;
 if(kind==='anger'){for(const [sx,sy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(sx*r,sy*2);c.lineTo(sx*3,sy*2);c.lineTo(sx*3,sy*r);c.stroke();}}
 if(kind==='shock'){for(const dx of [-3,3]){c.fillRect(dx-1,-r,2,8);c.fillRect(dx-1,4,2,2);}}
 if(kind==='panic'){for(const [dx,dy]of [[-4,0],[4,-3]]){c.beginPath();c.moveTo(dx,dy-r);c.quadraticCurveTo(dx+6,dy+3,dx,dy+5);c.quadraticCurveTo(dx-5,dy+3,dx,dy-r);c.fill();}}
 if(kind==='fury'){c.beginPath();c.moveTo(-8,6);c.lineTo(-10,-3);c.lineTo(-3,0);c.lineTo(0,-9);c.lineTo(3,0);c.lineTo(10,-3);c.lineTo(8,6);c.closePath();c.fill();c.fillStyle='#6c351c';c.fillRect(-6,3,12,2);}
 c.restore();
}
