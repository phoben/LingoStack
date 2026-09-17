import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/stores/app-store";

/** 在业务失败位置统一提供直达 AI 设置的恢复操作。 */
export function AiConfigurationAction() {
  const openSettings = useAppStore((state) => state.openSettings);
  const t = useT();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="ml-auto"
      onClick={() => openSettings("ai")}
    >
      <Settings className="h-3.5 w-3.5" />
      {t("openAiSettings")}
    </Button>
  );
}
