import {hash,biomeAt,COLS,CELL} from './terrain.mjs';
export {makeLandscape,applyTerrainDamage,drawLandscape,landscapeObjects} from './terrain-renderer.mjs';
function rect(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
export function drawScenery(c,o){const{x,y}=o;
 if(o.kind==='house'){const dark=o.side==='demon';rect(c,'#202a2d90',x-42,y-6,92,23);rect(c,dark?'#77776b':'#86887b',x-34,y-45,68,51);rect(c,dark?'#55453b':'#3e5159',x-42,y-64,84,22);rect(c,dark?'#7b614b':'#637c84',x-30,y-72,60,10);rect(c,'#29312f',x-9,y-26,18,32);rect(c,'#c2a473',x-26,y-29,10,13);rect(c,'#c2a473',x+16,y-29,10,13);return;}
 if(o.kind==='camp'){const col=o.side==='demon'?'#936846':'#597d94';rect(c,'#3f4740',x-85,y-25,180,40);for(let s=-1;s<=1;s+=2){rect(c,'#5d5847',x+s*62-20,y-112,40,104);rect(c,'#8d8975',x+s*62-16,y-108,32,88);for(let i=0;i<4;i++)rect(c,'#655e4b',x+s*62-24+i*15,y-122,10,18);rect(c,col,x+s*62-8,y-70,16,25);}rect(c,'#716f60',x-47,y-101,94,42);rect(c,'#282e29',x-25,y-59,50,53);rect(c,col,x-44,y-105,88,10);return;}
 if(o.kind==='barrier'){rect(c,'#3c423a',x-17,y-3,35,8);for(const dx of [-12,0,12]){rect(c,'#392f24',x+dx-3,y-31,7,33);rect(c,'#897256',x+dx-2,y-30,3,29);rect(c,'#b3a080',x+dx-2,y-33,3,3);}rect(c,'#705132',x-17,y-23,35,5);rect(c,'#827058',x-17,y-22,35,2);rect(c,'#705132',x-17,y-11,35,5);return;}
 if(o.kind==='tree'){if(biomeAt(x,y).side==='demon'){rect(c,'#303f38',x-23,y-4,48,14);rect(c,'#5b5145',x-4,y-42,8,46);for(const[dy,w,col]of[[-82,22,'#73817a'],[-65,36,'#52685c'],[-44,50,'#40574b'],[-24,62,'#33473e']]){rect(c,col,x-w/2,y+dy,w,17);rect(c,'#9aa08b44',x-w/2+3,y+dy,w-10,3);}return;}const seed=hash(x,y),sz=seed>.5?1:0;rect(c,'#364638',x-20,y-5,44,13);rect(c,'#493f2e',x-4,y-37,8,41);rect(c,'#6c5b39',x-2,y-35,3,35);
  for(const[dy,w,h,col]of[[-62,30,14,'#30443a'],[-52,48,21,'#3c5343'],[-37,56,19,'#374c3e'],[-61,22,7,'#68765b'],[-49,32,8,'#586c53'],[-31,34,5,'#4b5e47']])rect(c,col,x-w/2+(sz?3:-2),y+dy,w,h);rect(c,'#788468',x-9,y-53,9,3);return;}
 if(o.kind==='rock'){rect(c,'#3d473f',x-11,y-2,25,7);rect(c,'#555e54',x-13,y-14,26,15);rect(c,'#7c8378',x-9,y-20,18,12);rect(c,'#9da18c',x-7,y-20,12,3);return;}
 rect(c,'#43533d',x-9,y-7,18,9);rect(c,'#68765a',x-5,y-10,12,5);}

export function sceneryIntact(land,o){return o.kind==='camp'||!land.changes?.[Math.floor(o.y/CELL)*COLS+Math.floor(o.x/CELL)];}
