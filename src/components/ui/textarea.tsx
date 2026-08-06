import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 多行输入，对齐原型 .textarea：垂直可缩放 + info 焦点环。
 * 圆角 radius-sm=6，无投影。V1 引入 shadcn 完整组件时可平滑替换。
 */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-sm leading-relaxed transition-colors duration-fast ease-app placeholder:text-muted-foreground/60 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
