# 第三方内容与许可

[English](../en/THIRD_PARTY_NOTICES.md)

## 代码

项目自有代码和教程采用 MIT。唯一安装时依赖为 Brian Grinstead 的 [javascript-astar](https://github.com/bgrins/javascript-astar)，npm 版本 0.4.1，MIT。其 BinaryHeap 实现注明来自 Marijn Haverbeke，按 CC BY 3.0 提供；原声明保留在依赖源码中。许可文本见 `licenses/javascript-astar-LICENSE`，不要删去依赖内署名。

## LPC 角色

来源：[Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)，固定版本 `d44ea7d6904891aab8627b80ff4de1560d63bdff`。

`examples/whitebridge/modules/pixel-war/public/lpc/manifest.json` 列出 109 个实际 PNG、原路径与 SHA-256。`CREDITS.csv` 保留实际身体部件条目和所用武器/盾牌家族的作者、来源与许可选项；部分导出 PNG 路径与上游基础图集署名路径不同，因此保留完整相关家族，而不是省略这些署名。`SOURCE-README.md` 保留上游的许可说明。

原素材按各行列出的 CC BY-SA、CC BY、OGA-BY 或 GPL 等许可选项提供；选择和遵守适用的一项，不能把它们一概说成 MIT 或 CC0。本项目的调色、部件组合等角色视觉改编按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供，注明已做改编。原始素材的许可选择与署名仍保留，PNG 不加密，可独立取用。

## 配乐、音效

- [JRPG Epic Rock Battle Theme #1](https://opengameart.org/content/jrpg-epic-rock-battle-theme-1)，HydroGene，CC0。使用循环版，经分离、滤波、重新混音形成同步层；不是作者原始分轨。
- [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)，Sam Gossner、Simon Dalzell，采样剪辑 Elan Hickler / Soundemote，CC0；用于音效和结算短乐句。
- [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) 和 [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio)，Kenney，CC0；重新变调、组合、混音。

分发的处理后声音在 `examples/whitebridge/modules/pixel-war/public/audio/score/`，清单含 SHA-256。重建脚本列出下载来源；重建时按脚本下载所需源文件。动态模型输出、语音合成服务及模型权重不是以上 CC0 素材，需另行遵守供应商许可。

## 平台标识和礼物

Bilibili、小红书、OBS 等名称属于对应组织。本项目没有官方背书，也不取得商标权。示例礼物名称、ID 和价格用于演示绑定，不保证当前房间存在这些礼物。平台提供的礼物图片没有随包分发，已替换为项目自绘的通用礼盒符号（MIT）。

## 可选主持人与语音

自动 Cubism 驱动是 MIT 项目代码，模型及运行库按各自许可另装，不随源码再分发。assets/host-voice 的固定成年合成女声参考是项目制作的 CC0 音频，不是真人录音。Qwen3-TTS/MLX 权重与依赖需单独下载，遵循上游许可。代码保留DJ歌单播放支持，但不打包第三方商业录音；离线示例默认使用上列可分发配乐。
