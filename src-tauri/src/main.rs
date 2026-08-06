// 防止 release 模式下 Windows 弹出额外的控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lingostack_app_lib::run()
}
