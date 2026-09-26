import {mkdir,writeFile} from 'node:fs/promises';
const dir=new URL('../.local/obs/',import.meta.url);await mkdir(dir,{recursive:true});
for(const side of ['demon','human']){
 const source={name:'Game only',id:'browser_source',versioned_id:'browser_source',settings:{url:`http://127.0.0.1:${process.env.STAGE_PORT||4390}/?side=${side}&broadcast=1`,width:1920,height:1080,fps:30,reroute_audio:true,shutdown:false,restart_when_active:false,webpage_control_level:0}};
 const scene={name:'Interactive Game',id:'scene',settings:{items:[{name:'Game only',visible:true,locked:true,pos:{x:0,y:0},scale:{x:1,y:1},rot:0}]}};
 const data={name:`Interactive Game ${side}`,current_scene:'Interactive Game',current_program_scene:'Interactive Game',sources:[source,scene],scene_order:[{name:'Interactive Game'}],DesktopAudioDevice1:null,DesktopAudioDevice2:null,AuxAudioDevice1:null,AuxAudioDevice2:null,AuxAudioDevice3:null,AuxAudioDevice4:null};
 await writeFile(new URL(side+'.json',dir),JSON.stringify(data,null,2)+'\n',{mode:0o600});
}
console.log('Scene templates written under .local/obs/. No OBS settings changed, no stream key included, no broadcast started. Verify audio and a local recording before streaming.');
