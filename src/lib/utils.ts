import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui 标准工具：合并 Tailwind class 并解决冲突。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 把 catch 到的任意值归一化为可展示的错误文本。
 *
 * Tauri IPC 的 reject 值是字符串（Rust 侧 `Result<_, String>`），前端自身抛的是
 * `Error`，故两者都要处理。此前 config-store / favorites-store / 两个视图各写了
 * 一份实现且不完全一致，此处收敛为单一来源。
 */
export function stringifyError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
