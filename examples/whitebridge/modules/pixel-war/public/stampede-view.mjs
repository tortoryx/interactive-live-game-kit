import {HEIGHT} from './terrain.mjs';
export function drawStampedeRoute(c,e,time){
 const s=e.stampede;if(!s||s.finished)return;const waiting=time<e.impact,half=s.width/2;
 c.save();c.fillStyle=waiting?'#d6423230':'#d6423215';c.fillRect(e.x-half,0,s.width,HEIGHT);c.strokeStyle=waiting?'#ff8976b0':'#ff897645';c.lineWidth=3;c.setLineDash([24,18]);c.strokeRect(e.x-half,0,s.width,HEIGHT);c.setLineDash([]);
 c.strokeStyle='#ff93847a';c.lineWidth=6;for(let y=120+(time/9)%160;y<HEIGHT;y+=270){c.beginPath();c.moveTo(e.x-25,y-24);c.lineTo(e.x,y);c.lineTo(e.x+25,y-24);c.stroke();}
 c.font='bold 19px sans-serif';c.textAlign='center';c.strokeStyle='#32221d';c.lineWidth=5;const text=waiting?'兽潮 ↓ '+Math.ceil((e.impact-time)/1000)+'秒 · 伤及双方':'兽潮冲锋 ↓ · 伤及双方';c.strokeText(text,e.x,e.y-125);c.fillStyle='#ffac95';c.fillText(text,e.x,e.y-125);c.restore();
}
