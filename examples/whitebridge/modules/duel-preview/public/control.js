const $=id=>document.getElementById(id),token=document.querySelector('meta[name="owner-token"]').content;
async function action(data){try{const r=await fetch('/action',{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Token':token},body:JSON.stringify(data)});const a=await r.json();$('feedback').textContent=a.ok?'已执行。':'暂时无法执行：可能处于结算、检查状态，或援军预算不足。';}catch{$('feedback').textContent='虚拟机未连接。';}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action({type:b.dataset.action}));
$('speed').onchange=()=>action({type:'speed',speed:Number($('speed').value)});
$('inspect').onclick=()=>action({type:'inspect',rank:Number($('rank').value),pose:Number($('pose').value)});
$('summon').onclick=()=>action({type:'summon',side:$('side').value,kind:$('unit').value,lane:1});
async function poll(){try{const s=await(await fetch('/state')).json();$('status').textContent=`${({sparring:'切磋结界',showcase:'实战演示',inspection:'差分检查',settlement:'长辈接班'})[s.mode]} · ${s.speed} 倍速${s.paused?' · 已暂停':''}｜双方人口 ${s.population.demon} / ${s.population.human}`;}catch{$('status').textContent='虚拟机未连接。';}setTimeout(poll,1000);}poll();
