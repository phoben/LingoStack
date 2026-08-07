import { describe, it, expect } from "vitest";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_LABEL_THRESHOLD,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  showsSidebarLabels,
  toggledSidebarWidth,
} from "./sidebar-layout";

describe("clampSidebarWidth", () => {
  it("保留区间内的宽度", () => {
    expect(clampSidebarWidth(188)).toBe(188);
  });

  it("过窄收敛到下限", () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(-120)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("过宽收敛到上限", () => {
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("取整小数宽度", () => {
    expect(clampSidebarWidth(187.6)).toBe(188);
  });

  it("非有限值回退到默认宽度", () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(
      SIDEBAR_DEFAULT_WIDTH,
    );
  });
});

describe("showsSidebarLabels", () => {
  it("阈值及以上显示文字", () => {
    expect(showsSidebarLabels(SIDEBAR_LABEL_THRESHOLD)).toBe(true);
    expect(showsSidebarLabels(SIDEBAR_DEFAULT_WIDTH)).toBe(true);
  });

  it("阈值以下为纯图标", () => {
    expect(showsSidebarLabels(SIDEBAR_LABEL_THRESHOLD - 1)).toBe(false);
    expect(showsSidebarLabels(SIDEBAR_MIN_WIDTH)).toBe(false);
  });
});

describe("toggledSidebarWidth", () => {
  it("展开态双击收到最窄", () => {
    expect(toggledSidebarWidth(SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("图标态双击展开到默认", () => {
    expect(toggledSidebarWidth(SIDEBAR_MIN_WIDTH)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(toggledSidebarWidth(SIDEBAR_LABEL_THRESHOLD - 1)).toBe(
      SIDEBAR_DEFAULT_WIDTH,
    );
  });
});
