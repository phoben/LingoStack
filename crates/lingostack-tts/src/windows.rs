//! Windows 朗读实现（SAPI `ISpVoice`）。
//!
//! **`ISpVoice` 不能被 [`Speaker`] 持有**：COM 接口指针绑定创建它的 apartment，
//! 不满足 trait 要求的 `Send + Sync`。而朗读走 `SPF_ASYNC` 立即返回，若在函数内
//! 创建实例，函数返回即 drop、引用计数归零，朗读随实例一起被销毁——声音一发即断。
//!
//! 解法是把实例关进一条专用朗读线程：进程内单例，实例常驻其中且从不越出该线程；
//! [`WindowsSpeaker`] 自身无字段，朗读与停止都只是往通道里递一条指令。
//! 单实例同时是「打断上一句」的前提——`SPF_PURGEBEFORESPEAK` 只在同一实例内
//! 生效，两个独立实例各自 purge 互不打断。

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;

use windows::core::HSTRING;
use windows::Win32::Media::Speech::{
    ISpVoice, SpVoice, SPF_ASYNC, SPF_PURGEBEFORESPEAK, SPRS_DONE, SPVOICESTATUS,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};

use crate::{Speaker, SpeechCompletion, SpeechOutcome, TtsError};

/// 等待朗读线程回执的上界。回执只表示「引擎已受理指令」，不含朗读时长
/// （引擎侧走 `SPF_ASYNC`），故正常在微秒级返回；超时即认为线程失去响应。
const ACK_TIMEOUT: Duration = Duration::from_secs(2);
const STATUS_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// 递给朗读线程的指令。`ack` 回传引擎是否受理，不等朗读播完。
enum Cmd {
    Speak {
        text: String,
        ack: Sender<Result<SpeechCompletion, TtsError>>,
    },
    Stop {
        ack: Sender<Result<(), TtsError>>,
    },
}

/// 朗读线程的指令入口。`None` 表示尚未启动，或上次启动失败——
/// 失败不做缓存（多为音频设备被占用等暂态），下次调用重新尝试。
static VOICE_TX: Mutex<Option<Sender<Cmd>>> = Mutex::new(None);

/// 朗读线程累计启动次数。单例语义下正常值恒为 1，测试据此断言线程未被重复创建。
static THREAD_STARTS: AtomicUsize = AtomicUsize::new(0);

/// Windows 朗读提供者。只持有通往朗读线程的通道，故天然 `Send + Sync`。
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

/// 创建 SAPI 语音实例。**只在朗读线程内调用**，实例不得越出该线程。
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

/// 把文本提交给引擎。提交即返回，不等播完。
fn submit(voice: &ISpVoice, text: &str) -> Result<(), TtsError> {
    let wide = HSTRING::from(text);
    // SPF_ASYNC：引擎后台播放，朗读线程立即回到收指令状态，
    //   使随后的停止指令不必排在长句之后；
    // SPF_PURGEBEFORESPEAK：清空队列打断上一句（仅同一实例内有效）。
    let flags = (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32;
    // SAFETY: voice 由本线程创建且仅在本线程使用；wide 在调用期间存活；
    // 第三个参数为可选的输出流序号，传 None 表示不需要。
    unsafe {
        voice
            .Speak(&wide, flags, None)
            .map_err(|e| TtsError::Failed(format!("朗读失败: {e}")))
    }
}

/// 只在语音线程中读取 SAPI 运行状态，绝不把 COM 对象带出其 apartment。
fn playback_finished(voice: &ISpVoice) -> Result<bool, TtsError> {
    let mut status = SPVOICESTATUS::default();
    // SAFETY: `voice` 在其创建的 STA 线程中使用，status 是有效的输出缓冲区；
    // 不需要最后 bookmark，因此传入空指针。
    unsafe {
        voice
            .GetStatus(&mut status, std::ptr::null_mut())
            .map_err(|e| TtsError::Failed(format!("朗读状态读取失败: {e}")))?;
    }
    Ok(status.dwRunningState == SPRS_DONE.0 as u32)
}

fn notify(
    active: &mut Option<Sender<Result<SpeechOutcome, TtsError>>>,
    outcome: Result<SpeechOutcome, TtsError>,
) {
    if let Some(completion) = active.take() {
        let _ = completion.send(outcome);
    }
}

/// 朗读线程主体：建实例、报初始化结果、循环收指令直至通道关闭。
fn voice_loop(cmd_rx: &Receiver<Cmd>, ready_tx: &Sender<Result<(), String>>) {
    let voice = match create_voice() {
        Ok(voice) => {
            let _ = ready_tx.send(Ok(()));
            voice
        }
        Err(e) => {
            let _ = ready_tx.send(Err(e.to_string()));
            return;
        }
    };
    let mut active = None;
    loop {
        match cmd_rx.recv_timeout(STATUS_POLL_INTERVAL) {
            Ok(Cmd::Speak { text, ack }) => {
                notify(&mut active, Ok(SpeechOutcome::Interrupted));
                let (completion_tx, completion_rx) = mpsc::channel();
                match submit(&voice, &text) {
                    Ok(()) => {
                        active = Some(completion_tx);
                        let _ = ack.send(Ok(SpeechCompletion::new(completion_rx)));
                    }
                    Err(error) => {
                        let _ = ack.send(Err(error));
                    }
                }
            }
            Ok(Cmd::Stop { ack }) => {
                notify(&mut active, Ok(SpeechOutcome::Interrupted));
                // 空串 + PURGEBEFORESPEAK 即清空队列并停止当前朗读。
                let _ = ack.send(submit(&voice, ""));
            }
            Err(RecvTimeoutError::Timeout) => {
                if active.is_some() {
                    match playback_finished(&voice) {
                        Ok(true) => notify(&mut active, Ok(SpeechOutcome::Finished)),
                        Ok(false) => {}
                        Err(error) => notify(&mut active, Err(error)),
                    }
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// 启动朗读线程，等其报告初始化结果后才交出通道。
fn spawn_voice_thread() -> Result<Sender<Cmd>, TtsError> {
    let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    std::thread::Builder::new()
        .name("lingostack-tts".to_owned())
        .spawn(move || voice_loop(&cmd_rx, &ready_tx))
        .map_err(|e| TtsError::Failed(format!("朗读线程启动失败: {e}")))?;
    match ready_rx.recv() {
        Ok(Ok(())) => {
            THREAD_STARTS.fetch_add(1, Ordering::Relaxed);
            Ok(cmd_tx)
        }
        Ok(Err(msg)) => Err(TtsError::Failed(msg)),
        Err(_) => Err(TtsError::Failed("朗读线程未报告初始化结果".to_owned())),
    }
}

/// 取朗读线程通道，未启动则先启动。
fn ensure_thread() -> Result<Sender<Cmd>, TtsError> {
    // 锁被 panic 毒化时取回内部值继续用：朗读不是一致性敏感状态，
    // 让它永久不可用比容忍一次 panic 更糟。
    let mut slot = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(tx) = slot.as_ref() {
        return Ok(tx.clone());
    }
    let tx = spawn_voice_thread()?;
    *slot = Some(tx.clone());
    Ok(tx)
}

/// 丢弃失效线程的通道，使下次调用重新启动一条。
fn clear_thread() {
    let mut slot = VOICE_TX.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None;
}

/// 递指令并等回执。回执只覆盖「引擎已受理」，不等朗读播完（见 [`ACK_TIMEOUT`]）。
fn dispatch_speak(text: String) -> Result<SpeechCompletion, TtsError> {
    let tx = ensure_thread()?;
    let (ack_tx, ack_rx) = mpsc::channel();
    if tx.send(Cmd::Speak { text, ack: ack_tx }).is_err() {
        clear_thread();
        return Err(TtsError::Failed("朗读线程已退出".to_owned()));
    }
    match ack_rx.recv_timeout(ACK_TIMEOUT) {
        Ok(result) => result,
        // 线程失去响应。丢弃它并让下次调用重建——代价是那条线程若仍持有实例，
        // 打断语义会短暂退化；相比永久无法朗读，这个取舍更可接受。
        Err(_) => {
            clear_thread();
            Err(TtsError::Failed("朗读线程无响应".to_owned()))
        }
    }
}

fn dispatch_stop() -> Result<(), TtsError> {
    let tx = ensure_thread()?;
    let (ack_tx, ack_rx) = mpsc::channel();
    if tx.send(Cmd::Stop { ack: ack_tx }).is_err() {
        clear_thread();
        return Err(TtsError::Failed("朗读线程已退出".to_owned()));
    }
    match ack_rx.recv_timeout(ACK_TIMEOUT) {
        Ok(result) => result,
        Err(_) => {
            clear_thread();
            Err(TtsError::Failed("朗读线程无响应".to_owned()))
        }
    }
}

impl Speaker for WindowsSpeaker {
    fn speak(&self, text: &str) -> Result<SpeechCompletion, TtsError> {
        // 空文本在触碰 COM 之前就拒绝。
        if text.trim().is_empty() {
            return Err(TtsError::Empty);
        }
        let text = text.to_owned();
        dispatch_speak(text)
    }

    fn stop(&self) -> Result<(), TtsError> {
        dispatch_stop()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

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
            Ok(_) => {}
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

    /// `speak` 必须提交即返回，不能同步等播完——否则调用方（翻译页读整段译文）
    /// 会被冻住。无法断言真的出声，但「远快于朗读该文本所需时长」可断言。
    #[test]
    fn speak_returns_without_waiting_for_playback() {
        let s = WindowsSpeaker::new();
        let long = "This sentence is long enough that speaking it aloud would take \
                    several seconds, which makes it a usable probe for whether the \
                    call returns before playback finishes.";
        // 先热一次，把朗读线程的一次性初始化排除在计时之外。
        if s.speak("warm up").is_err() {
            return; // 环境无可用语音引擎，跳过时序断言。
        }
        let started = Instant::now();
        let result = s.speak(long);
        let elapsed = started.elapsed();
        let _ = s.stop();
        if result.is_ok() {
            assert!(
                elapsed < Duration::from_millis(500),
                "speak 耗时 {elapsed:?}，疑似同步等待播放完成"
            );
        }
    }

    /// 连续朗读与停止交替不得死锁：停止指令走同一条通道，若朗读线程被长句阻塞住，
    /// 这里会卡到 ACK_TIMEOUT 才返回错误，断言随之失败。
    #[test]
    fn repeated_speak_and_stop_do_not_deadlock() {
        let s = WindowsSpeaker::new();
        for i in 0..5 {
            match s.speak(&format!("utterance number {i} for the interrupt probe")) {
                Ok(_) | Err(TtsError::Failed(_)) => {}
                Err(e) => panic!("非预期错误: {e}"),
            }
            match s.stop() {
                Ok(()) | Err(TtsError::Failed(_)) => {}
                Err(e) => panic!("非预期错误: {e}"),
            }
        }
    }

    /// 多次调用共享同一条朗读线程。这是打断语义的结构前提——
    /// SPF_PURGEBEFORESPEAK 跨实例无效，若每次新建实例，连点朗读会两句重叠。
    ///
    /// 断言的是「这两次调用之间没有新起线程」而非绝对计数：同进程内其他测试
    /// 也会用到这条线程，绝对值不属于本测试可控范围。
    #[test]
    fn repeated_speak_reuses_one_voice_thread() {
        let s = WindowsSpeaker::new();
        if s.speak("first utterance").is_err() {
            return; // 环境无可用语音引擎，跳过。
        }
        let before = THREAD_STARTS.load(Ordering::Relaxed);
        let second = s.speak("second utterance");
        let after = THREAD_STARTS.load(Ordering::Relaxed);
        let _ = s.stop();
        if second.is_ok() {
            assert_eq!(before, after, "第二次朗读又起了一条线程，打断语义会失效");
        }
    }
}
