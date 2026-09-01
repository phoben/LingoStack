//! # lingostack-tts
//!
//! 系统 TTS（朗读）。**平台差异用 trait 抽象、按 `target` 分文件隔离**
//! （见 `windows.rs` / `macos.rs` / `linux.rs`），禁止在调用侧写
//! `if windows/mac` 分支。

use std::sync::mpsc::Receiver;

use thiserror::Error;

/// 朗读请求的终态。新的朗读或停止会打断当前请求。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpeechOutcome {
    Finished,
    Interrupted,
}

/// 等待一条已受理朗读的终态。实际播放仍在平台语音线程上进行。
#[derive(Debug)]
pub struct SpeechCompletion {
    receiver: Receiver<Result<SpeechOutcome, TtsError>>,
}

impl SpeechCompletion {
    pub(crate) fn new(receiver: Receiver<Result<SpeechOutcome, TtsError>>) -> Self {
        Self { receiver }
    }

    pub fn wait(self) -> Result<SpeechOutcome, TtsError> {
        self.receiver
            .recv()
            .map_err(|_| TtsError::Failed("朗读线程在报告完成前退出".to_owned()))?
    }
}

/// 朗读统一抽象。具体实现按平台分文件隔离。
pub trait Speaker: Send + Sync {
    /// 异步朗读文本，并打断上一句。
    ///
    /// 「打断」是刻意的：用户连续点朗读时应立即切到新内容，而非排队播完旧的。
    /// 调用立即返回，不阻塞等待朗读结束。
    fn speak(&self, text: &str) -> Result<SpeechCompletion, TtsError>;

    /// 停止当前朗读。
    fn stop(&self) -> Result<(), TtsError>;
}

/// 朗读错误。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum TtsError {
    /// 文本为空，无可朗读内容。
    #[error("朗读文本为空")]
    Empty,
    /// 语音引擎初始化或调用失败。
    #[error("朗读失败: {0}")]
    Failed(String),
    /// 当前平台尚未实现。
    #[error("当前平台暂不支持朗读")]
    Unsupported,
}

// 平台实现入口。
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// 返回当前平台的朗读实现。
///
/// macOS / Linux 目前为占位实现，需在目标平台验证后补齐。
#[must_use]
pub fn speaker() -> Box<dyn Speaker> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsSpeaker::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosSpeaker::new())
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxSpeaker::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct StubSpeaker {
        spoken: Mutex<Vec<String>>,
    }
    impl Speaker for StubSpeaker {
        fn speak(&self, text: &str) -> Result<SpeechCompletion, TtsError> {
            if text.trim().is_empty() {
                return Err(TtsError::Empty);
            }
            self.spoken.lock().unwrap().push(text.to_string());
            let (tx, rx) = std::sync::mpsc::channel();
            tx.send(Ok(SpeechOutcome::Finished)).unwrap();
            Ok(SpeechCompletion::new(rx))
        }
        fn stop(&self) -> Result<(), TtsError> {
            self.spoken.lock().unwrap().clear();
            Ok(())
        }
    }

    #[test]
    fn trait_is_object_safe() {
        let s: Box<dyn Speaker> = Box::new(StubSpeaker::default());
        assert_eq!(
            s.speak("hello").unwrap().wait().unwrap(),
            SpeechOutcome::Finished
        );
        assert!(s.stop().is_ok());
    }

    #[test]
    fn empty_text_rejected() {
        let s = StubSpeaker::default();
        assert_eq!(s.speak("   ").unwrap_err(), TtsError::Empty);
    }

    #[test]
    fn completion_propagates_monitoring_errors() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(Err(TtsError::Failed("状态读取失败".into())))
            .unwrap();

        assert_eq!(
            SpeechCompletion::new(rx).wait().unwrap_err(),
            TtsError::Failed("状态读取失败".into())
        );
    }

    #[test]
    fn platform_speaker_is_constructible() {
        let _s = speaker();
    }
}
