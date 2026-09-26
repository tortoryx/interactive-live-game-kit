import {FIELD_EVENTS,EVENT_NOTICE} from './public/event-catalog.mjs';
export function announceFieldEvent(w,kind,point,effectUntil){
 if(!FIELD_EVENTS[kind])return null;w.announcements??=[];
 const displayAt=Math.max(w.time,Math.min(w.time+EVENT_NOTICE.spacing*3,(w.announcements.at(-1)?.displayAt??-1e9)+EVENT_NOTICE.spacing));
 const e={displayAt,id:++w.serial,kind,at:w.time,x:point?.x,y:point?.y,effectUntil,until:Math.max(displayAt+16000,effectUntil||0)};
 w.announcements=w.announcements.filter(e=>e.until>w.time).slice(-11);w.announcements.push(e);return e;
}
