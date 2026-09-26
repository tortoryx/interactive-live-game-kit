const $=id=>document.getElementById(id),canvas=$('battle'),ctx=canvas.getContext('2d');
const side=new URLSearchParams(location.search).get('side')==='human'?'human':'demon';
document.body.className=side+'-view';$('viewLabel').textContent=side==='human'?'勇者视角 · 小红书阵营':'魔族视角 · B站阵营';
function resize(){const s=Math.min(innerWidth/1920,innerHeight/1080);$('stage').style.transform=`scale(${s})`;$('stage').style.left=`${(innerWidth-1920*s)/2}px`;$('stage').style.top=`${(innerHeight-1080*s)/2}px`;}
addEventListener('resize',resize);resize();
const images={};await Promise.all(['demon-dynasty-v1','human-dynasty-v1','troops-v1'].map(async key=>{const i=new Image();i.src='/assets/'+key+'.png';try{await i.decode();images[key]=i;}catch{console.warn('Asset unavailable:',key);}}));
const color={demon:'#d07965',human:'#84b3c1',neutral:'#e2b573'};
const project=(x,y)=>({x:240+x*1.2,y:265+y*.82});
const ground=document.createElement('canvas');ground.width=1920;ground.height=1080;const g=ground.getContext('2d');
let seed=27;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
function polygon(c,points,fill,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
function drawGround(){
  const bg=g.createRadialGradient(960,520,90,960,520,1100);bg.addColorStop(0,'#39382d');bg.addColorStop(.6,'#252922');bg.addColorStop(1,'#0a1010');g.fillStyle=bg;g.fillRect(0,0,1920,1080);
  for(let i=0;i<6000;i++){g.fillStyle=`rgba(200,175,125,${random()*.042})`;g.fillRect(random()*1920,random()*1080,1+random()*3,1+random()*2);}
  g.save();g.translate(240,265);g.scale(1.2,.82);
  for(let ring=5;ring>=0;ring--){const d=ring*9;polygon(g,[[70-d,38-d],[1130+d,38-d],[1180+d,88-d],[1180+d,615+d],[1130+d,665+d],[70-d,665+d],[20-d,615+d],[20-d,88-d]],ring%2?'#21241e':'#494738','#625940');}
  polygon(g,[[70,50],[1130,50],[1160,80],[1160,620],[1130,650],[70,650],[40,620],[40,80]],'#514b3b','#73664b');
  g.save();g.beginPath();g.rect(65,65,1070,570);g.clip();
  for(let y=50;y<660;y+=39)for(let x=20-(Math.floor(y/39)%2)*42;x<1160;x+=84){
    const c=Math.floor(57+random()*14);g.fillStyle=`rgb(${c+13},${c+9},${c})`;g.fillRect(x+2,y+2,79,34);g.strokeStyle='#39392d';g.strokeRect(x+2,y+2,79,34);g.strokeStyle='#83725735';g.beginPath();g.moveTo(x+3,y+3);g.lineTo(x+80,y+3);g.stroke();
    if(random()>.74){g.strokeStyle='#302e2570';g.beginPath();g.moveTo(x+8,y+5);g.lineTo(x+23,y+17);g.lineTo(x+30,y+18);g.stroke();}
  }
  g.fillStyle='#8f785224';for(const y of [145,350,555])g.fillRect(65,y-42,1070,84);
  g.lineWidth=1;g.strokeStyle='#ab90663b';for(const y of [108,182,313,387,518,592]){g.beginPath();g.moveTo(65,y);g.lineTo(1135,y);g.stroke();}
  g.restore();
  for(const y of [220,415]){
    polygon(g,[[400,y+3],[800,y+3],[800,y+58],[400,y+58]],'#201f1b','#746242');
    for(let x=400;x<800;x+=40){g.fillStyle=x%80?'#55503d':'#635a44';g.fillRect(x+1,y-13,38,52);g.fillStyle='#312e25';g.fillRect(x+1,y+39,38,18);g.strokeStyle='#8d795243';g.strokeRect(x+1,y-13,38,52);}
    for(const x of [413,787]){g.fillStyle='#272823';g.fillRect(x-16,y-20,32,64);g.fillStyle='#928060';g.fillRect(x-20,y-27,40,9);g.fillStyle='#655e48';g.fillRect(x-15,y-18,30,9);}
  }
  for(const [x,team]of [[113,'demon'],[1087,'human']])for(const y of [95,605]){
    g.strokeStyle='#b5a06b';g.lineWidth=3;g.beginPath();g.moveTo(x,y+12);g.lineTo(x,y-54);g.stroke();polygon(g,[[x,y-55],[x+(x<600?44:-44),y-52],[x+(x<600?40:-40),y-14],[x,y-22]],team==='demon'?'#682e31':'#32525d','#968059');
  }
  g.restore();
  for(let i=0;i<100;i++){const x=290+random()*1340,y=925+random()*74;g.strokeStyle='#a2926730';g.beginPath();g.moveTo(x,y);g.lineTo(x+random()*40,y-2);g.stroke();}
  const fade=g.createLinearGradient(0,0,0,1080);fade.addColorStop(0,'#0c100fbf');fade.addColorStop(.23,'#0c100f00');fade.addColorStop(.77,'#0c100f00');fade.addColorStop(1,'#0c100fd9');g.fillStyle=fade;g.fillRect(0,0,1920,1080);
}
drawGround();
let state=null,previous=null,received=0,lastSuccess=performance.now(),lastSpeech=0,shownSpeech=null,speaking=null,sound=false,voiceQueue=[],audio=null;
const seenVoice=new Set(),unitKeys=['militia','shield','pike','bow','rider','mage','healer','siege'];
// Original RGBA atlas has organically spaced rows. Measured sprite frames avoid
// slicing heads at assumed quarter-height boundaries; source pixels stay intact.
const troopFrames=[[20,29,231,276],[348,10,215,291],[628,10,306,293],[986,27,217,278],[44,297,262,324],[367,322,215,301],[686,313,195,305],[955,314,263,311],[34,625,252,293],[348,626,248,291],[634,621,300,307],[989,644,224,279],[33,898,283,356],[373,916,203,334],[666,915,218,334],[956,919,259,323]];
function crown(x,y,scale){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);polygon(ctx,[[-16,5],[-20,-9],[-8,-2],[0,-15],[8,-2],[20,-9],[16,5]],'#ba9454','#e2c276');ctx.fillStyle='#684546';ctx.fillRect(-12,1,24,3);ctx.restore();}
function sprite(u,x,y,size,portrait=false){
  ctx.save();let pose=Math.max(0,Math.min(3,u.pose||0));if(speaking?.side===u.side&&portrait)pose=speaking.audio?.includes('Panic')?3:speaking.audio?.includes('Brag')?1:pose;
  if(u.hp<=0){ctx.globalAlpha=.7;ctx.filter='grayscale(1)';}
  if(u.kind==='hero'){
    const img=images[u.side+'-dynasty-v1'];if(img){const cell=img.width/4,row=Math.min(2,u.rank||0);ctx.drawImage(img,pose*cell,row*img.height/3,cell,img.height/3,x-size/2,y-size,size,size);}
    for(let r=2;r<Math.min(u.rank||0,7);r++)crown(x,y-size+(2-(r-2)*11)*(size/362),size/410);
  }else{
    const img=images['troops-v1'],index=unitKeys.indexOf(u.kind)+(u.side==='demon'?8:0);
    if(img){const [sx,sy,w,h]=troopFrames[index],width=size*w/h;ctx.drawImage(img,sx,sy,w,h,x-width/2,y-size,width,size);}
    else{ctx.fillStyle=color[u.side];ctx.fillRect(x-8,y-25,16,25);}
  }
  ctx.restore();
}
function ellipse(x,y,rx,ry,fill,stroke){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function fighter(u,wallTime){
  let x=u.x,y=u.y;
  const old=previous?.heroes?.[u.side]?.id===u.id?previous.heroes[u.side]:previous?.units?.find(v=>v.id===u.id);
  const t=Math.min(1,(wallTime-received)/100);
  if(old){x=old.x+(u.x-old.x)*t;y=old.y+(u.y-old.y)*t;}
  const p=project(x,y),isHero=u.kind==='hero',size=isHero?148:u.kind==='siege'?94:u.kind==='rider'?86:70;
  const moving=old&&Math.hypot(u.x-old.x,u.y-old.y)>.8&&!state.paused;
  const bob=moving?Math.sin(state.time*.013+Number(u.id.replace(/\D/g,'')))*2:0;
  ctx.globalAlpha=u.hp<=0?.35:1;ellipse(p.x,p.y+3,isHero?36:22,isHero?10:6,'#07090877');ctx.lineWidth=isHero?2:1;
  ellipse(p.x,p.y+1,isHero?33:18,isHero?9:5,null,color[u.side]+'bb');
  if(isHero&&state.mode==='sparring')ellipse(p.x,p.y-size*.4,40,62,null,color[u.side]+'29');
  sprite(u,p.x,p.y+bob,size);ctx.globalAlpha=1;
  const width=isHero?65:32,by=p.y-size-7;
  ctx.fillStyle='#100e0cd9';ctx.fillRect(p.x-width/2-1,by-1,width+2,5);ctx.fillStyle=color[u.side];ctx.fillRect(p.x-width/2,by,width*Math.max(0,u.hp/u.maxHP),3);
  if(isHero){ctx.font='15px "Songti SC",serif';ctx.textAlign='center';ctx.fillStyle='#edddba';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(u.name,p.x,p.y+23);ctx.shadowBlur=0;}
  if(u.shield>0)ellipse(p.x,p.y-size*.45,size*.24,size*.42,null,'#b9b88b80');
}
function draw(wallTime){
  ctx.clearRect(0,0,1920,1080);ctx.drawImage(ground,0,0);
  if(state){
    const visualTime=state.time;
    for(const h of state.hazards){const p=project(h.x,h.y),landed=visualTime>=h.impact;ctx.lineWidth=2;
      ellipse(p.x,p.y,h.radius*1.2,h.radius*.82,landed?'#9f4b2f77':'#a1492638',landed?'#edb479':'#df8c57aa');
      if(!landed){const f=Math.max(0,(h.impact-visualTime)/2400);ellipse(p.x,p.y,h.radius*1.2*f,h.radius*.82*f,null,'#edc881');ctx.fillStyle='#e6bc7f';ctx.font='19px serif';ctx.textAlign='center';ctx.fillText('落石',p.x,p.y+6);}
    }
    for(const item of state.pickups.filter(p=>!p.used)){const p=project(item.x,item.y);ellipse(p.x,p.y+7,19,6,'#c8b57722');ctx.save();ctx.translate(p.x,p.y-5);ctx.rotate(Math.sin(visualTime*.003)*.08);ctx.fillStyle=item.kind==='heal'?'#91b37e':'#d3bb79';ctx.strokeStyle='#e6dca8';ctx.lineWidth=1.5;
      if(item.kind==='heal'){ctx.fillRect(-6,-9,12,18);ctx.strokeRect(-6,-9,12,18);ctx.fillStyle='#a58b60';ctx.fillRect(-4,-14,8,5);ctx.fillStyle='#ebead4';ctx.fillRect(-4,-2,8,3);ctx.fillRect(-1,-5,3,9);}else polygon(ctx,[[0,-13],[10,-7],[8,5],[0,14],[-8,5],[-10,-7]],'#ac955bbb','#e7cf8c');ctx.restore();}
    const fighters=[...Object.values(state.heroes),...state.units].sort((a,b)=>a.y-b.y);for(const u of fighters)fighter(u,wallTime);
    for(const m of state.missiles){const p=project(m.x,m.y);ctx.save();ctx.shadowColor=color[m.side];ctx.shadowBlur=m.kind==='bow'?0:15;ctx.fillStyle=color[m.side];if(m.kind==='bow'){ctx.fillRect(p.x-8,p.y-3,16,3);}else ellipse(p.x,p.y-15,m.kind==='siege'?10:6,m.kind==='siege'?9:6,color[m.side]);ctx.restore();}
    for(const e of state.events){const age=visualTime-e.at,f=age/1000,p=project(e.x||0,e.y||0);if(age>1000)continue;ctx.save();ctx.globalAlpha=Math.max(0,1-f);
      if(e.kind==='hit'&&e.amount){ctx.font=`${e.amount>=100?'bold 24px':'18px'} Georgia`;ctx.textAlign='center';ctx.fillStyle=e.side==='neutral'?'#e7b27c':'#f2dfb4';ctx.strokeStyle='#291710';ctx.lineWidth=3;ctx.strokeText(e.amount,p.x+Math.sin(e.id)*14,p.y-78-f*40);ctx.fillText(e.amount,p.x+Math.sin(e.id)*14,p.y-78-f*40);}
      if(e.kind==='sweep'){ctx.strokeStyle=color[e.side];ctx.lineWidth=8*(1-f);ctx.beginPath();ctx.ellipse(p.x,p.y-30,40+f*145,20+f*65,0,.1,Math.PI*1.8);ctx.stroke();}
      if(e.kind==='burst'||e.kind==='meteor'){for(let i=0;i<9;i++){const a=i*.7+e.id,r=8+f*(e.kind==='meteor'?130:50);ctx.fillStyle=i%2?'#e7bd7d':'#784839';ctx.fillRect(p.x+Math.cos(a)*r,p.y-20+Math.sin(a)*r*.65-f*30,7*(1-f)+2,7*(1-f)+2);}}
      if(e.kind==='heal'){const to=project(e.toX,e.toY);ctx.strokeStyle='#a3caa18a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y-25);ctx.quadraticCurveTo((p.x+to.x)/2,p.y-90,to.x,to.y-30);ctx.stroke();}
      ctx.restore();
    }
    // These are the same static sprite sheets used by the two in-world heroes.
    sprite(state.heroes.demon,150,865,425,true);sprite(state.heroes.human,1770,865,425,true);
    for(const [x,c]of [[301,'#925146'],[1618,'#648b94']]){ctx.strokeStyle=c+'50';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,485);ctx.lineTo(x,850);ctx.stroke();}
  }
  requestAnimationFrame(draw);
}
function updateUI(s){
  const labels={sparring:'切磋中 · 结界开启',showcase:'实战演示',inspection:'角色差分检查',settlement:'这一代的终点'};
  for(const team of ['demon','human']){const h=s.heroes[team];$(team+'Name').textContent=h.name;$(team+'Label').textContent=h.name;
    $(team+'Crown').textContent=h.rank===0?'初代 · 无冠':`第 ${h.rank+1} 辈 · ${h.rank} 冠`;
    $(team+'Kin').textContent=h.rank===0?(team==='demon'?'魔王的小儿子':'年轻的勇者'):h.rank===1?(team==='demon'?'索恩他爹':'阿岚他爹'):h.rank===2?(team==='demon'?'索恩他爹的爹':'阿岚他爹的爹'):'刚才那位的爹';
    const sparring=s.mode==='sparring';$(team+'HP').style.width=Math.max(0,(sparring?h.training:h.hp)/h.maxHP*100)+'%';$(team+'Health').textContent=sparring?`切磋结界 ${Math.ceil(h.training).toLocaleString()} · 生命受保护`:`生命 ${Math.ceil(h.hp).toLocaleString()} / ${Math.round(h.maxHP).toLocaleString()}`;$(team+'Army').textContent=`在场兵力 ${s.population[team]} / 30`;
  }
  const seconds=Math.floor(s.time/1000);$('clock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('mode').textContent=labels[s.mode]+(s.paused?' · 暂停':'');$('round').textContent=s.round;$('wins').textContent=`${s.wins.demon} : ${s.wins.human}`;
  $('barrierNote').textContent=s.mode==='sparring'?'切磋结界生效 · 英雄不会阵亡':s.mode==='inspection'?'静态立绘 · 表情与动作差分':'实战演示 · 败方长辈接班';
  const events=s.events.filter(e=>e.kind==='summon').slice(-2);$('eventFeed').replaceChildren(...events.map(e=>{const a=document.createElement('span');a.textContent=`系统援军 · ${e.side==='demon'?'魔族':'人类'} ${e.unit}`;return a;}));
  if(s.result){$('result').hidden=false;$('resultTitle').textContent=s.result.winner?`${s.heroes[s.result.dead[0]].name}，退场`:'双方停战';$('resultText').textContent=s.result.dead.length?'长辈正在赶来 · 败方角色会更换':'本场超时 · 双方身份保留';}else $('result').hidden=true;
  for(const line of s.speech){if(line.id<=lastSpeech)continue;lastSpeech=line.id;shownSpeech=line;if(sound&&line.audio&&!seenVoice.has(line.id)&&s.heroes[line.side].id===line.persona){voiceQueue.push(line);seenVoice.add(line.id);}}
  voiceQueue=voiceQueue.filter(l=>s.heroes[l.side].id===l.persona&&s.time-l.at<16000).slice(-2);
  if(speaking&&s.heroes[speaking.side].id!==speaking.persona){audio?.pause();speaking=null;audio=null;}
  if(!speaking&&shownSpeech){$('speaker').textContent=s.heroes[shownSpeech.side]?.name||'';$('line').textContent=shownSpeech.text;}
  playNext();
}
function playNext(){if(!sound||speaking||!voiceQueue.length)return;const line=voiceQueue.shift();speaking=line;audio=new Audio('/audio/'+line.audio+'.wav');audio.volume=.8;$('speaker').textContent=state.heroes[line.side].name;$('line').textContent=line.text;
  const done=()=>{speaking=null;audio=null;playNext();};audio.onended=done;audio.onerror=done;audio.play().catch(()=>{sound=false;$('audio').textContent='♫ 点击重新启用配音';$('audio').className='';done();});}
$('audio').onclick=()=>{sound=!sound;$('audio').textContent=sound?'♫ 角色配音已开启':'♫ 开启角色配音';$('audio').className=sound?'enabled':'';if(!sound){audio?.pause();speaking=null;audio=null;voiceQueue=[];}else{const line=state?.speech.filter(l=>l.audio&&state.heroes[l.side].id===l.persona).at(-1);if(line){voiceQueue=[line];playNext();}}};
async function poll(){try{const r=await fetch('/state');if(!r.ok)throw new Error('disconnected');const s=await r.json();previous=state;state=s;received=performance.now();lastSuccess=received;$('connection').hidden=true;updateUI(s);}catch{if(performance.now()-lastSuccess>2000){$('connection').hidden=false;audio?.pause();}}setTimeout(poll,100);}
requestAnimationFrame(draw);poll();
