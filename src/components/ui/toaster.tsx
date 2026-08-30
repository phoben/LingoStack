import { Toaster } from "sonner";
import { useT } from "@/lib/i18n";
import { useThemeStore } from "@/stores/theme-store";

/** The only application-level Sonner mount. Business views only choose a toast type. */
export function LingoStackToaster() {
  const t = useT();
  const theme = useThemeStore((state) => state.mode);

  return (
    <Toaster
      theme={theme}
      position="top-center"
      duration={1600}
      visibleToasts={3}
      gap={8}
      offset={16}
      hotkey={[]}
      closeButton
      containerAriaLabel={t("notifications")}
      toastOptions={{
        closeButtonAriaLabel: t("dismiss"),
        classNames: {
          toast:
            "!rounded-full !border !border-border !bg-surface !text-foreground !shadow-ring",
          title: "!text-xs !font-medium",
          success: "!text-success",
          info: "!text-info",
          warning: "!text-warning",
          error: "!text-destructive",
          closeButton:
            "!border-border !bg-background !text-muted-foreground hover:!bg-accent hover:!text-foreground",
        },
      }}
    />
  );
}
