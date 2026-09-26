export const modelReasonText=reason=>({upstream_400:'API 参数不被接受',upstream_401:'DeepSeek 密钥无效',upstream_402:'DeepSeek 余额不足',upstream_403:'DeepSeek 拒绝访问',upstream_404:'DeepSeek 模型不可用',upstream_429:'DeepSeek 限流，暂停30秒',api_cooldown:'API 冷却中',api_key_required:'需要 DeepSeek API 密钥',budget_limit:'模型预算已到上限',electron_account_selection_required:'等待确认新的 Electron 窗口',electron_access_restricted:'ChatGPT 暂时拒绝请求',electron_rate_limited:'ChatGPT 请求过快，正在冷却',electron_turn_uncertain:'这次网页回复超时，结果未确认',electron_needs_attention:'Electron 对话需要检查，已停止自动发送',electron_login_required:'ChatGPT 需要重新登录',electron_page_warming:'Instant 网页正在连接',electron_page_unavailable:'Instant 网页连接失败',electron_not_submitted:'网页未就绪，对话尚未发送',electron_instant_unavailable:'Instant 暂不可用',electron_profile_busy:'对话账号正在被其他任务使用',subscription_call_limit:'调用次数已达上限',codex_quota_reserve:'剩余额度低于保留线',playback_unavailable:'播报未开始，已跳过',interrupted_request:'连接中断，本条不自动重发',disabled:'未启用模型',codex_login_unavailable:'订阅登录不可用',codex_quota_unavailable:'额度状态未确认',broker_unavailable:'连接不可用',timeout_or_cancelled:'模型响应超时',model_timeout:'模型响应超时',connection_failed:'模型连接失败',stale_decision:'战况已变化，回复未采用',luna_max_unavailable:'解说 AI 不可用'}[reason]||'模型暂不可用');

export function connectionLabel(status={},side){
 const m=status.connections?.models||{},ai=status.readiness?.ai||{};
 if(m.state==='electron_access_restricted'||m.pages?.failureKind==='unusual_activity')return {text:'AI 暂停 · 网页检测到异常活动',tone:'paused',title:'ChatGPT 拒绝了生成请求，尚未获得新对白。自动请求已暂停，需要在该账号网页检查并确认恢复后才能继续；不会定时试发、切换账号或重发原消息。'};
 if(m.state==='electron_rate_limited'||m.pages?.failureKind==='rate_limited'){
  const seconds=Math.max(0,Math.ceil(((m.retryAt||m.pages?.retryAt||0)-Date.now())/1000));
  return {text:'AI 暂停 · 网页限流'+(seconds?' · '+Math.ceil(seconds/60)+' 分钟后检查':''),tone:'paused',title:'ChatGPT 显示 Too many requests。已暂停新对话和网页预热；冷却后检查恢复，不重发结果不明的消息。'};
 }
 if(m.state==='electron_page_warming'&&m.pages?.preparing>0&&!m.pages?.failureKind)return {text:'魔女解说 · 准备下一条',tone:'ready',title:'正在准备空闲 Instant 网页；新留言保留在有时限的队列中。'};
 const voice=status.connections?.voice;
 if(ai.available&&voice?.enabled&&voice.state==='character_budget_limit')return {text:'AI 对话可用 · 语音达到字符上限',tone:'paused',title:'本机角色语音已达到当前字符上限；对白会保留字幕。可在语音设置调整本机上限。'};

 if(m.transport==='electron'&&m.authenticated===true&&m.pages&&m.pages.ready===0&&!(m.pages.busy>0)){
  const warming=m.pages.preparing>0,interrupted=m.pages.failureKind==='navigation_interrupted';
  return {text:warming?'AI 网页 · 连接中':interrupted?'AI 网页 · 页面跳转中断':'AI 网页 · 连接失败',tone:'paused',title:'尚未发送对话。'+(warming?'正在准备空闲 Instant 网页。':interrupted?'新的聊天页面跳转被中止。请刷新专用 ChatGPT 窗口确认登录；旧窗口显示已登录，不代表新页面可用。恢复后会自动准备新页面，不重发结果不明的消息。':'请检查专用 ChatGPT 窗口的登录状态；恢复后会自动重连。')};
 }
 if(!ai.available){
  const recovery=ai.reason==='subscription_call_limit'&&Number.isFinite(m.callLimitResetAt)?' 本地次数最早于 '+new Date(m.callLimitResetAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' 腾出名额，其他额度条件仍须满足。':'';
  return {text:'AI 暂停 · '+modelReasonText(ai.reason),tone:'paused',title:'当前没有可用的 解说 AI 回复。'+modelReasonText(ai.reason)+'。'+recovery+' 每条留言以实际回复记录为准。'};
 }
 const pressure=Math.max(0,...[['hourCalls','hourLimitCalls'],['dayCalls','dayLimitCalls']].map(([u,l])=>m[l]>0?(m[u]||0)/m[l]:0));
 if(pressure>=.8)return {text:pressure>=.95?'AI · 余量留给观众回复':'AI · 自动对白降频，观众优先',tone:'paused',title:pressure>=.95?'自动对白已暂停，最后 5% 本地调用余量留给观众；随着滚动计数回落会恢复。':'本地调用达到 80%，自动对白每分钟最多生成一批。观众消息优先；调用上限保持不变。'};
 if(status.speechMode==='observer')return {text:m.state==='requesting'?'魔女解说 · 正在生成':m.transport==='api'?'魔女解说 · DeepSeek':'魔女解说 · 已连接',tone:'ready',title:'只有魔女解说和回应观众；首领与小兵保留本地战况气泡，不调用模型或配音。'};
 const command=ai.controllers?.[side],latest=ai.activity?.sides?.[side];
 const detail=command?'本代已执行 '+({raid_grain:'抢粮仓',raid_forge:'夺工坊',defend_grain:'守粮仓',defend_forge:'守工坊',auto:'战术部署'}[command.strategy]||command.strategy)+'，距今 '+Math.floor(command.ageMs/1000)+' 秒。':'本代尚无已执行的 解说 AI 战略指令；即时战术由游戏执行。';
 return {text:m.state==='requesting'?'解说 AI · 正在思考':command?.active?'解说 AI · 指挥已执行':'解说 AI · 对话可用',tone:'ready',title:'解说对话通道。'+detail+(latest?.state==='rejected'?'最近请求未采用：'+modelReasonText(latest.reason)+'。':'')+'每条留言以输入框旁的回复来源为准。'};
}

export function replyReceipt(snapshot,id){
 const a=snapshot?.audience;if(!a||!id)return null;
 const item=Object.values(a.active||{}).find(m=>m.id===id)||(a.preparing||[]).find(m=>m.id===id)||(a.history||[]).find(m=>m.id===id);if(!item)return null;
 if(['synthesizing','awaiting_playback'].includes(item.phase))return {text:item.phase==='synthesizing'?'回复已生成 · 正在准备语音':'语音已准备 · 等待播报',kind:'prepared',final:false};
 const reply=item.presentedText||item.reaction||item.reply;
 if(item.replyMode==='model'&&reply)return {text:item.model==='gpt-5.6-luna'?'解说 AI 已回复':'模型已回复',detail:reply,kind:'model',final:true};
 if(item.replyMode==='local'&&reply)return {text:'本地规则回复 · 非 解说 AI',detail:reply+'（'+modelReasonText(item.fallbackReason)+'）',kind:'local',final:true};
 if(item.phase==='unanswered'||item.status==='unanswered')return {text:'未回复 · '+modelReasonText(item.fallbackReason),detail:'这条留言未获得 解说 AI 回复，角色没有使用预写台词代答。',kind:'unanswered',final:true};
 if(item.phase==='ready')return {text:'回复已生成 · 等待播报',kind:'prepared',final:false};
 if(item.phase==='waiting_model')return {text:item.modelStarted?'解说 AI 正在读这条留言':'等待 解说 AI · 尚未调用',kind:'waiting',final:false};
 const text={sampled_out:'本条未抽中朗读',expired:'留言等待超时',queue_full:'留言队列已满',persona_retired:'首领已换代，本条未继续回复'}[item.status];
 return text?{text,kind:'skipped',final:true}:null;
}
