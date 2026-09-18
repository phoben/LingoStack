use futures::FutureExt;
use tokio::sync::watch;

use crate::{OcrEngine, OcrError, OcrInput, OcrOperation};

/// Linux Tesseract 实现留待对应平台开发与验证。
pub struct LinuxOcrEngine;

impl OcrEngine for LinuxOcrEngine {
    fn recognize(&self, _input: OcrInput) -> OcrOperation {
        let (sender, _receiver) = watch::channel(false);
        OcrOperation::new(sender, async { Err(OcrError::Unsupported) }.boxed())
    }
}
