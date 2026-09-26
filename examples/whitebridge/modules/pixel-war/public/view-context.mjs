export function overlappingView(a,b){
 if(!a||!b)return false;
 const ix=Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2));
 const iy=Math.max(0,Math.min(a.y+a.h/2,b.y+b.h/2)-Math.max(a.y-a.h/2,b.y-b.h/2));
 return ix*iy/Math.min(a.w*a.h,b.w*b.h)>=.45;
}
