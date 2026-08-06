//! Windows 取词实现：UI Automation TextPattern 优先，失败降级剪贴板（§9）。
//!
//! 许多原生控件（终端、部分 Win32 控件、Electron 应用）不实现 UIA
//! `TextPattern`，此时 `GetCurrentPattern` 返回空指针或 `cast` 失败——这属于
//! 预期路径，不是错误，直接走剪贴板降级。

use windows::core::Interface;
use windows::Win32::Foundation::HGLOBAL;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
};

use crate::{Selection, SelectionError, SelectionProvider, SelectionSource};

/// `CF_UNICODETEXT` 剪贴板格式（UTF-16）。
const CF_UNICODETEXT: u32 = 13;

/// Windows 取词提供者。
pub struct WindowsSelection;

impl WindowsSelection {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for WindowsSelection {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectionProvider for WindowsSelection {
    fn get_selection(&self) -> Result<Selection, SelectionError> {
        // UIA 优先。返回 None 表示「无选区或控件不支持」——非错误，继续降级。
        if let Some(text) = uia_selection() {
            let text = text.trim().to_string();
            if !text.is_empty() {
                return Ok(Selection {
                    text,
                    source: SelectionSource::Accessibility,
                });
            }
        }
        // 降级：剪贴板。
        let text = clipboard_text()?.trim().to_string();
        if text.is_empty() {
            return Err(SelectionError::Empty);
        }
        Ok(Selection {
            text,
            source: SelectionSource::Clipboard,
        })
    }
}

/// 经 UIA TextPattern 读取焦点元素的选中文本。
///
/// 任何一步失败（COM 初始化、无焦点元素、控件不支持 TextPattern、空选区）
/// 都返回 `None` 交由调用方降级——UIA 不可用在 Windows 上很常见。
fn uia_selection() -> Option<String> {
    // SAFETY: 全部调用遵循 COM 约定——先在本线程初始化 STA，再创建
    // CUIAutomation 实例；所有接口指针由 windows crate 的 RAII 包装管理
    // 引用计数，不手动 Release；`GetText(-1)` 表示不限长度，返回 BSTR
    // 亦由包装类型释放。
    unsafe {
        // 已初始化时返回 RPC_E_CHANGED_MODE，忽略即可（不改变既有 apartment）。
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
        let focused = automation.GetFocusedElement().ok()?;
        let pattern = focused.GetCurrentPattern(UIA_TextPatternId).ok()?;
        // 控件不支持 TextPattern 时 cast 失败——预期路径。
        let text_pattern: IUIAutomationTextPattern = pattern.cast().ok()?;
        let ranges = text_pattern.GetSelection().ok()?;
        if ranges.Length().ok()? == 0 {
            return None;
        }
        let range = ranges.GetElement(0).ok()?;
        Some(range.GetText(-1).ok()?.to_string())
    }
}

/// 读取剪贴板中的 Unicode 文本。
fn clipboard_text() -> Result<String, SelectionError> {
    // SAFETY: 严格遵循剪贴板协议——OpenClipboard 成功后必须 CloseClipboard
    // （所有 return 路径均已覆盖）；GetClipboardData 返回的句柄归系统所有，
    // 不可释放，只在 GlobalLock/GlobalUnlock 之间读取；按 CF_UNICODETEXT
    // 约定数据是 NUL 结尾的 UTF-16 序列，故以 0 为终止扫描长度。
    unsafe {
        OpenClipboard(None).map_err(|e| SelectionError::Failed(format!("打开剪贴板失败: {e}")))?;

        let result = (|| {
            let handle = GetClipboardData(CF_UNICODETEXT).map_err(|_| SelectionError::Empty)?;
            let ptr = GlobalLock(HGLOBAL(handle.0)) as *const u16;
            if ptr.is_null() {
                return Err(SelectionError::Failed("剪贴板内存锁定失败".into()));
            }
            let mut len = 0usize;
            while *ptr.add(len) != 0 {
                len += 1;
            }
            let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
            let _ = GlobalUnlock(HGLOBAL(handle.0));
            Ok(text)
        })();

        let _ = CloseClipboard();
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_constructs() {
        let _p = WindowsSelection::new();
        let _d = WindowsSelection;
    }

    /// 取词不得 panic——无论当前焦点/剪贴板处于何种状态。
    ///
    /// 结果依赖运行环境（CI 无桌面会话时通常为 Empty），故只断言
    /// 「不 panic 且语义自洽」：成功则文本非空。
    #[test]
    fn get_selection_never_panics_and_is_self_consistent() {
        let provider = WindowsSelection::new();
        match provider.get_selection() {
            Ok(sel) => assert!(!sel.text.is_empty(), "成功时文本不应为空"),
            Err(e) => assert!(
                matches!(e, SelectionError::Empty | SelectionError::Failed(_)),
                "非预期错误: {e}"
            ),
        }
    }

    #[test]
    fn clipboard_text_does_not_panic() {
        // 只验证不 panic 与错误类型合理；内容随环境而变。
        match clipboard_text() {
            Ok(_) => {}
            Err(e) => assert!(matches!(
                e,
                SelectionError::Empty | SelectionError::Failed(_)
            )),
        }
    }

    #[test]
    fn uia_selection_does_not_panic() {
        let _ = uia_selection();
    }
}
