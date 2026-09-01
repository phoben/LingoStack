import { beforeEach, describe, expect, it, vi } from "vitest";

const channels = vi.hoisted((): Array<{ onmessage: ((message: unknown) => void) | null }> => []);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((message: unknown) => void) | null = null;

    constructor() {
      channels.push(this);
    }
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { useTtsStore } from "./tts-store";

describe("tts-store", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    channels.length = 0;
    useTtsStore.setState({ status: "idle", text: null, error: null });
  });

  it("records speaking only after the engine accepts the request", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTtsStore.getState().speakText("hello");
    expect(invoke).toHaveBeenCalledWith("speak", {
      text: "hello",
      onEvent: channels[0],
    });
    channels[0]?.onmessage?.({ type: "started" });
    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "hello",
      error: null,
    });
  });

  it("returns to idle when the engine reports natural completion", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await useTtsStore.getState().speakText("hello");

    expect(invoke).toHaveBeenCalledWith("speak", {
      text: "hello",
      onEvent: channels[0],
    });
    channels[0]?.onmessage?.({ type: "started" });
    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "hello",
    });

    channels[0]?.onmessage?.({ type: "done" });
    expect(useTtsStore.getState()).toMatchObject({
      status: "idle",
      text: null,
    });
  });

  it("exposes a playback-monitoring failure to the accessible UI", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTtsStore.getState().speakText("hello");

    channels[0]?.onmessage?.({
      type: "error",
      message: "朗读状态读取失败",
    });

    expect(useTtsStore.getState()).toMatchObject({
      status: "error",
      text: null,
      error: "朗读状态读取失败",
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

  it("ignores a completion event that arrives after an explicit stop", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await useTtsStore.getState().speakText("hello");
    channels[0]?.onmessage?.({ type: "started" });

    await useTtsStore.getState().stop();
    channels[0]?.onmessage?.({ type: "done" });

    expect(useTtsStore.getState()).toMatchObject({
      status: "idle",
      text: null,
    });
  });

  it("ignores a completion event from a superseded speech request", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await useTtsStore.getState().speakText("first");
    channels[0]?.onmessage?.({ type: "started" });
    await useTtsStore.getState().speakText("second");
    channels[1]?.onmessage?.({ type: "started" });

    channels[0]?.onmessage?.({ type: "done" });

    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "second",
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
    channels[1]?.onmessage?.({ type: "started" });
    acceptFirst?.();
    await first;

    expect(useTtsStore.getState()).toMatchObject({
      status: "speaking",
      text: "second",
    });
  });
});
