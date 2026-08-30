//! SSE（Server-Sent Events）流解析：把字节流切成 `data:` 负载字符串。
//!
//! OpenAI 兼容协议以 SSE 推送增量：每条 `data: {json}\n\n`，末尾 `data: [DONE]`。
//! 本模块处理跨 chunk 的缓冲与按事件分割，不解读 JSON（交给协议层）。

use async_stream::stream;
use futures::stream::BoxStream;
use futures::{Stream, StreamExt};

use crate::utf8::Utf8Carry;
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
    E: Into<LlmError> + Send + 'static,
{
    let mut input = input;
    let mut buf = String::new();
    let mut utf8 = Utf8Carry::default();
    stream! {
        while let Some(chunk) = input.next().await {
            match chunk {
                Ok(bytes) => match utf8.push(bytes.as_ref()) {
                    Ok(text) => {
                        buf.push_str(&text);
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
                    Err(message) => {
                        yield Err(LlmError::Stream(message));
                        return;
                    }
                },
                Err(error) => {
                    yield Err(error.into());
                    return;
                }
            }
        }
        if let Err(message) = utf8.finish() {
            yield Err(LlmError::Stream(message));
        }
    }
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    type Chunk = Result<Vec<u8>, LlmError>;

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
        let s = futures::stream::iter(vec![Ok::<Vec<u8>, LlmError>(vec![0xFF, 0xFE])]);
        let results: Vec<_> = parse_data_lines(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }

    #[tokio::test]
    async fn carries_multibyte_character_split_at_every_byte_boundary() {
        let text = "data: {\"text\":\"中\"}\n\n";
        let marker = text.find('中').unwrap();
        for split in 1..'中'.len_utf8() {
            let byte = marker + split;
            let s = futures::stream::iter(vec![
                Ok::<Vec<u8>, LlmError>(text.as_bytes()[..byte].to_vec()),
                Ok(text.as_bytes()[byte..].to_vec()),
            ]);
            assert_eq!(
                collect(parse_data_lines(s)).await,
                vec!["{\"text\":\"中\"}".to_string()],
                "split {split}"
            );
        }
    }

    #[tokio::test]
    async fn yields_utf8_error_when_stream_ends_mid_character() {
        let bytes = "data: 中".as_bytes();
        let s = futures::stream::iter(vec![Ok::<Vec<u8>, LlmError>(
            bytes[..bytes.len() - 1].to_vec(),
        )]);
        let results: Vec<_> = parse_data_lines(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }

    #[tokio::test]
    async fn preserves_response_body_decode_failure_as_retryable_transport_error() {
        let s = futures::stream::iter(vec![Err::<Vec<u8>, LlmError>(LlmError::Network(
            "响应正文读取失败: error decoding response body".into(),
        ))]);
        let results: Vec<_> = parse_data_lines(s).collect().await;
        assert!(matches!(results.as_slice(), [Err(LlmError::Network(_))]));
        assert!(results[0].as_ref().unwrap_err().is_retryable());
    }
}
