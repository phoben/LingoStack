import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamStore } from "@/stores/stream-store";

const sonner = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));

vi.mock("sonner", () => ({ toast: sonner }));

import { NamingView } from "./naming-view";

describe("NamingView copy feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    useStreamStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        naming: {
          ...state.tasks.naming,
          status: "done",
          output: "user profile",
          error: null,
        },
      },
    }));
  });

  it("waits for the Clipboard result before notifying success or failure", async () => {
    clipboard.writeText.mockResolvedValueOnce(undefined);
    render(<NamingView />);
    const copy = screen.getByRole("button", { name: "Copy userProfile" });

    fireEvent.click(copy);
    await waitFor(() => expect(sonner.success).toHaveBeenCalledWith("Copied"));

    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(copy);
    await waitFor(() =>
      expect(sonner.error).toHaveBeenCalledWith(
        "Copy failed: denied",
        expect.anything(),
      ),
    );
  });
});
