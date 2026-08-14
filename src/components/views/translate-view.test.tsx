import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TermTags } from "./translate-view";

const terms = [
  {
    term: "GitHub Copilot",
    category: "product" as const,
    explanation: "AI 编程助手。",
  },
];

describe("TermTags", () => {
  it("does not render an empty landmark when metadata is absent or invalid", () => {
    const { container } = render(<TermTags terms={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText("上下文术语")).not.toBeInTheDocument();
  });

  it("discloses an explanation on keyboard focus and hover", () => {
    render(<TermTags terms={terms} />);
    const tag = screen.getByRole("button", { name: "GitHub Copilot" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent("AI 编程助手。");
    expect(tag).toHaveAttribute("aria-describedby");

    fireEvent.blur(tag);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(tag);
    expect(screen.getByRole("tooltip")).toHaveTextContent("AI 编程助手。");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
