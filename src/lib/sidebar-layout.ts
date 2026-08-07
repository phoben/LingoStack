/**
 * 侧栏宽度规则（纯逻辑，便于单测）。
 *
 * 侧栏可由用户拖拽改变宽度；宽度决定导航是「图标 + 文字」还是「纯图标」，
 * 无独立折叠开关——窄到阈值以下即自动收为图标态。
 */

/** 纯图标态的最小宽度（容纳 1 个图标 + 左右留白）。 */
export const SIDEBAR_MIN_WIDTH = 60;

/** 拖拽上限，超过后侧栏挤压主区域收益递减。 */
export const SIDEBAR_MAX_WIDTH = 280;

/** 默认宽度（沿用原型 .sidebar 的 188px）。 */
export const SIDEBAR_DEFAULT_WIDTH = 188;

/** 低于此宽度切为纯图标态；不低于则显示图标 + 文字。 */
export const SIDEBAR_LABEL_THRESHOLD = 132;

/** 键盘调整侧栏宽度的单步像素。 */
export const SIDEBAR_KEYBOARD_STEP = 16;

/** 把任意宽度收敛到合法区间；非有限值回退到默认宽度。 */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

/** 当前宽度是否显示导航文字标签。 */
export function showsSidebarLabels(width: number): boolean {
  return width >= SIDEBAR_LABEL_THRESHOLD;
}

/**
 * 双击分隔条时的下一个宽度：在「最窄图标态」与「默认宽度」之间来回切换。
 * 处于图标态（含任何窄于阈值的宽度）→ 展开到默认；否则收到最窄。
 */
export function toggledSidebarWidth(width: number): number {
  return showsSidebarLabels(width) ? SIDEBAR_MIN_WIDTH : SIDEBAR_DEFAULT_WIDTH;
}
