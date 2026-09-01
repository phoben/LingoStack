import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";
export type UpdateCheckSource = "automatic" | "manual";
export type UpdateError = "check" | "download" | "install";

/** Only signed NSIS release builds opt in; dev, E2E and portable builds do not advertise updates. */
export const UPDATER_ENABLED =
  import.meta.env.VITE_LINGOSTACK_UPDATER_ENABLED === "true" ||
  import.meta.env.MODE === "test";

export interface AvailableUpdate {
  version: string;
  date: string | null;
  notes: string;
}

interface UpdateState {
  status: UpdateStatus;
  available: AvailableUpdate | null;
  /** The official handle is deliberately transient and is never persisted. */
  update: Update | null;
  downloadedBytes: number;
  contentLength: number | null;
  error: UpdateError | null;
  /** Only manual checks surface an explicit "up to date" result. */
  lastManualCheck: "upToDate" | null;
  check: (source: UpdateCheckSource) => Promise<void>;
  install: () => Promise<void>;
  resetForTest: () => void;
}

const initialState = () => ({
  status: "idle" as UpdateStatus,
  available: null,
  update: null,
  downloadedBytes: 0,
  contentLength: null,
  error: null,
  lastManualCheck: null,
});

let inFlight: Promise<void> | null = null;

/**
 * The sole updater task coordinator. The Tauri plugin owns version comparison,
 * download, signature verification, NSIS installation and Windows restart;
 * this store only exposes a renderer-safe, non-persistent UI state machine.
 */
export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...initialState(),

  check: async (source) => {
    if (!UPDATER_ENABLED) return;
    if (inFlight) return inFlight;
    if (get().status === "available") return;

    const task = (async () => {
      set({
        status: "checking",
        error: null,
        lastManualCheck: null,
        downloadedBytes: 0,
        contentLength: null,
      });
      try {
        const update = await check();
        if (!update) {
          set({
            status: "idle",
            lastManualCheck: source === "manual" ? "upToDate" : null,
          });
          return;
        }
        set({
          status: "available",
          update,
          available: {
            version: update.version,
            date: update.date ?? null,
            notes: update.body ?? "",
          },
        });
      } catch {
        // Do not retain provider/network response text: it can contain URLs or
        // proxy diagnostics. Automatic failures intentionally remain silent.
        set(
          source === "manual"
            ? { status: "error", error: "check" }
            : initialState(),
        );
      }
    })();
    inFlight = task;
    try {
      await task;
    } finally {
      if (inFlight === task) inFlight = null;
    }
  },

  install: async () => {
    if (!UPDATER_ENABLED) return;
    if (inFlight) return inFlight;
    const update = get().update;
    // A failed download or install keeps the verified Update handle so either
    // visible "Update now" entry can retry without another discovery request.
    // A check failure never has a handle, so this cannot install an unchecked
    // update.
    if (!update || (get().status !== "available" && get().status !== "error"))
      return;

    const task = (async () => {
      set({
        status: "downloading",
        error: null,
        downloadedBytes: 0,
        contentLength: null,
      });
      try {
        await update.download((event) => {
          if (event.event === "Started") {
            set({
              contentLength: event.data.contentLength ?? null,
              downloadedBytes: 0,
            });
          } else if (event.event === "Progress") {
            set((state) => ({
              downloadedBytes: state.downloadedBytes + event.data.chunkLength,
            }));
          }
        });
      } catch {
        set({ status: "error", error: "download" });
        return;
      }

      set({ status: "installing" });
      try {
        // Windows passive mode starts NSIS, which exits this process and relaunches
        // the updated application. Do not add a process-plugin relaunch here.
        await update.install();
        set({ status: "restarting" });
      } catch {
        set({ status: "error", error: "install" });
      }
    })();
    inFlight = task;
    try {
      await task;
    } finally {
      if (inFlight === task) inFlight = null;
    }
  },

  resetForTest: () => {
    inFlight = null;
    set(initialState());
  },
}));

export function updateProgress(
  downloadedBytes: number,
  contentLength: number | null,
): number | null {
  if (!contentLength || contentLength <= 0) return null;
  return Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
}
