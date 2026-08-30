import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useThemeStore } from "@/stores/theme-store";

const sonner = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));
vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    sonner.props = props;
    return <div role="status" aria-label={String(props.containerAriaLabel)} />;
  },
}));

import { LingoStackToaster } from "./toaster";

describe("LingoStackToaster", () => {
  beforeEach(() => {
    useConfigStore.setState({ config: defaultConfig() });
    useThemeStore.setState({ mode: "dark" });
  });

  it("mounts one localized, top-center bounded notification region with an offset", () => {
    render(<LingoStackToaster />);
    expect(
      screen.getByRole("status", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(sonner.props).toMatchObject({
      theme: "dark",
      position: "top-center",
      duration: 1600,
      visibleToasts: 3,
      offset: 16,
      hotkey: [],
    });
  });
});
