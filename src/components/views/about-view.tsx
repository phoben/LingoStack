import { ViewShell } from "@/components/view-shell";
import { Pill } from "@/components/ui/pill";
import { useT } from "@/lib/i18n";

/**
 * 关于视图（对齐原型 about panel）：版本、开源协议与隐私承诺。
 */
export function AboutView() {
  const t = useT();
  return (
    <ViewShell
      toolbar={
        <>
          <span
            className="brand-mark h-6 w-6 rounded-[7px]"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold">译栈 LingoStack</span>
          <Pill className="ml-auto">v1.0.0 · MIT</Pill>
        </>
      }
    >
      <div className="max-w-2xl px-4 py-4 text-xs leading-7 text-muted-foreground">
        <p>译栈 LingoStack · v1.0.0 · MIT License</p>
        <p>{t("privacy")}</p>
        <p>
          {t("crashLogs")} {" "}
          <a href="#" className="text-info hover:underline">
            GitHub Issues
          </a>
          。
        </p>
      </div>
    </ViewShell>
  );
}
