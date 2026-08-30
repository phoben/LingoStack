import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SettingsView } from "./settings-view";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";

const { registerHotkeys, saveConfig } = vi.hoisted(() => ({
  registerHotkeys: vi.fn(),
  saveConfig: vi.fn(),
}));
const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ registerHotkeys, saveConfig }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock("sonner", () => ({ toast: sonner }));

describe("SettingsView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    registerHotkeys.mockReset();
    saveConfig.mockReset();
    registerHotkeys.mockResolvedValue([]);
    saveConfig.mockResolvedValue(undefined);
    useConfigStore.setState({
      config: { ...defaultConfig(), ui_language: "zh" },
      error: null,
    });
  });

  it("rejects same-language mappings in the visible form", async () => {
    render(<SettingsView />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "zh" } });
    fireEvent.change(selects[1], { target: { value: "zh" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("不能相同");
  });

  it("rejects duplicate mapping sources in the visible form", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        pair_mappings: [["en", "zh"]],
      },
    });
    render(<SettingsView />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "en" } });
    fireEvent.change(selects[1], { target: { value: "ja" } });
    await waitFor(() => expect(selects[1]).toHaveValue("ja"));
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("只能映射一次");
  });

  it("assigns, clears, and cleans up the document model", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        providers: [
          {
            id: "deepseek",
            kind: "open_ai_compatible",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            models: ["deepseek-chat"],
          },
        ],
        models: {
          global_default: { provider_id: "deepseek", model: "deepseek-chat" },
        },
      },
      error: null,
    });

    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const selector = await screen.findByLabelText("文档");
    expect(selector).toHaveValue("");
    for (const label of ["翻译", "命名", "文档"]) {
      expect(
        within(screen.getByLabelText(label)).getByRole("option", {
          name: "使用全局默认模型",
        }),
      ).toBeInTheDocument();
    }
    expect(
      within(screen.getByLabelText("全局默认")).getByRole("option", {
        name: "未指定",
      }),
    ).toBeInTheDocument();

    fireEvent.change(selector, {
      target: { value: "deepseek::deepseek-chat" },
    });
    await waitFor(() =>
      expect(useConfigStore.getState().config?.models.doc_translate).toEqual({
        provider_id: "deepseek",
        model: "deepseek-chat",
      }),
    );
    expect(saveConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          doc_translate: { provider_id: "deepseek", model: "deepseek-chat" },
        }),
      }),
    );

    fireEvent.change(selector, { target: { value: "" } });
    await waitFor(() =>
      expect(useConfigStore.getState().config?.models.doc_translate).toBeNull(),
    );

    fireEvent.change(selector, {
      target: { value: "deepseek::deepseek-chat" },
    });
    await waitFor(() =>
      expect(
        useConfigStore.getState().config?.models.doc_translate,
      ).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除 DeepSeek" }));
    await waitFor(() => {
      expect(useConfigStore.getState().config?.providers).toEqual([]);
      expect(useConfigStore.getState().config?.models.doc_translate).toBeNull();
    });
  });

  it("exposes one clear English document model selector", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "en",
        providers: [
          {
            id: "deepseek",
            kind: "open_ai_compatible",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            models: ["deepseek-chat"],
          },
        ],
      },
      error: null,
    });

    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    const selector = await screen.findByLabelText("Document");
    expect(screen.getAllByLabelText("Document")).toEqual([selector]);
    expect(
      within(selector).getByRole("option", {
        name: "Use global default model",
      }),
    ).toBeInTheDocument();
  });

  it("reports provider create, edit, and delete completion", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        providers: [
          {
            id: "deepseek",
            kind: "open_ai_compatible",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            models: ["deepseek-chat"],
          },
        ],
      },
      error: null,
    });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑 DeepSeek" }));
    fireEvent.change(screen.getByPlaceholderText("DeepSeek"), {
      target: { value: "DeepSeek 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(sonner.success).toHaveBeenCalledWith("提供商已更新"),
    );

    fireEvent.click(screen.getByRole("button", { name: "删除 DeepSeek 2" }));
    await waitFor(() =>
      expect(sonner.success).toHaveBeenCalledWith("提供商已删除"),
    );

    fireEvent.click(screen.getByRole("button", { name: "添加提供商" }));
    fireEvent.change(screen.getByPlaceholderText("DeepSeek"), {
      target: { value: "New Provider" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://api.deepseek.com"), {
      target: { value: "https://example.test" },
    });
    fireEvent.change(screen.getByPlaceholderText("sk-..."), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() =>
      expect(sonner.success).toHaveBeenCalledWith("提供商已添加"),
    );
  });

  it("keeps a provider form open and clears the persistent error after a failed explicit save", async () => {
    saveConfig.mockRejectedValueOnce("disk unavailable");
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "添加提供商" }));
    fireEvent.change(screen.getByPlaceholderText("DeepSeek"), {
      target: { value: "New Provider" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://api.deepseek.com"), {
      target: { value: "https://example.test" },
    });
    fireEvent.change(screen.getByPlaceholderText("sk-..."), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "操作失败：disk unavailable",
        expect.anything(),
      ),
    );
    expect(screen.getByPlaceholderText("DeepSeek")).toBeInTheDocument();
    expect(useConfigStore.getState().error).toBeNull();
  });

  it("reports explicit mapping results but leaves automatic setting changes quiet", async () => {
    render(<SettingsView />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() =>
      expect(sonner.success).toHaveBeenCalledWith("语言映射已添加"),
    );

    saveConfig.mockRejectedValueOnce("disk unavailable");
    fireEvent.change(selects[0], { target: { value: "ja" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "操作失败：disk unavailable",
        expect.anything(),
      ),
    );
    expect(useConfigStore.getState().error).toBeNull();

    sonner.success.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    fireEvent.click(screen.getByRole("radio", { name: "浅色" }));
    expect(sonner.success).not.toHaveBeenCalled();
  });

  it("shows fixed protocol help, clears a prompt to built-in, and exposes save failures", async () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    expect(screen.getByText(/不能被覆盖/)).toBeInTheDocument();
    const prompt = screen.getAllByRole("textbox")[0];
    fireEvent.change(prompt, { target: { value: "custom" } });
    await waitFor(() =>
      expect(useConfigStore.getState().config?.prompt_overrides.translate).toBe(
        "custom",
      ),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "恢复内置" })[0]);
    await waitFor(() =>
      expect(
        useConfigStore.getState().config?.prompt_overrides.translate,
      ).toBeNull(),
    );
    saveConfig.mockRejectedValueOnce("disk unavailable");
    fireEvent.change(prompt, { target: { value: "again" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "disk unavailable",
    );
  });

  it("uses localized appearance controls and business labels for every prompt", async () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "外观" }));

    expect(screen.getByRole("radio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "跟随系统" })).toBeInTheDocument();
    expect(screen.getByLabelText("翻译")).toBeInTheDocument();
    expect(screen.getByLabelText("命名")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("文档")).toBeInTheDocument(),
    );
    const themeTitle = screen.getByText("主题");
    expect(themeTitle.nextElementSibling).toHaveClass("mt-2");
    const promptLabel = screen.getByText("翻译", { selector: "label" });
    const promptHeader = promptLabel.parentElement;
    expect(promptHeader).not.toBeNull();
    expect(promptHeader).toHaveClass("flex", "items-center", "justify-between");
    expect(
      within(promptHeader as HTMLElement).getByRole("button", {
        name: "恢复内置",
      }),
    ).toBeInTheDocument();
  });

  it("rejects bare and duplicate capture, presents a failed registration, then recovers", async () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "热键" }));
    const input = await screen.findByLabelText("translate_selection shortcut");
    fireEvent.keyDown(input, { key: "D" });
    expect(await screen.findByRole("alert")).toHaveTextContent("修饰键");
    registerHotkeys.mockReset();
    registerHotkeys.mockResolvedValueOnce([
      {
        action: "translate_selection",
        accelerator: "Ctrl+Shift+D",
        registered: false,
        error: "occupied",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "保存并重新注册" }));
    expect(await screen.findByText(/occupied/)).toBeInTheDocument();
    expect(sonner.success).not.toHaveBeenCalled();
    registerHotkeys.mockResolvedValue([]);
    fireEvent.keyDown(input, { key: "K", ctrlKey: true, shiftKey: true });
    await waitFor(() =>
      expect(
        useConfigStore
          .getState()
          .config?.hotkeys.find(
            (binding) => binding.action === "translate_selection",
          )?.combo.key,
      ).toBe("K"),
    );
  });

  it("only reports a shortcut save after every registration succeeds", async () => {
    registerHotkeys.mockResolvedValue([
      {
        action: "translate_selection",
        accelerator: "Ctrl+Shift+D",
        registered: true,
      },
      {
        action: "show_main_window",
        accelerator: "Ctrl+Shift+L",
        registered: true,
      },
    ]);
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "热键" }));
    fireEvent.click(screen.getByRole("button", { name: "保存并重新注册" }));
    await waitFor(() =>
      expect(sonner.success).toHaveBeenCalledWith("热键已保存并重新注册"),
    );
  });
});
