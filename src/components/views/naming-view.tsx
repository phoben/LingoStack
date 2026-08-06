import { useState } from "react";
import { Copy } from "lucide-react";
import { ViewShell } from "@/components/view-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 命名规范候选（§3 场景 3）。 */
type Conv = "camel" | "snake" | "pascal" | "kebab" | "const";

const CONVS: { id: Conv; label: string }[] = [
  { id: "camel", label: "camelCase" },
  { id: "snake", label: "snake_case" },
  { id: "pascal", label: "PascalCase" },
  { id: "kebab", label: "kebab-case" },
  { id: "const", label: "CONSTANT_CASE" },
];

/** 各规范下的候选占位（V1 接 LLM 后按描述实时生成）。 */
const NAMES: Record<Conv, { name: string; hint: string }[]> = {
  camel: [
    { name: "getUserProfile", hint: "方法名" },
    { name: "fetchUserProfile", hint: "方法名" },
    { name: "loadUserProfile", hint: "方法名" },
    { name: "retrieveUserProfile", hint: "方法名" },
    { name: "getUserProfileAsync", hint: "异步方法" },
  ],
  snake: [
    { name: "get_user_profile", hint: "函数 / 变量" },
    { name: "fetch_user_profile", hint: "函数 / 变量" },
    { name: "load_user_profile", hint: "函数 / 变量" },
  ],
  pascal: [
    { name: "GetUserProfile", hint: "类型 / 类" },
    { name: "FetchUserProfile", hint: "类型 / 类" },
    { name: "UserProfileDto", hint: "DTO" },
  ],
  kebab: [
    { name: "get-user-profile", hint: "CSS / 路由" },
    { name: "fetch-user-profile", hint: "CSS / 路由" },
    { name: "user-profile", hint: "文件 / 目录" },
  ],
  const: [
    { name: "GET_USER_PROFILE", hint: "常量" },
    { name: "FETCH_USER_PROFILE", hint: "常量" },
    { name: "USER_PROFILE", hint: "常量" },
  ],
};

/**
 * 命名视图（§3 场景 3，对齐原型命名 panel）：
 * 中文描述 + 规范切换（即时刷新候选）+ 候选列表。
 * 真实生成与一键复制留待 V1。
 */
export function NamingView() {
  const [desc, setDesc] = useState("获取用户资料");
  const [conv, setConv] = useState<Conv>("camel");

  return (
    <ViewShell view="naming">
      <div className="mx-auto flex h-full max-w-2xl flex-col">
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium tracking-wide text-muted-foreground"
              htmlFor="nm-desc"
            >
              中文描述
            </label>
            <Input
              id="nm-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-label="变量用途描述"
              className="max-w-[420px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CONVS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConv(c.id)}
                aria-pressed={conv === c.id}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 font-mono text-xs transition-colors duration-fast ease-app",
                  conv === c.id
                    ? "border-transparent bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          {NAMES[conv].map(({ name, hint }) => (
            <div
              key={name}
              className="flex items-center rounded-lg border border-border bg-background px-4 py-3 transition-colors duration-fast hover:border-foreground/15"
            >
              <span className="font-mono text-[15px] font-medium text-foreground">
                {name}
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">{hint}</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                title="V1 实装"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </Button>
            </div>
          ))}
        </div>
      </div>
    </ViewShell>
  );
}
