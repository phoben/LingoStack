import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark } from "lucide-react";
import type { TranslationTerm } from "@/lib/translation-envelope";
import {
  positionTermTooltip,
  type TooltipPosition,
} from "@/lib/term-tooltip-position";
import { matchesFavoriteTerm } from "@/lib/favorites";
import { useFavoritesStore } from "@/stores/favorites-store";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

/** Contextual translation terms with a top-level, non-layout-affecting explanation. */
export function TermTags({ terms }: { terms: TranslationTerm[] }) {
  const t = useT();
  const list = useFavoritesStore((state) => state.list);
  const loaded = useFavoritesStore((state) => state.loaded);
  const toggle = useFavoritesStore((state) => state.toggle);
  const clearError = useFavoritesStore((state) => state.clearError);
  const [open, setOpen] = useState<number | null>(null);
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());
  const pendingRef = useRef(new Set<number>());
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const triggerRefs = useRef(new Map<number, HTMLButtonElement>());
  const tooltipRef = useRef<HTMLSpanElement>(null);

  const favoriteStates = useMemo(
    () =>
      terms.map((term) =>
        list.some((favorite) =>
          matchesFavoriteTerm(favorite, term.term),
        ),
      ),
    [list, terms],
  );

  const measure = useCallback(() => {
    if (open === null) return;
    const trigger = triggerRefs.current.get(open);
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const rect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    setPosition(
      positionTermTooltip(rect, tooltipRect, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [open]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (open === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  if (terms.length === 0) return null;
  const openTerm = open === null ? null : terms[open];
  const tooltipId = open === null ? undefined : `term-explanation-${open}`;

  const onToggle = async (term: TranslationTerm, index: number) => {
    if (pendingRef.current.has(index)) return;
    pendingRef.current.add(index);
    setPending(new Set(pendingRef.current));
    try {
      await toggle(term.term, term.explanation, "翻译");
      const error = useFavoritesStore.getState().error;
      if (error) {
        toast.error(t("favoriteFailed", { message: error }), { duration: 4000 });
        clearError();
      } else {
        toast.success(
          t(favoriteStates[index] ? "favoriteRemoved" : "favorited"),
        );
      }
    } finally {
      pendingRef.current.delete(index);
      setPending(new Set(pendingRef.current));
    }
  };

  return (
    <section
      className="mt-4 border-t border-border pt-3"
      aria-label={t("contextualTerms")}
      aria-busy={!loaded}
    >
      <p className="mb-2 text-xs text-muted-foreground">{t("contextualTerms")}</p>
      <div className="flex flex-wrap gap-2">
        {terms.map((term, index) => {
          const isFavorite = favoriteStates[index];
          const id = `term-explanation-${index}`;
          return (
            <span
              key={`${term.category}:${term.term}`}
              className="inline-flex items-center rounded-md border border-border"
            >
              <button
                ref={(element) => {
                  if (element) triggerRefs.current.set(index, element);
                  else triggerRefs.current.delete(index);
                }}
                type="button"
                className="rounded-l-md px-2 py-1 text-xs text-foreground transition-colors duration-fast hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-info/40"
                aria-describedby={open === index ? id : undefined}
                onMouseEnter={() => setOpen(index)}
                onMouseLeave={() => setOpen(null)}
                onFocus={() => setOpen(index)}
                onBlur={() => setOpen(null)}
              >
                {term.term}
              </button>
              <button
                type="button"
                className="border-l border-border px-1.5 py-1 text-muted-foreground transition-colors duration-fast hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-info/40 disabled:cursor-wait"
                aria-label={t(isFavorite ? "removeFavorite" : "favorite")}
                aria-pressed={isFavorite}
                disabled={!loaded || pending.has(index)}
                onClick={() => void onToggle(term, index)}
              >
                <Bookmark
                  className="h-3.5 w-3.5"
                  fill={isFavorite ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </button>
            </span>
          );
        })}
      </div>
      {openTerm && tooltipId
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none fixed z-50 max-w-[calc(100vw-16px)] border border-border bg-surface px-2 py-1.5 text-xs text-foreground shadow-ring"
              style={{
                left: position?.left ?? 8,
                top: position?.top ?? 8,
                width: "14rem",
                visibility: position ? "visible" : "hidden",
              }}
            >
              {openTerm.explanation}
            </span>,
            document.body,
          )
        : null}
    </section>
  );
}
