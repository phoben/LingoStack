# Windows 本地 OCR 技术设计

## 1. Capability boundary

新增 `crates/lingostack-ocr`，保持 `lingostack-core` 纯净，也不把图片混入 LLM 或文档模块。公共层定义：

- `OcrInput`：拥有的图片字节、已验证格式、语言提示。
- `OcrResult`：非空 UTF-8 文本。
- `OcrError`：空输入、体积超限、像素超限、不支持格式、解码失败、语言不可用、无文字、已取消、平台不支持、平台调用失败。
- `OcrEngine` / `OcrOperation` 语义：启动一个请求、等待结果、从另一调用路径幂等取消。具体 Rust 签名在 WinRT 可编译性门禁中定型，但不得弱化底层取消或对象安全边界。
- 工厂按 `target_os` 选择实现；macOS/Linux 首期返回带“需目标平台实现与验证”说明的 `Unsupported` 占位。

Windows 模块使用 `Windows.Media.Ocr`、`Windows.Graphics.Imaging`、`Windows.Storage.Streams`、`Windows.Foundation` 与 `Windows.Globalization`。先从内存流读取解码元数据，执行格式、10 MiB、40 MP 检查；若最大边长超过 `OcrEngine::MaxImageDimension`，通过解码变换等比缩放，再调用 `RecognizeAsync`。显式语言按已安装 BCP-47 语言族匹配；自动模式使用用户配置语言创建引擎。

实现前先做一个最小编译测试，验证 `windows 0.61` 下异步操作到 `IAsyncInfo.Cancel` 的安全持有方式以及取消后的错误映射。若无法满足真正取消，停止实施并回到设计评审，不以“只丢弃结果”替代。

## 2. Tauri and IPC contracts

新增生产命令：

```text
recognize_image(requestId, mediaType, sourceOverride?, content) -> String
cancel_ocr(requestId) -> ()
cancel_chat(requestId) -> ()
chat_stream(..., requestId, onEvent) -> ()
```

- `content` 仍由 `src/lib/ipc.ts` 唯一封装；Rust 端立即按字节复核，不接收路径。
- `AppState` 增加 OCR 与 chat 的短生命周期取消注册表。注册、取消、移除都以请求 ID 精确匹配；取消不存在/已结束请求返回成功。
- `chat_stream` 在读取 provider 下一块数据与取消信号之间 `select`；取消分支丢弃流并正常清理注册表，不发送 `done`。前端已递增序号，因此不会把取消表现成错误。
- Prompt 构建完成后、调用 `chat_stream` 前再检查序号，覆盖“取消发生在 translation_plan/effective_prompt 期间”的窗口。
- E2E feature 使用真实 `recognize_image` 命令和确定性 OCR fixture engine；默认 handler、默认依赖图和生产前端不含 fixture 入口。

## 3. Frontend state and interaction

新增 `ocr-store.ts`：

```text
idle | recognizing | error
seq + requestId + error
start(image, languageHint) -> latest text or null
cancel() -> invalidate seq, cancel backend, preserve stable text
```

图片字节仅作为 `start` 的局部参数进入 IPC，不写入 Zustand state。`start` 会先取消前一请求；返回时只允许当前序号发布结果。

`stream-store` 为任务增加当前 `requestId` 与 `cancel(feature, preserveContent)`：立刻递增序号，然后调用 `cancel_chat`。取消时保留输入/输出/术语，状态使用明确的 cancelled 语义；下一次成功开始会正常清空旧输出。现有命名与手动翻译的行为不改变。

`TranslateView` 的图片流程：

1. paste 检查 image item；有图片则阻止默认行为并忽略同次文字，没有图片则完全交给 textarea。
2. drop 只接受恰好一个文件；进入原文区时显示轻量遮罩。
3. 接收有效图片后等待旧翻译取消，再调用 OCR store。
4. OCR 返回最新非空文本后设置原文，并以事件发生时的语言选择启动现有翻译。
5. `onChange` 或纯文字粘贴先取消 OCR，再正常更新文本。

识别状态放在原文 pane 内的稳定状态行：识别中使用 `aria-live="polite"` 与 `aria-busy=true`，失败单独 `role="alert"`；不新增圆角卡片、硬编码颜色或第二强调色。toolbar 在 OCR 期间显示识别状态，翻译按钮禁用以避免竞争。

## 4. Data and privacy flow

```text
Image File/Clipboard
  -> ArrayBuffer/Uint8Array
  -> recognize_image IPC
  -> WinRT in-memory decoder
  -> local OCR text
  -> existing translation messages (text only)
```

禁止路径：图片 -> `ChatMessage`、SQLite、IndexedDB、配置、临时文件、日志。测试通过 fixture 请求计数与代码边界断言同时守护。

## 5. Compatibility and rollback

- 纯文本 paste 没有图片时不 `preventDefault`，保持原生行为。
- 划词翻译继续走现有 `injectSource`；若它在 OCR 中到达，作为更新输入取消 OCR 并优先翻译划词文本。
- 新增 chat request ID 只在 IPC 内部使用，不改变 provider 协议。
- WinRT 编译、取消或解码变换任一门禁失败时，回滚 Windows 实现为 `Unsupported` 并保留公共测试；不引入网络 OCR 或 Tesseract 作为静默替代。
