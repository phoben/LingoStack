import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

/** Small app-native menu for document actions; it never delegates to WebView menus. */
export function ContextMenu({
  open,
  position,
  items,
  onClose,
  ariaLabel,
}: {
  open: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  ariaLabel: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState(position);
  const enabledItems = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).filter((item) => !item.disabled);
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const bounds = menu.current.getBoundingClientRect();
    const inset = 8;
    setPlacement({
      x: Math.max(
        inset,
        Math.min(position.x, window.innerWidth - bounds.width - inset),
      ),
      y: Math.max(
        inset,
        Math.min(position.y, window.innerHeight - bounds.height - inset),
      ),
    });
  }, [open, position.x, position.y]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    enabledItems()[0]?.focus();
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div
      ref={menu}
      role="menu"
      tabIndex={-1}
      aria-label={ariaLabel}
      style={{ left: placement.x, top: placement.y }}
      onKeyDown={(event) => {
        const options = enabledItems();
        if (options.length === 0) return;
        const current = options.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const focus = (index: number) => options[index]?.focus();
        switch (event.key) {
          case "ArrowDown":
          case "ArrowRight":
            event.preventDefault();
            focus((current + 1 + options.length) % options.length);
            break;
          case "ArrowUp":
          case "ArrowLeft":
            event.preventDefault();
            focus((current - 1 + options.length) % options.length);
            break;
          case "Home":
            event.preventDefault();
            focus(0);
            break;
          case "End":
            event.preventDefault();
            focus(options.length - 1);
            break;
        }
      }}
      className="fixed z-50 min-w-44 border border-border bg-surface p-1 shadow-focus outline-none"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={cn(
            "flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:bg-accent disabled:opacity-50",
            item.destructive && "text-destructive",
          )}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
