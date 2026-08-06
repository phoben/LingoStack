//! SSE（Server-Sent Events）流解析：把字节流切成 `data:` 负载字符串。
//!
//! OpenAI 兼容协议以 SSE 推送增量：每条 `data: {json}\n\n`，末尾 `data: [DONE]`。
//! 本模块处理跨 chunk 的缓冲与按事件分割，不解读 JSON（交给协议层）。

use async_stream::stream;
use futures::stream::BoxStream;
use futures::{Stream, StreamExt};

use crate::LlmError;

/// 把「字节 chunk 流」解析为「SSE `data:` 负载流」。
///
/// - 自动跨 chunk 缓冲：单个事件被拆到多个字节块也能正确拼接。
/// - 跳过 `data: [DONE]`（不产出），流在原始字节流耗尽后自然结束。
/// - 非 `data:` 开头的行（如 `event:` / `id:` / 注释 `:`）被忽略。
///
/// 返回 [`BoxStream`]（`Unpin`），便于协议层直接 `next().await`。
pub fn parse_data_lines<S, B, E>(input: S) -> BoxStream<'static, Result<String, LlmError>>
where
    S: Stream<Item = Result<B, E>> + Send + Unpin + 'static,
    B: AsRef<[u8]> + Send + 'static,
    E: std::fmt::Display + Send + 'static,
{
    let mut input = input;
    let mut buf = String::new();
    stream! {
        while let Some(chunk) = input.next().await {
            match chunk {
                Ok(bytes) => match std::str::from_utf8(bytes.as_ref()) {
                    Ok(text) => {
                        buf.push_str(text);
                        // 以空行（\n\n）为事件边界，逐个弹出完整事件块。
                        while let Some(idx) = buf.find("\n\n") {
                            let block: String = buf.drain(..idx + 2).collect();
                            for line in block.lines() {
                                if let Some(payload) = line.strip_prefix("data:") {
                                    let payload = payload.trim();
                                    if payload.is_empty() || payload == "[DONE]" {
                                        continue;
                                    }
                                    yield Ok(payload.to_string());
                                }
                            }
                        }
                    }
                    Err(e) => {
                        yield Err(LlmError::Stream(format!("UTF-8 解码失败: {e}")));
                        return;
                    }
                },
                Err(e) => {
                    yield Err(LlmError::Stream(e.to_string()));
                    return;
                }
            }
        }
    }
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    type Chunk = Result<Vec<u8>, std::io::Error>;

    fn chunk(s: &str) -> Chunk {
        Ok(s.as_bytes().to_vec())
    }

    async fn collect(stream: BoxStream<'static, Result<String, LlmError>>) -> Vec<String> {
        stream.filter_map(|r| async move { r.ok() }).collect().await
    }

    #[tokio::test]
    async fn parses_complete_events() {
        let s = futures::stream::iter(vec![chunk("data: {\"a\":1}\n\ndata: {\"a\":2}\n\n")]);
        assert_eq!(
            collect(parse_data_lines(s)).await,
            vec!["{\"a\":1}".to_string(), "{\"a\":2}".to_string()]
        );
    }

    #[tokio::test]
    async fn handles_events_split_across_chunks() {
        let s = futures::stream::iter(vec![
            chunk("data: {\"a\":"),
            chunk("1}\n\ndata: {\"b\":"),
            chunk("2}\n\n"),
        ]);
        assert_eq!(
            collect(parse_data_lines(s)).await,
            vec!["{\"a\":1}".to_string(), "{\"b\":2}".to_string()]
        );
    }

    #[tokio::test]
    async fn skips_done_and_non_data_lines() {
        let s = futures::stream::iter(vec![chunk(
            ": comment\n\nevent: ping\ndata: ok\n\ndata: [DONE]\n\n",
        )]);
        assert_eq!(collect(parse_data_lines(s)).await, vec!["ok".to_string()]);
    }

    #[tokio::test]
    async fn yields_utf8_error_on_invalid_bytes() {
        let s = futures::stream::iter(vec![Ok::<Vec<u8>, std::io::Error>(vec![0xFF, 0xFE])]);
        let results: Vec<_> = parse_data_lines(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }
}
