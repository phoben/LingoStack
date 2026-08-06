import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 状态徽标（原型 .pill）：等宽小字，三态。
 * - default：中性
 * - ok：成功（已连接）—— success 色
 * - warn：本地 / 警告 —— warning 色
 */
type PillVariant = "default" | "ok" | "warn";

const VARIANT: Record<PillVariant, string> = {
  default: "border-border bg-muted/40 text-muted-foreground",
  ok: "border-transparent bg-success/15 text-success",
  warn: "border-transparent bg-warning/15 text-warning",
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
}

export function Pill({
  variant = "default",
  className,
  children,
  ...props
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-wide",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
