import {giftPriceText} from './bili-gift-roster.mjs';
export function installGiftPicker({side,viewer,lane,post,notify,openButton}){
 const dialog=document.createElement('dialog');dialog.className='giftCatalog';dialog.setAttribute('aria-label','当前直播间礼物');
 const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();header.append(title,close);
 const hint=document.createElement('p');hint.textContent='本机测试，不扣费。这里只列当前房间公开面板中的礼物，特殊权益以平台面板为准。';
 const search=document.createElement('input');search.type='search';search.placeholder='搜索礼物或兵种';search.setAttribute('aria-label','搜索礼物或兵种');
 const list=document.createElement('div');list.className='catalogGrid';const nav=document.createElement('nav'),prev=document.createElement('button'),pageLabel=document.createElement('span'),next=document.createElement('button');prev.textContent='上一页';next.textContent='下一页';nav.append(prev,pageLabel,next);dialog.append(header,hint,search,list,nav);document.body.append(dialog);
 let rows=[],page=0,sentSide;
 function render(){const q=search.value.trim(),found=rows.filter(g=>(g.name+' '+g.label+' '+g.giftId).includes(q)),total=Math.max(1,Math.ceil(found.length/20));page=Math.min(page,total-1);list.replaceChildren();
 for(const g of found.slice(page*20,page*20+20)){const b=document.createElement('button');b.className='catalogGift';b.dataset.giftId=g.giftId;const img=document.createElement('img');if(/^\/gift-icons\/[a-z0-9-]+\.(png|gif|webp)$/.test(g.icon||''))img.src=g.icon;else img.hidden=true;img.alt=g.name;img.loading='lazy';const name=document.createElement('strong');name.textContent=g.name+' · '+giftPriceText(g);const reward=document.createElement('span');reward.textContent=g.label;b.append(img,name,reward);b.onclick=async()=>{try{const r=await post('/owner/gift',{side:sentSide,giftId:g.giftId,viewer:viewer(),lane:lane(),id:'test:'+crypto.randomUUID()});dialog.close();notify(r.status==='no_fallen_troops'?'最近一分钟没有可复活的部队':g.name+' · 已受理');}catch{notify('未发送，请检查当前连接');}};list.append(b);}
 pageLabel.textContent=(page+1)+' / '+total+' · '+found.length+' 个礼物';prev.disabled=page===0;next.disabled=page===total-1;
 }
 async function open(){sentSide=side();const data=await(await fetch('/play-menu?side='+sentSide)).json();rows=data.previewGifts;page=0;search.value='';title.textContent=data.name+' · 当前房间礼物';render();if(!rows.length){hint.textContent='当前房间礼物尚未核验。可以先用「参战」派兵，或在下方兵种栏免费测试。';}else hint.textContent='房间 '+data.roomId+' · 本机测试不扣费'+(data.giftPriceLimitMilli?' · 单件≤¥'+data.giftPriceLimitMilli/1000:'')+'；特殊权益以平台面板为准。';dialog.showModal();search.focus();}
 search.oninput=()=>{page=0;render();};prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};openButton.onclick=()=>open().catch(()=>notify('礼物目录暂时无法读取'));
 window.addEventListener('message',e=>{if(e.source!==document.getElementById('stage').contentWindow||e.origin!=='http://127.0.0.1:4390'||e.data?.type!=='gift-catalog')return;open().catch(()=>notify('礼物目录暂时无法读取'));});
}
