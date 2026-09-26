// Isolated regression fixture for the old offline conversation/relationship helpers.
// The broadcast server always constructs the real LiveGame with Luna-only speech.
import {LiveGame as Game} from '../../modules/live-runtime/game.mjs';
export class LiveGame extends Game {constructor(options={}){super({...options,generatedSpeechOnly:false});}}
