use std::future::{pending, Future, IntoFuture};

use futures::FutureExt;
use tokio::sync::watch;
use windows::core::{Result as WindowsResult, RuntimeType};
use windows::Graphics::Imaging::{
    BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, BitmapTransform, ColorManagementMode,
    ExifOrientationMode,
};
use windows::Media::Ocr::OcrEngine as WinOcrEngine;
use windows::Security::Cryptography::CryptographicBuffer;
use windows::Storage::Streams::InMemoryRandomAccessStream;

use crate::{validate_input, OcrEngine, OcrError, OcrInput, OcrLanguage, OcrOperation, OcrResult};

/// Windows 内置 WinRT OCR 实现。
pub struct WindowsOcrEngine;

impl OcrEngine for WindowsOcrEngine {
    fn recognize(&self, input: OcrInput) -> OcrOperation {
        let (sender, receiver) = watch::channel(false);
        OcrOperation::new(
            sender,
            async move { recognize(input, receiver).await }.boxed(),
        )
    }
}

async fn recognize(
    input: OcrInput,
    mut cancellation: watch::Receiver<bool>,
) -> Result<OcrResult, OcrError> {
    validate_input(&input)?;
    ensure_not_cancelled(&cancellation)?;

    let stream = InMemoryRandomAccessStream::new().map_err(|_| OcrError::DecodeFailed)?;
    let write = {
        // IBuffer 本身不跨线程；只在创建写入操作的同步作用域内持有。
        let buffer = CryptographicBuffer::CreateFromByteArray(&input.content)
            .map_err(|_| OcrError::DecodeFailed)?;
        stream
            .WriteAsync(&buffer)
            .map_err(|_| OcrError::DecodeFailed)?
    };
    let write_cancel = write.clone();
    await_cancellable(
        write.into_future(),
        move || write_cancel.Cancel(),
        &mut cancellation,
        OcrError::DecodeFailed,
    )
    .await?;
    stream.Seek(0).map_err(|_| OcrError::DecodeFailed)?;

    let decode = BitmapDecoder::CreateAsync(&stream).map_err(|_| OcrError::DecodeFailed)?;
    let decode_cancel = decode.clone();
    let decoder = await_cancellable(
        decode.into_future(),
        move || decode_cancel.Cancel(),
        &mut cancellation,
        OcrError::DecodeFailed,
    )
    .await?;

    let width = decoder.PixelWidth().map_err(|_| OcrError::DecodeFailed)?;
    let height = decoder.PixelHeight().map_err(|_| OcrError::DecodeFailed)?;
    crate::validate_dimensions(width, height)?;

    let transform = BitmapTransform::new().map_err(|_| OcrError::DecodeFailed)?;
    let max_dimension = WinOcrEngine::MaxImageDimension().map_err(|_| OcrError::PlatformFailed)?;
    let (scaled_width, scaled_height) = crate::scaled_dimensions(width, height, max_dimension);
    transform
        .SetScaledWidth(scaled_width)
        .map_err(|_| OcrError::DecodeFailed)?;
    transform
        .SetScaledHeight(scaled_height)
        .map_err(|_| OcrError::DecodeFailed)?;

    let bitmap = decoder
        .GetSoftwareBitmapTransformedAsync(
            BitmapPixelFormat::Bgra8,
            BitmapAlphaMode::Premultiplied,
            &transform,
            ExifOrientationMode::RespectExifOrientation,
            ColorManagementMode::DoNotColorManage,
        )
        .map_err(|_| OcrError::DecodeFailed)?;
    let bitmap_cancel = bitmap.clone();
    let bitmap = await_cancellable(
        bitmap.into_future(),
        move || bitmap_cancel.Cancel(),
        &mut cancellation,
        OcrError::DecodeFailed,
    )
    .await?;

    let engine = create_engine(input.language)?;
    let operation = engine
        .RecognizeAsync(&bitmap)
        .map_err(|_| OcrError::PlatformFailed)?;
    let operation_cancel = operation.clone();
    let result = await_cancellable(
        operation.into_future(),
        move || operation_cancel.Cancel(),
        &mut cancellation,
        OcrError::PlatformFailed,
    )
    .await?;
    let text = result
        .Text()
        .map_err(|_| OcrError::PlatformFailed)?
        .to_string();
    let text = text.trim().to_owned();
    if text.is_empty() {
        Err(OcrError::NoText)
    } else {
        Ok(OcrResult { text })
    }
}

fn create_engine(language: OcrLanguage) -> Result<WinOcrEngine, OcrError> {
    let Some(family) = language.language_family() else {
        return WinOcrEngine::TryCreateFromUserProfileLanguages()
            .map_err(|_| OcrError::LanguageUnavailable("系统首选语言".into()));
    };
    let languages =
        WinOcrEngine::AvailableRecognizerLanguages().map_err(|_| OcrError::PlatformFailed)?;
    let size = languages.Size().map_err(|_| OcrError::PlatformFailed)?;
    for index in 0..size {
        let installed = languages
            .GetAt(index)
            .map_err(|_| OcrError::PlatformFailed)?;
        let tag = installed
            .LanguageTag()
            .map_err(|_| OcrError::PlatformFailed)?
            .to_string();
        if matches_language_family(&tag, family) {
            return WinOcrEngine::TryCreateFromLanguage(&installed)
                .map_err(|_| OcrError::LanguageUnavailable(language_label(language).into()));
        }
    }
    Err(OcrError::LanguageUnavailable(
        language_label(language).into(),
    ))
}

fn matches_language_family(tag: &str, family: &str) -> bool {
    tag.split('-')
        .next()
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(family))
}

const fn language_label(language: OcrLanguage) -> &'static str {
    match language {
        OcrLanguage::Auto => "系统首选语言",
        OcrLanguage::Zh => "中文",
        OcrLanguage::En => "英文",
        OcrLanguage::Ja => "日文",
    }
}

fn ensure_not_cancelled(cancellation: &watch::Receiver<bool>) -> Result<(), OcrError> {
    if *cancellation.borrow() {
        Err(OcrError::Cancelled)
    } else {
        Ok(())
    }
}

async fn cancellation_requested(cancellation: &mut watch::Receiver<bool>) {
    loop {
        if *cancellation.borrow() {
            return;
        }
        if cancellation.changed().await.is_err() {
            pending::<()>().await;
        }
    }
}

async fn await_cancellable<T, F, C>(
    future: F,
    cancel: C,
    cancellation: &mut watch::Receiver<bool>,
    failure: OcrError,
) -> Result<T, OcrError>
where
    T: RuntimeType,
    F: Future<Output = WindowsResult<T>>,
    C: FnOnce() -> WindowsResult<()>,
{
    tokio::pin!(future);
    tokio::select! {
        biased;
        () = cancellation_requested(cancellation) => {
            let _ = cancel();
            Err(OcrError::Cancelled)
        }
        result = &mut future => result.map_err(|_| failure),
    }
}

#[cfg(test)]
mod tests {
    use super::matches_language_family;
    use windows::Media::Ocr::OcrEngine;

    #[test]
    fn matches_installed_bcp47_language_by_family() {
        assert!(matches_language_family("zh-Hans-CN", "zh"));
        assert!(matches_language_family("EN-us", "en"));
        assert!(!matches_language_family("ja-JP", "zh"));
        assert!(!matches_language_family("zho", "zh"));
    }

    #[test]
    fn windows_ocr_runtime_exposes_dimension_and_language_metadata() {
        let max_dimension =
            OcrEngine::MaxImageDimension().expect("当前 Windows 应提供 OcrEngine 最大图片边长");
        assert!(max_dimension > 0);
        let languages = OcrEngine::AvailableRecognizerLanguages()
            .expect("当前 Windows 应能读取已安装 OCR 语言列表");
        let _ = languages.Size().expect("OCR 语言列表应可读取");
    }
}
