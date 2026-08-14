# Windows 真实运行验收：翻译与词条

## 环境与方法

- 日期：2026-08-14
- 平台：Windows，Tauri 开发二进制 `target/debug/lingostack-app.exe`
- 启动：`pnpm tauri dev --no-watch`
- 操作：通过桌面可访问性树设置翻译原文、触发“翻译”，观察任务状态、译文、词条区域与 tooltip。
- 安全：使用本机既有配置完成真实调用；记录中不读取、不输出提供商身份或 API Key。

## 首次运行发现与修复

首次运行成功进入新的 `translation_plan` / `effective_translation_prompt` / `chat_stream` 链路并产生部分中文译文，随后出现：

```text
响应流解析错误: UTF-8 解码失败: incomplete utf-8 byte sequence from index 1458
```

证据表明 IPC 已注册，但 `reqwest` 网络字节块切在中文 UTF-8 字符内部时，SSE/JSON 解码器错误地对单个块直接解码。修复为共享 UTF-8 尾缓冲，并为 SSE 与 Gemini JSON 数组流增加每个多字节内部边界的分片测试，以及流结束残留半字符测试。

## 修复后真实结果

输入：

```text
Copilot memory and Ollama in GitHub Copilot for JetBrains
```

可观察结果：

- 任务状态从“流式”进入“已完成”，未再出现 UTF-8 或协议错误。
- 译文完整显示为 `GitHub Copilot for JetBrains 中的 Copilot memory 与 Ollama`。
- sentinel 与 JSON 未出现在译文正文。
- 展示 3 个专业词条 tag：`Copilot memory`、`Ollama`、`GitHub Copilot for JetBrains`；没有把普通单词 `memory` 单独提取为 tag。
- 聚焦 `Copilot memory` 后出现 tooltip，英文解释为 `A feature of GitHub Copilot that stores and recalls user preferences and context across sessions.`，符合“解释使用原文语种”。
- 开发应用及其父进程在验收后均已关闭。

## 证据边界

- 本次是真实 Windows Tauri + IPC + 已配置模型的运行证据，不是 mock 或静态推断。
- 词条数量与具体词面由模型根据语境选择，只要求满足专业类别、上下文出现、去重和最多 5 项，不要求与示例候选逐字一致。
