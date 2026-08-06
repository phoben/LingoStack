import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        // Inter 本地打包留待 V1；JetBrains Mono 降级到系统等宽（零遥测不引网络字体）
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // shadcn/ui 语义色（HSL 变量，定义在 src/index.css）
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
        // 原型扩展语义色
        surface: {
          DEFAULT: "hsl(var(--surface))",
          2: "hsl(var(--surface-2))",
        },
        // info：原型主交互色（焦点 / 链接 / 流式 / 保留词）
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--background))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--background))",
        },
      },
      borderRadius: {
        // 原型 radius：sm=6 md=10 lg=12（--radius=12px）xl=14
        sm: "calc(var(--radius) - 6px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 2px)",
      },
      // 原型「无投影或极轻投影」：深色以 elev-ring 替代模糊投影
      boxShadow: {
        ring: "var(--elev-ring)",
        focus: "var(--focus-ring)",
        sm: "0 1px 3px 0 hsl(var(--foreground) / 0.07)",
        md: "0 4px 12px -2px hsl(var(--foreground) / 0.08)",
      },
      transitionTimingFunction: {
        // 原型 --ease-standard：快速进出无弹跳
        app: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        // 原型 --motion-fast / --motion-base
        fast: "150ms",
        base: "220ms",
      },
      keyframes: {
        "panel-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        pulse: {
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        "panel-in": "panel-in 0.25s cubic-bezier(0.2, 0, 0, 1)",
        pulse: "pulse 1s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
