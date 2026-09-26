// Shared, reusable formation geometry. Forward is +x; y spans the ranks.
export const MUSTER_INTERVAL=60000;
export const MUSTER_LEAD=3400, MUSTER_DESCENT=850, MUSTER_TITLE_DROP=500, MUSTER_TITLE_HOLD=2000;
export const MUSTER_ASSEMBLE=MUSTER_DESCENT+MUSTER_TITLE_DROP+MUSTER_TITLE_HOLD, MUSTER_MARCH=11000;
export const MUSTER_SIZE=48, MUSTER_GROUPS=1, MUSTER_NPC_CAP=108;
const row=(x,ys)=>ys.map(y=>({x,y}));
const ring=Array.from({length:12},(_,i)=>({x:Math.cos(i*Math.PI/6)*100,y:Math.sin(i*Math.PI/6)*88}));
const shapes={
 dragon:Array.from({length:16},(_,i)=>({x:-165+i*22,y:Math.sin(i/15*Math.PI*2)*70})),
 tiger:[...row(90,[-90,0,90]),...row(45,[-90,-45,0,45,90]),...row(0,[-70,-25,25,70]),...row(-45,[-70,-25,25,70])],
 turtle:[...ring,...row(-28,[-24,24]),...row(28,[-24,24])],
 spear:[...row(120,[0]),...row(80,[-28,28]),...row(40,[-56,0,56]),...row(0,[-84,-28,28,84]),...row(-45,[-112,-67,-22,22,67,112])],
 serpent:Array.from({length:16},(_,i)=>({x:Math.cos(i/15*Math.PI*1.7)*100,y:Math.sin(i/15*Math.PI*1.7)*88})),
 claw:[...row(100,[-96,0,96]),...row(50,[-85,0,85]),...row(0,[-74,0,74]),...row(-50,[-62,0,62]),...row(-100,[-50,-16,16,50])],
 wings:[...row(110,[-115,115]),...row(70,[-90,90]),...row(30,[-65,65]),...row(-10,[-40,40]),...row(-50,[-16,16]),...row(-90,[-45,0,45]),...row(-130,[-70,0,70])],
 fangs:[...row(120,[-65,65]),...row(75,[-65,65]),...row(30,[-96,-32,32,96]),...row(-15,[-96,-32,32,96]),...row(-60,[-96,-32,32,96])]
};
export const MUSTER_FORMATIONS={
 human:[{id:'azure-dragon',name:'苍龙游阵',shape:'dragon',seal:'龙'},{id:'white-tiger',name:'白虎啸阵',shape:'tiger',seal:'虎'},{id:'black-tortoise',name:'玄武甲阵',shape:'turtle',seal:'武'},{id:'spearhead',name:'锋矢突击阵',shape:'spear',seal:'锋'}],
 demon:[{id:'ember-serpent',name:'炎蛇噬阵',shape:'serpent',seal:'蛇'},{id:'rift-claw',name:'裂爪杀阵',shape:'claw',seal:'爪'},{id:'demon-wings',name:'魔翼掠阵',shape:'wings',seal:'翼'},{id:'hell-fangs',name:'獠牙冲阵',shape:'fangs',seal:'牙'}]
};
export function formationSlots(id){const f=Object.values(MUSTER_FORMATIONS).flat().find(f=>f.id===id);return f?shapes[f.shape].flatMap(p=>[[-14,-13],[14,-13],[0,15]].map(([x,y])=>({x:p.x*2.2+x,y:p.y*2.2+y}))):[];}
export function formationSet(side,cycle){const list=MUSTER_FORMATIONS[side]||[];return Array.from({length:MUSTER_GROUPS},(_,i)=>list[(Math.max(0,cycle-1)+i)%list.length]);}
export function musterActive(state){const m=state.muster;return m&&m.version===2&&m.field===state.fieldEpoch&&state.time>=m.at&&state.time<m.until&&!state.campaign?.conquest&&state.mode!=='settlement'?m:null;}
