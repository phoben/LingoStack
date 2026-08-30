import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/**
 * 关于视图（对齐原型 about panel）：版本、开源协议与隐私承诺。
 */
export function AboutView() {
  const t = useT();
  return (
    <ViewShell>
      <div className="flex h-full items-center justify-center overflow-auto px-6 py-10">
        <div className="flex max-w-md flex-col items-center text-center">
          <span
            className="brand-mark mb-5 h-16 w-16 rounded-[18px]"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            译栈 LingoStack
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("aboutDescription")}
          </p>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            {t("privacy")}
          </p>
          <Button className="mt-7" variant="outline" disabled>
            {t("checkForUpdatesSoon")}
          </Button>
        </div>
      </div>
    </ViewShell>
  );
}
