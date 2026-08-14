import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((message: unknown) => void) | null = null;
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { useTtsStore } from "./tts-store";

describe("tts-store", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    useTtsStore.setState({ status: "idle", text: null, error: null });
  });

  it("records speaking only after the engine accepts the request", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTtsStore.getState().speakText("hello");
    expect(invoke).toHaveBeenCalledWith("speak", { text: "hello" });
    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "hello",
      error: null,
    });
  });

  it("stops the current speaking state", async () => {
    useTtsStore.setState({ status: "speaking", text: "hello" });
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTtsStore.getState().stop();
    expect(invoke).toHaveBeenCalledWith("stop_speaking");
    expect(useTtsStore.getState()).toMatchObject({
      status: "idle",
      text: null,
    });
  });

  it("exposes typed backend failures to the accessible UI", async () => {
    vi.mocked(invoke).mockRejectedValue("当前平台暂不支持朗读");
    await useTtsStore.getState().speakText("hello");
    expect(useTtsStore.getState()).toMatchObject({
      status: "error",
      error: "当前平台暂不支持朗读",
    });
  });

  it("keeps the newest speech intent when requests settle out of order", async () => {
    let acceptFirst: (() => void) | undefined;
    let acceptSecond: (() => void) | undefined;
    vi.mocked(invoke)
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { acceptFirst = resolve; }),
      )
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => { acceptSecond = resolve; }),
      );

    const first = useTtsStore.getState().speakText("first");
    const second = useTtsStore.getState().speakText("second");
    acceptSecond?.();
    await second;
    acceptFirst?.();
    await first;

    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "second",
    });
  });
});
