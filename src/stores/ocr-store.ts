import { create } from "zustand";

import type { Language } from "@/lib/config-types";
import { cancelOcr, recognizeImage } from "@/lib/ipc";
import { stringifyError } from "@/lib/utils";

export const MAX_OCR_INPUT_BYTES = 10 * 1024 * 1024;
export const OCR_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export interface OcrImage {
  mediaType: string;
  content: Uint8Array;
}

export type OcrStatus = "idle" | "recognizing" | "error";

interface OcrState {
  status: OcrStatus;
  error: string | null;
  seq: number;
  requestId: string | null;
  start: (image: OcrImage, language?: Language) => Promise<string | null>;
  cancel: () => Promise<void>;
  reject: (message: string) => void;
}

function newRequestId(): string {
  return `ocr-${crypto.randomUUID()}`;
}

export const useOcrStore = create<OcrState>((set, get) => ({
  status: "idle",
  error: null,
  seq: 0,
  requestId: null,

  reject: (message) => {
    const requestId = get().requestId;
    set((state) => ({
      status: "error",
      error: message,
      requestId: null,
      seq: state.seq + 1,
    }));
    if (requestId) void cancelOcr(requestId).catch(() => undefined);
  },

  cancel: async () => {
    const requestId = get().requestId;
    if (requestId) {
      // 后端确认取消后再清理本地任务态；失败时保留 requestId，
      // 让调用方停止替换操作并向用户暴露真实失败。
      await cancelOcr(requestId);
    }
    set((state) => {
      if (requestId && state.requestId !== requestId) return state;
      return {
        status: "idle",
        error: null,
        requestId: null,
        seq: state.seq + 1,
      };
    });
  },

  start: async (image, language) => {
    await get().cancel();
    if (
      !OCR_MEDIA_TYPES.includes(
        image.mediaType as (typeof OCR_MEDIA_TYPES)[number],
      )
    ) {
      set((state) => ({
        status: "error",
        error: "仅支持 PNG、JPEG 和 WebP 图片",
        seq: state.seq + 1,
      }));
      return null;
    }
    if (
      image.content.byteLength === 0 ||
      image.content.byteLength > MAX_OCR_INPUT_BYTES
    ) {
      set((state) => ({
        status: "error",
        error:
          image.content.byteLength === 0
            ? "图片内容为空"
            : "图片超过 10 MiB 限制",
        seq: state.seq + 1,
      }));
      return null;
    }

    const seq = get().seq + 1;
    const requestId = newRequestId();
    set({ status: "recognizing", error: null, seq, requestId });
    try {
      const text = await recognizeImage(
        requestId,
        image.mediaType,
        language,
        image.content,
      );
      if (get().seq !== seq || get().requestId !== requestId) return null;
      const normalized = text.trim();
      if (!normalized) {
        set({ status: "error", error: "图片中未识别到文字", requestId: null });
        return null;
      }
      set({ status: "idle", error: null, requestId: null });
      return normalized;
    } catch (error) {
      if (get().seq !== seq || get().requestId !== requestId) return null;
      set({ status: "error", error: stringifyError(error), requestId: null });
      return null;
    }
  },
}));

/** 测试辅助：清空 OCR 任务态。 */
export function resetOcrStore(): void {
  useOcrStore.setState({
    status: "idle",
    error: null,
    seq: 0,
    requestId: null,
  });
}
