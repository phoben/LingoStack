//! Linux 朗读实现（speech-dispatcher / `spd-say`）。
//!
//! **待在目标平台实现与验证**：优先经 D-Bus 调用 speech-dispatcher；
//! 无该服务时可回退调用 `spd-say` 命令行。
//!
//! 当前为占位实现，返回 [`TtsError::Unsupported`]。

use crate::{Speaker, SpeechCompletion, TtsError};

/// Linux 朗读提供者（占位）。
pub struct LinuxSpeaker;

impl LinuxSpeaker {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for LinuxSpeaker {
    fn default() -> Self {
        Self::new()
    }
}

impl Speaker for LinuxSpeaker {
    fn speak(&self, _text: &str) -> Result<SpeechCompletion, TtsError> {
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
            LinuxSpeaker::new().speak("hi").unwrap_err(),
            TtsError::Unsupported
        );
    }
}
