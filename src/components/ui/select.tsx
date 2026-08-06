import { type SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 原生 select + 自定义箭头（原型 .select）：桌面端保留键盘与表单语义，
 * 零额外依赖。圆角 radius-sm=6，info 焦点环。
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative inline-flex">
    <select
      ref={ref}
      className={cn(
        "appearance-none rounded-sm border border-input bg-background py-1 pl-3 pr-8 text-sm text-foreground transition-colors duration-fast ease-app focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = "Select";
