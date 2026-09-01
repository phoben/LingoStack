import { beforeEach, describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));

import { updateProgress, useUpdateStore } from "./update-store";

function updateFixture() {
  return {
    version: "0.0.3",
    date: "2026-08-31T00:00:00Z",
    body: "Safer updates.",
    download: vi.fn(),
    install: vi.fn(),
  };
}

describe("update store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.getState().resetForTest();
  });

  it("keeps automatic check failures silent", async () => {
    check.mockRejectedValueOnce(new Error("private proxy diagnostic"));
    await useUpdateStore.getState().check("automatic");
    expect(useUpdateStore.getState()).toMatchObject({
      status: "idle",
      error: null,
    });
  });

  it("reports an explicit manual check failure without retaining raw error text", async () => {
    check.mockRejectedValueOnce(new Error("secret response"));
    await useUpdateStore.getState().check("manual");
    expect(useUpdateStore.getState()).toMatchObject({
      status: "error",
      error: "check",
    });
  });

  it("reports when a manual check finds no update", async () => {
    check.mockResolvedValueOnce(null);
    await useUpdateStore.getState().check("manual");
    expect(useUpdateStore.getState()).toMatchObject({
      status: "idle",
      lastManualCheck: "upToDate",
    });
  });

  it("coordinates duplicate checks and never downloads while checking", async () => {
    let resolve: (value: ReturnType<typeof updateFixture>) => void;
    check.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = useUpdateStore.getState().check("automatic");
    const second = useUpdateStore.getState().check("manual");
    expect(check).toHaveBeenCalledOnce();
    resolve!(updateFixture());
    await Promise.all([first, second]);
    expect(useUpdateStore.getState().status).toBe("available");
  });

  it("downloads only after an explicit install action and exposes progress", async () => {
    const update = updateFixture();
    update.download.mockImplementation(async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 10 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 4 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 6 } });
    });
    check.mockResolvedValueOnce(update);
    await useUpdateStore.getState().check("manual");
    expect(update.download).not.toHaveBeenCalled();
    await useUpdateStore.getState().install();
    expect(update.download).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "restarting",
      downloadedBytes: 10,
    });
  });

  it("returns a retryable error after a download failure", async () => {
    const update = updateFixture();
    update.download.mockRejectedValueOnce(new Error("network broken"));
    check.mockResolvedValueOnce(update);
    await useUpdateStore.getState().check("manual");
    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "error",
      error: "download",
    });
  });

  it("retries the same verified update after a download failure", async () => {
    const update = updateFixture();
    update.download.mockRejectedValueOnce(new Error("network broken"));
    update.download.mockResolvedValueOnce(undefined);
    check.mockResolvedValueOnce(update);

    await useUpdateStore.getState().check("manual");
    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState()).toMatchObject({
      status: "error",
      error: "download",
    });

    await useUpdateStore.getState().install();
    expect(update.download).toHaveBeenCalledTimes(2);
    expect(update.install).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().status).toBe("restarting");
  });

  it("normalizes determinate progress", () => {
    expect(updateProgress(8, 10)).toBe(80);
    expect(updateProgress(1, null)).toBeNull();
    expect(updateProgress(11, 10)).toBe(100);
  });
});
