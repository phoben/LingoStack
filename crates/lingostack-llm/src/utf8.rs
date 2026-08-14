//! TCP 字节块与 UTF-8 字符边界之间的桥接。
//!
//! `reqwest` 的 chunk 并不保证恰好落在 Unicode code point 边界；因此解码器
//! 必须保留唯一允许延迟判断的「不完整尾序列」，其余非法字节立即报错。

#[derive(Default)]
pub(crate) struct Utf8Carry {
    pending: Vec<u8>,
}

impl Utf8Carry {
    /// 接收一个网络字节块，返回其中已完整的 UTF-8 文本。
    pub(crate) fn push(&mut self, bytes: &[u8]) -> Result<String, String> {
        self.pending.extend_from_slice(bytes);
        match std::str::from_utf8(&self.pending) {
            Ok(text) => {
                let text = text.to_owned();
                self.pending.clear();
                Ok(text)
            }
            Err(error) if error.error_len().is_none() => {
                let valid_len = error.valid_up_to();
                let text = std::str::from_utf8(&self.pending[..valid_len])
                    .expect("valid_up_to must be a valid UTF-8 boundary")
                    .to_owned();
                self.pending.drain(..valid_len);
                Ok(text)
            }
            Err(error) => Err(format!("UTF-8 解码失败: {error}")),
        }
    }

    /// 上游结束时不允许留下半个字符。
    pub(crate) fn finish(&self) -> Result<(), String> {
        if self.pending.is_empty() {
            Ok(())
        } else {
            Err("UTF-8 解码失败: 流在不完整 UTF-8 字符中结束".into())
        }
    }
}
