# 工具包结构与示例边界

[English](../en/ARCHITECTURE.md)

根目录教程负责完整搭建流程；`scripts/` 提供启动、OBS 导出和发布检查；`examples/whitebridge/` 保存示例游戏、运行时、素材、测试与重建脚本；`licenses/` 保留第三方声明。

根目录启动命令运行这个示例。`LiveGame`、连接服务和游戏规则仍有耦合，当前没有通用游戏插件契约，复用流程不等于无需改代码就能换游戏。

```text
本地测试消息 / B站事件 / 可选来源程序
                  ↓
连接服务（4392，随机令牌）→ 去重收据 / 头像处理
                  ↓
LiveGame + PixelWorld → 伤害、归属、命令、存档、对话上下文
        ↓                         ↕
画面服务（4390）           可选模型 / TTS
        ↓
浏览器或 OBS Browser Source

管理页面（4391）→ 带 Origin 与令牌校验的有限管理动作
```

三个端口默认仅监听本机。示例启动器把服务放在同一 Node 进程内；端口与逻辑分层不是操作系统隔离。需要进程以外的隔离时，可将服务放到专用低权限账户或虚拟机中运行。

| 想改什么 | 入口 |
| --- | --- |
| 攻击、单位、装备基础数值 | `examples/whitebridge/modules/pixel-war/public/catalog.mjs` |
| 观众奖励、价格与数量关系 | `examples/whitebridge/modules/pixel-war/public/gifts.mjs`、`gift-tiers.mjs`、`gift-strength.mjs` |
| 免费参战、冷却、命令反馈 | `examples/whitebridge/modules/live-runtime/interaction-feedback.mjs` |
| 玩家部队寿命与复活 | `examples/whitebridge/modules/pixel-war/service-life.mjs`、`examples/whitebridge/modules/live-runtime/rescue.mjs` |
| 资源据点、战线和寻路 | `campaign.mjs`、`navigation.mjs`、`strategy.mjs` |
| 像素人物和武器拼装 | `examples/whitebridge/modules/pixel-war/public/actors.mjs`、`procedural-weapons.mjs` |
| 镜头、头像和场外提示 | `examples/whitebridge/modules/pixel-war/public/camera.mjs`、`unit-marker-tracker.mjs`、`supporter-guides.mjs` |
| 王冠、换代与结算 | `crown-inheritance.mjs`、`leader-lineage.mjs`、`settlement.mjs` |
| AI 提示与输出校验 | `examples/whitebridge/modules/live-runtime/models.mjs`、`speech-request.mjs` |
| 记忆、活跃观众、历史 | `examples/whitebridge/modules/live-runtime/viewer-history.mjs` 及 audience 相关模块 |
| B站握手、心跳与事件 | `examples/whitebridge/modules/live-runtime/bilibili.mjs`、`examples/whitebridge/modules/connectors/bilibili-events.mjs` |
| 音乐和语音播放 | `examples/whitebridge/modules/pixel-war/public/music.mjs`、`audio-director.mjs`、`speech-playback.mjs` |

表格中未写完整前缀的游戏文件位于 `examples/whitebridge/modules/pixel-war/`。游戏的权威状态在服务端；修改画面不能直接给部队加伤害或伪造礼物。

音乐层是从获许可的立体声循环素材处理出来的打击/主题/力度混音层，不是作者原始乐器分轨。按同一时间轴混音避免换曲断裂。生成脚本在 `examples/whitebridge/scripts/build-game-score.py` 等文件中，从示例目录执行；重建需要额外 Python 音频依赖，**普通试玩不需要重建**。

本仓库保留部分迭代形成的命名和历史适配分支，优先维持可运行的游戏。下一步适合贡献：性能基准、端到端真实供应商测试、无障碍与英文界面、独立平台适配、数据保留/删除功能。
