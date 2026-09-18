import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ipc", () => ({
  recognizeImage: vi.fn(),
  cancelOcr: vi.fn(),
}));

import { cancelOcr, recognizeImage } from "@/lib/ipc";
import { resetOcrStore, useOcrStore } from "./ocr-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const png = {
  mediaType: "image/png",
  content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

describe("ocr-store", () => {
  beforeEach(() => {
    vi.mocked(recognizeImage).mockReset();
    vi.mocked(cancelOcr).mockReset().mockResolvedValue(undefined);
    resetOcrStore();
  });

  it("发布最新识别文本，但不把图片字节写入状态", async () => {
    vi.mocked(recognizeImage).mockResolvedValue("  本地文字  ");
    const text = await useOcrStore.getState().start(png, "zh");

    expect(text).toBe("本地文字");
    expect(recognizeImage).toHaveBeenCalledWith(
      expect.stringMatching(/^ocr-/),
      "image/png",
      "zh",
      png.content,
    );
    expect(useOcrStore.getState()).toMatchObject({
      status: "idle",
      error: null,
      requestId: null,
    });
    expect(useOcrStore.getState()).not.toHaveProperty("content");
  });

  it("取消后丢弃迟到结果并精确通知后端", async () => {
    const pending = deferred<string>();
    vi.mocked(recognizeImage).mockReturnValue(pending.promise);
    const running = useOcrStore.getState().start(png);
    await vi.waitFor(() =>
      expect(useOcrStore.getState().status).toBe("recognizing"),
    );
    const requestId = useOcrStore.getState().requestId;

    await useOcrStore.getState().cancel();
    pending.resolve("迟到文字");

    expect(await running).toBeNull();
    expect(cancelOcr).toHaveBeenCalledWith(requestId);
    expect(useOcrStore.getState()).toMatchObject({
      status: "idle",
      error: null,
    });
  });

  it("取消失败时保留运行态并阻止替换识别", async () => {
    const pending = deferred<string>();
    vi.mocked(recognizeImage).mockReturnValue(pending.promise);
    const running = useOcrStore.getState().start(png);
    await vi.waitFor(() =>
      expect(useOcrStore.getState().status).toBe("recognizing"),
    );
    const { requestId, seq } = useOcrStore.getState();
    vi.mocked(cancelOcr).mockRejectedValue(new Error("取消服务不可用"));

    await expect(useOcrStore.getState().cancel()).rejects.toThrow(
      "取消服务不可用",
    );
    expect(useOcrStore.getState()).toMatchObject({
      status: "recognizing",
      error: null,
      requestId,
      seq,
    });

    await expect(useOcrStore.getState().start(png, "en")).rejects.toThrow(
      "取消服务不可用",
    );
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    expect(useOcrStore.getState()).toMatchObject({ requestId, seq });

    pending.resolve("原任务文字");
    expect(await running).toBe("原任务文字");
  });

  it("连续替换时只接受最后一张图片", async () => {
    const first = deferred<string>();
    vi.mocked(recognizeImage)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce("新图片文字");
    const firstRun = useOcrStore.getState().start(png);
    await vi.waitFor(() =>
      expect(useOcrStore.getState().status).toBe("recognizing"),
    );

    const secondText = await useOcrStore.getState().start(png, "en");
    first.resolve("旧图片文字");

    expect(secondText).toBe("新图片文字");
    expect(await firstRun).toBeNull();
    expect(recognizeImage).toHaveBeenCalledTimes(2);
  });

  it("在 IPC 前拒绝不支持格式和超限内容", async () => {
    expect(
      await useOcrStore
        .getState()
        .start({ mediaType: "image/gif", content: png.content }),
    ).toBeNull();
    expect(useOcrStore.getState().status).toBe("error");
    expect(recognizeImage).not.toHaveBeenCalled();
  });
});
