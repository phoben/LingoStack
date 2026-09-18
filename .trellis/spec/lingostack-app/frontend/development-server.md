# 前端开发服务器契约

## Scenario：Vite 不监听 Rust 构建产物

### 1. Scope / Trigger

修改 `vite.config.ts`、Tauri `beforeDevCommand`、Rust `target-dir` 或本地调试启动方式时适用。仓库根同时是 Vite root 与 Cargo workspace root；Windows 正在运行或扫描的 `.exe` 可能被独占，前端 watcher 不得触碰这些构建产物。

### 2. Signatures

```ts
server: {
  port: 1420,
  strictPort: true,
  watch: {
    ignored: ["**/src-tauri/**", "**/target/**"],
  },
}
```

Tauri `build.devUrl` 固定为 `http://localhost:1420`，必须与 Vite 端口保持一致。

### 3. Contracts

- Vite watcher 必须忽略 `src-tauri/**`，Rust 源码由 Tauri/Cargo watcher 负责。
- Vite watcher 必须忽略所有层级的 `target/**`；这些目录只含 Cargo 构建产物，不参与前端 HMR。
- 不得用 `usePolling` 回避被锁定的 `.exe`。轮询会增加 CPU 开销，而且仍错误地把 Rust 产物纳入前端观察范围。
- Vite 官方说明开发服务器会监听整个 root，额外目录应通过 `server.watch.ignored` 排除；参见 [Vite server.watch](https://vite.dev/config/server-options#server-watch)。

### 4. Validation & Error Matrix

| 条件                                | 必须结果                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `target/debug/*.exe` 被另一进程独占 | `pnpm dev` 仍启动并监听 1420，不出现 `EBUSY`              |
| `target/**` 从 ignored 中移除       | 配置回归测试失败                                          |
| 1420 已被其他开发服务器占用         | 以 `Port 1420 is already in use` 明确失败，不得换随机端口 |
| 修改 `src/**`                       | Vite 继续触发正常 HMR                                     |

### 5. Good / Base / Bad Cases

- **Good**：Tauri 应用正在运行或安全软件短暂锁定 exe 时，Vite 不扫描 `target/`，前端源码保存仍正常热更新。
- **Base**：没有文件锁时，`pnpm tauri dev` 正常启动，配置测试持续锁定 ignored 列表。
- **Bad**：通过结束所有 LingoStack 进程临时恢复启动，却不排除 `target/`；下次编译、E2E 或安全扫描仍会复现。

### 6. Tests Required

- `vite.config.test.ts` 直接读取真实配置，断言 ignored 同时包含 `**/src-tauri/**` 与 `**/target/**`。
- Windows 回归时用 `FileShare.None` 独占一个 `target/debug/**/*.exe`，再运行 `pnpm dev`；以 1420 成功监听且无 `EBUSY` 为通过。
- 最终运行 `pnpm verify` 与一次 `pnpm tauri dev`，确认配置测试、生产构建和完整调试启动均正常。

### 7. Wrong vs Correct

```ts
// Wrong：Vite 会递归扫描 Cargo 产物，Windows 锁定 exe 时启动失败。
watch: {
  ignored: ["**/src-tauri/**"];
}

// Correct：前端 watcher 与 Rust 构建目录彻底隔离。
watch: {
  ignored: ["**/src-tauri/**", "**/target/**"];
}
```
