import { beforeEach, describe, expect, it, vi } from "vitest";

// 必须在 import store 之前 mock：vitest 会把 vi.mock 提升到文件顶部。
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((m: unknown) => void) | null = null;
  },
}));

import { invoke } from "@tauri-apps/api/core";

import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "./config-store";

describe("config-store", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    useConfigStore.setState({ config: null, loading: false, error: null });
  });

  it("load 从后端拉取配置", async () => {
    const loaded = { ...defaultConfig(), ui_language: "en" as const };
    vi.mocked(invoke).mockResolvedValue(loaded);
    await useConfigStore.getState().load();
    expect(useConfigStore.getState().config).toEqual(loaded);
    expect(useConfigStore.getState().loading).toBe(false);
    expect(invoke).toHaveBeenCalledWith("load_config");
  });

  it("load 失败时记录 error 且不写入 config", async () => {
    vi.mocked(invoke).mockRejectedValue("disk full");
    await useConfigStore.getState().load();
    expect(useConfigStore.getState().config).toBeNull();
    expect(useConfigStore.getState().error).toBe("disk full");
  });

  it("update 乐观改动并存盘", async () => {
    useConfigStore.setState({ config: defaultConfig() });
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useConfigStore.getState().update((cfg) => ({
      ...cfg,
      ui_language: "ja" as const,
    }));
    expect(useConfigStore.getState().config?.ui_language).toBe("ja");
    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "save_config",
      expect.objectContaining({
        cfg: expect.objectContaining({ ui_language: "ja" }),
      }),
    );
  });

  it("update 不 mutate 原引用（深拷贝）", async () => {
    const original = defaultConfig();
    useConfigStore.setState({ config: original });
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useConfigStore.getState().update((cfg) => {
      cfg.providers.push({
        id: "x",
        kind: "open_ai_compatible",
        name: "X",
        base_url: "https://x",
        api_key: "k",
        models: [],
      });
      return cfg;
    });
    // 原 defaultConfig 的 providers 仍为空（未被污染）。
    expect(original.providers).toHaveLength(0);
    expect(useConfigStore.getState().config?.providers).toHaveLength(1);
  });

  it("config 未加载时 update 记录错误且不调用 save", async () => {
    await useConfigStore.getState().update((cfg) => cfg);
    expect(useConfigStore.getState().error).toBeTruthy();
    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  });
});
