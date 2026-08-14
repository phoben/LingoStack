import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsView } from "./settings-view";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";

const { registerHotkeys, saveConfig } = vi.hoisted(() => ({ registerHotkeys: vi.fn(), saveConfig: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ registerHotkeys, saveConfig }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));

describe("SettingsView", () => {
  afterEach(cleanup);
  beforeEach(() => {
    registerHotkeys.mockReset();
    saveConfig.mockReset();
    registerHotkeys.mockResolvedValue([]);
    saveConfig.mockResolvedValue(undefined);
    useConfigStore.setState({ config: { ...defaultConfig(), ui_language: "zh" }, error: null });
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
    useConfigStore.setState({ config: { ...defaultConfig(), ui_language: "zh", pair_mappings: [["en", "zh"]] } });
    render(<SettingsView />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "en" } });
    fireEvent.change(selects[1], { target: { value: "ja" } });
    await waitFor(() => expect(selects[1]).toHaveValue("ja"));
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("只能映射一次");
  });

  it("shows fixed protocol help, clears a prompt to built-in, and exposes save failures", async () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    expect(screen.getByText(/不能被覆盖/)).toBeInTheDocument();
    const prompt = screen.getAllByRole("textbox")[0];
    fireEvent.change(prompt, { target: { value: "custom" } });
    await waitFor(() => expect(useConfigStore.getState().config?.prompt_overrides.translate).toBe("custom"));
    fireEvent.click(screen.getAllByRole("button", { name: "恢复内置" })[0]);
    await waitFor(() => expect(useConfigStore.getState().config?.prompt_overrides.translate).toBeNull());
    saveConfig.mockRejectedValueOnce("disk unavailable");
    fireEvent.change(prompt, { target: { value: "again" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("disk unavailable");
  });

  it("rejects bare and duplicate capture, presents a failed registration, then recovers", async () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: "热键" }));
    const input = await screen.findByLabelText("translate_selection shortcut");
    fireEvent.keyDown(input, { key: "D" });
    expect(await screen.findByRole("alert")).toHaveTextContent("修饰键");
    registerHotkeys.mockReset();
    registerHotkeys.mockResolvedValueOnce([{ action: "translate_selection", accelerator: "Ctrl+Shift+D", registered: false, error: "occupied" }]);
    fireEvent.click(screen.getByRole("button", { name: "保存并重新注册" }));
    expect(await screen.findByText(/occupied/)).toBeInTheDocument();
    registerHotkeys.mockResolvedValue([]);
    fireEvent.keyDown(input, { key: "K", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(useConfigStore.getState().config?.hotkeys.find((binding) => binding.action === "translate_selection")?.combo.key).toBe("K"));
  });
});
