// Dialogue can wait for Max reasoning; battle orders must remain fresh.
export const MODEL_SPEECH_MS = 45000;
export const MODEL_ORDER_MS = 19500;
export const MODEL_BRIDGE_MS = MODEL_SPEECH_MS + 2000;
export const MODEL_CLIENT_MS = MODEL_SPEECH_MS + 4000;
export const MODEL_REPLY_AGE_MS = MODEL_SPEECH_MS + 5000;
export const MODEL_QUEUE_MS = MODEL_CLIENT_MS * 2;

export const INSTANT_BRIDGE_MS = 62000;
