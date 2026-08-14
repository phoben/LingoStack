# 测试规范

37 个测试，全部内联在各源文件底部的 `#[cfg(test)] mod tests`。无 `tests/` 目录。

| 文件 | 数量 | 手段 |
|------|------|------|
| `openai.rs` | 5 | wiremock |
| `anthropic.rs` | 8 | wiremock |
| `gemini.rs` | 7 | wiremock |
| `sse.rs` | 4 | 手工分片 |
| `json_array_stream.rs` | 10 | 手工分片 |
| `lib.rs` | 3 | 纯同步 |

异步测试用 `#[tokio::test]`；纯逻辑用 `#[test]`。

## wiremock 骨架

provider 层测试的固定五步：

```rust
let server = MockServer::start().await;
Mock::given(method("POST"))
    .and(path("/v1/chat/completions"))
    .and(header("authorization", "Bearer sk-test"))     // 或 body_partial_json / query_param
    .respond_with(ResponseTemplate::new(200)
        .set_body_raw(SSE_TEXT, "text/event-stream"))
    .mount(&server).await;
// provider 指向 server.uri()
// 驱动 chat_stream，收集结果
```

流式响应用 `set_body_raw` **一次性投递整个字符串**——所以 provider 层测试**验证不了跨 chunk 分片**，那是解码器测试的职责（见 [流式解析](./streaming.md)）。

收集结果两种写法：

- 只要成功增量：`.filter_map(|r| async move { r.ok() }).map(|c| c.delta).collect::<Vec<String>>().await`
- 要断言错误：`.collect::<Vec<_>>().await` 保留 `Result`，再 `match results[0].as_ref() { Err(LlmError::Status{..}) => ..., other => panic!(...) }`

用到的 matcher：`method`、`path`、`header`（鉴权）、`query_param`（Gemini 的 `?key=`）、`body_partial_json`（只校验请求体形状，不要求全等）。

**`body_partial_json` 的失败方式要注意**：matcher 不匹配时 wiremock 静默返回 404，测试表现为「收到的增量为空」，而不是一个明确的匹配失败报错（`openai.rs:246-247` 注释写明）。断言为空时先怀疑是 matcher 没匹配上。

## 命名

`<动词>_<条件>`，同名测试在三个 provider 文件里平行存在：

- `streams_deltas_and_sends_bearer_auth`
- `surfaces_non_ok_status`（`openai.rs:199`、`anthropic.rs:338`）
- `surfaces_stream_json_error`（`openai.rs:277`、`anthropic.rs:357`、`gemini.rs:367`）
- `skips_chunks_without_content`
- `request_body_carries_model_messages_and_stream`

新增 provider 时**把这批同名测试补齐**，形成横向可比的最低覆盖面。

## 减少样板

文件内可写本地 helper：`fn request() -> ChatRequest` 造标准请求；`deltas(server)`（`anthropic.rs:217-225`）/ `deltas_of`（`gemini.rs:246-254`）把「构造 provider → 驱动流 → 收集增量」压成一行。不跨文件共享。

## 解码器测试

不用 wiremock，用 `futures::stream::iter` 手工构造字节分片，helper `fn chunk(s: &str) -> Result<Vec<u8>, std::io::Error>`（`sse.rs:69-71`）。必覆盖：

- 正常多事件
- **在最坏位置切开**（`handles_events_split_across_chunks`、`handles_objects_split_across_chunks`）
- 非法 UTF-8
- UTF-8 多字节字符在每一个内部字节边界分片；上游结束时的半个字符必须报错
- 上游流报错

## 硬性要求

- 新增 / 改动请求构造或响应处理 → 必须补 wiremock 测试
- 改缓冲或分帧逻辑 → 必须补分片测试
- **CI 中不使用真实密钥**，测试里的 key 一律是 `sk-test` / `gk-test` 之类假值
- 密钥可能进 URL 的提供商 → 必须有「mock 回显 key、断言已擦除」的测试
