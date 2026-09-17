import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./app-store";

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.getState().setReady(false);
  });

  it("defaults to not ready", () => {
    expect(useAppStore.getState().ready).toBe(false);
  });

  it("toggles ready", () => {
    useAppStore.getState().setReady(true);
    expect(useAppStore.getState().ready).toBe(true);
  });

  it("可从任何视图直达 AI 设置", () => {
    useAppStore.getState().openSettings("ai");
    expect(useAppStore.getState()).toMatchObject({ activeView: "settings", settingsSection: "ai" });
    useAppStore.getState().setActiveView("settings");
    expect(useAppStore.getState().settingsSection).toBe("general");
  });
});
