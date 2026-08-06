import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TitleBar } from "@/components/title-bar";
import { useApplyTheme } from "@/hooks/use-theme";

function App() {
  useApplyTheme();
  const [info, setInfo] = useState("正在连接后端…");

  useEffect(() => {
    let cancelled = false;
    invoke<string>("app_info")
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setInfo(`IPC 错误：${String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            LingoStack · 译栈
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            面向程序员的跨平台桌面翻译工具
          </p>
        </div>
        <div className="bg-muted text-muted-foreground rounded-2xl px-6 py-3 font-mono text-sm">
          {info}
        </div>
        <p className="text-muted-foreground/70 text-xs">
          V0 脚手架占位 · 业务功能将在 V1 实现
        </p>
      </main>
    </div>
  );
}

export default App;
