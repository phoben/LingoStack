import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { AboutView } from "./about-view";

describe("AboutView", () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: { ...defaultConfig(), ui_language: "en" },
      error: null,
    });
  });
  afterEach(cleanup);

  it("presents the centered product identity and a clearly unavailable update action", () => {
    render(<AboutView />);

    expect(
      screen.getByRole("heading", { name: "译栈 LingoStack" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A cross-platform desktop translator built for developers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for updates (coming soon)" }),
    ).toBeDisabled();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
