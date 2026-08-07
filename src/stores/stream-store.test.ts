import { beforeEach, describe, expect, it, vi } from "vitest";

// 必须在 import store 之前 mock：vitest 会把 vi.mock 提升到文件顶部。
vi.mock("@/lib/ipc", () => ({
  chatStream: vi.fn(),
}));

import type { ChatEvent, ChatMessage } from "@/lib/config-types";
import { chatStream } from "@/lib/ipc";
import { resetStreamStore, useStreamStore } from "./stream-store";

type Emit = (event: ChatEvent) => void;

const messages = async (): Promise<ChatMessage[]> => [
  { role: "user", content: "x" },
];

/** 让 chatStream 立即推一串事件后 resolve。 */
function emitsThenResolve(events: ChatEvent[]) {
  vi.mocked(chatStream).mockImplementation(async (_f, _m, onEvent) => {
    for (const e of events) onEvent(e);
  });
}

/**
 * 让 chatStream 挂住，把推送权交给测试（模拟仍在流式中）。
 *
 * `ready` 在 chatStream 真正被调用后 resolve——start 会先 await 取 Prompt，
 * 不等这一步就推事件会打在空回调上。
 */
function captureEmit(): {
  ready: Promise<void>;
  emit: Emit;
  settle: () => void;
} {
  let emit: Emit = () => {};
  let settle: () => void = () => {};
  let signalReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  vi.mocked(chatStream).mockImplementation((_f, _m, onEvent) => {
    emit = onEvent;
    signalReady();
    return new Promise<void>((resolve) => {
      settle = resolve;
    });
  });
  return {
    ready,
    emit: (e) => emit(e),
    settle: () => settle(),
  };
}

const task = (feature: "translate" | "naming" = "translate") =>
  useStreamStore.getState().tasks[feature];

describe("stream-store", () => {
  beforeEach(() => {
    vi.mocked(chatStream).mockReset();
    resetStreamStore();
  });

  it("增量累积到 output，done 置完成", async () => {
    emitsThenResolve([
      { type: "chunk", delta: "并发" },
      { type: "chunk", delta: "是" },
      { type: "done" },
    ]);
    await useStreamStore.getState().start("translate", "hi", messages);
    expect(task().output).toBe("并发是");
    expect(task().status).toBe("done");
    expect(task().input).toBe("hi");
  });

  it("error 事件置错误且保留已累积内容", async () => {
    emitsThenResolve([
      { type: "chunk", delta: "半句" },
      { type: "error", message: "连接中断" },
    ]);
    await useStreamStore.getState().start("translate", "hi", messages);
    expect(task().status).toBe("error");
    expect(task().error).toBe("连接中断");
    expect(task().output).toBe("半句");
  });

  it("发起失败（取 Prompt 抛错）记为错误", async () => {
    vi.mocked(chatStream).mockResolvedValue(undefined);
    await useStreamStore.getState().start("translate", "hi", () => {
      throw new Error("模型未配置");
    });
    expect(task().status).toBe("error");
    expect(task().error).toBe("模型未配置");
  });

  it("IPC 的字符串 reject 也归一化为可读文本", async () => {
    vi.mocked(chatStream).mockRejectedValue("provider 未配置");
    await useStreamStore.getState().start("translate", "hi", messages);
    expect(task().error).toBe("provider 未配置");
  });

  it("旧任务的迟到增量被丢弃（seq 守卫）", async () => {
    // 第一条流：拿到回调引用后放行，回调引用仍握在测试手里。
    const first = captureEmit();
    const firstRun = useStreamStore.getState().start("translate", "a", messages);
    await first.ready;
    first.emit({ type: "chunk", delta: "旧" });
    expect(task().output).toBe("旧");
    first.settle();
    await firstRun;

    // 第二条流顶掉第一条的序号。
    const second = captureEmit();
    const secondRun = useStreamStore
      .getState()
      .start("translate", "b", messages);
    await second.ready;
    second.emit({ type: "chunk", delta: "新" });

    // 旧回调迟到推送：序号已被顶掉，不得写入，也不得改状态。
    first.emit({ type: "chunk", delta: "污染" });
    first.emit({ type: "error", message: "旧流报错" });

    expect(task().output).toBe("新");
    expect(task().status).toBe("streaming");
    expect(task().error).toBeNull();

    second.settle();
    await secondRun;
  });

  it("进行中再次 start 被忽略", async () => {
    const live = captureEmit();
    const running = useStreamStore.getState().start("translate", "a", messages);
    await live.ready;
    live.emit({ type: "chunk", delta: "跑着" });

    await useStreamStore.getState().start("translate", "b", messages);
    expect(task().input).toBe("a");
    expect(task().output).toBe("跑着");
    expect(chatStream).toHaveBeenCalledTimes(1);

    live.settle();
    await running;
  });

  it("空输入不发起任务", async () => {
    await useStreamStore.getState().start("translate", "   ", messages);
    expect(chatStream).not.toHaveBeenCalled();
    expect(task().status).toBe("idle");
  });

  it("流结束却没收到完成信号时兜底收尾，按钮不会卡死", async () => {
    // 后端异常退出、没发 done/error 的情形。若状态停在 streaming，
    // 后续 start 会被「进行中」挡掉，用户只能重启应用。
    emitsThenResolve([{ type: "chunk", delta: "半句" }]);
    await useStreamStore.getState().start("translate", "a", messages);
    expect(task().status).toBe("done");
    expect(task().output).toBe("半句");

    // 兜底后仍可发起下一次。
    emitsThenResolve([{ type: "chunk", delta: "新的" }, { type: "done" }]);
    await useStreamStore.getState().start("translate", "b", messages);
    expect(task().output).toBe("新的");
  });

  it("已 error 的任务不被兜底改写成完成", async () => {
    emitsThenResolve([{ type: "error", message: "连接中断" }]);
    await useStreamStore.getState().start("translate", "a", messages);
    expect(task().status).toBe("error");
    expect(task().error).toBe("连接中断");
  });

  it("两个功能同时流式互不干扰", async () => {
    const translate = captureEmit();
    const tRun = useStreamStore.getState().start("translate", "a", messages);
    await translate.ready;
    translate.emit({ type: "chunk", delta: "译文" });

    const naming = captureEmit();
    const nRun = useStreamStore.getState().start("naming", "b", messages);
    await naming.ready;
    naming.emit({ type: "chunk", delta: "get user" });

    // translate 的回调引用仍然有效——两条通道各有独立记录。
    translate.emit({ type: "chunk", delta: "续写" });

    expect(task("translate").output).toBe("译文续写");
    expect(task("naming").output).toBe("get user");
    expect(task("translate").status).toBe("streaming");
    expect(task("naming").status).toBe("streaming");

    translate.settle();
    naming.settle();
    await Promise.all([tRun, nRun]);
  });

  it("setInput 只改输入，不动进行中的输出", async () => {
    const live = captureEmit();
    const running = useStreamStore.getState().start("translate", "a", messages);
    await live.ready;
    live.emit({ type: "chunk", delta: "已出" });

    useStreamStore.getState().setInput("translate", "用户又打字了");
    expect(task().input).toBe("用户又打字了");
    expect(task().output).toBe("已出");
    expect(task().status).toBe("streaming");

    live.settle();
    await running;
  });

  it("reset 清空任务态且递增序号，阻止旧回调复活", async () => {
    const live = captureEmit();
    const running = useStreamStore.getState().start("translate", "a", messages);
    await live.ready;
    live.emit({ type: "chunk", delta: "旧内容" });

    useStreamStore.getState().reset("translate");
    expect(task().output).toBe("");
    expect(task().status).toBe("idle");
    expect(task().input).toBe("");

    live.emit({ type: "chunk", delta: "复活" });
    expect(task().output).toBe("");

    live.settle();
    await running;
  });

  it("任务态跨视图存活：store 记录与组件生命周期无关", async () => {
    // 模拟「发起后视图卸载、期间流继续、切回时读到完整内容」。
    const live = captureEmit();
    const running = useStreamStore
      .getState()
      .start("translate", "原文", messages);
    await live.ready;
    live.emit({ type: "chunk", delta: "第一段" });
    // 视图卸载期间继续推送。
    live.emit({ type: "chunk", delta: "第二段" });
    live.emit({ type: "done" });
    live.settle();
    await running;

    // 切回时从 store 读，内容与状态完整。
    expect(task().output).toBe("第一段第二段");
    expect(task().status).toBe("done");
    expect(task().input).toBe("原文");
  });
});
