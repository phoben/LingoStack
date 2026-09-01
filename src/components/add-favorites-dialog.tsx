import { useEffect, useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_MANUAL_FAVORITES, validateManualFavorites } from "@/lib/favorites";
import { useT } from "@/lib/i18n";
import { resolveLocale } from "@/lib/i18n";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useConfigStore } from "@/stores/config-store";

type Row = { id: string; value: string };
const newRow = (): Row => ({ id: crypto.randomUUID(), value: "" });

export function AddFavoritesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dialogId = useId();
  const firstInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const list = useFavoritesStore((state) => state.list);
  const loaded = useFavoritesStore((state) => state.loaded);
  const storeError = useFavoritesStore((state) => state.error);
  const addManualBatch = useFavoritesStore((state) => state.addManualBatch);
  const clearError = useFavoritesStore((state) => state.clearError);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const validation = validateManualFavorites(rows.map((row) => row.value), list);

  useEffect(() => {
    clearError();
    firstInput.current?.focus();
  }, [clearError]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const errorText = (index: number) => {
    const value = validation.errors.get(index);
    return value === "empty" ? t("favoriteEmpty") : value === "duplicate" ? t("favoriteDuplicate") : value === "alreadySaved" ? t("favoriteAlreadySaved") : null;
  };
  const submit = async () => {
    setSaving(true);
    const language = resolveLocale(useConfigStore.getState().config?.ui_language ?? "system");
    const result = await addManualBatch(rows.map((row) => row.value), language);
    setSaving(false);
    if (result.count) onClose();
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" role="presentation">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`} className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-border bg-surface shadow-ring">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><h2 id={`${dialogId}-title`} className="text-sm font-semibold">{t("addFavoritesTitle")}</h2><p id={`${dialogId}-description`} className="text-xs text-muted-foreground">{t("validFavorites", { count: String(validation.valid.length), max: String(MAX_MANUAL_FAVORITES) })}</p></div>
        <Button variant="ghost" size="icon" aria-label={t("dismiss")} onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="min-h-0 space-y-2 overflow-auto px-4 py-3">
        {storeError ? <p role="alert" className="text-xs text-destructive">{storeError}</p> : null}
        {rows.map((row, index) => <div key={row.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><Input ref={index === 0 ? firstInput : undefined} value={row.value} aria-label={`${t("addFavoritesTitle")} ${index + 1}`} aria-invalid={Boolean(errorText(index))} onChange={(event) => setRows((old) => old.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
          {errorText(index) ? <p className="mt-1 text-xs text-destructive" role="alert">{errorText(index)}</p> : null}</div>
          <Button variant="ghost" size="icon" aria-label={t("removeFavoriteItem")} disabled={rows.length === 1} onClick={() => setRows((old) => old.filter((item) => item.id !== row.id))}><X className="h-3.5 w-3.5" /></Button>
        </div>)}
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3"><Button variant="outline" size="sm" disabled={rows.length >= MAX_MANUAL_FAVORITES} onClick={() => setRows((old) => [...old, newRow()])}><Plus className="h-3.5 w-3.5" />{t("addFavoriteItem")}</Button><Button size="sm" disabled={!loaded || saving || validation.valid.length === 0} onClick={() => void submit()}>{t("saveAndExplain")}</Button></div>
    </div>
  </div>;
}
