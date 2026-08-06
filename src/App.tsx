import { TitleBar } from "@/components/title-bar";
import { Sidebar } from "@/components/sidebar";
import { StatusBar } from "@/components/status-bar";
import { AboutView } from "@/components/views/about-view";
import { DocsView } from "@/components/views/docs-view";
import { FavoritesView } from "@/components/views/favorites-view";
import { NamingView } from "@/components/views/naming-view";
import { SettingsView } from "@/components/views/settings-view";
import { TranslateView } from "@/components/views/translate-view";
import { useAppStore } from "@/stores/app-store";
import { useApplyTheme } from "@/hooks/use-theme";

/**
 * 主窗口：自定义标题栏 + 左侧导航 + 视图内容区 + 底部状态栏（§4.3 / §12.4）。
 * 视图切换经 app-store；主题由 useApplyTheme 同步至 <html>。
 * 布局与视觉对齐 Open Design 高保真原型 main-window.html。
 */
function App() {
  useApplyTheme();
  const activeView = useAppStore((s) => s.activeView);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          {activeView === "translate" ? <TranslateView /> : null}
          {activeView === "naming" ? <NamingView /> : null}
          {activeView === "docs" ? <DocsView /> : null}
          {activeView === "favorites" ? <FavoritesView /> : null}
          {activeView === "settings" ? <SettingsView /> : null}
          {activeView === "about" ? <AboutView /> : null}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
