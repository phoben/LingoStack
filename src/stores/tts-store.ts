import { create } from "zustand";

import { speak, stopSpeaking } from "@/lib/ipc";
import { stringifyError } from "@/lib/utils";

export type TtsStatus = "idle" | "submitting" | "speaking" | "error";

// IPC 可能乱序完成；用代次保证较早的“引擎已受理”不会覆盖较新的朗读/停止意图。
let requestGeneration = 0;

interface TtsState {
  status: TtsStatus;
  text: string | null;
  error: string | null;
  speakText: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
}

/** TTS 的开始与自然完成均由请求级 IPC Channel 驱动。 */
export const useTtsStore = create<TtsState>((set) => ({
  status: "idle",
  text: null,
  error: null,
  speakText: async (text) => {
    if (!text.trim()) return;
    const generation = ++requestGeneration;
    set({ status: "submitting", text, error: null });
    try {
      await speak(text, (event) => {
        if (generation !== requestGeneration) return;
        if (event.type === "started") set({ status: "speaking", text });
        if (event.type === "done") set({ status: "idle", text: null });
        if (event.type === "error") {
          set({ status: "error", text: null, error: event.message });
        }
      });
    } catch (error) {
      if (generation === requestGeneration) {
        set({ status: "error", text: null, error: stringifyError(error) });
      }
    }
  },
  stop: async () => {
    const generation = ++requestGeneration;
    set({ status: "submitting", error: null });
    try {
      await stopSpeaking();
      if (generation === requestGeneration) set({ status: "idle", text: null });
    } catch (error) {
      if (generation === requestGeneration) {
        set({ status: "error", text: null, error: stringifyError(error) });
      }
    }
  },
  clearError: () => set({ status: "idle", text: null, error: null }),
}));
