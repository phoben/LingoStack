import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { TitleBar } from "@/components/title-bar";
import { Sidebar } from "@/components/sidebar";
import { AboutView } from "@/components/views/about-view";
import { DocsView } from "@/components/views/docs-view";
import { FavoritesView } from "@/components/views/favorites-view";
import { NamingView } from "@/components/views/naming-view";
import { SettingsView } from "@/components/views/settings-view";
import { TranslateView } from "@/components/views/translate-view";
import { getSelection } from "@/lib/ipc";
import { useAppStore } from "@/stores/app-store";
import { useConfigStore } from "@/stores/config-store";
import { useApplyTheme } from "@/hooks/use-theme";

/**
 * 主窗口：自定义标题栏 + 可调宽左侧导航 + 圆角内容面板（§4.3 / §12.4）。
 *
 * 布局无分割线：标题栏与侧栏共用窗口底色，内容区为一块背景稍浅的圆角面板，
 * 视觉上「标题栏 + 侧栏」连成一体、右侧主页面区独立浮起。
 *
 * 视图切换经 app-store；主题由 useApplyTheme 同步至 <html>；应用配置启动时
 * 从 Rust 侧加载一次。划词翻译热键触发时，Rust 发 `translate-selection` 事件，
 * 由本组件切到翻译视图并注入选中文本，翻译视图自动翻译——故无需独立浮窗。
 */
function App() {
  useApplyTheme();
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setInjectSource = useAppStore((s) => s.setInjectSource);
  const loadConfig = useConfigStore((s) => s.load);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const un = listen("translate-selection", async () => {
      setActiveView("translate");
      try {
        const sel = await getSelection();
        if (sel.text.trim()) {
          setInjectSource(sel.text);
        }
      } catch {
        // 取词失败：仍切到翻译视图，用户可手动粘贴。
      }
    });
    return () => {
      void un.then((f) => f());
    };
  }, [setActiveView, setInjectSource]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1 gap-1.5 px-2 pb-2">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-surface shadow-ring">
          {activeView === "translate" ? <TranslateView /> : null}
          {activeView === "naming" ? <NamingView /> : null}
          {activeView === "docs" ? <DocsView /> : null}
          {activeView === "favorites" ? <FavoritesView /> : null}
          {activeView === "settings" ? <SettingsView /> : null}
          {activeView === "about" ? <AboutView /> : null}
        </main>
      </div>
    </div>
  );
}

export default App;
