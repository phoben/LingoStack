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
import { getSelection, registerHotkeys } from "@/lib/ipc";
import { useAppStore } from "@/stores/app-store";
import { useConfigStore } from "@/stores/config-store";
import { useApplyTheme } from "@/hooks/use-theme";
import { useThemeStore } from "@/stores/theme-store";

type Selection = Awaited<ReturnType<typeof getSelection>>;

interface TranslateSelectionPayload {
  selection?: Selection;
  error?: string;
}

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
  const setSelectionFeedback = useAppStore((s) => s.setSelectionFeedback);
  const loadConfig = useConfigStore((s) => s.load);
  const config = useConfigStore((s) => s.config);
  const hotkeys = useConfigStore((s) => s.config?.hotkeys);
  const theme = useThemeStore((s) => s.mode);
  const setTheme = useThemeStore((s) => s.setMode);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config && config.theme !== theme) setTheme(config.theme);
  }, [config, setTheme, theme]);

  // setup can register before the frontend listener exists; actively register after
  // config load so status is observable and stale system registrations are repaired.
  useEffect(() => {
    if (hotkeys) void registerHotkeys(hotkeys).catch(() => {});
  }, [hotkeys]);

  useEffect(() => {
    const translateSelection = async (payload?: TranslateSelectionPayload) => {
      setActiveView("translate");
      setSelectionFeedback(null);
      try {
        if (payload?.error) throw payload.error;
        const sel = payload?.selection ?? (await getSelection());
        if (sel.text.trim()) {
          setInjectSource(sel.text);
          if (sel.source === "clipboard")
            setSelectionFeedback({ kind: "clipboard" });
        } else {
          setSelectionFeedback({
            kind: "error",
            message: "未读取到选中文本，请手动粘贴后翻译。",
          });
        }
      } catch (error) {
        setSelectionFeedback({
          kind: "error",
          message: `读取选中文本失败：${typeof error === "string" ? error : String(error)}。请手动粘贴后翻译。`,
        });
      }
    };
    const unTranslate = listen<TranslateSelectionPayload | undefined>(
      "translate-selection",
      (event) => void translateSelection(event.payload),
    );
    const unNavigate = listen("navigate-view", (event) => {
      const view = event.payload;
      if (
        [
          "translate",
          "naming",
          "docs",
          "favorites",
          "settings",
          "about",
        ].includes(view as string)
      ) {
        setActiveView(
          view as
            | "translate"
            | "naming"
            | "docs"
            | "favorites"
            | "settings"
            | "about",
        );
      }
    });
    return () => {
      void Promise.all([unTranslate, unNavigate]).then(
        ([translate, navigate]) => {
          translate();
          navigate();
        },
      );
    };
  }, [setActiveView, setInjectSource, setSelectionFeedback]);

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
