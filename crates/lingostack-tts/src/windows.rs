//! Windows 朗读实现（SAPI `ISpVoice`）。
//!
//! **不持有 `ISpVoice` 实例**：COM 接口指针绑定创建它的 apartment，不满足
//! [`Speaker`] 要求的 `Send + Sync`。改为每次调用即创建——SAPI 的
//! `CoCreateInstance` 开销在朗读场景（用户点击触发）可忽略，换来无需
//! 手动同步或线程亲和管理。

use windows::core::HSTRING;
use windows::Win32::Media::Speech::{ISpVoice, SpVoice, SPF_ASYNC, SPF_PURGEBEFORESPEAK};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};

use crate::{Speaker, TtsError};

/// Windows 朗读提供者。
pub struct WindowsSpeaker;

impl WindowsSpeaker {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for WindowsSpeaker {
    fn default() -> Self {
        Self::new()
    }
}

/// 创建 SAPI 语音实例。
fn create_voice() -> Result<ISpVoice, TtsError> {
    // SAFETY: 遵循 COM 约定——先在本线程初始化 STA（已初始化时返回
    // RPC_E_CHANGED_MODE，忽略即可，不改变既有 apartment），再创建实例；
    // 返回的接口指针由 windows crate 的 RAII 包装管理引用计数。
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        CoCreateInstance(&SpVoice, None, CLSCTX_ALL)
            .map_err(|e| TtsError::Failed(format!("语音引擎初始化失败: {e}")))
    }
}

impl Speaker for WindowsSpeaker {
    fn speak(&self, text: &str) -> Result<(), TtsError> {
        if text.trim().is_empty() {
            return Err(TtsError::Empty);
        }
        let voice = create_voice()?;
        let wide = HSTRING::from(text);
        // SPF_ASYNC：立即返回不阻塞 UI；
        // SPF_PURGEBEFORESPEAK：清空队列打断上一句（连续点朗读时切换而非排队）。
        let flags = (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32;
        // SAFETY: voice 为刚创建的有效接口；wide 在调用期间存活；
        // 第三个参数为可选的输出流序号，传 None 表示不需要。
        unsafe {
            voice
                .Speak(&wide, flags, None)
                .map_err(|e| TtsError::Failed(format!("朗读失败: {e}")))
        }
    }

    fn stop(&self) -> Result<(), TtsError> {
        let voice = create_voice()?;
        // 朗读空串 + PURGEBEFORESPEAK 即清空队列并停止当前朗读。
        let flags = (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32;
        let empty = HSTRING::new();
        // SAFETY: 同 speak——voice 有效、字符串存活、无输出流。
        unsafe {
            voice
                .Speak(&empty, flags, None)
                .map_err(|e| TtsError::Failed(format!("停止朗读失败: {e}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_text_without_touching_com() {
        let s = WindowsSpeaker::new();
        assert_eq!(s.speak("").unwrap_err(), TtsError::Empty);
        assert_eq!(s.speak("   \n ").unwrap_err(), TtsError::Empty);
    }

    /// 朗读不得 panic。CI 无音频设备时 SAPI 仍可创建实例并接受 Speak，
    /// 故此处只断言「不 panic 且错误类型合理」，不断言一定成功。
    #[test]
    fn speak_does_not_panic() {
        let s = WindowsSpeaker::new();
        match s.speak("t") {
            Ok(()) => {}
            Err(e) => assert!(matches!(e, TtsError::Failed(_)), "非预期错误: {e}"),
        }
        // 立刻停止，避免测试期间真的持续发声。
        let _ = s.stop();
    }

    #[test]
    fn stop_does_not_panic() {
        let s = WindowsSpeaker::new();
        match s.stop() {
            Ok(()) => {}
            Err(e) => assert!(matches!(e, TtsError::Failed(_))),
        }
    }

    /// Speaker 要求 Send + Sync——WindowsSpeaker 无字段故天然满足；
    /// 此测试在类型层面固定该约束（若将来改为持有 ISpVoice 会编译失败）。
    #[test]
    fn speaker_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<WindowsSpeaker>();
    }
}
