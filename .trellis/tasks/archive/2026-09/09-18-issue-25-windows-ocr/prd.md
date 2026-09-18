# Issue 25 Windows 本地 OCR 首发

## Goal

在 Windows 11 上为翻译页交付单张图片本地取字：用户粘贴或拖入图片后，系统离线识别文字，成功时替换原文并自动翻译；失败时保持已有内容，不把图片上传或持久化。

## Background and confirmed facts

- 当前 `TranslateView` 只接受文本；翻译任务状态已在 `stream-store` 跨视图保存。
- 当前 `stream-store.start()` 在流式中会忽略新请求，序号只拦截迟到回调；后端 LLM 流没有取消入口。
- `DocsView` 的拖放属于多文件、持久化文档导入，不能复用其业务状态或 SQLite 生命周期。
- Windows 能使用现有 `windows = 0.61` 依赖扩展 WinRT OCR/图像解码 feature，不引入网络服务或额外 OCR 模型。
- 当前开发机是 Windows；macOS/Linux 实装与验收由父任务的独立子任务负责。

## Requirements

### 输入与发现性

1. 原文输入区接受剪贴板图片和单个拖入文件，格式为 PNG、JPEG 或 WebP。
2. 剪贴板同时有图片与文字时处理图片；没有图片时不拦截普通文字粘贴。
3. 多张图片明确提示“一次仅支持一张图片”且不调用 OCR。
4. 不新增文件选择按钮或设置项；通过占位文案、拖入遮罩和原文区状态行说明能力。

### 处理规则

1. 前端声明格式仅作快速反馈；Rust 必须根据魔数与解码器重新验证。
2. 默认编码体积上限为 10 MiB，解码像素上限为 40 MP；超过时给出可操作错误且不完整解码。
3. 在 40 MP 安全上限内，超过 WinRT OCR 最大边长的图片按比例缩小到系统上限后识别，避免常见 4K 截图被直接拒绝。
4. 显式源语言 `zh`/`en`/`ja` 作为 OCR 语言提示；`auto` 使用用户配置语言。系统没有匹配 OCR 语言时提示安装相应 Windows 语言包。
5. OCR 成功且文本 trim 后非空，才替换原文并自动翻译一次；空文本按“未识别到文字”处理。

### 取消与稳定状态

1. OCR store 保存 `status/seq/requestId/error`，不保存图片内容；视图卸载后任务继续。
2. 新图片先取消旧 OCR 与当前翻译，再开始识别。手动编辑原文或文字粘贴同样取消待完成 OCR，避免迟到识别覆盖新文本。
3. 后端 OCR 调用底层 WinRT `IAsyncInfo.Cancel`；LLM 流在取消后释放 provider stream。两个取消命令均幂等。
4. 前端在构建 Prompt 前、IPC 回调中和 OCR promise 完成时都检查序号；被替代任务不得再发 LLM 或修改状态。
5. OCR 失败、为空或取消时保留开始前的稳定原文和译文，且 LLM 调用数为零。

### 隐私与错误

1. IPC 不传绝对路径或文件名；只传请求 ID、格式、语言提示和内存字节。
2. 图片不得写入文档数据库、收藏、配置、临时文件或日志，也不得成为 LLM message。
3. 错误只返回分类后的短文案；不包含原始字节、路径、API Key 或完整系统异常体。

## Acceptance criteria

- [ ] 粘贴 PNG/JPEG/WebP 与拖入单图均显示“正在识别”，成功后替换原文并自动翻译一次。
- [ ] 图片+文字剪贴板走图片；纯文字粘贴仍按原行为进入 textarea。
- [ ] 多图、伪造扩展名/声明 MIME、超过 10 MiB、超过 40 MP、解码失败、缺语言和无文字均保留稳定内容且不调用 LLM。
- [ ] 常见超过 WinRT OCR 最大边长但未超过 40 MP 的截图会按比例缩小并识别。
- [ ] 连续两次选图、新图发生在翻译中、OCR 中手动输入和切换页面四个场景均无迟到污染。
- [ ] 后端可观察到被替代 OCR 调用了 WinRT 取消、被替代聊天流被释放；前端序号测试独立通过。
- [ ] OCR 状态区域有 `aria-live="polite"` / `aria-busy`，失败使用 `role="alert"`，拖入遮罩不引入第二层卡片或新主题色。
- [ ] 真实 Tauri E2E 通过 feature-gated OCR fixture 覆盖 IPC、替换、自动翻译和失败不调用 LLM；默认/发行构建不含 fixture 控制面。
- [ ] Windows 11 断网实机以至少一张中文截图和一张英文截图验证；语言缺失、取消和 4K 截图另有手工记录。
- [ ] `CLAUDE.md` 仓库布局与 crate 数量更新；相关 Trellis spec、测试说明和 IPC 清单与实现同步。

## Out of scope

- macOS Vision 和 Linux Tesseract 实现。
- 多图、文件选择按钮、OCR 设置、图片保存、图片直接发送给模型。
- 扫描 PDF/DOCX OCR。

## Blocking questions

无。上限、自动缩放、语言提示和手动编辑取消均作为本计划的明确默认决策，等待用户对完整计划一次性批准。
