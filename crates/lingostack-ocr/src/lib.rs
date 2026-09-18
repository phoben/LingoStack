//! # lingostack-ocr
//!
//! 本地图片 OCR。公共层只暴露平台无关的输入、结果、错误与可取消操作；
//! Windows、macOS、Linux 的实现分别位于独立模块，调用侧不判断操作系统。

use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// IPC 允许接收的最大编码图片大小：10 MiB。
pub const MAX_INPUT_BYTES: usize = 10 * 1024 * 1024;
/// 解码前允许的最大像素数：40 MP。
pub const MAX_IMAGE_PIXELS: u64 = 40_000_000;

/// 支持的图片格式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageFormat {
    Png,
    Jpeg,
    Webp,
}

impl ImageFormat {
    /// 从浏览器 MIME 类型解析声明格式。
    pub fn from_media_type(media_type: &str) -> Result<Self, OcrError> {
        match media_type.trim().to_ascii_lowercase().as_str() {
            "image/png" => Ok(Self::Png),
            "image/jpeg" | "image/jpg" => Ok(Self::Jpeg),
            "image/webp" => Ok(Self::Webp),
            _ => Err(OcrError::UnsupportedFormat),
        }
    }
}

/// OCR 语言提示。自动模式使用系统用户语言列表。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrLanguage {
    Auto,
    Zh,
    En,
    Ja,
}

impl OcrLanguage {
    #[must_use]
    pub const fn language_family(self) -> Option<&'static str> {
        match self {
            Self::Auto => None,
            Self::Zh => Some("zh"),
            Self::En => Some("en"),
            Self::Ja => Some("ja"),
        }
    }
}

/// 单次 OCR 输入。字节只在本次操作生命周期内持有，不做持久化。
#[derive(Debug, Clone)]
pub struct OcrInput {
    pub content: Vec<u8>,
    pub format: ImageFormat,
    pub language: OcrLanguage,
}

/// OCR 成功结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
}

/// OCR 失败原因。错误文案可直接呈现，但不包含图片、路径或原始系统异常体。
#[derive(Debug, thiserror::Error, Clone, PartialEq, Eq)]
pub enum OcrError {
    #[error("图片内容为空")]
    EmptyInput,
    #[error("图片超过 10 MiB 限制")]
    InputTooLarge,
    #[error("图片尺寸超过 4000 万像素限制")]
    ImageTooLarge,
    #[error("仅支持 PNG、JPEG 和 WebP 图片")]
    UnsupportedFormat,
    #[error("图片内容与声明格式不一致")]
    FormatMismatch,
    #[error("无法解码图片")]
    DecodeFailed,
    #[error("Windows 未安装 {0} OCR 语言包")]
    LanguageUnavailable(String),
    #[error("图片中未识别到文字")]
    NoText,
    #[error("识别已取消")]
    Cancelled,
    #[error("当前平台暂不支持本地图片识别")]
    Unsupported,
    #[error("本地图片识别失败")]
    PlatformFailed,
}

/// 可从 IPC 取消命令持有的轻量句柄。
#[derive(Clone)]
pub struct OcrCancellation {
    sender: watch::Sender<bool>,
}

impl OcrCancellation {
    /// 幂等请求取消正在进行的底层操作。
    pub fn cancel(&self) {
        let _ = self.sender.send(true);
    }
}

/// 已启动的 OCR 操作。等待结果和取消句柄相互独立。
pub struct OcrOperation {
    cancellation: OcrCancellation,
    future: BoxFuture<'static, Result<OcrResult, OcrError>>,
}

impl OcrOperation {
    pub(crate) fn new(
        sender: watch::Sender<bool>,
        future: BoxFuture<'static, Result<OcrResult, OcrError>>,
    ) -> Self {
        Self {
            cancellation: OcrCancellation { sender },
            future,
        }
    }

    #[must_use]
    pub fn cancellation(&self) -> OcrCancellation {
        self.cancellation.clone()
    }

    pub fn cancel(&self) {
        self.cancellation.cancel();
    }

    pub async fn result(self) -> Result<OcrResult, OcrError> {
        self.future.await
    }
}

/// 平台 OCR 统一抽象。
pub trait OcrEngine: Send + Sync {
    fn recognize(&self, input: OcrInput) -> OcrOperation;
}

/// 返回当前平台实现。平台分支仅存在于本 crate 工厂中。
#[must_use]
pub fn engine() -> Box<dyn OcrEngine> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsOcrEngine)
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosOcrEngine)
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxOcrEngine)
    }
}

/// E2E 专用确定性引擎；默认构建不包含此入口。
#[cfg(feature = "fixture")]
#[must_use]
pub fn fixture_engine(text: impl Into<String>) -> Box<dyn OcrEngine> {
    struct FixtureEngine(String);
    impl OcrEngine for FixtureEngine {
        fn recognize(&self, input: OcrInput) -> OcrOperation {
            let text = self.0.clone();
            let (sender, mut receiver) = watch::channel(false);
            let keepalive = sender.clone();
            OcrOperation::new(
                sender,
                Box::pin(async move {
                    let _keepalive = keepalive;
                    validate_input(&input)?;
                    tokio::select! {
                        _ = receiver.changed() => Err(OcrError::Cancelled),
                        () = tokio::task::yield_now() => Ok(OcrResult { text }),
                    }
                }),
            )
        }
    }
    Box::new(FixtureEngine(text.into()))
}

/// 在调用系统解码器前校验输入边界与魔数。
pub fn validate_input(input: &OcrInput) -> Result<(), OcrError> {
    if input.content.is_empty() {
        return Err(OcrError::EmptyInput);
    }
    if input.content.len() > MAX_INPUT_BYTES {
        return Err(OcrError::InputTooLarge);
    }
    let matches = match input.format {
        ImageFormat::Png => input
            .content
            .starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
        ImageFormat::Jpeg => input.content.starts_with(&[0xff, 0xd8, 0xff]),
        ImageFormat::Webp => {
            input.content.len() >= 12
                && &input.content[..4] == b"RIFF"
                && &input.content[8..12] == b"WEBP"
        }
    };
    if matches {
        Ok(())
    } else {
        Err(OcrError::FormatMismatch)
    }
}

/// 按最大边长等比计算解码尺寸，不放大原图。
#[must_use]
pub fn scaled_dimensions(width: u32, height: u32, max_dimension: u32) -> (u32, u32) {
    let longest = width.max(height);
    if longest == 0 || max_dimension == 0 || longest <= max_dimension {
        return (width, height);
    }
    let scaled_width =
        (u64::from(width) * u64::from(max_dimension) / u64::from(longest)).max(1) as u32;
    let scaled_height =
        (u64::from(height) * u64::from(max_dimension) / u64::from(longest)).max(1) as u32;
    (scaled_width, scaled_height)
}

/// 校验解码器报告的尺寸，防止零尺寸或压缩炸弹进入完整位图解码。
pub fn validate_dimensions(width: u32, height: u32) -> Result<(), OcrError> {
    if width == 0 || height == 0 {
        return Err(OcrError::DecodeFailed);
    }
    let pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(OcrError::ImageTooLarge)?;
    if pixels > MAX_IMAGE_PIXELS {
        Err(OcrError::ImageTooLarge)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(format: ImageFormat, content: &[u8]) -> OcrInput {
        OcrInput {
            content: content.to_vec(),
            format,
            language: OcrLanguage::Auto,
        }
    }

    #[test]
    fn validates_supported_magic_numbers() {
        assert_eq!(
            validate_input(&input(ImageFormat::Png, b"\x89PNG\r\n\x1a\nrest")),
            Ok(())
        );
        assert_eq!(
            validate_input(&input(ImageFormat::Jpeg, b"\xff\xd8\xffrest")),
            Ok(())
        );
        assert_eq!(
            validate_input(&input(ImageFormat::Webp, b"RIFFxxxxWEBPrest")),
            Ok(())
        );
    }

    #[test]
    fn rejects_empty_oversize_and_mismatched_input() {
        assert_eq!(
            validate_input(&input(ImageFormat::Png, b"")),
            Err(OcrError::EmptyInput)
        );
        assert_eq!(
            validate_input(&input(ImageFormat::Png, b"not png")),
            Err(OcrError::FormatMismatch)
        );
        let mut oversized = vec![0; MAX_INPUT_BYTES + 1];
        oversized[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        assert_eq!(
            validate_input(&input(ImageFormat::Png, &oversized)),
            Err(OcrError::InputTooLarge)
        );
    }

    #[test]
    fn parses_browser_media_types() {
        assert_eq!(
            ImageFormat::from_media_type("image/png"),
            Ok(ImageFormat::Png)
        );
        assert_eq!(
            ImageFormat::from_media_type("IMAGE/JPEG"),
            Ok(ImageFormat::Jpeg)
        );
        assert_eq!(
            ImageFormat::from_media_type("image/webp"),
            Ok(ImageFormat::Webp)
        );
        assert_eq!(
            ImageFormat::from_media_type("image/gif"),
            Err(OcrError::UnsupportedFormat)
        );
    }

    #[test]
    fn scales_proportionally_without_enlarging() {
        assert_eq!(scaled_dimensions(4000, 2000, 2000), (2000, 1000));
        assert_eq!(scaled_dimensions(2000, 4000, 1000), (500, 1000));
        assert_eq!(scaled_dimensions(640, 480, 2000), (640, 480));
    }

    #[test]
    fn rejects_zero_and_over_40_megapixel_dimensions() {
        assert_eq!(validate_dimensions(0, 100), Err(OcrError::DecodeFailed));
        assert_eq!(validate_dimensions(8000, 5000), Ok(()));
        assert_eq!(
            validate_dimensions(8001, 5000),
            Err(OcrError::ImageTooLarge)
        );
    }

    #[cfg(feature = "fixture")]
    #[tokio::test]
    async fn fixture_operation_honors_cancellation() {
        let operation =
            fixture_engine("text").recognize(input(ImageFormat::Png, b"\x89PNG\r\n\x1a\n"));
        operation.cancel();
        assert_eq!(operation.result().await, Err(OcrError::Cancelled));
    }

    #[test]
    fn trait_is_object_safe_and_platform_engine_is_constructible() {
        let _: Box<dyn OcrEngine> = engine();
    }
}
