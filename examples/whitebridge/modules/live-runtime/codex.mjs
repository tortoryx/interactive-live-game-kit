import {LocalVoice} from '../local-voice/service.mjs';
export class CodexConnection {
 constructor(){this.voice=new LocalVoice();this.status={transport:'api',authenticated:false,state:'optional_local_voice',localVoice:this.voice.status()};}
 async refresh(){this.status.localVoice=this.voice.status();return this.status;}
 async request(path){if(path==='/voice/warm')return this.voice.warm();if(path==='/voice/cancel'||path==='/cancel'){this.voice.stop();return {ok:true};}return {ok:false,reason:'api_transport_required'};}
 async speak(c){return this.voice.speak(c);}
 stopVoice(){this.voice.stop();}
 stop(){this.voice.stop();}
 async decide(){return {ok:false,reason:'api_transport_required'};}
}
