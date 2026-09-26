"""Mandarin casting and direction. Contains no dialogue or executable user input."""
def character_performance(side, rank=0):
    age='沉稳、威严但精力充沛，语速利落。' if rank else '成年，胸腔发声，有底气。'
    if side=='empress':
        # Let the text carry conversational rhythm instead of directing a performance.
        return 'Vivian', None
    if side=='human':
        return 'Uncle_Fu', age+'英雄般的战场统帅，声音坚实、开阔、有金属般的力度。说普通话，用短促、带火气的日常口语跟面前的对手吵架。清楚、干脆，不用方言、不拖长尾音、不念稿、不尖叫。'
    return 'Uncle_Fu', age+'狠辣、阴沉但从容的魔王。厚重的低音，咬字干脆，带压低嗓音的冷笑和不耐烦。普通话，像对一个站在面前的人说话，不用四川话、不唱腔、不鬼叫、不气泡音，不念旁白。'

def level_character_wave(wave):
    import numpy as np
    x=np.asarray(wave,dtype=np.float32)
    if not x.size or not np.isfinite(x).all(): raise ValueError('invalid character audio')
    peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)))
    return x*min(3.0,.12/max(rms,1e-6),.87/max(peak,1e-6))


def synthesis_profile(side):
    # Keep casting randomness independent of request ordering and previous clips.
    # Sentence rhythm can follow the words; vocal identity must not be re-cast.
    if side == 'empress':
        return {'seed': 1729, 'temperature': .42, 'top_p': .82}
    return {'seed': None, 'temperature': .75, 'top_p': .9}
