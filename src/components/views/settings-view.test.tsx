import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SettingsView } from "./settings-view";
import { defaultConfig, type Feature } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useAppStore } from "@/stores/app-store";

const {
  registerHotkeys,
  saveConfig,
  listProviderPresets,
  instantiateProviderPreset,
  discoverProviderModels,
} = vi.hoisted(() => ({
  registerHotkeys: vi.fn(),
  saveConfig: vi.fn(),
  listProviderPresets: vi.fn().mockResolvedValue([]),
  instantiateProviderPreset: vi.fn(),
  discoverProviderModels: vi.fn(),
}));
const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/lib/ipc", () => ({
  registerHotkeys,
  saveConfig,
  listProviderPresets,
  instantiateProviderPreset,
  discoverProviderModels,
}));
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
    listProviderPresets.mockResolvedValue([
      {
        id: "openai-responses",
        brand: "OpenAI",
        display_name: "OpenAI Responses",
        protocol: "open_ai_responses",
        suggested_endpoints: ["https://api.openai.com"],
        auth: "bearer",
        docs_url: "https://platform.openai.com/docs/api-reference/responses",
        discovery: "open_ai",
        initial_model_ids: ["gpt"],
      },
    ]);
    useConfigStore.setState({
      config: { ...defaultConfig(), ui_language: "zh" },
      error: null,
    });
    useAppStore.setState({ activeView: "translate", settingsSection: "general" });
  });

  it("配置加载失败时显示可操作错误而不是永久加载提示", () => {
    useConfigStore.setState({
      config: null,
      loading: false,
      error: "配置版本不兼容，请重新配置",
    });

    render(<SettingsView />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "配置版本不兼容，请重新配置",
    );
    expect(screen.queryByText("正在加载设置…")).not.toBeInTheDocument();
  });

  it("配置正在加载时才显示加载提示", () => {
    useConfigStore.setState({ config: null, loading: true, error: null });

    render(<SettingsView />);

    expect(screen.getByText("Loading settings…")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("既未加载也无错误时不会伪装为永久加载", () => {
    useConfigStore.setState({ config: null, loading: false, error: null });

    render(<SettingsView />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Settings did not initialize",
    );
    expect(screen.queryByText("Loading settings…")).not.toBeInTheDocument();
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
            protocol: "open_ai_chat_completions",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            auth: "bearer",
            models: [
              {
                id: "deepseek-chat",
                origin: "user_entered",
                supported_features: [
                  "translate",
                  "naming",
                  "explain",
                  "doc_translate",
                ],
                supports_temperature: false,
                supports_max_output: false,
                supports_reasoning: false,
              },
            ],
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
            protocol: "open_ai_chat_completions",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            auth: "bearer",
            models: [
              {
                id: "deepseek-chat",
                origin: "user_entered",
                supported_features: [
                  "translate",
                  "naming",
                  "explain",
                  "doc_translate",
                ],
                supports_temperature: false,
                supports_max_output: false,
                supports_reasoning: false,
              },
            ],
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

  it("新增提供商表单中的 API Key 默认掩码且可临时显隐", async () => {
    render(<SettingsView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "AI" }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "添加提供商" }));
<<<<<<< HEAD
=======
    await screen.findByRole("option", { name: "OpenAI Responses" });
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
    const input = screen.getByPlaceholderText("sk-...");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "显示 API Key" }));
    expect(input).toHaveAttribute("type", "text");
<<<<<<< HEAD
    expect(screen.getByRole("button", { name: "隐藏 API Key" })).toHaveAttribute("aria-pressed", "true");
=======
    expect(
      screen.getByRole("button", { name: "隐藏 API Key" }),
    ).toHaveAttribute("aria-pressed", "true");
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
    });
    fireEvent.click(await screen.findByRole("button", { name: "添加提供商" }));
<<<<<<< HEAD
    expect(screen.getByPlaceholderText("sk-...")).toHaveAttribute("type", "password");
=======
    await screen.findByRole("option", { name: "OpenAI Responses" });
    expect(screen.getByPlaceholderText("sk-...")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("将自定义入口置首并可从全部首批预设实例化独立草稿", async () => {
    const presetIds = [
      "openai-chat",
      "openai-responses",
      "anthropic",
      "gemini",
      "deepseek",
      "zhipu",
      "minimax",
      "bailian",
      "ollama",
    ];
    listProviderPresets.mockResolvedValueOnce(
      presetIds.map((id) => ({
        id,
        brand: id,
        display_name: id,
        protocol: "open_ai_chat_completions",
        suggested_endpoints: ["https://example.test"],
        auth: "bearer",
        docs_url: "https://example.test/docs",
        discovery: id === "zhipu" || id === "bailian" ? null : "open_ai",
        initial_model_ids: ["model"],
      })),
    );
    instantiateProviderPreset.mockResolvedValueOnce({
      id: "",
      preset_id: "ollama",
      protocol: "open_ai_chat_completions",
      name: "Ollama（OpenAI 兼容）",
      base_url: "http://localhost:11434",
      api_key: "",
      auth: "none",
      parameter_profile: {
        protocol: "open_ai_chat_completions",
        endpoint_scope: "http://localhost:11434",
        supports_temperature: true,
        max_output_field: "max_tokens",
        supports_reasoning: false,
      },
      models: [
        {
          id: "llama3.2",
          origin: "bundled_verified",
          supported_features: ["translate", "naming", "explain", "doc_translate"],
          supports_temperature: true,
          supports_max_output: true,
          supports_reasoning: false,
        },
      ],
    });

    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "添加提供商" }));
    const presetSelect = await screen.findByLabelText("提供商预设");
    const options = within(presetSelect).getAllByRole("option");
    expect(options).toHaveLength(10);
    expect(options[0]).toHaveTextContent("自定义提供商");

    fireEvent.change(presetSelect, { target: { value: "ollama" } });
    expect(await screen.findByDisplayValue("Ollama（OpenAI 兼容）")).toBeInTheDocument();
    expect(screen.getByLabelText("认证方式")).toHaveValue("none");
    expect(screen.getByDisplayValue("http://localhost:11434")).toBeInTheDocument();
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
  });

  it("编辑提供商时默认掩码，并在保存关闭后重新掩码", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        providers: [
          {
            id: "deepseek",
<<<<<<< HEAD
            kind: "open_ai_compatible",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "secret",
            models: ["deepseek-chat"],
=======
            protocol: "open_ai_chat_completions",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "secret",
            auth: "bearer",
            models: [
              {
                id: "deepseek-chat",
                origin: "user_entered",
                supported_features: [
                  "translate",
                  "naming",
                  "explain",
                  "doc_translate",
                ],
                supports_temperature: false,
                supports_max_output: false,
                supports_reasoning: false,
              },
            ],
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
          },
        ],
      },
    });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑 DeepSeek" }));
    const input = screen.getByDisplayValue("secret");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "显示 API Key" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue("secret")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑 DeepSeek" }));
<<<<<<< HEAD
    expect(screen.getByDisplayValue("secret")).toHaveAttribute("type", "password");
=======
    expect(screen.getByDisplayValue("secret")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("刷新模型后选择即进入草稿，保存并再次刷新仍显示为已选", async () => {
    const provider = {
      id: "openai",
      preset_id: "openai-responses",
      protocol: "open_ai_responses" as const,
      name: "OpenAI",
      base_url: "https://api.openai.com",
      api_key: "sk-test",
      auth: "bearer" as const,
      parameter_profile: {
        protocol: "open_ai_responses" as const,
        endpoint_scope: "https://api.openai.com",
        supports_temperature: true,
        max_output_field: "max_output_tokens" as const,
        supports_reasoning: true,
      },
      models: [
        {
          id: "manual",
          origin: "bundled_verified" as const,
          supported_features: [
            "translate",
            "naming",
            "explain",
            "doc_translate",
          ] as Feature[],
          supports_temperature: true,
          supports_max_output: true,
          supports_reasoning: false,
        },
      ],
    };
    useConfigStore.setState({
      config: { ...defaultConfig(), ui_language: "zh", providers: [provider] },
      error: null,
    });
    discoverProviderModels.mockResolvedValue([
      {
        id: "remote-a",
        supported_features: ["translate"],
        supports_temperature: true,
        supports_max_output: true,
        supports_reasoning: false,
      },
      {
        id: "remote-b",
        supported_features: ["translate"],
        supports_temperature: true,
        supports_max_output: true,
        supports_reasoning: false,
      },
    ]);
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑 OpenAI" }));
    fireEvent.click(await screen.findByRole("button", { name: "刷新模型" }));
    const modelInput = screen.getByRole("combobox", {
      name: "模型（逗号或换行分隔）",
    });
    expect(await screen.findByRole("option", { name: "remote-a" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    const listbox = screen.getByRole("listbox");
    expect(modelInput).toHaveAttribute("aria-expanded", "true");
    expect(modelInput).toHaveAttribute("aria-controls", listbox.id);
    expect(screen.getByRole("option", { name: "remote-a" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(modelInput).not.toHaveValue(
      expect.stringContaining("remote-a"),
    );
    fireEvent.change(modelInput, { target: { value: "manual, custom-model" } });
    fireEvent.click(screen.getByRole("option", { name: "remote-a" }));
    expect(modelInput).toHaveValue("manual, custom-model, remote-a");
    fireEvent.click(screen.getByRole("option", { name: "remote-a" }));
    expect(modelInput).toHaveValue("manual, custom-model");
    expect(screen.getByRole("option", { name: "remote-a" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.keyDown(modelInput, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(modelInput, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(modelInput).toHaveAttribute(
      "aria-activedescendant",
      `${listbox.id}-0`,
    );
    fireEvent.keyDown(modelInput, { key: "Enter" });
    expect(modelInput).toHaveValue("manual, custom-model, remote-a");
    expect(
      screen.queryByRole("button", { name: "添加所选模型" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(modelInput, { key: "Tab" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(modelInput).toHaveAttribute("aria-expanded", "false");
    expect(modelInput).not.toHaveAttribute("aria-controls");
    fireEvent.focus(modelInput);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(useConfigStore.getState().config?.providers[0].models).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "remote-a" })]),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑 OpenAI" }));
    fireEvent.click(await screen.findByRole("button", { name: "刷新模型" }));
    expect(await screen.findByRole("option", { name: "remote-a" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("刷新失败或空结果不清空草稿，规格覆盖和 Responses 参数会保存", async () => {
    const provider = {
      id: "openai",
      preset_id: "openai-responses",
      protocol: "open_ai_responses" as const,
      name: "OpenAI",
      base_url: "https://api.openai.com",
      api_key: "sk-test",
      auth: "bearer" as const,
      parameter_profile: {
        protocol: "open_ai_responses" as const,
        endpoint_scope: "https://api.openai.com",
        supports_temperature: true,
        max_output_field: "max_output_tokens" as const,
        supports_reasoning: true,
      },
      models: [
        {
          id: "gpt",
          origin: "bundled_verified" as const,
          source_url: "https://platform.openai.com/docs/models",
          verified_at: "2026-09-17",
          supported_features: [
            "translate",
            "naming",
            "explain",
            "doc_translate",
          ] as Feature[],
          supports_temperature: true,
          supports_max_output: true,
          supports_reasoning: true,
        },
      ],
    };
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        providers: [provider],
        models: { translate: { provider_id: "openai", model: "gpt" } },
      },
      error: null,
    });
    discoverProviderModels
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑 OpenAI" }));
    expect(screen.getByRole("link", { name: "官方来源" })).toHaveAttribute(
      "href",
      "https://platform.openai.com/docs/models",
    );
    expect(screen.getByText("核验于 2026-09-17")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("gpt 上下文窗口"), {
      target: { value: "128000" },
    });
    fireEvent.change(screen.getByLabelText("gpt 最大输出"), {
      target: { value: "4096" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "刷新模型" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("模型（逗号或换行分隔）")).toHaveValue("gpt");
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(useConfigStore.getState().config?.providers[0].models[0]).toEqual(
        expect.objectContaining({
          context_window: expect.objectContaining({ source: "user_override" }),
          max_output_tokens: expect.objectContaining({
            source: "user_override",
          }),
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText("翻译 最大输出"), {
      target: { value: "512" },
    });
    fireEvent.change(screen.getByLabelText("翻译 思考强度"), {
      target: { value: "high" },
    });
    await waitFor(() =>
      expect(
        useConfigStore.getState().config?.models.translate?.generation,
      ).toMatchObject({ max_output_tokens: 512, reasoning_effort: "high" }),
    );
>>>>>>> 1dbad488ffe5aef98ca852d3215bf57e46a4699d
  });

  it("reports provider create, edit, and delete completion", async () => {
    useConfigStore.setState({
      config: {
        ...defaultConfig(),
        ui_language: "zh",
        providers: [
          {
            id: "deepseek",
            protocol: "open_ai_chat_completions",
            name: "DeepSeek",
            base_url: "https://api.deepseek.com",
            api_key: "sk-test",
            auth: "bearer",
            models: [
              {
                id: "deepseek-chat",
                origin: "user_entered",
                supported_features: [
                  "translate",
                  "naming",
                  "explain",
                  "doc_translate",
                ],
                supports_temperature: false,
                supports_max_output: false,
                supports_reasoning: false,
              },
            ],
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
