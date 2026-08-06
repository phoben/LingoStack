import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 输入框，对齐原型 .input：bg-background 底 + input 边 + info 焦点环。
 * 圆角 radius-sm=6，无投影。V1 引入 shadcn 完整组件时可平滑替换。
 */
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-sm border border-input bg-background px-3 py-1 text-sm transition-colors duration-fast ease-app placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
