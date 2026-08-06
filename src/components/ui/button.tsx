import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 按钮组件，对齐原型 .act / .act.primary / .icon-btn。
 * - default：主按钮，深色态由 token 反转为白底深字（原型 .act.primary）
 * - outline：次级按钮（原型 .act），border + 悬停高亮
 * - ghost：图标按钮底（原型 .icon-btn）
 * 圆角 radius-sm=6，info 焦点环。V1 引入 shadcn 完整组件时可平滑替换。
 */
type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  outline:
    "border border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-sm px-3 text-xs",
  md: "h-9 gap-1.5 rounded-sm px-3.5 text-sm",
  lg: "h-10 gap-2 rounded-sm px-5 text-sm",
  icon: "h-8 w-8 rounded-md",
};

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", type, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-fast ease-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40 disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
