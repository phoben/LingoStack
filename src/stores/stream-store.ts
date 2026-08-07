import { create } from "zustand";

import type { ChatMessage, Feature } from "@/lib/config-types";
import { chatStream } from "@/lib/ipc";
import { stringifyError } from "@/lib/utils";

/**
 * 流式任务状态（跨视图存活）。
 *
 * 六个视图是条件渲染的（App.tsx），切页面即卸载视图。任务态若留在组件的
 * useState 里，切走就随组件一起销毁——而后端 chat_stream 是独立 async task，
 * 仍在往 Channel 推增量，接收方却已不存在，结果凭空丢失。
 *
 * 故把「输入 / 输出 / 状态 / 错误」上移到本 store：视图退化为纯展示层，
 * 可自由卸载重挂，任务不受影响。
 */

export type StreamStatus = "idle" | "streaming" | "done" | "error";

export interface StreamTask {
  status: StreamStatus;
  /** LLM 原始输出的累积文本（各功能自行解析）。 */
  output: string;
  error: string | null;
  /** 本次任务的输入（原文 / 描述）。也在此存放，否则切回页面后输入框空白却有输出。 */
  input: string;
  /**
   * 任务序号。回调先比对序号，不等则丢弃——避免用户连点两次生成时，
   * 上一条流的迟到增量污染新结果。Tauri Channel 无 abort 语义，这是最小可行守卫。
   */
  seq: number;
}

/** 本 store 覆盖的功能通道。explain / doc_translate 接入时复用同一形状。 */
export type StreamFeature = Extract<Feature, "translate" | "naming">;

const STREAM_FEATURES: readonly StreamFeature[] = ["translate", "naming"];

/** 首次打开的示例输入（开发者语境，便于立刻体验）。 */
const SAMPLE_INPUT: Record<StreamFeature, string> = {
  translate:
    "The graceful shutdown handler waits for in-flight requests to complete before terminating the process, with a configurable timeout to force-exit if they hang.",
  naming: "获取用户资料",
};

function emptyTask(input = ""): StreamTask {
  return { status: "idle", output: "", error: null, input, seq: 0 };
}

function initialTasks(): Record<StreamFeature, StreamTask> {
  return {
    translate: emptyTask(SAMPLE_INPUT.translate),
    naming: emptyTask(SAMPLE_INPUT.naming),
  };
}

interface StreamState {
  tasks: Record<StreamFeature, StreamTask>;
  /** 更新某功能的输入（用户打字），不触碰进行中的输出。 */
  setInput: (feature: StreamFeature, input: string) => void;
  /**
   * 发起一次流式任务。`buildMessages` 由调用方提供（各功能的 Prompt 装配不同），
   * 抛错即视为任务失败。已在进行中时忽略本次调用。
   */
  start: (
    feature: StreamFeature,
    input: string,
    buildMessages: (input: string) => Promise<ChatMessage[]>,
  ) => Promise<void>;
  /** 清空某功能的任务态（回到初始）。序号保留递增，防止旧回调复活。 */
  reset: (feature: StreamFeature) => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  tasks: initialTasks(),

  setInput: (feature, input) => {
    set((s) => ({
      tasks: { ...s.tasks, [feature]: { ...s.tasks[feature], input } },
    }));
  },

  reset: (feature) => {
    set((s) => ({
      tasks: {
        ...s.tasks,
        [feature]: { ...emptyTask(), seq: s.tasks[feature].seq + 1 },
      },
    }));
  },

  start: async (feature, input, buildMessages) => {
    const current = get().tasks[feature];
    if (current.status === "streaming" || !input.trim()) return;

    const seq = current.seq + 1;
    set((s) => ({
      tasks: {
        ...s.tasks,
        [feature]: {
          status: "streaming",
          output: "",
          error: null,
          input,
          seq,
        },
      },
    }));

    /** 迟到回调守卫：序号已被新任务顶掉时不再写入。 */
    const patch = (fn: (task: StreamTask) => Partial<StreamTask>) => {
      set((s) => {
        const task = s.tasks[feature];
        if (task.seq !== seq) return s;
        return { tasks: { ...s.tasks, [feature]: { ...task, ...fn(task) } } };
      });
    };

    try {
      const messages = await buildMessages(input);
      await chatStream(feature, messages, (event) => {
        if (event.type === "chunk") {
          patch((task) => ({ output: task.output + event.delta }));
        } else if (event.type === "done") {
          patch(() => ({ status: "done" }));
        } else {
          patch(() => ({ status: "error", error: event.message }));
        }
      });
      // 兜底：调用已返回却没收到 done / error 时收尾。否则状态永久停在
      // streaming，后续 start 会被「进行中」判定挡掉，按钮形同失效。
      patch((task) =>
        task.status === "streaming" ? { status: "done" } : {},
      );
    } catch (e) {
      // 已累积的输出保留，用户可「重试」（设计文档 §9）。
      patch(() => ({ status: "error", error: stringifyError(e) }));
    }
  },
}));

/** 测试辅助：把所有通道清空（不带示例输入，便于断言）。 */
export function resetStreamStore(): void {
  useStreamStore.setState({
    tasks: { translate: emptyTask(), naming: emptyTask() },
  });
}

export { SAMPLE_INPUT, STREAM_FEATURES };
