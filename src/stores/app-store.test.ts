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
});
