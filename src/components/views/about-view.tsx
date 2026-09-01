import { ViewShell } from "@/components/view-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  UPDATER_ENABLED,
  updateProgress,
  useUpdateStore,
} from "@/stores/update-store";

function errorText(
  error: "check" | "download" | "install",
  t: ReturnType<typeof useT>,
) {
  return t(
    error === "check"
      ? "updateCheckFailed"
      : error === "download"
        ? "updateDownloadFailed"
        : "updateInstallFailed",
  );
}

/**
 * 关于视图（对齐原型 about panel）：版本、开源协议与隐私承诺。
 */
export function AboutView() {
  const t = useT();
  const {
    status,
    available,
    downloadedBytes,
    contentLength,
    error,
    lastManualCheck,
    check,
    install,
  } = useUpdateStore((state) => state);
  const progress = updateProgress(downloadedBytes, contentLength);
  const busy =
    status === "checking" ||
    status === "downloading" ||
    status === "installing" ||
    status === "restarting";
  const releaseUrl = available
    ? `https://github.com/phoben/LingoStack/releases/tag/v${encodeURIComponent(available.version)}`
    : null;
  const actionLabel =
    status === "available" || (status === "error" && available)
      ? t("updateNow")
      : status === "checking"
        ? t("checkingForUpdates")
        : t("checkForUpdates");

  const runAction = () => {
    if (status === "available") return void install();
    if (status === "error" && available) return void install();
    void check("manual");
  };

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
          {UPDATER_ENABLED ? (
            <div
              className="mt-7 flex w-full flex-col items-center gap-3"
              aria-live="polite"
              aria-busy={busy}
            >
              {available ? (
                <div className="w-full border-y border-border px-3 py-3 text-left">
                  <p className="text-sm font-medium">
                    {t("updateAvailable", { version: available.version })}
                  </p>
                  {available.date ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {available.date}
                    </p>
                  ) : null}
                  {available.notes ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {available.notes}
                    </p>
                  ) : null}
                  {releaseUrl ? (
                    <a
                      className="mt-2 inline-block text-xs text-info underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
                      href={releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("updateFullReleaseNotes")}
                    </a>
                  ) : null}
                </div>
              ) : null}
              {status === "downloading" ? (
                <p className="text-xs text-muted-foreground">
                  {progress === null
                    ? t("downloadingUpdate")
                    : t("updateProgress", { progress: String(progress) })}
                </p>
              ) : null}
              {status === "installing" || status === "restarting" ? (
                <p className="text-xs text-muted-foreground">
                  {status === "installing"
                    ? t("installingUpdate")
                    : t("restartingUpdate")}
                </p>
              ) : null}
              {lastManualCheck ? (
                <p className="text-xs text-success">{t("updateUpToDate")}</p>
              ) : null}
              {error ? (
                <p className="text-xs text-destructive" role="alert">
                  {errorText(error, t)}
                </p>
              ) : null}
              <Button
                variant={available ? "default" : "outline"}
                disabled={busy}
                onClick={runAction}
              >
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </ViewShell>
  );
}
