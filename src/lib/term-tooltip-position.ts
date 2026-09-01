export interface TooltipPosition {
  left: number;
  top: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface TooltipSize {
  width: number;
  height: number;
}

const GUTTER = 8;
const GAP = 8;

/** Computes a fixed overlay position without involving the translation scrollport. */
export function positionTermTooltip(
  trigger: Pick<DOMRect, "left" | "top" | "bottom">,
  tooltip: TooltipSize,
  viewport: ViewportSize,
): TooltipPosition {
  const maximumLeft = Math.max(GUTTER, viewport.width - tooltip.width - GUTTER);
  const left = Math.min(Math.max(GUTTER, trigger.left), maximumLeft);
  const below = trigger.bottom + GAP;
  const top =
    below + tooltip.height <= viewport.height - GUTTER
      ? below
      : Math.max(GUTTER, trigger.top - GAP - tooltip.height);
  return { left, top };
}
