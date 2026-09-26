# Languages · 语言

[English home](../README.md) · [中文首页](../README.zh-CN.md)

| Language / 语言 | Workflow documentation / 流程文档 | Example UI / 示例界面 | Platform integration / 平台接入 |
| --- | --- | --- | --- |
| 简体中文 · zh-CN | Complete guide set / 完整指南 | Chinese / 中文 | See platform guide / 见平台指南 |
| English · en | Complete corresponding guide set / 完整对应指南 | Not translated; English controls guide provided / 尚未翻译，有英文操作说明 | Same code and limitations as Chinese / 与中文相同 |
| Other languages / 其他语言 | Not translated yet; contributions welcome / 暂无完整版本，可贡献翻译 | Not implemented / 未实现 | See platform guide / 见平台指南 |

The two guide sets cover workflow, replacing the example, platform/OBS setup, AI/voice/memory, architecture, development story, privacy, contribution, licensing, sharing and validation. See the machine-readable [language manifest](languages.json).

两套指南覆盖工作流、替换示例、平台与 OBS、AI/语音/记忆、架构、开发过程、隐私、贡献、许可、宣传和验收。目录由[语言清单](languages.json)检查。

## Add a language / 添加语言

1. Create `docs/<language-code>/` and translate every required guide listed in `languages.json`. Add a localized root README and example controls guide.
2. Keep commands, paths, API fields, budgets and capability limits aligned. Do not turn “unverified” into “supported.”
3. Add the language as `partial` until all required files are present and reviewed. Then update this table and the manifest.
4. Run `npm run docs:check` and `python3 scripts/release.py manifest`. The check verifies structure and links, not translation quality.

1. 建立 `docs/<语言代码>/`，按清单逐篇翻译，补本语言首页和示例操作指南。
2. 命令、路径、字段、费用上限与功能限制保持一致，不能把“未验证”翻成“已支持”。
3. 未齐全时标 `partial`，完成并审阅后才更新进度表。
4. 运行文档检查并更新发布白名单；自动检查不代替语言质量审阅。

Runtime UI translation is separate work: extract display strings, add locale selection, localize parsing/feedback and character prompts, choose appropriate voices, and test layout and meaning. Platform adapters need their own authorization and tests regardless of document language.

游戏界面多语言需要另做字符串提取、语言选择、指令与反馈、角色提示、音色和排版验证。平台适配始终需要自己的授权与联调。
