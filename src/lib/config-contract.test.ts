import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/ipc-contract.json";
import { defaultConfig, type ChatEvent, type HotkeyAction } from "./config-types";
import type { HotkeyStatus, SystemSelection } from "./ipc";

describe("Rust/TypeScript IPC contract fixture", () => {
  it("keeps the TypeScript configuration default identical to the Rust fixture", () => {
    expect(defaultConfig()).toEqual(fixture.default_config);
  });

  it("accepts every tagged stream event and desktop state shape", () => {
    const events = fixture.chat_events as unknown as ChatEvent[];
    expect(events.map((event) => event.type)).toEqual(["status", "chunk", "done", "error"]);

    const selection = fixture.selection as unknown as SystemSelection;
    expect(selection.source).toBe("clipboard");

    const hotkey = fixture.hotkey_status as unknown as HotkeyStatus;
    const action: HotkeyAction = hotkey.action;
    expect(action).toBe("translate_selection");
    expect(hotkey.registered).toBe(false);
  });
});
