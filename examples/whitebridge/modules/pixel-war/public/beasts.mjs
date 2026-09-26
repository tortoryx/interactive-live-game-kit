// Reusable articulated pixel geometry. No generated bitmap assets.
const r=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
export function drawBeast(c,u,time){
 if(u.stampede&&u.hp>0){drawChargeBeast(c,u,time);return;}
 const giant=u.kind==='ogre',scale=giant?1.8:1.2,walk=u.moving?Math.sin(u.walkPhase/140):0,attack=u.action?Math.sin(Math.max(0,Math.min(1,(time-u.action.started)/(u.action.until-u.action.started)))*Math.PI):0;
 c.save();c.translate(Math.round(u.x),Math.round(u.y));c.fillStyle='#1f242c88';c.beginPath();c.ellipse(0,0,giant?48:29,giant?15:9,0,0,7);c.fill();c.scale(Math.cos(u.face)<0?-scale:scale,scale);if(u.hp<=0){c.globalAlpha=Math.max(0,1-(time-u.deadAt)/4500);c.rotate(-Math.PI/2);}c.translate(attack*9,-Math.abs(walk)*2);
 for(const [x,phase]of[[-17,1],[12,-1]]){r(c,'#292e30',x+walk*phase*3,-16,9,17);r(c,'#6d6962',x+walk*phase*3,-14,6,12);r(c,'#dad2af',x+walk*phase*3-1,-3,11,4);}
 r(c,'#272d30',-30,-42,61,29);r(c,giant?'#596366':'#765247',-28,-40,57,25);r(c,giant?'#889187':'#a17156',-23,-39,48,8);r(c,'#3e4140',-24,-22,47,8);
 if(giant){for(let i=0;i<5;i++){r(c,'#333e44',-25+i*10,-49-(i%2)*5,12,23);r(c,'#939e96',-23+i*10,-48-(i%2)*5,7,6);r(c,'#d3814a',-19+i*10,-34,3,8);}r(c,'#242d32',-5,-59,19,14);r(c,'#7f8b84',-3,-58,13,9);}else{for(let i=0;i<7;i++)r(c,'#353437',-27+i*7,-46,4,10);}
 r(c,'#353337',23,-43,23,25);r(c,giant?'#8d8781':'#ba8568',26,-42,19,19);r(c,'#eadcb0',34,-44,6,11);r(c,'#3e3b39',36,-44,2,5);r(c,'#25292a',29,-37,12,5);r(c,'#ffd889',34,-37,5,3);r(c,'#3d3033',39,-26,11,7);r(c,'#efe3b7',41,-22,5,9);r(c,'#ffffff',42,-22,2,7);r(c,'#292b2d',-36,-34,10,5);
 if(time-u.hitAt<100&&time>=u.hitAt){c.globalAlpha=.55;r(c,'#fff0c2',-25,-40,69,20);}c.restore();
 if(u.hp>0){c.save();c.strokeStyle='#ff786a';c.lineWidth=2;c.beginPath();c.ellipse(u.x,u.y+2,giant?48:29,giant?15:9,0,0,7);c.stroke();c.font='bold 11px sans-serif';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#291b1b';c.strokeText('无差别攻击',u.x,u.y-(giant?122:82));c.fillStyle='#ff9384';c.fillText('无差别攻击',u.x,u.y-(giant?122:82));c.restore();}
}
function drawChargeBeast(c,u,time){
 const giant=u.kind==='ogre',s=giant?1.65:1.15,k=u.moving?Math.sin(u.walkPhase/95):0;c.save();c.translate(u.x,u.y);c.scale(s,s);
 c.fillStyle='#5c30275c';c.beginPath();c.ellipse(0,2,32,12,0,0,7);c.fill();c.strokeStyle='#ff786a';c.lineWidth=2;c.stroke();
 // Four alternating legs, a low head and twin tusks face down the route.
 for(const x of [-22,15])for(const y of [-38,-9]){r(c,'#2d3030',x,y+k*(x<0?1:-1)*5,8,18);r(c,'#c3b78e',x,y+14+k*(x<0?1:-1)*5,8,4);}
 const poly=(color,points)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
 poly('#292c2c',[[-14,-69],[14,-69],[26,-53],[27,-21],[18,-6],[-18,-6],[-27,-21],[-26,-53]]);
 poly(giant?'#77847c':'#98694f',[[-12,-65],[12,-65],[23,-50],[22,-23],[13,-10],[-13,-10],[-22,-23],[-23,-50]]);
 poly(giant?'#a0aaa0':'#bd8760',[[-9,-64],[9,-64],[16,-53],[12,-46],[-12,-46],[-16,-53]]);
 for(let i=0;i<4;i++)poly('#42403a',[[-5,-65+i*7],[6,-65+i*7],[0,-55+i*7]]);
 poly('#313033',[[-20,-37],[-34,-45],[-30,-21],[-23,-20],[-25,-6],[-14,8],[14,8],[25,-6],[23,-20],[30,-21],[34,-45],[20,-37]]);
 poly(giant?'#919789':'#b78564',[[-18,-34],[-23,-22],[-22,-6],[-11,5],[11,5],[22,-6],[23,-22],[18,-34]]);
 poly('#d4ae82',[[-13,-12],[13,-12],[17,-2],[10,5],[-10,5],[-17,-2]]);
 for(const x of [-9,6])r(c,'#342d2c',x,-5,4,5);
 for(const sign of [-1,1]){poly('#f5e4b0',[[sign*18,-5],[sign*28,-13],[sign*28,4],[sign*20,12],[sign*14,8]]);poly('#c29c71',[[sign*25,-35],[sign*29,-38],[sign*27,-24],[sign*24,-23]]);}
 r(c,'#2a2628',-17,-23,12,6);r(c,'#2a2628',5,-23,12,6);r(c,'#ff7665',-13,-21,6,3);r(c,'#ff7665',7,-21,6,3);
 if(giant)for(const x of [-25,12])poly('#9da69c',[[x,-59],[x+7,-69],[x+15,-54],[x+13,-37],[x,-39]]);
 if(u.moving){for(let i=0;i<4;i++){const t=(time/45+i*11)%36;r(c,'#c1a57c55',(i%2?1:-1)*(12+i*3),-73-t,5+t*.22,9+t*.35);}}
 c.restore();
}
