import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "@/lib/config-types";
import { useConfigStore } from "@/stores/config-store";
import { useFavoritesStore } from "@/stores/favorites-store";
import { AddFavoritesDialog } from "./add-favorites-dialog";

describe("AddFavoritesDialog", () => {
  beforeEach(() => {
    useConfigStore.setState({ config: { ...defaultConfig(), ui_language: "zh" } });
    useFavoritesStore.setState({ list: [], error: null, loaded: true });
  });

  it("provides an accessible list dialog and stops adding after ten rows", () => {
    render(<AddFavoritesDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "新增收藏" })).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "添加一项" });
    for (let index = 0; index < 9; index += 1) fireEvent.click(add);
    expect(screen.getAllByRole("textbox")).toHaveLength(10);
    expect(add).toBeDisabled();
  });

  it("returns focus to the close callback on Escape", () => {
    const onClose = vi.fn();
    render(<AddFavoritesDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not submit until the favorites identity set has loaded", () => {
    useFavoritesStore.setState({ loaded: false });
    render(<AddFavoritesDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Redis" } });
    expect(screen.getByRole("button", { name: "保存并生成解释" })).toBeDisabled();
  });
});
