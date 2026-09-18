// @vitest-environment node

import { describe, expect, it } from "vitest";
import viteConfig from "./vite.config";

describe("Vite 开发服务器监听", () => {
  it("忽略 Tauri 源码和 Rust 构建产物，避免锁定的可执行文件触发监听错误", () => {
    expect(viteConfig.server?.watch?.ignored).toEqual(
      expect.arrayContaining(["**/src-tauri/**", "**/target/**"]),
    );
  });
});
