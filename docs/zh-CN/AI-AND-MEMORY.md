# 给游戏加一个会说话的主持人

[English](../en/AI-AND-MEMORY.md) · [首页](../../README.zh-CN.md)

右下角主持人分三部分配置：**模型写她要说的话，语音服务把文字读出来，Live2D 负责形象和动作。** 三者分开，方便换角色或服务。先完成[本地试玩](../../examples/whitebridge/README.zh-CN.md)，再按下面的顺序添加。

## 1. 先让她能回应消息

项目当前用 API 生成解说。API 密钥是模型服务提供的调用凭证，需要从你使用的服务取得；调用按该服务的报价计费。

在项目根目录复制 `.env.example`，副本命名为 `.env`。使用 DeepSeek 时填写以下项目：

| 配置 | 填什么 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 你自己的 API 密钥 |
| `DEEPSEEK_MODEL` | 服务当前可调用的模型 ID |
| `DEEPSEEK_INPUT_USD_PER_MILLION` | 每百万输入 token 的美元单价 |
| `DEEPSEEK_OUTPUT_USD_PER_MILLION` | 每百万输出 token 的美元单价 |

示例值不是实时价目表，先在供应商控制台核对。重新启动游戏，打开 http://127.0.0.1:4391/settings.html ，在「魔女解说 · DeepSeek API」里设置预算并点击「保存并连接」。

用测试弹幕问一个问题，检查模型状态和回复。还没有装角色、语音时，先在设置或状态页确认生成是否成功；不要把没有声音直接当成模型没有回复。

想换其他服务，可以设置 `.env.example` 中的 `AI_MODEL`、`AI_CHAT_URL`、`AI_API_KEY` 和两项单价。这个自定义接入要求服务支持 Chat Completions 与 JSON Schema 输出；只改名称并不代表任意服务都兼容。

## 2. 添加语音

TTS 是“把文字合成为声音”。模型调用成功后，还要启用一个 TTS 服务才能听见解说。

### Apple Silicon Mac：本机合成

先安装 [uv](https://docs.astral.sh/uv/)，在项目根目录运行：

```sh
npm run voice:install -- --plan
npm run voice:install
```

第一条显示安装计划，第二条下载依赖和 Qwen3-TTS / MLX 模型。预留约 **8 GiB 磁盘**，冷启动需要约 **6.5 GiB 可用内存**。首次下载需要联网，安装后合成工作进程禁止联网。

安装完成后重启游戏，在设置页「解说语音 · 本地女声」点击「启用本机解说声音」，等待预热。项目提供固定的合成成年女声参考，每段话沿用同一音色。配置位于 `examples/whitebridge/.runtime/`。

### 云端合成

其他电脑或不想运行本地模型时，可以使用设置页提供的百炼语音选项。填写自己的 Key、对应地域和字符用量上限，点击「保存并启用语音」。云端语音与文字生成分别计费；先确认账号支持对应服务。

## 3. 安装 Live2D 角色

Live2D / Cubism 模型通常是一个文件夹，里面有 `model3.json`、模型数据和贴图。选择允许你使用、直播的模型，保留文件夹结构。视频里的魔女需要自行取得；源码里提供的是驱动代码。

当前安装器需要 Cubism 4 模型，以及下面四个运行库文件：

| 文件名 | 来源 / 版本 |
| --- | --- |
| `live2dcubismcore.min.js` | [Live2D 官方 Web SDK](https://www.live2d.com/en/sdk/download/web/)，按其条款取得 |
| `pixi.min.js` | PixiJS 6.5.10 |
| `unsafe-eval.min.js` | 与该 PixiJS 版本匹配的 @pixi/unsafe-eval |
| `cubism4.min.js` | pixi-live2d-display 0.4.0 的 Cubism 4 构建 |

把四个文件放进同一个运行库文件夹，然后运行下面的命令，把两个示例路径换成你的实际路径：

```sh
npm run host:install -- --model "/path/to/model.model3.json" --runtime "/path/to/runtime-folder"
```

刷新游戏。角色应能眨眼、呼吸、转动头身，并随播放中的语音张嘴。模型参数不同，动作幅度可能需要调整。半身构图通过 `examples/whitebridge/modules/pixel-war/public/empress/config.json` 的 `height` 和 `offsetY` 调整。

## 她会收到什么、记住什么

主持人收到的是有限战况和选中的观众消息。观众问答优先于闲聊；重复免费参战、没变化的血量和同一个地点不应反复播报。首领和小兵的文字气泡由本地规则生成，不调用模型，也不配音。

观众对话和已经发布的回复保存在本地 SQLite 数据库里，按平台身份区分；再次发言时取相关内容作为上下文。未播放的草稿不当成双方已经说过的话。保留期限和删除方式见[数据管理](SECURITY.md)。

模型没有操作电脑的工具。输出先经过程序校验，派兵、伤害和胜负仍由游戏规则处理。

## 检查费用和播放

DeepSeek 路径限制同时请求数量，并设置每小时、每天的请求数和金额预算；自定义接口也有频率上限。页面用量是估算，以供应商账单为准。达到预算或鉴权失败时，生成会停止，基础游戏仍可运行。

一段话按完整片段配音，减少逐句换音色。最后做一段 [OBS 录制](BILIBILI-AND-OBS.md)，听听讲话、音乐和音效是否平衡，看看口型是否跟随声音。设置显示“开启”之后，还需要确认最终录制里确实听得到。
