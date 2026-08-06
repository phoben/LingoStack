import { ViewShell } from "@/components/view-shell";
import { Pill } from "@/components/ui/pill";

/**
 * 关于视图（对齐原型 about panel）：版本、开源协议与隐私承诺。
 */
export function AboutView() {
  return (
    <ViewShell view="about" actions={<Pill>v1.0.0 · MIT</Pill>}>
      <div className="max-w-2xl text-xs leading-7 text-muted-foreground">
        <p>译栈 LingoStack · v1.0.0 · MIT License</p>
        <p>零遥测：所有请求直连你配置的提供商，不经任何中间服务器。</p>
        <p>
          崩溃日志本地保存，不记录 API Key；问题反馈请前往{" "}
          <a href="#" className="text-info hover:underline">
            GitHub Issues
          </a>
          。
        </p>
      </div>
    </ViewShell>
  );
}
