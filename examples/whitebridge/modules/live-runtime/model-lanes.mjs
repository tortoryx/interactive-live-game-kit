// Separate show generation from commentary; leave a page available for viewers.
export const modelLane=c=>c.audience?.selected?'reply:'+c.side+':'+c.audience.selected.id:c.speechRequest?.duet?'show:debate':c.speechRequest?.commentary?'show:observer':'background';
