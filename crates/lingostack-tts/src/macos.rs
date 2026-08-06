//! macOS 朗读实现（`AVSpeechSynthesizer`）。
//!
//! **待在目标平台实现与验证**：经 objc 绑定调用 `AVSpeechSynthesizer`
//! 与 `AVSpeechUtterance`；打断上一句用
//! `stopSpeakingAtBoundary:AVSpeechBoundaryImmediate`。
//!
//! 当前为占位实现，返回 [`TtsError::Unsupported`]。

use crate::{Speaker, TtsError};

/// macOS 朗读提供者（占位）。
pub struct MacosSpeaker;

impl MacosSpeaker {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacosSpeaker {
    fn default() -> Self {
        Self::new()
    }
}

impl Speaker for MacosSpeaker {
    fn speak(&self, _text: &str) -> Result<(), TtsError> {
        Err(TtsError::Unsupported)
    }

    fn stop(&self) -> Result<(), TtsError> {
        Err(TtsError::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_reports_unsupported() {
        assert_eq!(
            MacosSpeaker::new().speak("hi").unwrap_err(),
            TtsError::Unsupported
        );
    }
}
