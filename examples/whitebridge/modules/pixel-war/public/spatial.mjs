import {teamOf} from './allegiance.mjs';
// Frame-local broad phase. Never serialized into a saved world or sent to clients.
export class SpatialGrid {
 constructor(units,cell=160){this.cell=cell;this.buckets=new Map();this.units=units;for(let i=0;i<units.length;i++){const u=units[i],key=this.key(Math.floor(u.x/cell),Math.floor(u.y/cell));let b=this.buckets.get(key);if(!b)this.buckets.set(key,b=[]);b.push({u,i});}}
 key(x,y){return x*65536+y;}
 near(p,r,side=null){const out=[],c=this.cell,r2=r*r;for(let x=Math.floor((p.x-r)/c);x<=Math.floor((p.x+r)/c);x++)for(let y=Math.floor((p.y-r)/c);y<=Math.floor((p.y+r)/c);y++){const b=this.buckets.get(this.key(x,y));if(!b)continue;for(const {u} of b){if(u.hp<=0||side&&teamOf(u)!==teamOf(side))continue;const dx=u.x-p.x,dy=u.y-p.y;if(dx*dx+dy*dy<r2)out.push(u);}}return out;}
 pairs(radius,visit){const c=this.cell,r2=radius*radius;for(let i=0;i<this.units.length;i++){const a=this.units[i];if(a.hp<=0)continue;for(let x=Math.floor((a.x-radius)/c);x<=Math.floor((a.x+radius)/c);x++)for(let y=Math.floor((a.y-radius)/c);y<=Math.floor((a.y+radius)/c);y++){const b=this.buckets.get(this.key(x,y));if(!b)continue;for(const {u,i:i2} of b){if(i2<=i||u.hp<=0)continue;const dx=u.x-a.x,dy=u.y-a.y,d2=dx*dx+dy*dy;if(d2<r2)visit(a,u,d2);}}}}
}
